"""Call Upload Processing Service (GMB / Inbound Calls)

This module is intentionally self-contained (prompt + downloader + Gemini analyzer + CSV orchestration)
to match the "processor + service" structure used for ABC calls.

Key behavior:
- Uses the same prompt text you use in AI Studio.
- Stores ONLY the raw AI Studio-style schema under `analysis` (no legacy normalization, no `analysis_v2`).
"""

import json
import math
import os
import tempfile
import time
import uuid
from io import BytesIO
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple

import pandas as pd
import requests
import google.generativeai as genai
import numpy as np
import soundfile as sf
from lameenc import Encoder


def sanitize_nan(obj):
    """Recursively replace NaN values with None for JSON serialization."""
    if isinstance(obj, dict):
        return {k: sanitize_nan(v) for k, v in obj.items()}
    elif isinstance(obj, list):
        return [sanitize_nan(item) for item in obj]
    elif isinstance(obj, float) and math.isnan(obj):
        return None
    return obj


def _safe_int(value: Any, default: int = 0) -> int:
    try:
        if value is None:
            return default
        if isinstance(value, float) and math.isnan(value):
            return default
        return int(float(str(value).strip()))
    except Exception:
        return default


WAV_TO_MP3_BITRATE = 192


def _is_wav_audio(audio_data: bytes, source_url: Optional[str] = None) -> bool:
    if audio_data and len(audio_data) >= 12 and audio_data[:4] == b"RIFF" and audio_data[8:12] == b"WAVE":
        return True
    url = (source_url or "").lower()
    return url.endswith(".wav")


def _convert_wav_to_mp3(audio_data: bytes) -> Tuple[Optional[bytes], Optional[str]]:
    try:
        audio, sample_rate = sf.read(BytesIO(audio_data), dtype="float32")

        if audio.ndim == 1:
            audio = audio[:, np.newaxis]

        channels = audio.shape[1]

        audio = np.clip(audio, -1.0, 1.0)
        pcm16 = (audio * 32767).astype(np.int16)
        pcm_bytes = pcm16.tobytes()

        encoder = Encoder()
        encoder.set_bit_rate(WAV_TO_MP3_BITRATE)
        encoder.set_in_sample_rate(sample_rate)
        encoder.set_channels(channels)
        encoder.set_quality(0)

        mp3_data = encoder.encode(pcm_bytes)
        mp3_data += encoder.flush()

        if not mp3_data:
            return None, "WAV to MP3 conversion returned empty output"

        return mp3_data, None
    except Exception as exc:
        return None, f"WAV to MP3 conversion failed: {exc}"


def _detect_audio_filetype(audio_data: bytes, source_url: Optional[str] = None) -> Tuple[str, str]:
    """Best-effort detection for temp file suffix + mime_type for Gemini upload."""
    data = audio_data or b""

    if len(data) >= 12 and data[:4] == b"RIFF" and data[8:12] == b"WAVE":
        return ".wav", "audio/wav"
    if len(data) >= 3 and data[:3] == b"ID3":
        return ".mp3", "audio/mpeg"
    if len(data) >= 2 and data[0] == 0xFF and (data[1] & 0xE0) == 0xE0:
        return ".mp3", "audio/mpeg"
    if len(data) >= 4 and data[:4] == b"OggS":
        return ".ogg", "audio/ogg"
    if len(data) >= 4 and data[:4] == b"fLaC":
        return ".flac", "audio/flac"
    if len(data) >= 12 and data[4:8] == b"ftyp":
        return ".m4a", "audio/mp4"

    url = (source_url or "").lower()
    for ext, mime in (
        (".wav", "audio/wav"),
        (".mp3", "audio/mpeg"),
        (".ogg", "audio/ogg"),
        (".flac", "audio/flac"),
        (".m4a", "audio/mp4"),
        (".mp4", "audio/mp4"),
    ):
        if url.endswith(ext):
            return ext, mime

    return ".mp3", "audio/mpeg"


def _safe_fill_prompt_template(prompt_template: str, values: Dict[str, Any]) -> str:
    """Replace known {tokens} without using str.format()."""
    prompt = prompt_template
    for key, value in (values or {}).items():
        token = "{" + str(key) + "}"
        if token in prompt:
            prompt = prompt.replace(token, str(value))
    return prompt


class AudioDownloader:
    """Downloads and validates audio files from URLs."""

    def __init__(self, timeout: int = 60):
        self.timeout = timeout

    def download(self, url: str) -> Tuple[Optional[bytes], Optional[str]]:
        try:
            if not url or not isinstance(url, str):
                return None, "Invalid URL provided"

            print(f"[AUDIO] Downloading: {url[:80]}...")
            response = requests.get(url, timeout=self.timeout, allow_redirects=True)
            response.raise_for_status()

            audio_data = response.content
            if len(audio_data) < 1000:
                return None, "Audio file too small (<1KB)"

            print(f"[AUDIO] Downloaded {len(audio_data):,} bytes")
            return audio_data, None
        except requests.exceptions.Timeout:
            return None, "Download timeout (60s exceeded)"
        except requests.exceptions.ConnectionError:
            return None, "Connection error - unable to reach URL"
        except requests.exceptions.HTTPError as e:
            return None, f"HTTP Error {getattr(e.response, 'status_code', 'unknown')}"
        except Exception as e:
            return None, f"Download failed: {str(e)}"


class GeminiAudioAnalyzer:
    """Analyzes audio calls using Gemini API."""

    def __init__(self, api_key: str, model: str = "gemini-2.5-pro"):
        self.model_name = model
        self.api_key = api_key

        genai.configure(api_key=api_key)

        generation_config = genai.GenerationConfig(
            temperature=0.1,
            top_p=0.95,
            max_output_tokens=8192,
            response_mime_type="application/json",
        )

        self.model = genai.GenerativeModel(
            model_name=model,
            generation_config=generation_config,
        )

        print(f"[GEMINI] Initialized: {model}")

    def analyze(self, audio_data: bytes, row_data: Dict[str, Any], prompt_template: str) -> Tuple[Optional[Dict], Optional[str]]:
        temp_path = None
        uploaded_file = None

        try:
            source_url = None
            if isinstance(row_data, dict):
                source_url = (
                    row_data.get("Recording URL")
                    or row_data.get("CallAudio")
                    or row_data.get("audio_url")
                    or row_data.get("recording_url")
                )

            suffix, mime_type = _detect_audio_filetype(audio_data, source_url=source_url)
            with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as temp_file:
                temp_file.write(audio_data)
                temp_path = temp_file.name

            print("[GEMINI] Uploading audio to Gemini storage...")
            uploaded_file = genai.upload_file(temp_path, mime_type=mime_type)

            while uploaded_file.state.name == "PROCESSING":
                time.sleep(1)
                uploaded_file = genai.get_file(uploaded_file.name)

            if uploaded_file.state.name == "FAILED":
                return None, "Gemini file processing failed"

            prompt = _safe_fill_prompt_template(
                prompt_template,
                {
                    "store_name": (row_data or {}).get("Store Name", "Unknown"),
                    "locality": (row_data or {}).get("Locality", "Unknown"),
                    "city": (row_data or {}).get("City", "Unknown"),
                    "state": (row_data or {}).get("State", "Unknown"),
                    "region": (row_data or {}).get("Region", "Unknown"),
                    "call_date": (row_data or {}).get("Date", "Unknown"),
                    "duration": (row_data or {}).get("Duration", "Unknown"),
                    "recording_url": source_url or "",
                    "INPUT_AUDIO_FILE": source_url or "Uploaded audio",
                },
            )

            print("[GEMINI] Analyzing audio...")
            response = self.model.generate_content([prompt, uploaded_file])

            if not response.text:
                return None, "Empty response from Gemini"

            json_text = response.text.strip()
            if json_text.startswith("```"):
                json_text = json_text.split("```", 2)[1]
                if json_text.startswith("json"):
                    json_text = json_text[4:]
            json_text = json_text.strip()

            analysis = json.loads(json_text)
            print("[GEMINI] Analysis complete")
            return analysis, None

        except json.JSONDecodeError as e:
            raw_text = None
            try:
                raw_text = response.text
            except Exception:
                raw_text = None
            return {"parse_error": str(e), "raw_response": raw_text}, None
        except Exception as e:
            return None, f"Analysis error: {str(e)}"
        finally:
            if temp_path and os.path.exists(temp_path):
                try:
                    os.remove(temp_path)
                except Exception:
                    pass
            if uploaded_file:
                try:
                    genai.delete_file(uploaded_file.name)
                except Exception:
                    pass

    def analyze_with_retry(
        self,
        audio_data: bytes,
        row_data: Dict[str, Any],
        prompt_template: str,
        max_retries: int = 5,
        retry_delay: int = 10,
    ) -> Tuple[Optional[Dict], Optional[str]]:
        last_error = None
        for attempt in range(1, max_retries + 1):
            result, error = self.analyze(audio_data, row_data, prompt_template)
            if result is not None:
                return result, None
            last_error = error
            print(f"[GEMINI] Attempt {attempt}/{max_retries} failed: {error}")
            
            if attempt < max_retries:
                # Special handling for 429 rate limit errors
                if error and "429" in str(error):
                    # Exponential backoff for rate limits: 30s, 60s, 120s, 240s
                    wait_time = retry_delay * (2 ** attempt)
                    print(f"[GEMINI] Rate limit hit (429), waiting {wait_time}s before retry...")
                    time.sleep(wait_time)
                else:
                    # Regular exponential backoff for other errors
                    wait_time = retry_delay * attempt
                    time.sleep(wait_time)
        return None, f"All {max_retries} attempts failed: {last_error}"


class PromptTemplate:
    """Manages Gemini analysis prompt templates for GMB calls."""

    @staticmethod
    def get_audio_call_prompt() -> str:
        """
        Get the prompt template for audio call analysis.
        Keep this aligned with the frontend/backend JSON contract.
        """
        return '''
Role: You are an Expert Retail Sales Auditor for Duroflex.
Task: Analyze the provided Audio Recording of an Inbound Call from a customer who found the store via Google (GMB).
Goal: Extract high-fidelity sales intelligence by listening to the dialogue, tone, and vocal sentiment to evaluate how effectively the agent converts the inquiry into a confirmed Store Visit.

INPUT DATA
    Audio Source: {INPUT_AUDIO_FILE} (Note: Analyze the raw audio for tone, pace, and background environment)

    CALL CONTEXT (from upload metadata; may be imperfect)
    - Store Name: {store_name}
    - Locality: {locality}
    - City: {city}
    - State: {state}
    - Region: {region}
    - Call Date: {call_date}
    - Duration (seconds): {duration}
    - Recording URL: {recording_url}

INSTRUCTIONS
Aural Observation: Do not rely on text alone. Listen for the "GMB Intent"—is the caller in a hurry or driving? Listen for the agent's tone; is it welcoming and professional, or dismissive?
Sentiment & Tone Inference: Use vocal pitch and response latency to determine Customer_Enthusiasm and Customer_Age_Group. Detect if the customer sounds frustrated by specific friction points (e.g., location clarity).
Environmental Context: Note any background noise (store music, other customers, traffic) that might impact the Audio_Quality or the agent's focus.
Conversion Audit: Pay close attention to the "Closing" phase. Did the agent's voice sound confident when giving directions or offering the Sleep Trial?
Strict JSON: Output ONLY a valid JSON object matching the schema. No conversational filler.
Transcript Requirement: Provide the entire conversation transcript in English.

    IMPORTANT DEFINITIONS (to reduce ambiguity)
    - Treat "Sleep Trial" as mentioned if the agent tells the customer they can *try/lie down/test* the mattress in-store.
    - If the customer states exact size/specs (e.g., 6-inch King, dimensions), you should treat them as late-stage and rate intent accordingly.

OUTPUT SCHEMA (JSON)
{
    "MetaData": {
        "Customer_Name": "String",
        "Customer_Location": "String(in case of mixed language give top2 used mostly)",
        "Call_Region": "String(for example South, North, East, West as per the location)",
        "Agent_Name": "String",
        "Customer_Language": "String",
        "Customer_Gender": "Male | Female | Unknown",
        "Customer_Age_Group": "Young Adult | Middle Aged | Senior | Unknown",
        Consideration_Value": "(REQUIRED)String ('Below 15k', '15k-25k', '25k-50k', '50k+')",
        "Call_Quality_Overall": "High | Medium | Low",
        "Call_Duration": "String",
        "Connected_to_Customer": true,
        "Customer_Enthusiasm": "High | Medium | Low"
    },
    "Call_Summary": "String (Max 100 words - Crisp synopsis)",
    "1_Call_Objective": {
        "Type": "Sales Call | Service Call",
        "Objective_Phrase": "String (e.g. 'Checking opening hours', 'Stock inquiry')"
    },
    "2_Intent_to_Purchase": {
        "Rating": "High | Medium | Low | Already Purchased",
        "Reason": "String (REQUIRED - evidence-based reasoning for the rating)"
    },
    "2A_Intent_to_Visit": {
        "Rating": "High | Medium | Low | Already Purchased",
        "Reason": "String (REQUIRED - evidence-based reasoning for the rating)"
    },
    "3_Customer_Experience": {
        "Rating": "High | Medium | Low",
        "Reason": "String (REQUIRED - evidence-based reasoning for the rating)"
    },
    "4_Funnel_Analysis": {
        "Stage": "Awareness | Consideration | Action | Already Purchased",
        "Reason": "String (REQUIRED - evidence-based reasoning for the stage)",
        "Timeline_to_Purchase": "Immediate (2-3 days) | Short Term (within a week) | Long Term (more than a week) | Unknown (unclear)",
        "Timeline_to_Purchase_Reasons": [
            "String (Evidence-based reason )"
        ]
    },
    "5_Product_Intelligence": {
        "Narrow_Down_Stage": "Category | Range | Specific SKU | NA",
        "Product_of_Interest": "String",
        "Approx_Order_Value": "String (or NA)"
    },
    "6_Customer_Needs": {
        "Description": "String (for example : For Whom: 63-year-old Father (76kg weight)\n\nMedical Condition: Spinal cord bulge / Back pain\n\nRequirement: Needs firm orthopedic support. Customer specifically asked about 6-inch vs 8-inch options.\n\nKey Constraint: Remote purchase; relies heavily on Agent's assurance regarding warranty.)"
    },
    "7_Purchase_Barrier": "String (e.g. Distance, Price, Availability)",
    "8_Decision_Maker": "Caller | Spouse | Joint | Unknown",
    "9_Invitations": {
        "Store_Visit": {
            "Rating": "High | Medium | Low",
            "Reason": "String (Did agent give a compelling reason to visit?)"
        },
        "Video_Demo": {
            "Rating": "High | Medium | Low",
            "Reason": "String (Did agent give a compelling reason to watch the video demo?)"
        }
    },
    "10_Conversion_Hooks": {
        "Offers_Discounts_EMI": {"Status": "Yes | No", "Comment": "String"},
        "Product_Brochure": {"Status": "Yes | No", "Comment": "String"},
        "Mattress_Measurement": {"Status": "Yes | No", "Comment": "String"},
        "Brand_Legacy_Warranty": {"Status": "Yes | No", "Comment": "String"},
        "Sleep_Trial": {"Status": "Yes | No", "Comment": "String"}
    },
    "11_RELAX_Framework": {
        "R_Reach_Out": {
            "Score": "H/M/L",
            "Reason": "Greeting & Brand Name usage"
        },
        "E_Explore_Needs": {
            "Score": "H/M/L",
            "Reason": "Discovery of user needs"
        },
        "L_Link_Product": {
            "Score": "H/M/L",
            "Reason": "Linking need to Product"
        },
        "A_Add_Value": {
            "Score": "H/M/L",
            "Reason": "Mentioning offers/financing/accessories"
        },
        "X_Express_Closing": {
            "Score": "H/M/L",
            "Reason": "Next steps/Location Sharing"
        }
    },
    "12_Agent_Evaluation": {
        "Main_Skills": {
            "Product_Knowledge": "High | Medium | Low",
            "Product_Knowledge_Reason": "String",
            "Sales_Skills": "High | Medium | Low",
            "Sales_Skills_Reason": "String",
            "Upsell_Revenue_Skills": "High | Medium | Low",
            "Upsell_Revenue_Skills_Reason": "String"
        },
        "Secondary_Traits": {
            "Need_Discovery": "High | Medium | Low",
            "Need_Discovery_Reason": "String",
            "Objection_Handling": "High | Medium | Low",
            "Objection_Handling_Reason": "String",
            "Agent_Nature": "Proactive | Responsive | Passive",
            "Agent_Nature_Reason": "String"
    }
    },
    "13_Agent_Learnings": [
        "String (Feedback 1)",
        "String (Feedback 2)",
        "String (Feedback 3)"
    ],
    "14_Next_Actions": "String (e.g. Send WhatsApp Location, Save Number)",
    "15_End_to_End_NPS": {
        "Score": "(REQUIRED)Integer (0-10)",
        "Comment": "String (Inferred sentiment)"
    },
      "Transcript_Log": "String (Full Transcript with proper definition of what is said by Agent and Customer with timestamps.
                      for example [Agent](0:02): Hello, thank you for calling Duroflex. I see you were interested in our mattresses. How can I assist you today?
                      [Customer](0:05): Hi, yes I was looking at the Duroflex Sleepyhead mattress)"
}
'''


class CSVValidator:
    """Validates CSV structure for audio call uploads"""

    REQUIRED_COLUMNS = [
        'Store Name',
        'Locality',
        'City',
        'State',
        'Region',
        'Recording URL',
        'Duration',
        'Date'
    ]

    @staticmethod
    def validate(df: pd.DataFrame) -> Tuple[bool, Optional[str]]:
        """
        Validate CSV has required columns.
        Returns: (is_valid, error_message)
        """
        missing = [col for col in CSVValidator.REQUIRED_COLUMNS if col not in df.columns]

        if missing:
            return False, f"Missing columns: {', '.join(missing)}"

        if len(df) == 0:
            return False, "CSV is empty"

        return True, None


class CallDataFlattener:
    """Flattens nested JSON analysis into flat structure"""

    @staticmethod
    def flatten_json(nested_json: Any, parent_key: str = '', sep: str = '_') -> Dict:
        """
        Recursively flatten nested JSON object.
        """
        items = []

        if isinstance(nested_json, dict):
            for key, value in nested_json.items():
                new_key = f"{parent_key}{sep}{key}" if parent_key else key

                # Skip Transcript_Log as it's large and not needed for storage
                if key == 'Transcript_Log':
                    items.append((f"{new_key}_count", len(value) if isinstance(value, list) else 0))
                    continue

                if isinstance(value, dict):
                    items.extend(CallDataFlattener.flatten_json(value, new_key, sep=sep).items())
                elif isinstance(value, list):
                    if len(value) > 0:
                        # For lists of strings (reasons, questions)
                        if all(isinstance(item, str) for item in value):
                            for idx, item in enumerate(value, 1):
                                items.append((f"{new_key}_{idx}", item))
                            items.append((f"{new_key}_count", len(value)))
                        else:
                            # For complex lists, convert to string
                            items.append((new_key, json.dumps(value)))
                    else:
                        items.append((new_key, None))
                else:
                    items.append((new_key, value))
        else:
            items.append((parent_key, nested_json))

        return dict(items)

    @staticmethod
    def flatten_call_analysis(analysis: Dict) -> Dict:
        """
        Flatten a call analysis structure.
        Returns: dict with flattened keys like 'Functional_Call_ID', etc.
        """
        if not isinstance(analysis, dict):
            return {}

        if 'error' in analysis:
            return {'analysis_error': analysis.get('error', '')}

        return CallDataFlattener.flatten_json(analysis)


class ProcessingJob:
    """Tracks the state of a CSV processing job"""

    def __init__(self, filename: str):
        self.job_id = str(uuid.uuid4())
        self.filename = filename
        self.status = "pending"  # pending → processing → completed/failed
        self.created_at = datetime.now()
        self.started_at = None
        self.completed_at = None
        self.total_records = 0
        self.processed = 0
        self.successful = 0
        self.failed = 0
        self.errors: List[Dict] = []

    def to_dict(self) -> Dict:
        """Convert to dictionary for MongoDB storage"""
        return {
            "job_id": self.job_id,
            "filename": self.filename,
            "status": self.status,
            "created_at": self.created_at.isoformat(),
            "started_at": self.started_at.isoformat() if self.started_at else None,
            "completed_at": self.completed_at.isoformat() if self.completed_at else None,
            "total_records": self.total_records,
            "processed": self.processed,
            "successful": self.successful,
            "failed": self.failed,
            "errors": self.errors
        }

    def add_error(self, row_num: int, store_name: str, error: str):
        """Log an error for a specific row"""
        self.errors.append({
            "row": row_num,
            "store": store_name,
            "error": error
        })
        self.failed += 1

    def mark_success(self):
        """Mark one record as successfully processed"""
        self.successful += 1
        self.processed += 1

    def mark_processing(self):
        """Mark job as started"""
        self.status = "processing"
        self.started_at = datetime.now()

    def mark_completed(self):
        """Mark job as completed"""
        self.status = "completed"
        self.completed_at = datetime.now()

    def mark_failed(self):
        """Mark job as failed"""
        self.status = "failed"
        self.completed_at = datetime.now()


class CallUploadProcessor:
    """Main orchestrator for CSV upload processing"""

    def __init__(self, api_key: str):
        """
        Initialize processor with Gemini API key.
        """
        self.api_key = api_key
        self.downloader = AudioDownloader(timeout=60)
        self.analyzer = GeminiAudioAnalyzer(api_key=api_key)
        self.prompt = PromptTemplate.get_audio_call_prompt()
        self.jobs: Dict[str, ProcessingJob] = {}
        self.processed_calls: List[Dict] = []

    def create_call_id(self, store_name: str, date: str, url: str) -> str:
        """Create unique call ID from store name, date, and URL hash"""
        import hashlib
        url_hash = hashlib.md5(url.encode()).hexdigest()[:6].upper()
        clean_store = store_name.replace(' ', '_')[:15]
        clean_date = date.replace('-', '')[:8]
        return f"CALL_{clean_store}_{clean_date}_{url_hash}"

    def process_single_call(
        self,
        row_num: int,
        row_data: Dict[str, Any],
        job: ProcessingJob
    ) -> Tuple[Optional[Dict], Optional[str]]:
        """
        Process a single call: download → analyze → flatten.
        Returns: (call_record, error_message)
        """
        try:
            store_name = row_data.get('Store Name', 'Unknown')
            url = row_data.get('Recording URL')

            if not url:
                job.add_error(row_num, store_name, "No recording URL")
                return None, "No recording URL"

            # 1. Download audio
            print(f"\n[UPLOAD] Row {row_num}: {store_name}")
            audio_data, download_error = self.downloader.download(url)

            if download_error:
                job.add_error(row_num, store_name, f"Download: {download_error}")
                return None, download_error

            if _is_wav_audio(audio_data, source_url=url):
                print("[AUDIO] Converting WAV to MP3 before Gemini upload...")
                mp3_data, convert_error = _convert_wav_to_mp3(audio_data)
                if convert_error:
                    job.add_error(row_num, store_name, f"Conversion: {convert_error}")
                    return None, convert_error
                audio_data = mp3_data

            # 2. Analyze with Gemini
            analysis, gemini_error = self.analyzer.analyze_with_retry(
                audio_data=audio_data,
                row_data=row_data,
                prompt_template=self.prompt,
                max_retries=5,
                retry_delay=10
            )

            if gemini_error:
                job.add_error(row_num, store_name, f"Analysis: {gemini_error}")
                return None, gemini_error

            # 3. Create call record with metadata
            call_id = self.create_call_id(store_name, row_data.get('Date', ''), url)

            call_record = {
                "call_id": call_id,
                "store_name": store_name,
                "locality": row_data.get('Locality', 'Unknown'),
                "city": row_data.get('City', 'Unknown'),
                "state": row_data.get('State', 'Unknown'),
                "region": row_data.get('Region', 'Unknown'),
                "call_date": row_data.get('Date', 'Unknown'),
                "duration_seconds": _safe_int(row_data.get('Duration', 0), default=0),
                "recording_url": url,
                "analysis": analysis,
                "flattened_data": CallDataFlattener.flatten_call_analysis(analysis),
                "upload_timestamp": datetime.now().isoformat(),
            }

            # Sanitize NaN values before returning
            call_record = sanitize_nan(call_record)

            print(f"[UPLOAD] ✅ Row {row_num} processed successfully")
            job.mark_success()
            return call_record, None

        except Exception as e:
            error_msg = f"Processing error: {str(e)}"
            job.add_error(row_num, row_data.get('Store Name', 'Unknown'), error_msg)
            return None, error_msg

    def process_csv_file(
        self,
        csv_file_path: str,
        rate_limit_delay: float = 10.0
    ) -> str:
        """
        Process entire CSV file.
        
        Args:
            csv_file_path: Path to uploaded CSV file
            rate_limit_delay: Seconds to wait between API calls (to avoid quota limits)
        
        Returns: job_id for tracking progress
        """
        job = ProcessingJob(filename=csv_file_path.split('/')[-1])
        self.jobs[job.job_id] = job

        try:
            # 1. Load CSV
            print(f"\n[UPLOAD] Loading CSV: {csv_file_path}")
            df = pd.read_csv(csv_file_path)

            # 2. Validate structure
            is_valid, error = CSVValidator.validate(df)
            if not is_valid:
                job.status = "failed"
                job.errors = [{"error": error}]
                return job.job_id

            job.total_records = len(df)
            job.mark_processing()
            print(f"[UPLOAD] Starting to process {len(df)} calls...")

            # 3. Process each row
            self.processed_calls = []

            for idx, row in df.iterrows():
                row_num = idx + 1
                row_data = row.to_dict()

                call_record, error = self.process_single_call(row_num, row_data, job)

                if call_record:
                    self.processed_calls.append(call_record)

                # Rate limiting to avoid Gemini API quota issues
                time.sleep(rate_limit_delay)

            job.mark_completed()
            print(f"\n[UPLOAD] ✅ Processing complete: {job.successful}/{job.total_records} successful")
            return job.job_id

        except Exception as e:
            job.mark_failed()
            job.errors = [{"error": str(e)}]
            print(f"[UPLOAD] ❌ Processing failed: {str(e)}")
            return job.job_id

    def get_job_status(self, job_id: str) -> Optional[Dict]:
        """Get status of a processing job"""
        job = self.jobs.get(job_id)
        return job.to_dict() if job else None

    def get_processed_calls(self) -> List[Dict]:
        """Get list of all processed calls from last job"""
        return self.processed_calls


if __name__ == "__main__":
    print("Call Upload Processing Service Module")
    print("Import this module to use CallUploadProcessor")

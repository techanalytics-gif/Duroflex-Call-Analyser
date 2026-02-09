"""
Audio Call Processor Service
Handles downloading audio files and processing them through Gemini API
"""

import os
import json
import time
import tempfile
import requests
import google.generativeai as genai
from typing import Optional, Dict, Tuple, Any
from datetime import datetime


def _detect_audio_filetype(audio_data: bytes, source_url: Optional[str] = None) -> Tuple[str, str]:
    """Best-effort detection for temp file suffix + mime_type for Gemini upload.

    We previously forced .mp3 + audio/mp3 even when the source was a .wav URL.
    That can cause partial/incorrect decoding and lower-quality analysis.
    """
    data = audio_data or b""

    # Signature sniffing (preferred)
    if len(data) >= 12 and data[:4] == b"RIFF" and data[8:12] == b"WAVE":
        return ".wav", "audio/wav"
    if len(data) >= 3 and data[:3] == b"ID3":
        return ".mp3", "audio/mpeg"
    if len(data) >= 2 and data[0] == 0xFF and (data[1] & 0xE0) == 0xE0:
        # MP3 frame sync
        return ".mp3", "audio/mpeg"
    if len(data) >= 4 and data[:4] == b"OggS":
        return ".ogg", "audio/ogg"
    if len(data) >= 4 and data[:4] == b"fLaC":
        return ".flac", "audio/flac"
    if len(data) >= 12 and data[4:8] == b"ftyp":
        # Likely mp4/m4a container
        return ".m4a", "audio/mp4"

    # URL-based fallback
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

    # Safe default
    return ".mp3", "audio/mpeg"


def _safe_fill_prompt_template(prompt_template: str, values: Dict[str, Any]) -> str:
    """Replace known {tokens} without using str.format().

    The prompt contains a JSON schema with many braces which would break str.format().
    """
    prompt = prompt_template
    for key, value in (values or {}).items():
        token = "{" + str(key) + "}"
        if token in prompt:
            prompt = prompt.replace(token, str(value))
    return prompt


class AudioDownloader:
    """Downloads and validates audio files from URLs"""

    def __init__(self, timeout: int = 60):
        self.timeout = timeout

    def download(self, url: str) -> Tuple[Optional[bytes], Optional[str]]:
        """
        Download audio from URL.
        Returns: (audio_bytes, error_message)
        """
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
            return None, f"HTTP Error {e.response.status_code}"
        except Exception as e:
            return None, f"Download failed: {str(e)}"


class GeminiAudioAnalyzer:
    """Analyzes audio calls using Gemini API"""

    def __init__(self, api_key: str, model: str = "gemini-2.5-flash"):
        """
        Initialize Gemini analyzer
        
        Args:
            api_key: Gemini API key
            model: Model name (default: gemini-2.5-pro for best performance)
        """
        self.model_name = model
        self.api_key = api_key

        # Configure Gemini API
        genai.configure(api_key=api_key)

        # Configure model with JSON output
        generation_config = genai.GenerationConfig(
            temperature=0.1,
            top_p=0.95,
            max_output_tokens=8192,
            response_mime_type="application/json"
        )

        self.model = genai.GenerativeModel(
            model_name=model,
            generation_config=generation_config
        )

        print(f"[GEMINI] Initialized: {model}")

    def analyze(
        self,
        audio_data: bytes,
        row_data: Dict[str, Any],
        prompt_template: str
    ) -> Tuple[Optional[Dict], Optional[str]]:
        """
        Analyze audio call using Gemini.
        
        Args:
            audio_data: Raw audio bytes
            row_data: CSV row data (store name, city, date, etc.)
            prompt_template: Prompt template with {placeholders}
        
        Returns: (analysis_dict, error_message)
        """
        temp_path = None
        uploaded_file = None

        try:
            # 1. Save bytes to temporary file
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

            print(f"[GEMINI] Uploading audio to Gemini storage...")

            # 2. Upload to Gemini File API
            uploaded_file = genai.upload_file(temp_path, mime_type=mime_type)

            # Wait for processing
            while uploaded_file.state.name == "PROCESSING":
                time.sleep(1)
                uploaded_file = genai.get_file(uploaded_file.name)

            if uploaded_file.state.name == "FAILED":
                return None, "Gemini file processing failed"

            # 3. Inject row context into the prompt without using str.format()
            # (the schema JSON braces would break .format).
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

            print(f"[GEMINI] Analyzing audio...")

            # 4. Send to Gemini with file reference
            response = self.model.generate_content([prompt, uploaded_file])

            if not response.text:
                return None, "Empty response from Gemini"

            # 5. Parse JSON response
            json_text = response.text.strip()

            # Remove markdown code blocks if present
            if json_text.startswith("```"):
                json_text = json_text.split("```")[1]
                if json_text.startswith("json"):
                    json_text = json_text[4:]
            json_text = json_text.strip()

            analysis = json.loads(json_text)
            print(f"[GEMINI] Analysis complete")
            return analysis, None

        except json.JSONDecodeError as e:
            # Return partial response with parse error
            return {"parse_error": str(e), "raw_response": response.text}, None
        except Exception as e:
            return None, f"Analysis error: {str(e)}"

        finally:
            # 6. Cleanup
            if temp_path and os.path.exists(temp_path):
                try:
                    os.remove(temp_path)
                except:
                    pass

            if uploaded_file:
                try:
                    genai.delete_file(uploaded_file.name)
                except:
                    pass

    def analyze_with_prompt(
        self,
        audio_data: bytes,
        prompt: str
    ) -> Tuple[Optional[Dict], Optional[str]]:
        """
        Analyze audio call using a fully formatted prompt.

        Args:
            audio_data: Raw audio bytes
            prompt: Fully formatted prompt (no placeholders)

        Returns: (analysis_dict, error_message)
        """
        temp_path = None
        uploaded_file = None

        try:
            suffix, mime_type = _detect_audio_filetype(audio_data, source_url=None)
            with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as temp_file:
                temp_file.write(audio_data)
                temp_path = temp_file.name

            print(f"[GEMINI] Uploading audio to Gemini storage...")

            uploaded_file = genai.upload_file(temp_path, mime_type=mime_type)

            while uploaded_file.state.name == "PROCESSING":
                time.sleep(1)
                uploaded_file = genai.get_file(uploaded_file.name)

            if uploaded_file.state.name == "FAILED":
                return None, "Gemini file processing failed"

            print(f"[GEMINI] Analyzing audio...")

            response = self.model.generate_content([prompt, uploaded_file])

            if not response.text:
                return None, "Empty response from Gemini"

            json_text = response.text.strip()

            if json_text.startswith("```"):
                json_text = json_text.split("```")[1]
                if json_text.startswith("json"):
                    json_text = json_text[4:]
            json_text = json_text.strip()

            analysis = json.loads(json_text)
            print(f"[GEMINI] Analysis complete")
            return analysis, None

        except json.JSONDecodeError as e:
            return {"parse_error": str(e), "raw_response": response.text}, None
        except Exception as e:
            return None, f"Analysis error: {str(e)}"

        finally:
            if temp_path and os.path.exists(temp_path):
                try:
                    os.remove(temp_path)
                except:
                    pass

            if uploaded_file:
                try:
                    genai.delete_file(uploaded_file.name)
                except:
                    pass

    def analyze_with_retry(
        self,
        audio_data: bytes,
        row_data: Dict[str, Any],
        prompt_template: str,
        max_retries: int = 3,
        retry_delay: int = 5
    ) -> Tuple[Optional[Dict], Optional[str]]:
        """
        Analyze audio with automatic retry on failure.
        
        Args:
            audio_data: Raw audio bytes
            row_data: CSV row data
            prompt_template: Prompt template
            max_retries: Maximum retry attempts
            retry_delay: Delay between retries (seconds)
        
        Returns: (analysis_dict, error_message)
        """
        last_error = None

        for attempt in range(1, max_retries + 1):
            result, error = self.analyze(audio_data, row_data, prompt_template)

            if result is not None:
                return result, None

            last_error = error
            print(f"[GEMINI] Attempt {attempt}/{max_retries} failed: {error}")

            if attempt < max_retries:
                wait_time = retry_delay * attempt
                print(f"[GEMINI] Retrying in {wait_time}s...")
                time.sleep(wait_time)

        return None, f"All {max_retries} attempts failed: {last_error}"


class PromptTemplate:
    """Manages Gemini analysis prompt templates"""

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
        "Consideration_Value": "(REQUIRED)String ('Below 15k', '15k-25k', '25k-50k', '50k+')",
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
        "Timeline_to_Purchase": "Immediate | Short Term | Long Term | Unknown",
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
        "Score": "Integer (0-10)",
        "Comment": "String (Inferred sentiment)"
    },
      "Transcript_Log": "String (Full Transcript with proper definition of what is said by Agent and Customer with timestamps.
                      for example [Agent](0:02): Hello, thank you for calling Duroflex. I see you were interested in our mattresses. How can I assist you today?
                      [Customer](0:05): Hi, yes I was looking at the Duroflex Sleepyhead mattress)"
}
'''


if __name__ == "__main__":
    print("Audio Processor Service Module")
    print("Import this module to use AudioDownloader, GeminiAudioAnalyzer, and PromptTemplate")
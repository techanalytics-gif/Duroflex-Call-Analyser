"""
Outbound Call Processor Service
Handles filtering Pre-Purchase vs Post-Purchase and full analysis
"""

import json
import uuid
import time
import pandas as pd
import math
from typing import Optional, Dict, List, Tuple, Any
from datetime import datetime
from audio_processor import AudioDownloader, GeminiAudioAnalyzer, PromptTemplate
import google.generativeai as genai
import os
from dotenv import load_dotenv

load_dotenv()

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
# Cheap model for filtering (use a model that exists for v1beta/generateContent)
# You can override via MODEL_LITE in .env
MODEL_NAME_LITE = os.getenv("MODEL_LITE", "gemini-flash-lite-latest")
MODEL_NAME_FULL = os.getenv("MODEL", "gemini-2.5-pro")  # Full model for analysis

if not GEMINI_API_KEY:
    raise ValueError("GEMINI_API_KEY not found in .env file")

genai.configure(api_key=GEMINI_API_KEY)


def sanitize_nan(obj):
    """Recursively replace NaN values with None for JSON serialization."""
    if isinstance(obj, dict):
        return {k: sanitize_nan(v) for k, v in obj.items()}
    elif isinstance(obj, list):
        return [sanitize_nan(item) for item in obj]
    elif isinstance(obj, float) and math.isnan(obj):
        return None
    return obj


class OutboundCSVValidator:
    """Validates CSV structure for outbound call uploads"""

    REQUIRED_COLUMNS = [
        'Store_Name__c',
        'Phone_Number__c',
        'Duration',
        'CallAudio',
        'CallStartDateTime',
        'CreatedDate',
        'Lead_Source',
        'Date'
    ]

    @staticmethod
    def validate(df: pd.DataFrame) -> Tuple[bool, Optional[str]]:
        """
        Validate CSV has required columns.
        Returns: (is_valid, error_message)
        """
        missing = [col for col in OutboundCSVValidator.REQUIRED_COLUMNS if col not in df.columns]

        if missing:
            return False, f"Missing columns: {', '.join(missing)}"

        if len(df) == 0:
            return False, "CSV is empty"

        return True, None


class PurchaseIntentFilter:
    """Filters calls into Pre-Purchase and Post-Purchase using cheap model"""

    def __init__(self, api_key: str, model: str = MODEL_NAME_LITE):
        """Initialize with lite model for quick filtering"""
        self.model_name = model
        self.api_key = api_key
        
        generation_config = genai.GenerationConfig(
            temperature=0.1,
            top_p=0.95,
            max_output_tokens=500,
            response_mime_type="application/json"
        )
        
        self.model = genai.GenerativeModel(
            model_name=model,
            generation_config=generation_config
        )
        
        print(f"[FILTER] Initialized with model: {model}")

    def classify_call_type(self, audio_data: bytes, duration: int) -> Tuple[Optional[str], Optional[str]]:
        """
        Quickly classify if call is Pre-Purchase or Post-Purchase.
        
        Args:
            audio_data: Raw audio bytes
            duration: Call duration in seconds
        
        Returns: (call_type, error_message)
                call_type: "PRE_PURCHASE" or "POST_PURCHASE"
        """
        try:
            # Create temp file for audio
            import tempfile
            with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
                tmp.write(audio_data)
                tmp_path = tmp.name

            try:
                # Upload to Gemini
                print(f"[FILTER] Uploading audio for classification ({len(audio_data)} bytes)...")
                audio_file = genai.upload_file(tmp_path)
                
                # Classification prompt - very simple and fast
                prompt = """Analyze this call and respond with ONLY valid JSON:
{
    "call_type": "PRE_PURCHASE or POST_PURCHASE",
    "confidence": 0.0 to 1.0,
    "reason": "brief reason"
}

Context: This is a follow-up call from Duroflex to a customer who visited a store but didn't buy.
- PRE_PURCHASE: Customer is interested but hasn't decided yet, wants more info, has concerns to resolve, might still buy
- POST_PURCHASE: Customer already purchased from Duroflex or elsewhere, bought the product already, call is just check-in

Listen for language like:
- PRE_PURCHASE cues: "still thinking", "want to know", "comparing", "need time", "concerned about", "interested but"
- POST_PURCHASE cues: "already bought", "already have", "purchased", "delivered", "using", "happy with", "got it"

Return only the JSON object, no other text."""

                response = self.model.generate_content([prompt, audio_file])
                
                # Clean file
                genai.delete_file(audio_file.name)
                
                # Parse response
                result_text = response.text.strip()
                
                # Try to extract JSON
                try:
                    result = json.loads(result_text)
                    call_type = result.get("call_type", "").upper()
                    
                    if "PRE_PURCHASE" in call_type or "PRE-PURCHASE" in call_type:
                        return "PRE_PURCHASE", None
                    elif "POST_PURCHASE" in call_type or "POST-PURCHASE" in call_type:
                        return "POST_PURCHASE", None
                    else:
                        return None, f"Could not classify call type: {call_type}"
                except json.JSONDecodeError:
                    # Try to extract from text
                    if "post" in result_text.lower() and "purchase" in result_text.lower():
                        return "POST_PURCHASE", None
                    elif "pre" in result_text.lower() or "not" in result_text.lower() and "purchase" in result_text.lower():
                        return "PRE_PURCHASE", None
                    else:
                        return None, f"Could not parse response: {result_text}"
                        
            finally:
                # Clean up temp file
                import os
                if os.path.exists(tmp_path):
                    os.remove(tmp_path)

        except Exception as e:
            print(f"[FILTER] Classification error: {str(e)}")
            return None, f"Classification failed: {str(e)}"


class OutboundCallUploadProcessor:
    """Orchestrates CSV upload → Filtering → Full Analysis → MongoDB storage"""

    def __init__(self):
        self.audio_downloader = AudioDownloader()
        self.intent_filter = PurchaseIntentFilter(GEMINI_API_KEY, MODEL_NAME_LITE)
        self.analyzer_full = GeminiAudioAnalyzer(GEMINI_API_KEY, MODEL_NAME_FULL)
        
        self.job_id = str(uuid.uuid4())
        self.processed_calls = []
        self.discarded_calls = []
        self.job_status = {
            "job_id": self.job_id,
            "status": "pending",
            "total_records": 0,
            "processed": 0,
            "successful": 0,
            "failed": 0,
            "filtered_out": 0,
            "errors": []
        }

    def process_csv_file(self, csv_file_path: str, rate_limit_delay: float = 2.0) -> str:
        """
        Process CSV file with Pre/Post-Purchase filtering.
        
        Pipeline:
        1. Validate CSV structure
        2. For each row:
           a. Download audio
           b. Extract first 20 seconds
           c. Classify as PRE or POST purchase
           d. If PRE: Full analysis with Gemini
           e. If POST: Save to discarded_calls collection
        3. Return job_id
        """
        try:
            # Read CSV
            df = pd.read_csv(csv_file_path)

            # Normalize headers (strip whitespace) so strict checks don't fail due to trailing spaces
            df.columns = df.columns.str.strip()
            
            # Validate
            is_valid, error_msg = OutboundCSVValidator.validate(df)
            if not is_valid:
                raise ValueError(error_msg)
            
            self.job_status["status"] = "processing"
            self.job_status["total_records"] = len(df)
            
            print(f"[OUTBOUND] Processing {len(df)} outbound call records...")
            
            for idx, row in df.iterrows():
                try:
                    row_num = idx + 2  # +2 for header and 1-based indexing
                    
                    # Extract row data
                    store_name = str(row.get('Store_Name__c', '')).strip()
                    recording_url = str(row.get('CallAudio', '')).strip()
                    duration_str = str(row.get('Duration', '0')).strip()
                    # Parse duration from HH:MM:SS format to seconds
                    if ':' in duration_str:
                        parts = duration_str.split(':')
                        if len(parts) == 3:
                            duration = int(parts[0]) * 3600 + int(parts[1]) * 60 + int(parts[2])
                        else:
                            duration = 0
                    else:
                        duration = int(duration_str) if duration_str.isdigit() else 0

                    # Skip very short calls
                    if duration and duration < 30:
                        print(f"[OUTBOUND] Row {row_num}: Duration {duration}s < 30s. Skipping.")
                        self.job_status["filtered_out"] += 1
                        self.job_status["processed"] += 1
                        time.sleep(rate_limit_delay)
                        continue
                    
                    customer_phone = str(row.get('Phone_Number__c', '')).strip()
                    call_date = str(row.get('Date', row.get('CallStartDateTime', ''))).strip()
                    created_date = str(row.get('Date', row.get('CreatedDate', ''))).strip()
                    lead_source = str(row.get('Lead_Source', '')).strip()
                    is_converted = str(row.get('is_Converted', '0')).strip()

                    # Store Walkin CSV does not provide customer name
                    customer_name = None

                    print(f"\n[ROW {row_num}] {store_name} - {customer_phone}")
                    
                    # Generate unique call_id
                    import hashlib
                    call_id_hash = hashlib.md5(recording_url.encode()).hexdigest()[:8]
                    call_id = f"SWL_{store_name.replace(' ', '')}_{call_id_hash}"
                    
                    # Download audio
                    print(f"[OUTBOUND] Downloading audio...")
                    audio_data, dl_error = self.audio_downloader.download(recording_url)
                    
                    if audio_data is None:
                        self._add_error(row_num, store_name, dl_error or "Download failed")
                        continue
                    
                    # Extract first 20 seconds (20000ms = ~320KB at 128kbps, but we'll extract what we can)
                    print(f"[OUTBOUND] Classifying call type (first 20 seconds)...")
                    call_type, filter_error = self.intent_filter.classify_call_type(audio_data, duration)
                    
                    if call_type is None:
                        self._add_error(row_num, store_name, filter_error or "Classification failed")
                        continue
                    
                    # Create base record
                    base_record = {
                        "call_id": call_id,
                        "store_name": store_name,
                        "customer_phone": customer_phone,
                        "call_date": call_date,
                        "created_date": created_date,
                        "lead_source": lead_source,
                        "is_converted": is_converted,
                        "duration": duration,
                        "recording_url": recording_url,
                        "call_type": call_type,
                        "analyzed_at": datetime.now().isoformat()
                    }
                    
                    # If POST-PURCHASE, save to discarded and continue
                    if call_type == "POST_PURCHASE":
                        print(f"[OUTBOUND] Call is POST_PURCHASE - storing in discarded_calls")
                        base_record["discard_reason"] = "Post-purchase call - customer already bought"
                        self.discarded_calls.append(base_record)
                        self.job_status["filtered_out"] += 1
                        self.job_status["processed"] += 1
                        time.sleep(rate_limit_delay)
                        continue
                    
                    # PRE-PURCHASE: Do full analysis
                    print(f"[OUTBOUND] Call is PRE_PURCHASE - performing full analysis...")
                    
                    # Create fully formatted prompt with context
                    prompt_str = self._create_prompt_template(base_record)
                    
                    # Analyze using fully formatted prompt
                    try:
                        analysis, analysis_error = self.analyzer_full.analyze_with_prompt(
                            audio_data=audio_data,
                            prompt=prompt_str
                        )
                        
                        if analysis is None:
                            error_msg = analysis_error or "Analysis failed (returned None)"
                            print(f"[OUTBOUND] ❌ Analysis failed for row {row_num}: {error_msg}")
                            self._add_error(row_num, store_name, error_msg)
                            continue
                        
                        print(f"[OUTBOUND] ✅ Analysis completed for row {row_num}")

                        # Normalize fields for storage consistency (avoid casing/alias issues)
                        if isinstance(analysis, dict):
                            funnel = analysis.get("5_Funnel_Analysis")
                            if isinstance(funnel, dict) and "Reason" not in funnel:
                                for alt_key in ("reason", "Rationale", "Why", "Stage_Reason", "StageReason"):
                                    alt_val = funnel.get(alt_key)
                                    if isinstance(alt_val, str) and alt_val.strip():
                                        funnel["Reason"] = alt_val
                                        break
                        
                        # Store successful record
                        base_record["analysis"] = analysis
                        self.processed_calls.append(base_record)
                        self.job_status["successful"] += 1
                        self.job_status["processed"] += 1
                        
                        print(f"[OUTBOUND] ✓ Row {row_num} processed successfully")
                    except Exception as analysis_exc:
                        error_msg = f"Analysis exception: {str(analysis_exc)}"
                        print(f"[OUTBOUND] ❌ {error_msg}")
                        self._add_error(row_num, store_name, error_msg)
                        continue
                    
                    # Rate limiting
                    time.sleep(rate_limit_delay)
                    
                except Exception as row_error:
                    print(f"[ERROR ROW {row_num}] {str(row_error)}")
                    self._add_error(row_num, str(row.get('Store_Name__c', 'Unknown')), str(row_error))
            
            self.job_status["status"] = "completed"
            print(f"\n[OUTBOUND] Processing complete!")
            print(f"  Total: {self.job_status['total_records']}")
            print(f"  Processed: {self.job_status['processed']}")
            print(f"  Successful: {self.job_status['successful']}")
            print(f"  Filtered (Post-Purchase): {self.job_status['filtered_out']}")
            print(f"  Failed: {self.job_status['failed']}")
            
            return self.job_id
            
        except ValueError as ve:
            print(f"[OUTBOUND] Validation error: {str(ve)}")
            raise
        except Exception as e:
            print(f"[OUTBOUND] Processing error: {str(e)}")
            self.job_status["status"] = "error"
            raise

    def _create_prompt_template(self, call_record: Dict) -> str:
        """Create the outbound store-walkin analysis prompt (ABC-style schema)."""

        # Keep the output schema in a non-f-string so curly braces don't get interpreted
        # by Python's f-string formatter.
        output_schema = """{
  "MetaData": { 
    "Customer_Name": "String",
    "Customer_Location": "String",
    "Agent_Name": "String (REQUIRED if available)",
    "Call_Region": "String(REQUIRED - South/North/East/West as per the location)",
    "Customer_Language": "String",
    "Customer_Gender": "Male | Female | Unknown",
    "Customer_Age_Group": "Young Adult | Middle Aged | Senior | Unknown",
    "Consideration_Value": "(REQUIRED)String ('Below 15k', '15k-25k', '25k-50k', '50k+')",
    "Call_Quality_Overall": "High | Medium | Low",
    "Call_Duration": "String(Format : MM:SS)",
    "Connected_to_Customer": true,
    "Customer_Enthusiasm": "High | Medium | Low"
  },
  "Call_Summary": "String (Max 150 words - Focus on the store feedback and call outcome)",
  "1_Call_Objective": {
    "Type": "Store Walk-in Recovery | Post-Purchase Check",
    "Objective_Phrase": "String"
  },
  "2_Intent_to_Purchase": {
    "Rating": "High | Medium | Low | Already Purchased",
    "Reason": "String (Evidence based)"
  },
  "3_Store_Experience": {
    "Rating": "High | Medium | Low",
    "Reason": "String (Why did they leave without buying? Staff/Stock/Price?)"
  },
  "4_Call_Experience": {
    "Rating": "High | Medium | Low",
    "Reason": "String (How well did the agent handle the feedback?)"
  },
  "5_Funnel_Analysis": {
        "Stage": "Awareness | Consideration | Action | Already Purchased",
        "Reason": "String (REQUIRED - evidence-based reasoning for the stage)",
    "Timeline_to_Purchase": "Immediate (2-3 days) | Short Term (within a week) | Long Term (more than a week) | Unknown (unclear)",
    "Timeline_to_Purchase_Reason": "String (REQUIRED - evidence based reasoning)"
  },
  "6_Product_Intelligence": {
    "Narrow_Down_Stage": "Category | Range | Specific SKU | NA",
    "Product_of_Interest": "String",
    "Approx_Order_Value": "String (or NA)"
  },
  "7_Customer_Needs": {
    "Description": "String (Who is it for? Key pain points? Constraints?)"
  },
  "8_Purchase_Barriers": {
    "At_Store": "String (Why they walked out?)",
    "On_Call": "String (Why they aren't buying now?)"
  },
  "9_Decision_Maker": "Caller | Spouse | Joint | Unknown",
  "10_Invitations": {
    "Home_Measurement": {
      "Rating": "High | Medium | Low",
      "Reason": "String (Did agent suggest sending a technician?)"
    }
  },
  "11_Conversion_Hooks": {
    "Offers_Discounts_EMI": {"Status": "Yes | No", "Comment": "String (Did they offer a 'Manager's Discount'?) "},
    "Product_Brochure": {"Status": "Yes | No", "Comment": "String"},
    "Mattress_Measurement": {"Status": "Yes | No", "Comment": "String"},
    "Brand_Legacy_Warranty": {"Status": "Yes | No", "Comment": "String"},
    "Sleep_Trial": {"Status": "Yes | No", "Comment": "String"}
  },
  "12_RELAX_Framework": {
    "R_Reach_Out": {
      "Score": "H/M/L",
      "Reason": "Context setting (Mentioning the store visit)"
    },
    "E_Explore_Needs": {
      "Score": "H/M/L",
      "Reason": "Probing for walk-out reason"
    },
    "L_Link_Product": {
      "Score": "H/M/L",
      "Reason": "Re-affirming store demo experience"
    },
    "A_Add_Value": {
      "Score": "H/M/L",
      "Reason": "Offering Home Measure/Discount"
    },
    "X_Express_Closing": {
      "Score": "H/M/L",
      "Reason": "Next steps/Appointment Setting"
    }
  },
  "13_Agent_Evaluation": {
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
  "14_Agent_Learnings": [
    "String (Feedback 1)",
    "String (Feedback 2)",
    "String (Feedback 3)"
  ],
  "15_Next_Actions": "String (e.g. Schedule Technician Visit, Send Brochure)",
  "16_End_to_End_NPS": {
    "Score": "(REQUIRED)Integer (0-10)",
    "Comment": "String (For the Call Experience)"
  },
    "Transcript_Log": "String (Full Transcript with proper definition of what is said by Agent and Customer with timestamps.
                      for example [Agent](0:02): Hello, thank you for calling Duroflex. I see you were interested in our mattresses. How can I assist you today?
                      [Customer](0:05): Hi, yes I was looking at the Duroflex Sleepyhead mattress)"
}"""

        # NOTE: This prompt is intentionally kept verbatim to the user-provided text.
        # We avoid f-strings here so {INPUT_AUDIO_FILE} remains literal.
        full_prompt = (
            "Key Information to Extract\n"
            "MetaData: Customer name, Customer location, Call Region, Customer Language, Customer Gender, Customer Age, Consideration Value/Price | Call Quality(Agent + Customer), Call Duration, Connected to Customer?, Customer Availability/Enthusiasm (H/M/L)\n\n"
            "Call Summary: Crisp and simple in few sentences (less than 150 words)\n\n"
            "Features:\n"
            "1. Sales Lead or Already Purchased, Call Objective Phrase\n"
            "2. Intent to Purchase (High/Med/Low/Already Purchased) - State Why in few words <Important Aspect>\n"
            "3. Customer Experience at Store  (High/Med/Low) - (How happy were they with the store visit?) State Why in few words <Important Aspect>\n"
            "4. Customer Experience on Call (High/Med/Low) - State Why in few words <Important Aspect>\n"
            "4. Customer Funnel Stage (Awareness, Consideration, Action, Already Purchased) - include Reason (evidence-based) and Timeline to purchase\n"
            "5. Product Narrow Down stage (Category, Range, SKU), Product of Interest, Order Value (Approximate, if low confidence say NA)\n"
            "6. Customer's Need Description (What? For Whom? Why? Constraints?)\n"
            "7. Purchase Barrier at Store, Purchase Barrier on Call\n"
            "8. Decision Maker identification\n"
            "9. Invitation to Home Measurement (H/M/L _ Reason)\n"
            "10. Conversion Hook (Offers/Discounts/No Cost emi, Product Brochure, Mattress/Product measurement, Brand Legacy and Warranty, Sleep Trial) - Yes/No and Comment about the aspect\n"
            "11.  Relax Framework {Score H/M/L + reasons for each} (- R_Reach_Out: Greeting & Brand Name usage\n"
            "- E_Explore_Needs: Discovery of user needs/pain points\n"
            "- L_Link_Product: Linking need to Product\n"
            "- A_Add_Value: Mentioning offers/financing/accessories\n"
            "- X_Express_Closing: Next steps/Move closer to Purchase)\n"
            "12. Agent Evaluation [Main: Agent Product Knowledge and Agent Sales Skills Ratings (also Upsell revenue skills)],[Secondary: Need Discovery, Objection Handling, Agent Nature (Proactive/Responsive) ( Scale of High / Med / Low)]\n"
            "13. Agent Learnings [ Top 1 to 3 Areas of Feedback for Agent, keep it crisp]\n"
            "14. Next Actions for Duroflex\n"
            "15. End to End NPS Rating Score by Customer (for the Call) and comment for Feedback\n\n"
            "Transcript: Entire Conversation transcript in English with proper definition of what is said by Agent and Customer\n\n\n"
            "Prompt\n"
            "Role: You are an Expert Retail Sales Auditor for Duroflex. \n"
            "Task: Analyze the provided Audio Recording of an Outbound Call made to a customer who recently visited a physical store but left without purchasing. \n"
            "Goal: Extract intelligence on the Store Experience, pinpoint the Walk-out Reason, and evaluate the agent's effectiveness in re-engaging the customer through vocal sentiment and dialogue.\n"
            "INPUT DATA\n"
            "Audio Source: {INPUT_AUDIO_FILE} (Note: Analyze the raw audio for sentiment, interruptions, and environmental context)\n"
            "INSTRUCTIONS\n"
            "Auditory Experience Audit: Listen for the customer's \"Emotional Charge\" when discussing their store visit. Do they sound frustrated (indicating a bad service experience) or thoughtful (indicating they are still weighing the price/decision)?\n"
            "Dual-Layer Analysis:\n"
            "The Past (Store): Extract cues about the physical visit. Did the customer hesitate when asked if they were shown the \"Pressure Test\"? Listen for keywords and tonal shifts related to \"Staff Behavior\" or \"Stock Availability.\"\n"
            "The Present (Call): Evaluate the agent’s \"Vocal Empathy.\" Does the agent sound genuinely interested in solving the customer's barrier, or are they rushing the script?\n"
            "Inference from Tone: Use vocal pitch, response latency (delays in answering), and \"vocal fillers\" (ums/ahs) to infer Customer_Enthusiasm and Customer_Age_Group.\n"
            "The \"Real\" Barrier: Identify if the reason for not buying was \"Functional\" (dimensions/stock) or \"Emotional\" (need for spouse approval/lack of trust), based on how firmly the customer states their objection.\n"
            "Strict JSON: Output ONLY a valid JSON object matching the schema. No conversational filler.\n\n"
            "OUTPUT SCHEMA (JSON)\n"
        ) + output_schema

        return full_prompt

    def _add_error(self, row_num: int, store_name: str, error: str):
        """Add error to job status"""
        self.job_status["errors"].append({
            "row": row_num,
            "store": store_name,
            "error": error
        })
        self.job_status["failed"] += 1

    def get_processed_calls(self) -> List[Dict]:
        """Get all successfully processed pre-purchase calls"""
        return self.processed_calls

    def get_discarded_calls(self) -> List[Dict]:
        """Get all post-purchase discarded calls"""
        return self.discarded_calls

    def get_job_status(self, job_id: str = None) -> Dict:
        """Get current job status"""
        if job_id and job_id != self.job_id:
            return {}
        return self.job_status

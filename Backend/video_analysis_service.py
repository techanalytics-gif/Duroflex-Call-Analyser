import google.generativeai as genai
import os
import json
import pandas as pd
import requests
import tempfile
import time
from pathlib import Path
from dotenv import load_dotenv
from typing import List, Dict
import re
from pymongo import MongoClient
from drive_mirror_integration import trigger_drive_mirror_for_video
from analysis_utils import is_failed_analysis

# Load environment variables
load_dotenv()

# Configure Gemini API
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
MODEL_NAME = os.getenv("MODEL", "gemini-1.5-flash")
MONGODB_URI = os.getenv("MONGODB_URI")
MONGODB_NAME = os.getenv("MONGODB_NAME", "Duroflex")

if not GEMINI_API_KEY:
    raise ValueError("GEMINI_API_KEY not found in .env file")

genai.configure(api_key=GEMINI_API_KEY)

# Video analysis data storage
VIDEO_ANALYSIS_DIR = Path("video_analysis")
VIDEO_ANALYSIS_DIR.mkdir(exist_ok=True)
VIDEO_ANALYSIS_FILE = VIDEO_ANALYSIS_DIR / "video_reports.json"

# Mongo helpers
_mongo_client = None


def get_video_collection():
  """Return Mongo collection for video analyses, or None if unavailable."""
  global _mongo_client
  if not MONGODB_URI:
    return None
  try:
    if _mongo_client is None:
      _mongo_client = MongoClient(MONGODB_URI, serverSelectionTimeoutMS=3000)
      # Trigger a lightweight ping to validate connectivity
      _mongo_client.admin.command("ping")
    db = _mongo_client[MONGODB_NAME]
    return db["video_reports"]
  except Exception as exc:  # Fallback silently to file storage if Mongo is not reachable
    print(f"MongoDB not available, falling back to JSON file storage: {exc}")
    return None


# The exact prompt from user
EXACT_ANALYSIS_PROMPT = """{
  "role": "You are an expert Assisted Sales Call Analyst.",
  "context": "You are analyzing a video-recorded sales interaction between a Duroflex sales agent and a potential customer. Duroflex is an omnichannel B2C brand specializing in mattresses and furniture. Your analysis will be used for agent coaching and quality assurance.",
  "objective": "To meticulously evaluate the agent's performance against a predefined framework, identifying strengths and areas for improvement in their sales technique, technical execution, and ability to convert inquiries into sales or store visits.",
  "input": {
    "videoUrl": "{video_url}"
  },
  "taskFramework": {
    "instructions": {
      "ratingScale": {
        "1": "Poor / Not Attempted",
        "2": "Below Average",
        "3": "Average / Met Minimum Standard",
        "4": "Good / Effective",
        "5": "Excellent / Exemplary"
      },
      "feedback": "For all 'Reasons for Rating' fields, provide 2-3 concise, bulleted points of actionable feedback that justify your score."
    },
    "sections": {
      "Functional": {
        "Call_ID": "Unique identifier for the call being analyzed.",
        "Call_Time": "Timestamp of when the call took place (e.g., 2025-10-21 14:35 IST).",
        "Customer_Name": "Name of the customer (if mentioned in call).",
        "Agent_Name": "Name of the sales agent (as per video or introduction).",
        "Store_Location": "Store location from which the video call is happening.",
        "Customer_Location": "City or specific location mentioned by the customer (e.g., 'Bangalore', 'Indiranagar'). If not mentioned, return 'N/A'.",
        "Customer_Language": "Primary language spoken by the customer during the call (e.g., English, Hindi, Tamil, Mixed).",
        "Agent_Presentability": {
          "Score": "1 to 5",
          "Reason_for_Score": "Reason for how presentable the sales agent appeared (looks, tidiness, grooming, being presentation ready)."
        },
        "Agent_Video_Quality_Rating": "Score: 1 to 5",
        "Agent_Audio_Quality_Rating": "Score: 1 to 5",
        "Customer_Audio_Quality_Rating": "Score: 1 to 5",
        "Call_Objective_Theme": "Summarize the main purpose: e.g., 'Stock Check', 'Price Inquiry', 'Location/Hours', 'Complaint/Service', 'General Product Info'."
      },
      "Customer_Information": {
        "Type_of_Call": "Was this a Sales Call (Pre-purchase) or a Service Call (Post-purchase)?",
        "Interest_Category": "Category of interest (Mattress, Sofa, Bed, Accessories).",
        "Specific_Product_Inquiry": "Did the customer ask about a specific model? List the product name extracted from the conversation or 'General'.",
        "Primary_Questions_Asked": "List the top 3-4 specific questions asked by the user (e.g., 'Is this available in 6 inch?', 'Do you have exchange offer?').",
        "Timeline_to_Purchase": {
          "value": "Short/Medium/Long",
          "criteria": {
            "Short": "Immediate need (Today/This Week).",
            "Medium": "Planning phase (2-4 Weeks).",
            "Long": "Research phase (> 1 Month)."
          }
        },
        "Customer_Stage_AIDA": {
          "value": "Awareness/Interest/Desire/Action",
          "criteria": {
            "Awareness": "General inquiry.",
            "Interest": "Specific feature questions.",
            "Desire": "Comparing/Asking for deals.",
            "Action": "Ready to visit/buy."
          }
        },
        "Intent_to_Visit_Rating": {
          "question": "How likely is the customer to visit the store for a physical trial? (High/Med/Low)",
          "criteria": {
            "HIGH": "Explicit confirmation/Ask for location.",
            "MEDIUM": "Tentative interest in trying the mattress.",
            "LOW": "No commitment/Refusal."
          }
        },
        "Intent_to_Purchase_Rating": {
          "question": "Urgency to buy? (High/Med/Low)",
          "criteria": {
            "HIGH": "Transactional Language: High frequency of questions about price, discounts, payment options.",
            "MEDIUM": "Comparison/Validation Language: Focus on specific product features, materials, pros/cons.",
            "LOW": "Exploratory/Educational Language: Asks broad, open-ended questions about general mattress types."
          }
        },
        "Barriers_to_Conversion": "If Intent is Low/Medium, what is the primary reason? (e.g., 'Price too high', 'Stock Unavailable', 'Location too far', 'Just Researching', 'Bad Agent Handling', 'N/A').",
        "Customer_Satisfaction_Score": {
          "question": "On a scale of 1 to 5, how would the customer rate the agent interaction based on their overall experience?",
          "criteria": {
            "5": "Excellent: Customer expresses explicit satisfaction.",
            "3": "Average: Neutral tone, transactional.",
            "1": "Poor: Explicit frustration or ends call abruptly."
          }
        },
        "Business_Satisfaction_Score": {
          "question": "On a scale of 1 to 5, if the Brand Leadership (CEO/CMO/CSO) watched this call, how would they rate it as a representation of the brand?",
          "criteria": {
            "5": "Brand Ambassador: Perfect pitch, excellent etiquette, high conversion effort.",
            "3": "Standard: Did the job, but nothing memorable. Basic hygiene met.",
            "1": "Brand Risk: Rude, incorrect info, sloppy appearance, or lost a hot lead."
          }
        }
      },
      "Agent_Areas": {
        "Product_Demonstration": {
          "Done": "Was a product demonstration performed? (Yes/No)",
          "Quality_Rating": "Rate the effectiveness of the demonstration. (Rating 1-5)",
          "Quality_Reasons": "Reasons for Quality Rating",
          "Relevance_Rating": {
            "score": "1-5",
            "criteria": "Did the agent choose to demonstrate features directly relevant to the customer's stated problem?"
          },
          "Video_Audio_Quality": {
            "score": "1-5",
            "criteria": "Was the lighting and camera angle sufficient? Were all props visible? Was audio clear?"
          },
          "Effectiveness": {
            "score": "1-5",
            "criteria": "Did the agent effectively translate an intangible feature (comfort, support) into a clear visual action?"
          },
          "Customer_Engagement": {
            "score": "1-5",
            "criteria": "Did the agent pause to solicit feedback? Was the customer prompted to engage with the visual content?"
          }
        },
        "The_Invitation_to_Visit": {
          "Attempted": "Yes/No",
          "Quality_Rating": {
            "score": "1-5",
            "criteria": "Did the agent explicitly invite the customer to the store if the online sale wasn't closed? Did they share the location?"
          },
          "Reasons": "Reasons for Rating"
        },
        "RELAX_Framework": {
          "R_Reach_Out": {
            "title": "Greeting & Rapport",
            "rating": "1-5",
            "reasons": "Reasons for Rating"
          },
          "E_Explore_Needs": {
            "title": "Discovery & Understanding",
            "rating": "1-5",
            "reasons": "Reasons for Rating"
          },
          "L_Link_Demo": {
            "title": "Connecting Needs to Product Features via Demo",
            "rating": "1-5",
            "reasons": "Reasons for Rating"
          },
          "A_Add_Value": {
            "title": "Cross-Selling & Upselling",
            "rating": "1-5",
            "reasons": "Reasons for Rating"
          },
          "X_Express_Offers": {
            "title": "Closing & Next Steps",
            "rating": "1-5",
            "reasons": "Reasons for Rating"
          }
        },
        "SoftSkills_Rating": {
          "Active_Listening": {
            "score": "1-5",
            "criteria": "Assesses the agent's focus. Did the agent interrupt? Did they repeat pain points?"
          },
          "Empathy_Rapport": {
            "score": "1-5",
            "criteria": "Assesses emotional connection. Did the agent validate feelings or concerns?"
          },
          "Clarity_Confidence": {
            "score": "1-5",
            "criteria": "Were explanations easy to understand? Was the tone confident and positive?"
          },
          "Objection_Handling": {
            "score": "1-5",
            "criteria": "Did the agent acknowledge concerns before responding? Was the response framed as a benefit?"
          },
          "Hold_and_Dead_Air_Management": {
            "score": "1-5",
            "criteria": "Did the agent manage time effectively when checking stock/moving product? Did they keep the customer engaged or leave them looking at a blank screen?"
          },
          "Agent_Language_Fluency": {
            "score": "1-5",
            "reason": "Specific observations on grammar, vocabulary, and ease of speech in the customer's language.",
            "comment": "A crisp, 2-line comment summarizing the agent's language proficiency."
          }
        },
        "Top_3_Improvement_Areas": "List the top three areas where the agent scored lowest, providing specific, actionable advice for coaching."
      },
      "Overall_Summary": {
        "Chronological_Call_Summary": "Provide a brief, step-by-step summary of how the call unfolded from start to finish.",
        "Agent_Handling_Summary": "Summarize the agent's overall performance, highlighting key strengths and weaknesses.",
        "Customer_Satisfaction_Summary": "Describe the customer's journey and overall experience during the call.",
        "Next_Action": "What is the specific next step defined? (e.g., 'Customer buying online', 'Customer visiting at 5PM', 'Agent sending WhatsApp Location', 'No Action')."
      }
    }
  },
  "outputFormat": {
    "instruction": "Present your complete analysis as a single, well-structured JSON object. Do not include any text, headers, or explanations outside the JSON block. All numerical ratings (1-5) must be stored as integers. All feedback points (Reasons for Rating) must be stored as arrays of strings. Boolean values (Yes/No, Attempted?) must be stored as true/false (Booleans).",
    "schema": {
      "Functional": {
        "Call_ID": "",
        "Call_Time": "",
        "Customer_Name": "",
        "Agent_Name": "",
        "Store_Location": "",
        "Customer_Location": "",
        "Customer_Language": "",
        "Agent_Presentability": {
          "Score": 0,
          "Reason_for_Score": ""
        },
        "Agent_Video_Quality_Rating": 0,
        "Agent_Audio_Quality_Rating": 0,
        "Customer_Audio_Quality_Rating": 0,
        "Call_Objective_Theme": ""
      },
      "Customer_Information": {
        "Type_of_Call": "",
        "Interest_Category": "",
        "Specific_Product_Inquiry": "",
        "Primary_Questions_Asked": [
          ""
        ],
        "Timeline_to_Purchase": "",
        "Customer_Stage_AIDA": "",
        "Intent_to_Visit_Rating": "",
        "Intent_to_Visit_Rating_Reasons": [
          ""
        ],
        "Intent_to_Purchase_Rating": "",
        "Intent_to_Purchase_Rating_Reasons": [
          ""
        ],
        "Barriers_to_Conversion": "",
        "Customer_Satisfaction_Score": 0,
        "Customer_Satisfaction_Score_Reasons": [
          ""
        ],
        "Business_Satisfaction_Score": {
          "Score": 0,
          "Reason": ""
        }
      },
      "Agent_Areas": {
        "Product_Demonstration": {
          "Done": false,
          "Quality_Rating": 0,
          "Quality_Reasons": [
            ""
          ],
          "Relevance_Rating": 0,
          "Relevance_Rating_Reason": "",
          "Video_Audio_Quality_Rating": 0,
          "Video_Audio_Quality_Reason": "",
          "Effectiveness_Rating": 0,
          "Effectiveness_Rating_Reason": "",
          "Customer_Engagement_Rating": 0,
          "Customer_Engagement_Reason": ""
        },
        "The_Invitation_to_Visit": {
          "Attempted": false,
          "Quality_Rating": 0,
          "Reasons": [
            ""
          ]
        },
        "RELAX_Framework": {
          "R_Reach_Out": {
            "Rating": 0,
            "Reasons": [
              ""
            ]
          },
          "E_Explore_Needs": {
            "Rating": 0,
            "Reasons": [
              ""
            ]
          },
          "L_Link_Demo": {
            "Rating": 0,
            "Reasons": [
              ""
            ]
          },
          "A_Add_Value": {
            "Rating": 0,
            "Reasons": [
              ""
            ]
          },
          "X_Express_Offers": {
            "Rating": 0,
            "Reasons": [
              ""
            ]
          }
        },
        "SoftSkills": {
          "Active_Listening_Rating": 0,
          "Active_Listening_Reasons": [
            ""
          ],
          "Empathy_Rapport_Rating": 0,
          "Empathy_Rapport_Reasons": [
            ""
          ],
          "Clarity_Confidence_Rating": 0,
          "Clarity_Confidence_Reasons": [
            ""
          ],
          "Objection_Handling_Rating": 0,
          "Objection_Handling_Reasons": [
            ""
          ],
          "Hold_and_Dead_Air_Management_Rating": 0,
          "Hold_and_Dead_Air_Management_Reasons": [
            ""
          ],
          "Agent_Language_Fluency": {
            "Score": 0,
            "Reason": "",
            "Comment": ""
          },
          "Top_3_Improvement_Areas": [
            ""
          ]
        },
        "Overall_Summary": {
          "Chronological_Call_Summary": "",
          "Agent_Handling_Summary": "",
          "Customer_Satisfaction_Summary": "",
          "Next_Action": ""
        },
        "Transcript_Log": [
          {
            "Speaker": "Agent/Customer",
            "Text": "...",
            "Timestamp": "00:00"
          }
        ]
      }
    }
  }
}"""


def load_video_csv():
    """Load the video calls CSV file"""
    csv_path = Path("video calls input call analyzer.csv")
    if not csv_path.exists():
        return pd.DataFrame()
    return pd.read_csv(csv_path)


def save_video_analysis(report_id: str, analysis_data: dict, metadata: dict | None = None):
  """Save video analysis to MongoDB if available; otherwise JSON file.
  Triggers async Drive mirror if recording_url is present."""
  if is_failed_analysis(analysis_data):
    print(f"[MONGODB] Skipping save for {report_id} - analysis failed")
    return False

  collection = get_video_collection()

  # Persist to Mongo with optional metadata for uploaded CSV rows
  if collection is not None:
    try:
      payload = {"report_id": report_id, "analysis": analysis_data}
      if metadata is not None:
        payload["metadata"] = metadata

      collection.update_one(
        {"report_id": report_id},
        {"$set": payload},
        upsert=True,
      )
      
      # Trigger Drive mirror asynchronously
      video_record = {"report_id": report_id, **payload}
      trigger_drive_mirror_for_video(video_record)
      
      return True
    except Exception as exc:
      print(f"Error saving video analysis to MongoDB, falling back to file: {exc}")

  # Fallback: JSON file storage
  try:
    if VIDEO_ANALYSIS_FILE.exists():
      with open(VIDEO_ANALYSIS_FILE, 'r', encoding='utf-8') as f:
        reports = json.load(f)
    else:
      reports = {}

    reports[report_id] = {
      "analysis": analysis_data,
      "metadata": metadata,
    }

    with open(VIDEO_ANALYSIS_FILE, 'w', encoding='utf-8') as f:
      json.dump(reports, f, indent=2, ensure_ascii=False)

    return True
  except Exception as e:
    print(f"Error saving video analysis: {e}")
    return False


def load_all_video_analyses():
  """Load all video analyses from MongoDB if available, else JSON file."""
  collection = get_video_collection()

  if collection is not None:
    try:
      docs = list(collection.find({}))
      if docs:
        return {
          doc["report_id"]: {
            "analysis": doc.get("analysis", {}),
            "metadata": doc.get("metadata"),
          }
          for doc in docs
        }
      # If Mongo is reachable but empty, fall back to file seed
      print("MongoDB video_reports collection is empty; using JSON file fallback")
    except Exception as exc:
      print(f"Error loading video analyses from MongoDB, falling back to file: {exc}")

  if not VIDEO_ANALYSIS_FILE.exists():
    return {}

  try:
    with open(VIDEO_ANALYSIS_FILE, 'r', encoding='utf-8') as f:
      raw = json.load(f)

    # Support legacy file format where value was the analysis object directly
    normalized = {}
    for report_id, value in raw.items():
      if isinstance(value, dict) and "analysis" in value:
        normalized[report_id] = {
          "analysis": value.get("analysis", {}),
          "metadata": value.get("metadata"),
        }
      else:
        normalized[report_id] = {"analysis": value, "metadata": None}
    return normalized
  except Exception as e:
    print(f"Error loading video analyses: {e}")
    return {}


def normalize_analysis_structure(analysis: dict, metadata: dict = None) -> dict:
  """Normalize different analysis structures to a common format."""
  if not analysis:
    return {}
  
  # If already in standard format, return as-is
  if "Functional" in analysis and "Customer_Information" in analysis:
    return analysis
  
  # Handle new nested structure from uploaded CSVs
  call_analysis = analysis.get("call_analysis", {})
  if call_analysis:
    agent_details = call_analysis.get("agent_details", {})
    customer_info = call_analysis.get("customer_info", {})
    performance = call_analysis.get("performance_ratings", {})
    
    # Build normalized structure
    normalized = {
      "Functional": {
        "Store_Location": call_analysis.get("store_location", metadata.get("store_name") if metadata else None),
        "Agent_Name": agent_details.get("name"),
        "Call_Time": metadata.get("clean_datetime") if metadata else None,
        "Product_of_Interest": customer_info.get("query_product"),
        "Agent_Video_Quality_Rating": 3,  # Default since not in new format
        "Agent_Audio_Quality_Rating": 3,
        "Customer_Audio_Quality_Rating": 3,
      },
      "Customer_Information": {
        "Intent_to_Purchase_Rating": "LOW",  # Default
        "Customer_Satisfaction_Score": 3,
        "Business_Satisfaction_Score": 3,
        "Primary_Questions_Asked": customer_info.get("key_interests", []),
      },
      "Agent_Areas": {
        "Product_Demonstration": {
          "Done": False,
          "Quality_Rating": 0,
          "Relevance_Rating": 0,
          "Video_Audio_Quality_Rating": 0,
          "Effectiveness_Rating": 0,
          "Customer_Engagement_Rating": 0,
        },
        "RELAX_Framework": {
          "R_Reach_Out": {"Rating": performance.get("greeting_opening", 0)},
          "E_Explore_Needs": {"Rating": performance.get("product_knowledge", 0)},
          "L_Link_Demo": {"Rating": performance.get("query_resolution", 0)},
          "A_Add_Value": {"Rating": 0},
          "X_Express_Offers": {"Rating": performance.get("salesmanship_closing", 0)},
        },
        "SoftSkills": {
          "Active_Listening_Rating": 0,
          "Empathy_Rapport_Rating": 0,
          "Clarity_Confidence_Rating": 0,
          "Objection_Handling_Rating": 0,
          "Hold_and_Dead_Air_Management_Rating": 0,
        },
        "The_Invitation_to_Visit": {
          "Attempted": False,
          "Quality_Rating": 0,
        },
      },
      "Overall_Summary": {
        "Chronological_Call_Summary": call_analysis.get("summary"),
        "Agent_Handling_Summary": agent_details.get("performance_notes"),
      },
    }
    return normalized
  
  return analysis


def fill_missing_analysis_fields(analysis: dict, metadata: dict = None) -> dict:
  """Fill in N/A values in analysis with available metadata."""
  if not analysis or not isinstance(analysis, dict):
    return analysis
  
  if not metadata:
    return analysis
  
  # Deep copy to avoid modifying original
  analysis = json.loads(json.dumps(analysis))
  
  # Ensure Functional section exists
  if "Functional" not in analysis:
    analysis["Functional"] = {}
  
  functional = analysis["Functional"]
  
  # Fill Call_Time from metadata.clean_datetime if N/A
  if not functional.get("Call_Time") or functional.get("Call_Time") == "N/A":
    if metadata.get("clean_datetime"):
      # clean_datetime format: "17:20.0" - convert to HH:MM IST
      try:
        time_str = str(metadata["clean_datetime"]).replace(".0", "")
        functional["Call_Time"] = f"{time_str} IST"
      except:
        pass
  
  # Fill from date if available
  if (not functional.get("Call_Time") or functional.get("Call_Time") == "N/A") and metadata.get("date"):
    # Just use date as fallback
    functional["Call_Time"] = f"{metadata.get('date')} IST"
  
  # Store_Location - use metadata if Gemini didn't extract it
  if not functional.get("Store_Location") or functional.get("Store_Location") == "N/A":
    if metadata.get("store_name"):
      functional["Store_Location"] = metadata["store_name"]
  
  # Customer_Name - if we have phone number and name is N/A, use phone as identifier
  if (not functional.get("Customer_Name") or functional.get("Customer_Name") == "N/A") and metadata.get("clean_number"):
    # Keep as N/A but add phone to metadata for reference
    if "metadata" not in analysis:
      analysis["metadata"] = {}
    analysis["metadata"]["customer_phone"] = metadata.get("clean_number")
  
  return analysis


def get_video_analysis_by_id(report_id: str):
  """Get a specific video analysis by ID"""
  collection = get_video_collection()

  if collection is not None:
    try:
      doc = collection.find_one({"report_id": report_id})
      if doc:
        analysis = doc.get("analysis", {})
        metadata = doc.get("metadata", {})
        return normalize_analysis_structure(analysis, metadata)
    except Exception as exc:
      print(f"Error fetching analysis from MongoDB, falling back to file: {exc}")

  all_analyses = load_all_video_analyses()
  analysis_entry = all_analyses.get(report_id)

  if isinstance(analysis_entry, dict) and "analysis" in analysis_entry:
    return normalize_analysis_structure(
      analysis_entry.get("analysis"),
      analysis_entry.get("metadata")
    )

  return normalize_analysis_structure(analysis_entry, {})


def clean_json_string(text: str) -> str:
    """Clean and repair common JSON formatting issues."""
    # Remove markdown code blocks more aggressively
    text = re.sub(r'```(?:json)?\s*', '', text, flags=re.IGNORECASE)
    text = re.sub(r'```', '', text)
    
    # Remove trailing commas before closing brackets/braces
    text = re.sub(r',(\s*[}\]])', r'\1', text)
    
    # Remove any leading/trailing whitespace
    text = text.strip()
    
    return text


def download_video(url: str, timeout: int = 120) -> tuple:
    """
    Download video from URL to temporary file.
    Returns: (temp_file_path, error_message)
    """
    try:
        # Check for NaN, None, or non-string types
        if url is None or not isinstance(url, str) or not url.strip():
            return None, "Invalid URL provided"
        
        # Additional check for pandas NaN (float type)
        try:
            import math
            if isinstance(url, float) and math.isnan(url):
                return None, "Invalid URL provided (NaN)"
        except (TypeError, ValueError):
            pass

        print(f"[VIDEO] Downloading from URL...")
        response = requests.get(url, timeout=timeout, stream=True, allow_redirects=True)
        response.raise_for_status()

        # Save to temporary file
        with tempfile.NamedTemporaryFile(suffix=".mp4", delete=False) as temp_file:
            for chunk in response.iter_content(chunk_size=8192):
                if chunk:
                    temp_file.write(chunk)
            temp_path = temp_file.name

        file_size = os.path.getsize(temp_path)
        print(f"[VIDEO] Downloaded {file_size:,} bytes")
        
        if file_size < 1000:
            os.remove(temp_path)
            return None, "Video file too small"
        
        return temp_path, None

    except Exception as e:
        return None, f"Download failed: {str(e)}"


def analyze_video_with_gemini(video_url: str, store_name: str = "Unknown Store", metadata: dict = None) -> dict:
    """
    Analyze a video using Gemini API by downloading and uploading to Gemini File API
    
    Args:
        video_url: URL of the video to analyze
        store_name: Name of the store
        metadata: Optional metadata dict with clean_datetime, clean_number, date, etc.
    """
    temp_path = None
    uploaded_file = None
    
    try:
        print(f"Analyzing video from {video_url}")
        
        # Step 1: Download the video file
        temp_path, download_error = download_video(video_url)
        if download_error:
            raise Exception(f"Download failed: {download_error}")
        
        # Step 2: Upload to Gemini File API
        print(f"[GEMINI] Uploading video to Gemini storage...")
        uploaded_file = genai.upload_file(temp_path, mime_type="video/mp4")
        
        # Wait for processing
        print(f"[GEMINI] Waiting for video processing...")
        while uploaded_file.state.name == "PROCESSING":
            time.sleep(2)
            uploaded_file = genai.get_file(uploaded_file.name)
        
        if uploaded_file.state.name == "FAILED":
            raise Exception("Gemini video processing failed")
        
        print(f"[GEMINI] Video processed, analyzing...")
        
        # Step 3: Use the full, strict JSON prompt
        # Use simple replace to avoid str.format interfering with JSON braces
        prompt_text = EXACT_ANALYSIS_PROMPT.replace("{video_url}", video_url)

        # Step 4: Generate analysis (use old working config without forced JSON mime type)
        model = genai.GenerativeModel(MODEL_NAME)
        
        response = model.generate_content(
            [prompt_text, uploaded_file],
            generation_config=genai.types.GenerationConfig(
                temperature=0.7,
                max_output_tokens=16000,
            )
        )
        
        if not response.text:
            raise Exception("Empty response from Gemini")
        
        # Step 5: Extract and parse JSON (enhanced extraction with truncation handling)
        response_text = response.text.strip()
        
        # First clean markdown blocks
        response_text = clean_json_string(response_text)
        
        try:
            # Try direct JSON parse first
            try:
                analysis_json = json.loads(response_text)
            except json.JSONDecodeError as parse_error:
                # If truncated, try to fix by closing unclosed braces
                print(f"Initial parse failed, attempting truncation recovery...")
                
                # Find where JSON starts
                json_start = response_text.find('{')
                if json_start == -1:
                    raise ValueError("No JSON found in response")
                
                json_text = response_text[json_start:]
                
                # Count open/close braces to see if we're truncated
                open_braces = json_text.count('{')
                close_braces = json_text.count('}')
                
                # If truncated, try to close it
                if open_braces > close_braces:
                    json_text += '}' * (open_braces - close_braces)
                
                # Remove trailing commas
                json_text = re.sub(r',(\s*[}\]])', r'\1', json_text)
                
                try:
                    analysis_json = json.loads(json_text)
                except json.JSONDecodeError:
                    # Last resort: try to parse just the Functional section
                    functional_match = re.search(r'"Functional"\s*:\s*\{.*?\}(?=,\s*"[A-Z]|$)', json_text, re.DOTALL)
                    if functional_match:
                        raise ValueError(f"Partial JSON recovery attempted but failed. {str(parse_error)}")
                    raise
        except (json.JSONDecodeError, ValueError) as e:
            print(f"JSON parsing error: {e}")
            print(f"Response length: {len(response_text)}")
            print(f"Response preview: {response_text[:500]}")
            print(f"Response ending: {response_text[-300:] if len(response_text) > 300 else response_text}")
            
            # Count braces to see if truncated
            open_braces = response_text.count('{')
            close_braces = response_text.count('}')
            print(f"Open braces: {open_braces}, Close braces: {close_braces} (truncated: {open_braces > close_braces})")
            
            # Fallback - create complete minimal structure with all required fields
            analysis_json = {
                "Functional": {
                    "Call_ID": f"VIDEO_{store_name.upper().replace(' ', '_')}",
                    "Store_Location": store_name,
                    "Call_Time": "N/A",
                    "Agent_Name": "N/A",
                    "Customer_Name": "N/A",
                    "Customer_Location": "N/A",
                    "Customer_Language": "N/A",
                    "Agent_Presentability": {
                        "Score": 3,
                        "Reason_for_Score": ["Unable to analyze video"]
                    },
                    "Agent_Video_Quality_Rating": 3,
                    "Agent_Audio_Quality_Rating": 3,
                    "Customer_Audio_Quality_Rating": 3,
                    "Call_Objective_Theme": "Analysis incomplete"
                },
                "Customer_Information": {
                    "Type_of_Call": "Unknown",
                    "Interest_Category": "Unknown",
                    "Specific_Product_Inquiry": "N/A",
                    "Primary_Questions_Asked": [],
                    "Timeline_to_Purchase": "Unknown",
                    "Customer_Stage_AIDA": "Unknown",
                    "Intent_to_Visit_Rating": "LOW",
                    "Intent_to_Visit_Rating_Reasons": [],
                    "Intent_to_Purchase_Rating": "LOW",
                    "Intent_to_Purchase_Rating_Reasons": [],
                    "Barriers_to_Conversion": "Unable to analyze",
                    "Customer_Satisfaction_Score": 3,
                    "Customer_Satisfaction_Score_Reasons": [],
                    "Business_Satisfaction_Score": {
                        "Score": 3,
                        "Reason": "Unable to analyze"
                    }
                },
                "Agent_Areas": {
                    "Product_Demonstration": {
                        "Done": False,
                        "Quality_Rating": 0,
                        "Quality_Reasons": ["N/A"],
                        "Relevance_Rating": 0,
                        "Relevance_Rating_Reason": "N/A",
                        "Video_Audio_Quality_Rating": 0,
                        "Video_Audio_Quality_Reason": "N/A",
                        "Effectiveness_Rating": 0,
                        "Effectiveness_Rating_Reason": "N/A",
                        "Customer_Engagement_Rating": 0,
                        "Customer_Engagement_Reason": "N/A"
                    },
                    "The_Invitation_to_Visit": {
                        "Attempted": False,
                        "Quality_Rating": 0,
                        "Reasons": ["N/A"]
                    },
                    "RELAX_Framework": {
                        "R_Reach_Out": {
                            "Rating": 0,
                            "Reasons": ["Unable to analyze"]
                        },
                        "E_Explore_Needs": {
                            "Rating": 0,
                            "Reasons": ["Unable to analyze"]
                        },
                        "L_Link_Demo": {
                            "Rating": 0,
                            "Reasons": ["Unable to analyze"]
                        },
                        "A_Add_Value": {
                            "Rating": 0,
                            "Reasons": ["Unable to analyze"]
                        },
                        "X_Express_Offers": {
                            "Rating": 0,
                            "Reasons": ["Unable to analyze"]
                        }
                    },
                    "SoftSkills": {
                        "Active_Listening_Rating": 0,
                        "Active_Listening_Reasons": ["Unable to analyze"],
                        "Empathy_Rapport_Rating": 0,
                        "Empathy_Rapport_Reasons": ["Unable to analyze"],
                        "Clarity_Confidence_Rating": 0,
                        "Clarity_Confidence_Reasons": ["Unable to analyze"],
                        "Objection_Handling_Rating": 0,
                        "Objection_Handling_Reasons": ["Unable to analyze"],
                        "Hold_and_Dead_Air_Management_Rating": 0,
                        "Hold_and_Dead_Air_Management_Reasons": ["Unable to analyze"],
                        "Agent_Language_Fluency": {
                            "Score": 0,
                            "Reason": "Unable to analyze",
                            "Comment": "Analysis incomplete"
                        },
                        "Top_3_Improvement_Areas": ["Unable to analyze video"]
                    }
                },
                "Overall_Summary": {
                    "Chronological_Call_Summary": f"Analysis incomplete due to JSON parsing error.",
                    "Agent_Handling_Summary": "Unable to analyze video.",
                    "Customer_Satisfaction_Summary": "Unable to determine.",
                    "Next_Action": "N/A"
                },
                "parse_error": True,
                "error_details": str(e)
            }
        
        # Fill in N/A values with metadata if available
        analysis_json = fill_missing_analysis_fields(analysis_json, metadata)
        
        return analysis_json
        
    except Exception as e:
        print(f"Error analyzing video: {e}")
        return {
            "Functional": {"Store_Location": store_name},
            "Overall_Summary": {"Chronological_Call_Summary": f"Failed: {str(e)}"},
            "error": str(e)
        }
    
    finally:
        # Cleanup
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


def _unpack_analysis(entry: dict | None):
  """Return (analysis, metadata) tuple from stored entry variants."""
  if not entry:
    return None, None
  if isinstance(entry, dict) and "analysis" in entry:
    return entry.get("analysis"), entry.get("metadata")
  return entry, None


def get_all_video_reports_with_metadata():
  """Get all video reports with metadata from CSV and uploaded sources."""
  csv_df = load_video_csv()
  analyses = load_all_video_analyses()

  reports = []
  seen_report_ids = set()

  # First, list records present in the seeded CSV
  for idx, row in csv_df.iterrows():
    report_id = f"video_{idx}"
    seen_report_ids.add(report_id)

    analysis_entry = analyses.get(report_id)
    analysis, metadata = _unpack_analysis(analysis_entry)

    store_name = row.get('Store Name') or (metadata or {}).get('store_name', 'Unknown')
    recording_url = row.get('Recording URL') or (metadata or {}).get('recording_url', '')
    duration = row.get('Duration', 'N/A')
    is_converted = row.get('is_converted', 0)

    # Normalize analysis structure before extracting data
    analysis = normalize_analysis_structure(analysis, metadata) if analysis else None
    
    # Extract data from analysis for easy display
    call_time = 'N/A'
    product = None
    customer_name = None

    if analysis:
      functional = analysis.get('Functional', {}) if isinstance(analysis, dict) else {}
      call_time = functional.get('Call_Time', 'N/A')
      product = functional.get('Product_of_Interest')
      customer_name = functional.get('Customer_Name')

    reports.append({
      "report_id": report_id,
      "store_name": store_name,
      "recording_url": recording_url,
      "duration": duration,
      "is_converted": bool(is_converted),
      "analyzed": analysis is not None,
      "call_time": call_time,
      "product": product,
      "customer_name": customer_name,
      "analysis_data": analysis,
      "metadata": metadata,
    })

  # Then, include any analyses that came from uploaded CSVs (not in the seed CSV)
  for report_id, entry in analyses.items():
    if report_id in seen_report_ids:
      continue

    analysis, metadata = _unpack_analysis(entry)
    meta = metadata or {}

    store_name = meta.get('store_name', 'Unknown')
    recording_url = meta.get('recording_url', '')
    duration = meta.get('duration', 'N/A')
    is_converted = meta.get('is_converted', False)
    call_time = meta.get('clean_datetime') or meta.get('date') or 'N/A'

    # Normalize uploaded analysis structure
    analysis = normalize_analysis_structure(analysis, meta) if analysis else None
    
    product = None
    customer_name = None
    if analysis:
      functional = analysis.get('Functional', {}) if isinstance(analysis, dict) else {}
      call_time = functional.get('Call_Time', call_time)
      product = functional.get('Product_of_Interest')
      customer_name = functional.get('Customer_Name')

    reports.append({
      "report_id": report_id,
      "store_name": store_name,
      "recording_url": recording_url,
      "duration": duration,
      "is_converted": bool(is_converted),
      "analyzed": analysis is not None,
      "call_time": call_time,
      "product": product,
      "customer_name": customer_name,
      "analysis_data": analysis,
      "metadata": metadata,
    })

  return reports

import google.generativeai as genai
import os
import json
from dotenv import load_dotenv
from typing import List, Dict, Optional
from pymongo import MongoClient

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
    except Exception as exc:
        print(f"MongoDB not available: {exc}")
        return None


def _join_transcript_log(log_items) -> str:
    """Convert a transcript log array to readable text."""
    if not isinstance(log_items, list):
        return ""
    lines = []
    for item in log_items:
        if not isinstance(item, dict):
            continue
        speaker = item.get("Speaker") or item.get("speaker") or "Unknown"
        text = item.get("Text") or item.get("text") or ""
        ts = item.get("Timestamp") or item.get("timestamp")
        prefix = f"[{ts}] " if ts else ""
        lines.append(f"{prefix}{speaker}: {text}")
    return "\n".join(lines)


def extract_transcript_from_report(report: Dict) -> str:
    """Extract transcript from a video report, covering legacy and nested formats."""
    transcript = ""

    # Prefer top-level analysis object if present
    analysis = report.get("analysis") if isinstance(report.get("analysis"), dict) else report

    # Check Agent_Areas.Transcript or Transcript_Log inside analysis
    agent_areas = analysis.get("Agent_Areas") if isinstance(analysis.get("Agent_Areas"), dict) else {}
    if isinstance(agent_areas.get("Transcript"), dict):
        tdict = agent_areas["Transcript"]
        if isinstance(tdict.get("Transcript_Log"), str):
            transcript = tdict["Transcript_Log"]
        elif isinstance(tdict.get("transcript_log"), str):
            transcript = tdict["transcript_log"]
        elif isinstance(tdict.get("Transcript_Log"), list):
            transcript = _join_transcript_log(tdict.get("Transcript_Log"))
    elif isinstance(agent_areas.get("Transcript_Log"), list):
        transcript = _join_transcript_log(agent_areas.get("Transcript_Log"))

    # Check direct Transcript_Log list in analysis
    if not transcript and isinstance(analysis.get("Transcript_Log"), list):
        transcript = _join_transcript_log(analysis.get("Transcript_Log"))

    # Check direct Transcript field
    if not transcript and isinstance(analysis.get("Transcript"), str):
        transcript = analysis.get("Transcript")

    # Check call_analysis
    if not transcript and isinstance(analysis.get("call_analysis"), dict):
        transcript = analysis["call_analysis"].get("transcript", "")

    return transcript if isinstance(transcript, str) else ""


def get_all_video_transcripts() -> List[Dict[str, str]]:
    """Fetch all video reports and extract their transcripts along with metadata."""
    try:
        collection = get_video_collection()
        if collection is None:
            return []
        
        # Fetch all video reports
        reports = list(collection.find({}, {"_id": 0}))
        
        transcripts_data = []
        for report in reports:
            transcript = extract_transcript_from_report(report)
            
            # Work off analysis object if present
            analysis = report.get("analysis") if isinstance(report.get("analysis"), dict) else report

            functional = analysis.get("Functional", {}) if isinstance(analysis.get("Functional"), dict) else {}
            call_id = functional.get("Call_ID", report.get("report_id", "Unknown"))
            agent_name = functional.get("Agent_Name", "Unknown")
            store_location = functional.get("Store_Location", analysis.get("store_name", "Unknown"))
            call_time = functional.get("Call_Time", analysis.get("call_time", "Unknown"))
            
            # Get customer info
            customer_info = analysis.get("Customer_Information", {}) if isinstance(analysis.get("Customer_Information"), dict) else {}
            customer_name = customer_info.get("Customer_Name") or functional.get("Customer_Name", "Unknown")
            product_interest = customer_info.get("Product_of_Interest") or functional.get("Product_of_Interest", "Unknown")
            
            if transcript.strip():  # Only include if transcript exists
                transcripts_data.append({
                    "call_id": call_id,
                    "agent": agent_name,
                    "store": store_location,
                    "customer": customer_name,
                    "time": call_time,
                    "product": product_interest,
                    "transcript": transcript
                })
        
        return transcripts_data
    except Exception as e:
        print(f"Error fetching transcripts: {e}")
        return []


def format_transcripts_for_context(transcripts: List[Dict[str, str]]) -> str:
    """Format transcripts into a readable context string for Gemini."""
    if not transcripts:
        return "No transcripts available."
    
    context = "# Video Call Transcripts Database\n\n"
    context += f"Total calls analyzed: {len(transcripts)}\n\n"
    
    for i, data in enumerate(transcripts, 1):
        context += f"## Call {i}\n"
        context += f"**Call ID:** {data.get('call_id', 'N/A')}\n"
        context += f"**Agent:** {data.get('agent', 'N/A')}\n"
        context += f"**Store Location:** {data.get('store', 'N/A')}\n"
        context += f"**Customer:** {data.get('customer', 'N/A')}\n"
        context += f"**Time:** {data.get('time', 'N/A')}\n"
        context += f"**Product Discussed:** {data.get('product', 'N/A')}\n"
        context += f"**Transcript:**\n{data.get('transcript', 'N/A')}\n\n"
        context += "---\n\n"
    
    return context


def chat_with_video_context(user_message: str, conversation_history: List[Dict] = None) -> str:
    """Chat with Gemini using video transcripts as context."""
    try:
        transcripts = get_all_video_transcripts()
        transcripts_context = format_transcripts_for_context(transcripts)
        
        # If still empty, surface a clearer message
        if not transcripts:
            return "No transcripts available in the database. Please ensure video_reports collection has Transcript_Log data."

        if conversation_history is None:
            conversation_history = []

        # Build a simple conversational transcript for the model
        history_text = ""
        for msg in conversation_history:
            role = msg.get("role", "user")
            content = msg.get("content", "")
            history_text += f"{role.capitalize()}: {content}\n"

        prompt = f"""You are a sales insights analyst specializing in understanding customer behavior and sales patterns from video call transcripts for Duroflex (furniture and mattress brand).

Goals:
- Explain why customers purchase or hesitate
- List common questions and objections
- Highlight sales patterns and trends
- Base answers ONLY on the transcripts provided

Transcript Knowledge Base:
{transcripts_context}

Conversation so far:
{history_text}

User: {user_message}
Assistant:"""

        model = genai.GenerativeModel(MODEL_NAME)
        response = model.generate_content(prompt)
        return response.text
    except Exception as e:
        return f"Error processing your question: {str(e)}"


def get_chat_insights() -> Dict:
    """Get summary insights about all video calls."""
    try:
        transcripts = get_all_video_transcripts()
        
        if not transcripts:
            return {"status": "error", "message": "No transcripts available"}
        
        # Count statistics
        total_calls = len(transcripts)
        products = {}
        stores = set()
        
        for data in transcripts:
            product = data.get("product", "Unknown")
            if product:
                products[product] = products.get(product, 0) + 1
            stores.add(data.get("store", "Unknown"))
        
        return {
            "status": "success",
            "total_calls": total_calls,
            "product_distribution": products,
            "store_count": len(stores),
            "stores": list(stores),
            "message": f"Database contains {total_calls} video call transcripts ready for analysis"
        }
    except Exception as e:
        return {"status": "error", "message": str(e)}

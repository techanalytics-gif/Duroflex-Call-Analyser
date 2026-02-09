
"""
ABC Call Service (Cart Recovery)
Handles Abc/Cart Recovery Outbound Call reports and filtering
"""
import os
import math
from pathlib import Path
from pymongo import MongoClient
from typing import Optional, List, Dict
from drive_mirror_integration import trigger_drive_mirror
from analysis_utils import is_failed_analysis

def sanitize_nan(obj):
    """Recursively replace NaN values with None for JSON serialization."""
    if isinstance(obj, dict):
        return {k: sanitize_nan(v) for k, v in obj.items()}
    elif isinstance(obj, list):
        return [sanitize_nan(item) for item in obj]
    elif isinstance(obj, float) and math.isnan(obj):
        return None
    return obj


# MongoDB Connection
MONGODB_URI = os.getenv("MONGODB_URI")
MONGODB_NAME = os.getenv("MONGODB_NAME", "Duroflex")
_mongo_client = None


def get_abc_collection():
    """Return MongoDB collection for ABC/Cart Recovery call reports."""
    global _mongo_client
    if not MONGODB_URI:
        print(f"[MONGODB] Connection not available - MONGODB_URI is not set")
        return None
    try:
        if _mongo_client is None:
            print(f"[MONGODB] Connecting to: {MONGODB_URI[:50]}...")
            _mongo_client = MongoClient(MONGODB_URI)
        db = _mongo_client[MONGODB_NAME]
        return db["abc_call_reports"]
    except Exception as exc:
        print(f"[MONGODB] Connection error: {exc}")
        return None


def get_abc_discarded_collection():
    """Return MongoDB collection for discarded (post-purchase) ABC calls."""
    global _mongo_client
    if not MONGODB_URI:
        return None
    try:
        if _mongo_client is None:
            _mongo_client = MongoClient(MONGODB_URI)
        db = _mongo_client[MONGODB_NAME]
        return db["abc_discarded_calls"]
    except Exception as exc:
        print(f"[MONGODB] Connection error: {exc}")
        return None


def load_abc_reports() -> List[Dict]:
    """Load all ABC call reports from MongoDB."""
    collection = get_abc_collection()
    if collection is None:
        return []
    
    try:
        reports = list(collection.find())
        # Convert MongoDB ObjectId to string
        for report in reports:
            if '_id' in report:
                report['_id'] = str(report['_id'])
        return sanitize_nan(reports)
    except Exception as e:
        print(f"[MONGODB] Load ABC reports failed: {e}")
        return []


def get_abc_report_by_id(call_id: str) -> Optional[Dict]:
    """Get a specific ABC call report by ID."""
    collection = get_abc_collection()
    if collection is None:
        return None
    
    try:
        report = collection.find_one({"call_id": call_id})
        if report:
            if '_id' in report:
                report['_id'] = str(report['_id'])
            return sanitize_nan(report)
        return None
    except Exception as e:
        print(f"[MONGODB] Get ABC report failed: {e}")
        return None


def save_abc_call_to_mongodb(call_record: Dict) -> bool:
    """Save an ABC call record to MongoDB."""
    call_id = call_record.get("call_id")
    analysis = call_record.get("analysis")
    if is_failed_analysis(analysis):
        print(f"[MONGODB] Skipping save for {call_id} - analysis failed")
        return False

    collection = get_abc_collection()
    if collection is None:
        return False

    try:
        collection.update_one(
            {"call_id": call_id},
            {"$set": call_record},
            upsert=True
        )
        
        # Trigger Drive mirror asynchronously (using recording_url)
        recording_url = call_record.get("recording_url") or call_record.get("audio_url")
        if recording_url:
            trigger_drive_mirror(call_id, recording_url, is_audio=True, collection_type="abc")
        
        return True
    except Exception as e:
        print(f"[MONGODB] Save ABC call failed: {e}")
        return False


def save_abc_discarded_call(call_record: Dict) -> bool:
    """Save a post-purchase (discarded) ABC call record."""
    collection = get_abc_discarded_collection()
    if collection is None:
        return False

    try:
        call_id = call_record.get("call_id")
        collection.update_one(
            {"call_id": call_id},
            {"$set": call_record},
            upsert=True
        )
        print(f"[ABC] Post-purchase call {call_id} stored in abc_discarded_calls")
        return True
    except Exception as e:
        print(f"[MONGODB] Save ABC discarded call failed: {e}")
        return False


def get_abc_stats() -> Dict:
    """Get aggregate statistics for ABC calls."""
    collection = get_abc_collection()
    if collection is None:
        return {}
    
    try:
        reports = list(collection.find())
        
        if not reports:
            return {
                "total_calls": 0,
                "recovered_carts": 0,
                "recovery_rate": 0,
                "avg_experience_score": 0,
                "avg_intent_rating": 0
            }
        
        total = len(reports)
        
        # Calculate recovered carts based on High Intent or some other metric
        # For ABC, "Recovery Verdict" or High Intent might signal success.
        # Let's use Intent_to_Purchase_Rating == HIGH as a proxy for now, or check "Call_Outcome" if available.
        # Prompt has "Recovery_Verdict" in Overall Summary.
        
        recovered_count = 0
        intent_scores = [] # Map High=3, Medium=2, Low=1
        experience_scores = []
        
        for r in reports:
            analysis = r.get("analysis", {})
            pillar1 = analysis.get("Pillar_1_Customer_Intent_and_Barriers", {})
            pillar2 = analysis.get("Pillar_2_Experience_Delivered", {})
            
            intent = pillar1.get("Intent_to_Purchase_Rating", "LOW")
            if intent == "HIGH":
                recovered_count += 1
                intent_scores.append(100)
            elif intent == "MEDIUM":
                intent_scores.append(50)
            else:
                intent_scores.append(0)
                
            exp_score = pillar2.get("Overall_Experience_Rating", 0)
            if exp_score:
                experience_scores.append(float(exp_score))

        return {
            "total_calls": total,
            "recovered_carts": recovered_count,
            "recovery_rate": round((recovered_count / total * 100) if total > 0 else 0, 2),
            "avg_experience_score": round(sum(experience_scores) / len(experience_scores), 2) if experience_scores else 0,
            "avg_intent_rating": round(sum(intent_scores) / len(intent_scores), 2) if intent_scores else 0
        }
    except Exception as e:
        print(f"[MONGODB] ABC Stats failed: {e}")
        return {}

"""
Outbound Call Service
Handles Store Walkin Outbound Call reports and filtering
"""

import pandas as pd
import json
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


def get_outbound_collection():
    """Return MongoDB collection for outbound call reports, or None if unavailable."""
    global _mongo_client
    if not MONGODB_URI:
        print(f"[MONGODB] Connection not available - MONGODB_URI is not set")
        return None
    try:
        if _mongo_client is None:
            print(f"[MONGODB] Connecting to: {MONGODB_URI[:50]}...")
            print(f"[MONGODB] Database name: {MONGODB_NAME}")
            _mongo_client = MongoClient(MONGODB_URI, serverSelectionTimeoutMS=5000)
            _mongo_client.admin.command("ping")
            print(f"[MONGODB] Connection successful!")
        db = _mongo_client[MONGODB_NAME]
        return db["outbound_call_reports"]
    except Exception as exc:
        print(f"[MONGODB] Connection error: {exc}")
        return None


def get_discarded_calls_collection():
    """Return MongoDB collection for discarded (post-purchase) calls."""
    global _mongo_client
    if not MONGODB_URI:
        return None
    try:
        if _mongo_client is None:
            _mongo_client = MongoClient(MONGODB_URI, serverSelectionTimeoutMS=5000)
            _mongo_client.admin.command("ping")
        db = _mongo_client[MONGODB_NAME]
        return db["outbound_discarded_calls"]
    except Exception as exc:
        print(f"[MONGODB] Connection error: {exc}")
        return None


def load_outbound_reports() -> List[Dict]:
    """Load all outbound call reports from MongoDB."""
    collection = get_outbound_collection()
    if collection is None:
        return []
    
    try:
        reports = list(collection.find())
        # Convert MongoDB ObjectId to string
        for report in reports:
            if "_id" in report:
                del report["_id"]
        return sanitize_nan(reports)
    except Exception as e:
        print(f"[MONGODB] Load failed: {e}")
        return []


def get_outbound_report_by_id(call_id: str) -> Optional[Dict]:
    """Get a specific outbound call report by ID."""
    collection = get_outbound_collection()
    if collection is None:
        return None
    
    try:
        report = collection.find_one({"call_id": call_id})
        if report:
            if "_id" in report:
                del report["_id"]
            return sanitize_nan(report)
        return None
    except Exception as e:
        print(f"[MONGODB] Get report failed: {e}")
        return None


def save_outbound_call_to_mongodb(call_record: Dict) -> bool:
    """Save an outbound call record to MongoDB."""
    call_id = call_record.get("call_id")
    analysis = call_record.get("analysis")
    if is_failed_analysis(analysis):
        print(f"[MONGODB] Skipping save for {call_id} - analysis failed")
        return False

    collection = get_outbound_collection()
    if collection is None:
        return False

    try:
        collection.update_one(
            {"call_id": call_id},
            {"$set": call_record},
            upsert=True
        )
        
        # Trigger Drive mirror asynchronously
        recording_url = call_record.get("recording_url")
        if recording_url:
            trigger_drive_mirror(call_id, recording_url, is_audio=True, collection_type="outbound")
        
        return True
    except Exception as e:
        print(f"[MONGODB] Save failed: {e}")
        return False


def save_discarded_call(call_record: Dict) -> bool:
    """Save a post-purchase (discarded) call record to separate collection."""
    collection = get_discarded_calls_collection()
    if collection is None:
        return False

    try:
        call_id = call_record.get("call_id")
        collection.update_one(
            {"call_id": call_id},
            {"$set": call_record},
            upsert=True
        )
        print(f"[OUTBOUND] Post-purchase call {call_id} stored in discarded_calls")
        return True
    except Exception as e:
        print(f"[MONGODB] Save discarded call failed: {e}")
        return False


def get_outbound_stats() -> Dict:
    """Get aggregate statistics for outbound calls."""
    collection = get_outbound_collection()
    if collection is None:
        return {}
    
    try:
        reports = list(collection.find())
        
        if not reports:
            return {
                "total_calls": 0,
                "converted_calls": 0,
                "conversion_rate": 0,
                "avg_agent_score": 0,
                "avg_intent_rating": 0
            }
        
        total = len(reports)
        converted = sum(1 for r in reports if r.get("analysis", {}).get("Pillar_1_Customer_Intent_and_Barriers", {}).get("Intent_to_Purchase_Rating") == "HIGH")
        
        intent_scores = []
        agent_scores = []
        
        for r in reports:
            analysis = r.get("analysis", {})
            
            intent = analysis.get("Pillar_1_Customer_Intent_and_Barriers", {}).get("Intent_to_Purchase_Rating")
            if intent == "HIGH":
                intent_scores.append(3)
            elif intent == "MEDIUM":
                intent_scores.append(2)
            elif intent == "LOW":
                intent_scores.append(1)
            
            overall_exp = analysis.get("Pillar_2_Experience_Delivered", {}).get("Overall_Experience_Rating", 0)
            if overall_exp:
                agent_scores.append(overall_exp)
        
        return {
            "total_calls": total,
            "converted_calls": converted,
            "conversion_rate": round((converted / total * 100) if total > 0 else 0, 2),
            "avg_agent_score": round(sum(agent_scores) / len(agent_scores), 2) if agent_scores else 0,
            "avg_intent_rating": round(sum(intent_scores) / len(intent_scores), 2) if intent_scores else 0
        }
    except Exception as e:
        print(f"[MONGODB] Stats failed: {e}")
        return {}

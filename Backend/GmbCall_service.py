import pandas as pd
import json
import os
import math
from pathlib import Path
from pymongo import MongoClient
from typing import Optional, List, Dict
from drive_mirror_integration import trigger_drive_mirror_for_call
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

CSV_PATH = Path(__file__).parent / "staff_quality_analysis_results.csv"
JSON_BACKUP_PATH = Path(__file__).parent / "uploaded_call_reports.json"

# MongoDB Connection
MONGODB_URI = os.getenv("MONGODB_URI")
MONGODB_NAME = os.getenv("MONGODB_NAME", "Duroflex")
_mongo_client = None


def get_call_collection():
    """Return MongoDB collection for call reports, or None if unavailable."""
    global _mongo_client
    if not MONGODB_URI:
        print(f"[MONGODB] Connection not available - MONGODB_URI is not set")
        return None
    try:
        if _mongo_client is None:
            print(f"[MONGODB] Connecting to: {MONGODB_URI[:50]}...")
            print(f"[MONGODB] Database name: {MONGODB_NAME}")
            _mongo_client = MongoClient(MONGODB_URI, serverSelectionTimeoutMS=5000)
            # Trigger a lightweight ping to validate connectivity
            _mongo_client.admin.command("ping")
            print(f"[MONGODB] Connection successful!")
        db = _mongo_client[MONGODB_NAME]
        return db["call_reports"]
    except Exception as exc:
        print(f"[MONGODB] Connection error: {exc}")
        return None


def save_call_to_mongodb(call_record: Dict) -> bool:
    """
    Save a call record to MongoDB.
    Triggers async Drive mirror if recording_url is present.
    Returns: True if successful, False otherwise
    """
    call_id = call_record.get("call_id")
    analysis = call_record.get("analysis")
    if is_failed_analysis(analysis):
        print(f"[MONGODB] Skipping save for {call_id} - analysis failed")
        return False

    collection = get_call_collection()
    if collection is None:
        return False

    try:
        collection.update_one(
            {"call_id": call_id},
            {"$set": call_record},
            upsert=True
        )
        
        # Trigger Drive mirror asynchronously
        trigger_drive_mirror_for_call(call_record)
        
        return True
    except Exception as e:
        print(f"[MONGODB] Save failed: {e}")
        return False


def save_calls_to_json(calls: List[Dict]) -> bool:
    """
    Save calls to JSON backup file.
    Returns: True if successful, False otherwise
    """
    try:
        with open(JSON_BACKUP_PATH, 'w') as f:
            json.dump(calls, f, indent=2, default=str)
        return True
    except Exception as e:
        print(f"[JSON] Save failed: {e}")
        return False


def load_calls_from_json() -> List[Dict]:
    """
    Load calls from JSON backup file.
    Returns: List of call records
    """
    if not JSON_BACKUP_PATH.exists():
        return []

    try:
        with open(JSON_BACKUP_PATH, 'r') as f:
            return json.load(f)
    except Exception as e:
        print(f"[JSON] Load failed: {e}")
        return []


def load_call_reports_from_csv() -> List[Dict]:
    """Load and parse all call reports from original CSV"""
    try:
        df = pd.read_csv(CSV_PATH)
        reports = []
        
        for _, row in df.iterrows():
            # Parse the JSON string
            try:
                analysis_json = json.loads(row['call_analysis_json'])
                
                # Flatten the structure
                report = {
                    # Metadata from CSV
                    "call_id": str(row['CleanNumber']),
                    "store_name": row['Store Name'],
                    "locality": row['Locality'],
                    "city": row['City'],
                    "state": row['State'],
                    "region": row['Region'],
                    "recording_url": row['Recording URL'],
                    "duration_seconds": row['Duration'],
                    "call_date": row['Date'],
                    "month": row['Month'],
                    "is_converted": bool(row['is_converted']),
                    
                    # Analysis data - flattened
                    "analysis": analysis_json if not isinstance(analysis_json, str) else {"error": analysis_json}
                }
                
                reports.append(report)
            except json.JSONDecodeError:
                # Handle error cases
                reports.append({
                    "call_id": str(row['CleanNumber']),
                    "store_name": row['Store Name'],
                    "city": row['City'],
                    "state": row['State'],
                    "region": row['Region'],
                    "call_date": row['Date'],
                    "duration_seconds": row['Duration'],
                    "is_converted": bool(row['is_converted']),
                    "analysis": {"error": row['call_analysis_json']}
                })
        
        return reports
    except Exception as e:
        print(f"Error loading CSV: {e}")
        return []


def load_call_reports():
    """
    Load all call reports from MongoDB only.
    """
    collection = get_call_collection()
    if collection is None:
        print("[MONGODB] Connection not available")
        return []
    
    try:
        docs = list(collection.find({}))
        print(f"[MONGODB] Loaded {len(docs)} call reports")
        # Convert ObjectId to string and sanitize NaN values
        sanitized_docs = []
        for doc in docs:
            if '_id' in doc:
                doc['_id'] = str(doc['_id'])
            # Sanitize NaN values and append sanitized version
            sanitized_docs.append(sanitize_nan(doc))
        return sanitized_docs
    except Exception as e:
        print(f"[MONGODB] Load error: {e}")
        return []


def get_call_report_by_id(call_id: str) -> Optional[Dict]:
    """Fetch a single call report by call_id from MongoDB only."""
    collection = get_call_collection()
    if collection is None:
        print("[MONGODB] Connection not available")
        return None
    
    try:
        doc = collection.find_one({"call_id": call_id})
        if doc:
            if "_id" in doc:
                doc["_id"] = str(doc["_id"])
            return sanitize_nan(doc)
    except Exception as e:
        print(f"[MONGODB] Load by id error: {e}")
    
    return None


def get_call_stats():
    """Get aggregate statistics"""
    reports = load_call_reports()
    
    total = len(reports)
    converted = sum(1 for r in reports if r.get('is_converted'))
    
    # Count by region
    regions = {}
    for r in reports:
        region = r.get('region') or 'Unknown'  # Handle None/NaN
        regions[region] = regions.get(region, 0) + 1
    
    # Sanitize stats values
    stats = {
        "total_calls": total,
        "converted_calls": converted,
        "conversion_rate": round(converted / total * 100, 1) if total > 0 else 0,
        "regions": regions
    }
    
    return sanitize_nan(stats)

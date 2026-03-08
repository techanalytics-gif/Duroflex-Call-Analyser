"""
Persistent Job Tracker (MongoDB-backed)

Provides create / update / query helpers for upload processing jobs.
Falls back to an in-memory dict if MongoDB is not available so that
local development still works without a running database.
"""

import os
import math
import uuid
from datetime import datetime
from typing import Dict, Optional, Any
from dotenv import load_dotenv
from pymongo import MongoClient

load_dotenv()

MONGODB_URI = os.getenv("MONGODB_URI")
MONGODB_NAME = os.getenv("MONGODB_NAME", "Duroflex")

_mongo_client: Optional[MongoClient] = None
_in_memory_jobs: Dict[str, Dict] = {}  # Fallback for local dev


def _get_jobs_collection():
    """Return the 'processing_jobs' MongoDB collection, or None if unavailable."""
    global _mongo_client
    if not MONGODB_URI:
        return None
    try:
        if _mongo_client is None:
            _mongo_client = MongoClient(MONGODB_URI, serverSelectionTimeoutMS=3000)
            _mongo_client.admin.command("ping")
        db = _mongo_client[MONGODB_NAME]
        return db["processing_jobs"]
    except Exception as exc:
        print(f"[JOB TRACKER] MongoDB not available: {exc}")
        return None


def create_job(job_type: str, filename: str, total_records: int) -> str:
    """
    Create a new processing job record and return its job_id.

    Args:
        job_type: e.g. 'gmb_audio', 'video', 'outbound', 'abc'
        filename: Original uploaded filename
        total_records: Total number of rows to process
    """
    job_id = str(uuid.uuid4())
    job_doc = {
        "job_id": job_id,
        "job_type": job_type,
        "filename": filename,
        "status": "processing",
        "total_records": total_records,
        "processed": 0,
        "successful": 0,
        "failed": 0,
        "filtered_out": 0,
        "errors": [],
        "created_at": datetime.utcnow().isoformat(),
        "updated_at": datetime.utcnow().isoformat(),
    }

    collection = _get_jobs_collection()
    if collection is not None:
        try:
            collection.insert_one(job_doc)
        except Exception as exc:
            print(f"[JOB TRACKER] Failed to create job in MongoDB: {exc}")
    
    job_doc_copy = {k: v for k, v in job_doc.items() if k != "_id"}
    _in_memory_jobs[job_id] = job_doc_copy
    return job_id


def update_job_progress(
    job_id: str,
    *,
    successful_delta: int = 0,
    failed_delta: int = 0,
    filtered_delta: int = 0,
    error: Optional[Dict] = None,
) -> None:
    """
    Atomically increment job progress counters in MongoDB and in-memory cache.
    Called after each individual call is processed.
    """
    processed_delta = successful_delta + failed_delta  # filtered rows don't count as "processed"
    
    update_payload: Dict[str, Any] = {
        "$inc": {
            "processed": processed_delta + filtered_delta,
            "successful": successful_delta,
            "failed": failed_delta,
            "filtered_out": filtered_delta,
        },
        "$set": {"updated_at": datetime.utcnow().isoformat()},
    }
    if error:
        update_payload["$push"] = {"errors": error}

    collection = _get_jobs_collection()
    if collection is not None:
        try:
            collection.update_one({"job_id": job_id}, update_payload)
        except Exception as exc:
            print(f"[JOB TRACKER] Failed to update job {job_id}: {exc}")

    # Update in-memory too
    if job_id in _in_memory_jobs:
        job = _in_memory_jobs[job_id]
        job["processed"] = job.get("processed", 0) + processed_delta + filtered_delta
        job["successful"] = job.get("successful", 0) + successful_delta
        job["failed"] = job.get("failed", 0) + failed_delta
        job["filtered_out"] = job.get("filtered_out", 0) + filtered_delta
        job["updated_at"] = datetime.utcnow().isoformat()
        if error:
            job.setdefault("errors", []).append(error)


def complete_job(job_id: str) -> None:
    """Mark a job as completed."""
    _finish_job(job_id, "completed")


def fail_job(job_id: str, error_msg: str) -> None:
    """Mark a job as failed with a critical error message."""
    collection = _get_jobs_collection()
    if collection is not None:
        try:
            collection.update_one(
                {"job_id": job_id},
                {
                    "$set": {
                        "status": "failed",
                        "updated_at": datetime.utcnow().isoformat(),
                    },
                    "$push": {"errors": {"critical": error_msg}},
                },
            )
        except Exception as exc:
            print(f"[JOB TRACKER] Failed to mark job {job_id} as failed: {exc}")
    if job_id in _in_memory_jobs:
        _in_memory_jobs[job_id]["status"] = "failed"


def _finish_job(job_id: str, status: str) -> None:
    collection = _get_jobs_collection()
    if collection is not None:
        try:
            collection.update_one(
                {"job_id": job_id},
                {"$set": {"status": status, "updated_at": datetime.utcnow().isoformat()}},
            )
        except Exception as exc:
            print(f"[JOB TRACKER] Failed to update status for job {job_id}: {exc}")
    if job_id in _in_memory_jobs:
        _in_memory_jobs[job_id]["status"] = status


def get_job_status(job_id: str) -> Optional[Dict]:
    """
    Fetch job status. Tries MongoDB first, then falls back to in-memory.
    Returns None if job is not found.
    """
    collection = _get_jobs_collection()
    if collection is not None:
        try:
            doc = collection.find_one({"job_id": job_id})
            if doc:
                doc.pop("_id", None)
                return _sanitize(doc)
        except Exception as exc:
            print(f"[JOB TRACKER] Failed to fetch job {job_id} from MongoDB: {exc}")

    return _sanitize(_in_memory_jobs.get(job_id))


def _sanitize(obj):
    """Recursively replace NaN with None for JSON safety."""
    if obj is None:
        return None
    if isinstance(obj, dict):
        return {k: _sanitize(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_sanitize(i) for i in obj]
    if isinstance(obj, float) and math.isnan(obj):
        return None
    return obj

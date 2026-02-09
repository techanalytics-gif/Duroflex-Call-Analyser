"""
Video Upload Processing Service
Handles CSV upload -> Gemini video analysis -> MongoDB storage
"""

import uuid
import time
import hashlib
import math
from datetime import datetime
from pathlib import Path
from typing import Dict, Any, Optional, Tuple, List

import pandas as pd

from video_analysis_service import analyze_video_with_gemini, save_video_analysis


def sanitize_nan(obj):
    """Recursively replace NaN values with None for JSON serialization."""
    if isinstance(obj, dict):
        return {k: sanitize_nan(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [sanitize_nan(item) for item in obj]
    if isinstance(obj, float) and math.isnan(obj):
        return None
    return obj


class VideoCSVValidator:
    """Validates CSV structure for video uploads."""

    REQUIRED_COLUMNS = [
        "Store Name",
        "Recording URL",
        "Duration",
        "CleanDateTime",
        "Date",
        "WeekNum",
        "Month",
        "CleanNumber",
        "is_converted",
    ]

    COLUMN_ALIASES = {
        "storename": "Store Name",
        "store": "Store Name",
        "customer": "Store Name",
        "customername": "Store Name",
        "recordingurl": "Recording URL",
        "recordinglink": "Recording URL",
        "recordedfile": "Recording URL",
        "recordedfileurl": "Recording URL",
        "recordedfilelink": "Recording URL",
        "recordedf": "Recording URL",
        "videourl": "Recording URL",
        "videolink": "Recording URL",
        "duration": "Duration",
        "cleandatetime": "CleanDateTime",
        "cleandatet": "CleanDateTime",
        "cleandatetim": "CleanDateTime",
        "date": "Date",
        "weeknum": "WeekNum",
        "week": "WeekNum",
        "month": "Month",
        "cleannumber": "CleanNumber",
        "isconverted": "is_converted",
        "isconvertedflag": "is_converted",
        "converted": "is_converted",
    }

    @staticmethod
    def _normalize_key(value: str) -> str:
        return "".join(ch.lower() for ch in str(value) if ch.isalnum())

    @staticmethod
    def normalize_columns(df: pd.DataFrame) -> pd.DataFrame:
        if df is None or df.empty:
            return df

        normalized = {}
        for col in df.columns:
            key = VideoCSVValidator._normalize_key(col)
            normalized[col] = VideoCSVValidator.COLUMN_ALIASES.get(key, col)

        df = df.rename(columns=normalized)
        return df

    @staticmethod
    def validate(df: pd.DataFrame) -> Tuple[bool, Optional[str]]:
        missing = [col for col in VideoCSVValidator.REQUIRED_COLUMNS if col not in df.columns]
        if missing:
            return False, f"Missing columns: {', '.join(missing)}"
        if df.empty:
            return False, "CSV is empty"
        return True, None


class VideoProcessingJob:
    """Tracks the state of a CSV processing job."""

    def __init__(self, filename: str):
        self.job_id = str(uuid.uuid4())
        self.filename = filename
        self.status = "pending"
        self.created_at = datetime.now()
        self.started_at: Optional[datetime] = None
        self.completed_at: Optional[datetime] = None
        self.total_records = 0
        self.processed = 0
        self.successful = 0
        self.failed = 0
        self.errors: List[Dict[str, Any]] = []

    def to_dict(self) -> Dict[str, Any]:
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
            "errors": self.errors,
        }

    def add_error(self, row_num: int, store_name: str, error: str):
        self.errors.append({"row": row_num, "store": store_name, "error": error})
        self.failed += 1
        self.processed += 1

    def mark_success(self):
        self.successful += 1
        self.processed += 1

    def mark_processing(self):
        self.status = "processing"
        self.started_at = datetime.now()

    def mark_completed(self):
        self.status = "completed"
        self.completed_at = datetime.now()

    def mark_failed(self):
        self.status = "failed"
        self.completed_at = datetime.now()


class VideoUploadProcessor:
    """Main orchestrator for video CSV uploads."""

    def __init__(self):
        self.jobs: Dict[str, VideoProcessingJob] = {}
        self.processed_videos: List[Dict[str, Any]] = []

    def create_report_id(self, store_name: str, date: str, url: str) -> str:
        """Create unique video report ID from store name, date, and URL hash."""
        url_hash = hashlib.md5(url.encode()).hexdigest()[:6].upper()
        clean_store = store_name.replace(" ", "_")[:15]
        clean_date = str(date).replace("-", "")[:8]
        return f"VIDEO_{clean_store}_{clean_date}_{url_hash}"

    def process_single_video(
        self,
        row_num: int,
        row_data: Dict[str, Any],
        job: VideoProcessingJob,
    ) -> Optional[Dict[str, Any]]:
        """Process a single video row and return the stored record."""
        store_name = row_data.get("Store Name", "Unknown")
        url = row_data.get("Recording URL")
        
        # Handle NaN values from pandas (which are float type)
        if pd.isna(url) or not url or not isinstance(url, str):
            job.add_error(row_num, store_name, "No recording URL provided or invalid URL")
            return None
        
        if pd.isna(store_name) or not store_name:
            store_name = "Unknown"

        # Build metadata first (needed for filling N/A values in analysis)
        metadata = {
            "store_name": store_name,
            "recording_url": url,
            "duration": row_data.get("Duration"),
            "clean_datetime": row_data.get("CleanDateTime"),
            "date": row_data.get("Date"),
            "week_num": row_data.get("WeekNum"),
            "month": row_data.get("Month"),
            "clean_number": row_data.get("CleanNumber"),
            "is_converted": bool(row_data.get("is_converted", 0)),
        }

        try:
            analysis = analyze_video_with_gemini(
                video_url=url, 
                store_name=store_name,
                metadata=metadata
            )
        except Exception as exc:  # Capture Gemini/network issues without crashing the job
            job.add_error(row_num, store_name, f"Analysis error: {exc}")
            return None

        report_id = self.create_report_id(store_name, str(row_data.get("Date", "")), url)

        video_record = {
            "report_id": report_id,
            "analysis": analysis,
            "metadata": metadata,
            "upload_timestamp": datetime.now().isoformat(),
        }

        job.mark_success()
        return sanitize_nan(video_record)

    def process_csv_file(self, csv_file_path: str, rate_limit_delay: float = 1.0) -> str:
        """Validate and process an uploaded CSV file."""
        df = pd.read_csv(csv_file_path)
        df = VideoCSVValidator.normalize_columns(df)
        is_valid, error = VideoCSVValidator.validate(df)
        if not is_valid:
            raise ValueError(error)

        job = VideoProcessingJob(filename=Path(csv_file_path).name)
        self.jobs[job.job_id] = job

        job.total_records = len(df)
        job.mark_processing()

        for idx, row in df.iterrows():
            record = self.process_single_video(idx + 1, row.to_dict(), job)
            if record:
                self.processed_videos.append(record)

            if rate_limit_delay:
                time.sleep(rate_limit_delay)

        job.mark_completed()
        return job.job_id

    def get_processed_videos(self) -> List[Dict[str, Any]]:
        return self.processed_videos

    def get_job_status(self, job_id: str) -> Dict[str, Any]:
        job = self.jobs.get(job_id)
        if not job:
            return {"status": "not_found", "message": "Job ID not found"}
        return job.to_dict()

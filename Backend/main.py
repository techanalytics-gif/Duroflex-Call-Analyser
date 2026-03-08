from fastapi import FastAPI, HTTPException, UploadFile, File, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional, Dict
from dotenv import load_dotenv
import os
import json
from pathlib import Path
import uvicorn
from datetime import timedelta
import asyncio
import tempfile
import math
from json import JSONEncoder

# Load environment variables from .env file
load_dotenv()

from GmbCall_service import load_call_reports, get_call_report_by_id, get_call_stats, save_call_to_mongodb, save_calls_to_json
from video_analysis_service import analyze_video_with_gemini, get_all_video_reports_with_metadata, get_video_analysis_by_id, save_video_analysis
from auth_service import authenticate_admin, create_access_token, create_admin_in_db
from preprocess_videos import preprocess_all_videos
from GmbCall_processor import CallUploadProcessor
from video_upload_service import VideoUploadProcessor
from drive_mirror_integration import trigger_drive_mirror
from video_chatbot_service import chat_with_video_context, get_chat_insights, get_all_video_transcripts
from outbound_call_service import load_outbound_reports, get_outbound_report_by_id, get_outbound_stats, save_outbound_call_to_mongodb, save_discarded_call
from outbound_processor import OutboundCallUploadProcessor
from abc_processor import AbcCallProcessor
from abc_service import load_abc_reports, get_abc_report_by_id, get_abc_stats, save_abc_call_to_mongodb, save_abc_discarded_call
import job_tracker



def sanitize_nan(obj):
    """Recursively replace NaN values and MongoDB types with JSON-safe values."""
    if isinstance(obj, dict):
        # Handle MongoDB $numberLong format
        if "$numberLong" in obj and len(obj) == 1:
            return int(obj["$numberLong"])
        return {k: sanitize_nan(v) for k, v in obj.items()}
    elif isinstance(obj, list):
        return [sanitize_nan(item) for item in obj]
    elif isinstance(obj, float) and math.isnan(obj):
        return None
    return obj


# Custom JSON encoder to handle NaN values (fallback)
class NaNEncoder(JSONEncoder):
    def encode(self, o):
        if isinstance(o, float) and math.isnan(o):
            return 'null'
        return super().encode(o)
    
    def iterencode(self, o, _one_shot=False):
        for chunk in super().iterencode(o, _one_shot):
            yield chunk


app = FastAPI(title="Duroflex Video Analysis API")

# CORS middleware for frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], 
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Create necessary directories
RESULTS_DIR = Path("results")
TEMP_DIR = Path("temp")
RESULTS_DIR.mkdir(exist_ok=True)
TEMP_DIR.mkdir(exist_ok=True)


# Request models
class LoginRequest(BaseModel):
    email: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str
    email: str


class ChatbotMessage(BaseModel):
    message: str
    conversation_history: Optional[List[Dict]] = None


class ChatbotResponse(BaseModel):
    status: str
    response: str
    message: Optional[str] = None# # Mystery Shopper Models

# ===== AUTHENTICATION ENDPOINTS =====

@app.post("/api/auth/login", response_model=TokenResponse)
async def login(request: LoginRequest):
    """
    Admin login endpoint
    Credentials: admin@duroflex.com / duroflex123
    """
    if not authenticate_admin(request.email, request.password):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    
    # Create access token
    access_token = create_access_token(
        data={"sub": request.email},
        expires_delta=timedelta(days=1)
    )
    
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "email": request.email
    }


# Root endpoint
@app.get("/")
async def root():
    return {
        "message": "Duroflex Video Analysis API",
        "status": "running",
        "endpoints": {
            "login": "POST /api/auth/login",
            "video_reports": "GET /api/video-reports",
            "video_report_detail": "GET /api/video-reports/{report_id}",
            "analyze_video": "POST /api/video-reports/analyze",
            "get_result": "GET /api/results/{video_id}",
            "get_all_results": "GET /api/results",
            "health": "GET /api/health",
            "call_reports": "GET /api/GmbCalls"
        }
    }


@app.get("/api/health")
async def health_check():
    return {"status": "healthy", "service": "Duroflex Video Analysis"}


# ===== VIDEO ANALYSIS ENDPOINTS (NEW) =====

@app.get("/api/video-reports")
async def get_all_video_reports():
    """Get all video reports from CSV with analysis status"""
    try:
        reports = get_all_video_reports_with_metadata()
        return {
            "status": "success",
            "total": len(reports),
            "reports": reports
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/video-reports/{report_id}")
async def get_video_report_detail(report_id: str):
    """Get detailed analysis for a specific video report"""
    try:
        from video_analysis_service import get_video_collection
        
        # Get full document from MongoDB to include driveLink
        collection = get_video_collection()
        if collection is not None:
            document = collection.find_one({"report_id": report_id})
            if document:
                # Remove MongoDB _id for JSON serialization
                if "_id" in document:
                    del document["_id"]
                
                # Sanitize MongoDB types for JSON
                return sanitize_nan({
                    "status": "success",
                    "report_id": report_id,
                    "analysis": document.get("analysis"),
                    "driveLink": document.get("driveLink"),
                    "driveStatus": document.get("driveStatus"),
                    "metadata": document.get("metadata")
                })
        
        # Fallback to old method if MongoDB not available
        analysis = get_video_analysis_by_id(report_id)
        if not analysis:
            raise HTTPException(status_code=404, detail=f"Analysis not found for report {report_id}")
        
        return {
            "status": "success",
            "report_id": report_id,
            "analysis": analysis
        }
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        print(f"[ERROR] Video report detail failed: {e}")
        print(traceback.format_exc())
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/video-reports/analyze/{report_id}")
async def analyze_video_report(report_id: str):
    """Trigger analysis for a specific video by report_id"""
    try:
        # Get all reports
        reports = get_all_video_reports_with_metadata()
        
        # Find the specific report
        target_report = None
        for report in reports:
            if report["report_id"] == report_id:
                target_report = report
                break
        
        if not target_report:
            raise HTTPException(status_code=404, detail=f"Video report {report_id} not found")
        
        # Check if already analyzed
        if target_report["analyzed"]:
            return {
                "status": "success",
                "message": "Video already analyzed",
                "report_id": report_id,
                "analysis": target_report["analysis_data"]
            }
        
        # Analyze the video
        print(f"Starting analysis for {report_id}...")
        
        # Build metadata from target_report
        metadata = {
            "store_name": target_report.get("store_name"),
            "recording_url": target_report.get("recording_url"),
        }
        
        analysis_result = analyze_video_with_gemini(
            video_url=target_report["recording_url"],
            store_name=target_report["store_name"],
            metadata=metadata
        )
        
        # Save the analysis
        save_video_analysis(report_id, analysis_result)
        
        return {
            "status": "success",
            "message": f"Video {report_id} analyzed successfully",
            "report_id": report_id,
            "analysis": analysis_result
        }
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error analyzing video: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error analyzing video: {str(e)}")


# ===== VIDEO CSV UPLOAD ENDPOINT =====


def _run_video_upload_in_background(csv_bytes: bytes, filename: str, persistent_job_id: str):
    """Background task: process video CSV and save each result to MongoDB immediately."""
    import tempfile, os
    temp_path = None
    try:
        with tempfile.NamedTemporaryFile(mode='wb', suffix='.csv', delete=False) as f:
            f.write(csv_bytes)
            temp_path = f.name

        processor = VideoUploadProcessor(
            save_callback=lambda rid, analysis, metadata: save_video_analysis(
                report_id=rid, analysis_data=sanitize_nan(analysis), metadata=metadata
            )
        )
        processor.process_csv_file(
            csv_file_path=temp_path,
            rate_limit_delay=1.0,
            persistent_job_id=persistent_job_id,
        )
        job_tracker.complete_job(persistent_job_id)
        print(f"[BG] Video upload job {persistent_job_id} completed.")
    except Exception as exc:
        job_tracker.fail_job(persistent_job_id, str(exc))
        print(f"[BG] Video upload job {persistent_job_id} failed: {exc}")
    finally:
        if temp_path and os.path.exists(temp_path):
            try:
                os.remove(temp_path)
            except:
                pass


@app.post("/api/video-reports/upload")
async def upload_video_csv(background_tasks: BackgroundTasks, file: UploadFile = File(...)):
    """Upload a CSV of video calls. Returns job_id immediately; processing runs in the background."""
    if not file.filename.endswith('.csv'):
        raise HTTPException(status_code=400, detail="File must be a CSV file")

    try:
        csv_bytes = await file.read()
        # Quick structure validation before accepting
        import io
        import pandas as pd
        from video_upload_service import VideoCSVValidator
        df = pd.read_csv(io.BytesIO(csv_bytes))
        df = VideoCSVValidator.normalize_columns(df)
        is_valid, err = VideoCSVValidator.validate(df)
        if not is_valid:
            raise HTTPException(status_code=400, detail=err)
        total_records = len(df)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid CSV: {str(e)}")

    persistent_job_id = job_tracker.create_job(
        job_type="video",
        filename=file.filename,
        total_records=total_records,
    )

    background_tasks.add_task(_run_video_upload_in_background, csv_bytes, file.filename, persistent_job_id)

    return sanitize_nan({
        "status": "accepted",
        "message": f"Processing {total_records} videos in the background.",
        "job_id": persistent_job_id,
        "total_records": total_records,
        "poll_url": f"/api/upload-status/{persistent_job_id}",
    })


# ===== CSV AUDIO CALL UPLOAD ENDPOINTS =====


def _run_gmb_upload_in_background(csv_bytes: bytes, filename: str, persistent_job_id: str, api_key: str):
    """Background task: process GMB audio CSV and save each result to MongoDB immediately."""
    import tempfile, os
    temp_path = None
    try:
        with tempfile.NamedTemporaryFile(mode='wb', suffix='.csv', delete=False) as f:
            f.write(csv_bytes)
            temp_path = f.name

        def _save_gmb(call_record):
            save_call_to_mongodb(sanitize_nan(call_record))

        processor = CallUploadProcessor(api_key=api_key, save_callback=_save_gmb)
        processor.process_csv_file(
            csv_file_path=temp_path,
            rate_limit_delay=15.0,
            persistent_job_id=persistent_job_id,
        )
        job_tracker.complete_job(persistent_job_id)
        print(f"[BG] GMB upload job {persistent_job_id} completed.")
    except Exception as exc:
        job_tracker.fail_job(persistent_job_id, str(exc))
        print(f"[BG] GMB upload job {persistent_job_id} failed: {exc}")
    finally:
        if temp_path and os.path.exists(temp_path):
            try:
                os.remove(temp_path)
            except:
                pass


@app.post("/api/GmbCalls/upload")
async def upload_audio_csv(background_tasks: BackgroundTasks, file: UploadFile = File(...)):
    """
    Upload a CSV file with audio call recordings for processing.
    Returns job_id immediately; processing runs in the background.
    """
    if not file.filename.endswith('.csv'):
        raise HTTPException(status_code=400, detail="File must be a CSV file")

    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail="GEMINI_API_KEY not configured")

    try:
        csv_bytes = await file.read()
        # Quick structure validation
        import io, pandas as pd
        from GmbCall_processor import CSVValidator
        df = pd.read_csv(io.BytesIO(csv_bytes))
        is_valid, err = CSVValidator.validate(df)
        if not is_valid:
            raise HTTPException(status_code=400, detail=err)
        total_records = len(df)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid CSV: {str(e)}")

    persistent_job_id = job_tracker.create_job(
        job_type="gmb_audio",
        filename=file.filename,
        total_records=total_records,
    )

    background_tasks.add_task(_run_gmb_upload_in_background, csv_bytes, file.filename, persistent_job_id, api_key)

    return sanitize_nan({
        "status": "accepted",
        "message": f"Processing {total_records} audio calls in the background.",
        "job_id": persistent_job_id,
        "total_records": total_records,
        "poll_url": f"/api/upload-status/{persistent_job_id}",
    })


# ===== CSV CALL ANALYSIS ENDPOINTS =====


@app.get("/api/GmbCalls")
async def get_all_call_reports():
    """Get all call analysis reports from CSV"""
    try:
        reports = load_call_reports()
        response = {
            "status": "success",
            "total": len(reports),
            "reports": reports
        }
        # Sanitize NaN values before returning
        return sanitize_nan(response)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/GmbCalls/{call_id}")
async def get_call_report(call_id: str):
    """Get a specific call report by call ID"""
    try:
        report = get_call_report_by_id(call_id)
        if not report:
            raise HTTPException(status_code=404, detail=f"Call report not found for ID {call_id}")
        response = {
            "status": "success",
            "report": report
        }
        # Sanitize NaN values before returning
        return sanitize_nan(response)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/GmbCalls/stats/overview")
async def get_call_reports_stats():
    """Get aggregate statistics for all call reports"""
    try:
        stats = get_call_stats()
        response = {
            "status": "success",
            "stats": stats
        }
        # Sanitize NaN values before returning
        return sanitize_nan(response)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ===== UNIVERSAL UPLOAD STATUS ENDPOINT =====

@app.get("/api/upload-status/{job_id}")
async def get_upload_status(job_id: str):
    """Get real-time processing status for any upload job."""
    status = job_tracker.get_job_status(job_id)
    if status is None:
        raise HTTPException(status_code=404, detail=f"Job {job_id} not found")
    return sanitize_nan(status)


@app.post("/api/GmbCalls/{call_id}/retry-drive-sync")
async def retry_audio_drive_sync(call_id: str):
    """Retry Drive sync for a specific audio call report"""
    try:
        report = get_call_report_by_id(call_id)
        if not report:
            raise HTTPException(status_code=404, detail=f"Call report not found: {call_id}")
        
        recording_url = report.get("recording_url")
        if not recording_url:
            raise HTTPException(status_code=400, detail="No recording URL found for this call")
        
        success = trigger_drive_mirror(call_id, recording_url, is_audio=True)
        
        return {
            "status": "success" if success else "failed",
            "message": f"Drive sync {'queued' if success else 'failed to queue'} for {call_id}",
            "call_id": call_id
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/video-reports/{report_id}/retry-drive-sync")
async def retry_video_drive_sync(report_id: str):
    """Retry Drive sync for a specific video report"""
    try:
        analysis = get_video_analysis_by_id(report_id)
        if not analysis:
            raise HTTPException(status_code=404, detail=f"Video report not found: {report_id}")
        
        # Check both analysis and metadata for recording_url
        recording_url = None
        if isinstance(analysis, dict):
            recording_url = analysis.get("recording_url")
            if not recording_url and "metadata" in analysis:
                recording_url = analysis["metadata"].get("recording_url")
        
        if not recording_url:
            raise HTTPException(status_code=400, detail="No recording URL found for this video")
        
        success = trigger_drive_mirror(report_id, recording_url, is_audio=False)
        
        return {
            "status": "success" if success else "failed",
            "message": f"Drive sync {'queued' if success else 'failed to queue'} for {report_id}",
            "report_id": report_id
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ===== VIDEO CHATBOT ENDPOINTS =====

@app.get("/api/video-chatbot/insights")
async def get_video_chatbot_insights():
    """Get summary insights about all video call transcripts"""
    try:
        insights = get_chat_insights()
        return insights
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/video-chatbot/chat")
async def chat_with_videos(request: ChatbotMessage):
    """
    Chat with Gemini AI using all video transcripts as context.
    Answers questions about customer behavior, sales patterns, etc.
    """
    try:
        if not request.message or not request.message.strip():
            raise HTTPException(status_code=400, detail="Message cannot be empty")
        
        # Call the chatbot service
        response = chat_with_video_context(
            user_message=request.message,
            conversation_history=request.conversation_history
        )
        
        return ChatbotResponse(
            status="success",
            response=response
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/video-chatbot/transcripts/count")
async def get_transcript_count():
    """Get count of available transcripts"""
    try:
        transcripts = get_all_video_transcripts()
        return {
            "status": "success",
            "count": len(transcripts),
            "message": f"Total transcripts available: {len(transcripts)}"
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ===== OUTBOUND CALL ENDPOINTS =====

@app.get("/api/outbound-calls")
async def get_all_outbound_calls():
    """Get all outbound (store walkin follow-up) call reports"""
    try:
        reports = load_outbound_reports()
        response = {
            "status": "success",
            "total": len(reports),
            "reports": reports
        }
        return sanitize_nan(response)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/outbound-calls/{call_id}")
async def get_outbound_call_report(call_id: str):
    """Get a specific outbound call report by call ID"""
    try:
        report = get_outbound_report_by_id(call_id)
        if not report:
            raise HTTPException(status_code=404, detail=f"Outbound call report not found for ID {call_id}")
        response = {
            "status": "success",
            "report": report
        }
        return sanitize_nan(response)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/outbound-calls/stats/overview")
async def get_outbound_calls_stats():
    """Get aggregate statistics for outbound call reports"""
    try:
        stats = get_outbound_stats()
        response = {
            "status": "success",
            "stats": stats
        }
        return sanitize_nan(response)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


def _run_outbound_upload_in_background(csv_bytes: bytes, filename: str, persistent_job_id: str):
    """Background task: process outbound CSV; persists each result to MongoDB immediately."""
    import tempfile, os
    temp_path = None
    try:
        with tempfile.NamedTemporaryFile(mode='wb', suffix='.csv', delete=False) as f:
            f.write(csv_bytes)
            temp_path = f.name

        processor = OutboundCallUploadProcessor()
        processor.process_csv_file(
            csv_file_path=temp_path,
            rate_limit_delay=1.0,
            persistent_job_id=persistent_job_id,
        )

        # Save results to MongoDB (processor already saves discarded calls inside _process_single_row)
        for call_data in processor.get_processed_calls():
            save_outbound_call_to_mongodb(call_data)
        for call_data in processor.get_discarded_calls():
            save_discarded_call(call_data)

        job_tracker.complete_job(persistent_job_id)
        print(f"[BG] Outbound upload job {persistent_job_id} completed.")
    except Exception as exc:
        job_tracker.fail_job(persistent_job_id, str(exc))
        print(f"[BG] Outbound upload job {persistent_job_id} failed: {exc}")
    finally:
        if temp_path and os.path.exists(temp_path):
            try:
                os.remove(temp_path)
            except:
                pass


@app.post("/api/outbound-calls/upload")
async def upload_outbound_csv(background_tasks: BackgroundTasks, file: UploadFile = File(...)):
    """
    Upload a CSV file with outbound call recordings for processing.
    Returns job_id immediately; processing runs in the background.
    """
    if not file.filename.endswith('.csv'):
        raise HTTPException(status_code=400, detail="File must be a CSV file")

    try:
        csv_bytes = await file.read()
        import io, pandas as pd
        from outbound_processor import OutboundCSVValidator
        df = pd.read_csv(io.BytesIO(csv_bytes))
        df.columns = df.columns.str.strip()
        is_valid, err = OutboundCSVValidator.validate(df)
        if not is_valid:
            raise HTTPException(status_code=400, detail=err)
        total_records = len(df)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid CSV: {str(e)}")

    persistent_job_id = job_tracker.create_job(
        job_type="outbound",
        filename=file.filename,
        total_records=total_records,
    )

    background_tasks.add_task(_run_outbound_upload_in_background, csv_bytes, file.filename, persistent_job_id)

    return sanitize_nan({
        "status": "accepted",
        "message": f"Processing {total_records} outbound calls in the background.",
        "job_id": persistent_job_id,
        "total_records": total_records,
        "poll_url": f"/api/upload-status/{persistent_job_id}",
    })


# ===== ABC CART RECOVERY CALLS ENDPOINTS =====

@app.get("/api/abc-calls/reports")
async def get_abc_call_reports():
    """Get all ABC call reports"""
    try:
        reports = load_abc_reports()
        response = {
            "status": "success",
            "total": len(reports),
            "reports": reports
        }
        return sanitize_nan(response)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/abc-calls/{call_id}")
async def get_abc_call_report(call_id: str):
    """Get a specific ABC call report by call ID"""
    try:
        report = get_abc_report_by_id(call_id)
        if not report:
            raise HTTPException(status_code=404, detail=f"ABC call report not found for ID {call_id}")
        response = {
            "status": "success",
            "report": report
        }
        return sanitize_nan(response)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/abc-calls/stats/overview")
async def get_abc_calls_stats():
    """Get aggregate statistics for ABC call reports"""
    try:
        stats = get_abc_stats()
        response = {
            "status": "success",
            "stats": stats
        }
        return sanitize_nan(response)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


def _run_abc_upload_in_background(csv_bytes: bytes, filename: str, persistent_job_id: str):
    """Background task: process ABC cart recovery CSV; persists each result to MongoDB immediately."""
    import tempfile, os
    temp_path = None
    try:
        with tempfile.NamedTemporaryFile(mode='wb', suffix='.csv', delete=False) as f:
            f.write(csv_bytes)
            temp_path = f.name

        processor = AbcCallProcessor()
        processor.process_csv_file(csv_file_path=temp_path, rate_limit_delay=1.0, persistent_job_id=persistent_job_id)
        # abc_processor calls save_abc_call_to_mongodb / save_abc_discarded_call internally per-row

        job_tracker.complete_job(persistent_job_id)
        print(f"[BG] ABC upload job {persistent_job_id} completed.")
    except Exception as exc:
        job_tracker.fail_job(persistent_job_id, str(exc))
        print(f"[BG] ABC upload job {persistent_job_id} failed: {exc}")
    finally:
        if temp_path and os.path.exists(temp_path):
            try:
                os.remove(temp_path)
            except:
                pass


@app.post("/api/abc-calls/upload")
async def upload_abc_csv(background_tasks: BackgroundTasks, file: UploadFile = File(...)):
    """
    Upload a CSV file with ABC Cart Recovery call recordings for processing.
    Returns job_id immediately; processing runs in the background.
    """
    if not file.filename.endswith('.csv'):
        raise HTTPException(status_code=400, detail="File must be a CSV file")

    try:
        csv_bytes = await file.read()
        import io, pandas as pd
        from abc_processor import AbcCSVValidator
        df = pd.read_csv(io.BytesIO(csv_bytes))
        df.columns = df.columns.str.strip()
        is_valid, err = AbcCSVValidator.validate(df)
        if not is_valid:
            raise HTTPException(status_code=400, detail=err)
        total_records = len(df)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid CSV: {str(e)}")

    persistent_job_id = job_tracker.create_job(
        job_type="abc",
        filename=file.filename,
        total_records=total_records,
    )

    background_tasks.add_task(_run_abc_upload_in_background, csv_bytes, file.filename, persistent_job_id)

    return sanitize_nan({
        "status": "accepted",
        "message": f"Processing {total_records} cart recovery calls in the background.",
        "job_id": persistent_job_id,
        "total_records": total_records,
        "poll_url": f"/api/upload-status/{persistent_job_id}",
    })


if __name__ == "__main__":
    print("Starting Duroflex Video Analysis API...")
    print("API will be available at http://localhost:8000")
    print("API docs at http://localhost:8000/docs")
    # Use import string form to allow reload without warnings
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=False)
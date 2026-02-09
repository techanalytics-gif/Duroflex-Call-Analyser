from fastapi import FastAPI, HTTPException, UploadFile, File
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

@app.post("/api/video-reports/upload")
async def upload_video_csv(file: UploadFile = File(...)):
    """Upload a CSV of video calls and store analyses in MongoDB."""
    try:
        if not file.filename.endswith('.csv'):
            raise HTTPException(status_code=400, detail="File must be a CSV file")

        temp_path = None
        try:
            content = await file.read()

            with tempfile.NamedTemporaryFile(mode='wb', suffix='.csv', delete=False) as temp_file:
                temp_file.write(content)
                temp_path = temp_file.name

            processor = VideoUploadProcessor()

            try:
                job_id = processor.process_csv_file(csv_file_path=temp_path, rate_limit_delay=1.0)
            except ValueError as ve:
                raise HTTPException(status_code=400, detail=str(ve))

            processed_videos = [sanitize_nan(v) for v in processor.get_processed_videos()]

            for video in processed_videos:
                metadata = video.get("metadata")
                save_video_analysis(
                    report_id=video.get("report_id"),
                    analysis_data=video.get("analysis", {}),
                    metadata=metadata,
                )

            job_status = processor.get_job_status(job_id)

            response = {
                "status": "processing_complete",
                "job_id": job_id,
                "filename": file.filename,
                "total_records": job_status.get('total_records'),
                "processed": job_status.get('processed'),
                "successful": job_status.get('successful'),
                "failed": job_status.get('failed'),
                "errors": job_status.get('errors')[:10] if isinstance(job_status.get('errors'), list) else job_status.get('errors')
            }

            return sanitize_nan(response)
        finally:
            if temp_path and os.path.exists(temp_path):
                try:
                    os.remove(temp_path)
                except:
                    pass
    except HTTPException:
        raise
    except Exception as e:
        print(f"[API] Video upload error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Upload failed: {str(e)}")


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


# ===== CSV AUDIO CALL UPLOAD ENDPOINTS =====

@app.post("/api/GmbCalls/upload")
async def upload_audio_csv(file: UploadFile = File(...)):
    """
    Upload a CSV file with audio call recordings for processing.
    
    CSV must contain columns:
    - Store Name
    - Locality
    - City
    - State
    - Region
    - Recording URL
    - Duration
    - Date
    
    Processing is done asynchronously and can be tracked with job_id.
    """
    try:
        # Validate file type
        if not file.filename.endswith('.csv'):
            raise HTTPException(status_code=400, detail="File must be a CSV file")

        # Save temporarily
        temp_path = None
        try:
            # Read file content
            content = await file.read()
            
            # Save to temp file
            with tempfile.NamedTemporaryFile(mode='wb', suffix='.csv', delete=False) as temp_file:
                temp_file.write(content)
                temp_path = temp_file.name

            # Initialize processor
            api_key = os.getenv("GEMINI_API_KEY")
            if not api_key:
                raise HTTPException(status_code=500, detail="GEMINI_API_KEY not configured")

            processor = CallUploadProcessor(api_key=api_key)

            # Start processing (returns job_id immediately)
            job_id = processor.process_csv_file(csv_file_path=temp_path, rate_limit_delay=15.0)

            # Save processed calls to MongoDB and JSON backup
            processed_calls = processor.get_processed_calls()
            # Ensure processed calls are clean before persistence
            processed_calls = [sanitize_nan(call) for call in processed_calls]

            if processed_calls:
                # Save to MongoDB
                for call in processed_calls:
                    save_call_to_mongodb(call)
                
                # Also save to JSON backup
                save_calls_to_json(processed_calls)
                
                print(f"[API] Saved {len(processed_calls)} calls to storage")

            # Get job status
            job_status = processor.get_job_status(job_id)

            response = {
                "status": "processing_complete",
                "job_id": job_id,
                "filename": file.filename,
                "total_records": job_status.get('total_records'),
                "processed": job_status.get('processed'),
                "successful": job_status.get('successful'),
                "failed": job_status.get('failed'),
                "errors": job_status.get('errors')[:10]  # Return first 10 errors
            }

            # Sanitize any NaN values before returning to avoid JSON errors
            return sanitize_nan(response)

        finally:
            # Cleanup temp file
            if temp_path and os.path.exists(temp_path):
                try:
                    os.remove(temp_path)
                except:
                    pass

    except HTTPException:
        raise
    except Exception as e:
        print(f"[API] Upload error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Upload failed: {str(e)}")


@app.get("/api/GmbCalls/upload-status/{job_id}")
async def get_upload_status(job_id: str):
    """
    Get the processing status of an uploaded CSV file.
    
    Returns job status including total, processed, successful, and failed counts.
    """
    try:
        # This is a simplified version - in production you'd store job state in Redis/MongoDB
        return {
            "status": "success",
            "message": "Job status tracking requires job persistence. Calls are saved to MongoDB after upload.",
            "note": "Query /api/GmbCalls to see all available calls"
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


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


@app.post("/api/outbound-calls/upload")
async def upload_outbound_csv(file: UploadFile = File(...)):
    """
    Upload a CSV file with outbound call recordings for processing.
    
    Processing pipeline:
    1. Validate CSV structure
    2. Download audio from recording URLs
    3. Classify call as PRE-PURCHASE or POST-PURCHASE (using first 20 seconds)
    4. For PRE-PURCHASE: Full analysis with Gemini 2.0 Flash
    5. For POST-PURCHASE: Store in separate discarded_calls collection
    6. Save to MongoDB
    
    CSV Requirements:
    - Store_Name
    - Recording_URL
    - Duration
    - Customer_Name
    - Customer_Phone
    - Store_Visit_Date
    - Products_Shown
    - Estimated_Deal_Value
    - Call_Date
    - Locality
    - City
    - State
    - Region
    """
    try:
        if not file.filename.endswith('.csv'):
            raise HTTPException(status_code=400, detail="File must be a CSV file")

        temp_path = None
        try:
            content = await file.read()

            with tempfile.NamedTemporaryFile(mode='wb', suffix='.csv', delete=False) as temp_file:
                temp_file.write(content)
                temp_path = temp_file.name

            try:
                processor = OutboundCallUploadProcessor()
                job_id = processor.process_csv_file(csv_file_path=temp_path, rate_limit_delay=1.0)
            except ValueError as ve:
                raise HTTPException(status_code=400, detail=str(ve))

            # Save processed pre-purchase calls
            processed_calls = processor.get_processed_calls()
            print(f"[API] Saving {len(processed_calls)} successfully processed calls to MongoDB...")
            for call_data in processed_calls:
                result = save_outbound_call_to_mongodb(call_data)
                if not result:
                    print(f"[API] Failed to save {call_data.get('call_id')}")

            # Save discarded post-purchase calls
            discarded_calls = processor.get_discarded_calls()
            print(f"[API] Saving {len(discarded_calls)} discarded calls to MongoDB...")
            for call_data in discarded_calls:
                save_discarded_call(call_data)

            job_status = processor.get_job_status(job_id)
            
            # Print errors for debugging
            if job_status.get('errors'):
                print(f"[API] Processing errors ({len(job_status['errors'])}):")
                for err in job_status['errors'][:5]:  # Print first 5
                    print(f"  Row {err.get('row')}: {err.get('error')}")

            response = {
                "status": "processing_complete",
                "job_id": job_id,
                "filename": file.filename,
                "total_records": job_status.get('total_records'),
                "processed": job_status.get('processed'),
                "successful": job_status.get('successful'),
                "failed": job_status.get('failed'),
                "filtered_out": job_status.get('filtered_out'),
                "message": f"Processed {job_status.get('successful')} pre-purchase calls, filtered out {job_status.get('filtered_out')} post-purchase calls",
                "errors": job_status.get('errors')[:10] if isinstance(job_status.get('errors'), list) else job_status.get('errors')
            }

            return sanitize_nan(response)
        finally:
            if temp_path and os.path.exists(temp_path):
                try:
                    os.remove(temp_path)
                except:
                    pass
    except HTTPException:
        raise
    except Exception as e:
        print(f"[API] Outbound call upload error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Upload failed: {str(e)}")


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


@app.post("/api/abc-calls/upload")
async def upload_abc_csv(file: UploadFile = File(...)):
    """
    Upload a CSV file with ABC Cart Recovery call recordings for processing.
    """
    try:
        if not file.filename.endswith('.csv'):
            raise HTTPException(status_code=400, detail="File must be a CSV file")

        temp_path = None
        try:
            content = await file.read()

            with tempfile.NamedTemporaryFile(mode='wb', suffix='.csv', delete=False) as temp_file:
                temp_file.write(content)
                temp_path = temp_file.name

            try:
                processor = AbcCallProcessor()
                job_id = processor.process_csv_file(csv_file_path=temp_path, rate_limit_delay=1.0)
            except ValueError as ve:
                raise HTTPException(status_code=400, detail=str(ve))

            # Save processed pre-purchase calls
            processed_calls = processor.processed_calls
            for call_data in processed_calls:
                save_abc_call_to_mongodb(call_data)

            # Save discarded post-purchase calls
            discarded_calls = processor.discarded_calls
            for call_data in discarded_calls:
                save_abc_discarded_call(call_data)

            job_status = processor.get_job_status(job_id)

            response = {
                "status": "processing_complete",
                "job_id": job_id,
                "filename": file.filename,
                "total_records": job_status.get('total_records'),
                "processed": job_status.get('processed'),
                "successful": job_status.get('successful'),
                "failed": job_status.get('failed'),
                "filtered_out": job_status.get('filtered_out'),
                "message": f"Processed {job_status.get('successful')} cart recovery calls, filtered out {job_status.get('filtered_out')} post-purchase calls",
                "errors": job_status.get('errors')[:10] if isinstance(job_status.get('errors'), list) else job_status.get('errors')
            }

            return sanitize_nan(response)
        finally:
            if temp_path and os.path.exists(temp_path):
                try:
                    os.remove(temp_path)
                except:
                    pass
    except HTTPException:
        raise
    except Exception as e:
        print(f"[API] ABC call upload error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Upload failed: {str(e)}")

if __name__ == "__main__":
    print("Starting Duroflex Video Analysis API...")
    print("API will be available at http://localhost:8000")
    print("API docs at http://localhost:8000/docs")
    # Use import string form to allow reload without warnings
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=False)
"""
Drive Mirror Integration for Audio/Video Call Reports
Triggers async Google Drive sync when reports are saved to MongoDB
"""
import os
import threading
from typing import Dict, Optional
from drive_upload_service import upload_file_to_drive


def _get_audio_collection(collection_type: str):
    try:
        if collection_type == "abc":
            from abc_service import get_abc_collection
            return get_abc_collection()
        if collection_type == "outbound":
            from outbound_call_service import get_outbound_collection
            return get_outbound_collection()
        from GmbCall_service import get_call_collection
        return get_call_collection()
    except Exception as exc:
        print(f"[DRIVE] Collection lookup failed for {collection_type}: {exc}")
        return None


def mirror_to_drive_async(report_id: str, recording_url: str, is_audio: bool = True, collection_type: str = "gmb"):
    """
    Mirror a recording file from S3 to Google Drive
    Runs in background thread, updates Mongo with drive link and status
    """
    try:
        # Lazy imports to avoid circular dependency
        from video_analysis_service import get_video_collection

        collection = _get_audio_collection(collection_type) if is_audio else get_video_collection()
        if collection is None:
            print(f"[DRIVE] No collection available for {report_id}")
            return
        
        # Mark as syncing
        query = {"call_id": report_id} if is_audio else {"report_id": report_id}
        collection.update_one(query, {
            "$set": {
                "driveStatus": "syncing",
                "driveSyncStarted": os.popen('date /t & time /t').read().strip()
            }
        })
        
        # Determine folder
        ext = recording_url.split('.')[-1].split('?')[0].lower()
        is_video_file = ext in ['mp4', 'mov', 'avi', 'mkv']
        folder_id = os.getenv('DRIVE_VIDEO_FOLDER_ID') if is_video_file else os.getenv('DRIVE_AUDIO_FOLDER_ID')
        
        # Create filename
        file_name = f"{report_id}.{ext}"
        
        print(f"[DRIVE] Starting upload: {report_id} ({'audio' if is_audio else 'video'})")
        
        # Upload to Drive
        result = upload_file_to_drive(recording_url, file_name, folder_id)
        
        if result:
            # Success - update Mongo
            collection.update_one(query, {
                "$set": {
                    "driveFileId": result['fileId'],
                    "driveLink": result['webViewLink'] or result.get('webContentLink'),
                    "driveStatus": "success",
                    "driveSyncedAt": os.popen('date /t & time /t').read().strip(),
                    "driveError": None
                }
            })
            print(f"[DRIVE] Success: {report_id} -> {result['fileId']}")
        else:
            # Failed - mark in Mongo
            error_msg = "Upload failed (check logs)"
            if "expired" in str(result).lower() or "403" in str(result):
                error_msg = "S3 URL expired - upload fresh CSV with new URLs"
            
            collection.update_one(query, {
                "$set": {
                    "driveStatus": "failed",
                    "driveError": error_msg,
                    "driveSyncedAt": os.popen('date /t & time /t').read().strip()
                }
            })
            print(f"[DRIVE] Failed: {report_id}")
            
    except Exception as e:
        print(f"[DRIVE] Exception for {report_id}: {str(e)}")
        try:
            # Lazy imports to avoid circular dependency
            from video_analysis_service import get_video_collection

            collection = _get_audio_collection(collection_type) if is_audio else get_video_collection()
            query = {"call_id": report_id} if is_audio else {"report_id": report_id}
            
            error_msg = str(e)[:500]
            if "expired" in error_msg.lower() or "403" in error_msg:
                error_msg = "S3 URL expired - upload fresh CSV with new URLs"
            
            if collection:
                collection.update_one(query, {
                    "$set": {
                        "driveStatus": "failed",
                        "driveError": error_msg
                    }
                })
        except:
            pass


def trigger_drive_mirror(report_id: str, recording_url: str, is_audio: bool = True, collection_type: str = "gmb") -> bool:
    """
    Trigger async Drive mirror job for a recording.
    Starts a background thread.
    
    Args:
        report_id: Call ID or Report ID
        recording_url: S3 presigned URL of the recording
        is_audio: True for audio, False for video
    
    Returns:
        True if job was queued successfully, False otherwise
    """
    try:
        if not recording_url or not recording_url.strip():
            print(f"[DRIVE] Skipping {report_id}: no recording URL")
            return False
        
        # Start background thread
        thread = threading.Thread(
            target=mirror_to_drive_async,
            args=(report_id, recording_url, is_audio, collection_type),
            daemon=True
        )
        thread.start()
        
        print(f"[DRIVE] Mirror job queued for {report_id}")
        return True
        
    except Exception as e:
        print(f"[DRIVE] Failed to queue mirror job for {report_id}: {str(e)}")
        return False


def trigger_drive_mirror_for_call(call_record: Dict, collection_type: str = "gmb") -> None:
    """
    Helper to trigger Drive mirror for an audio call record.
    Extracts call_id and recording_url from the record.
    """
    call_id = call_record.get("call_id")
    recording_url = call_record.get("recording_url")
    
    if call_id and recording_url:
        trigger_drive_mirror(call_id, recording_url, is_audio=True, collection_type=collection_type)


def trigger_drive_mirror_for_video(video_record: Dict) -> None:
    """
    Helper to trigger Drive mirror for a video call record.
    Extracts report_id and recording_url from the record.
    """
    report_id = video_record.get("report_id")
    # Check both top-level and metadata for recording_url
    recording_url = video_record.get("recording_url")
    if not recording_url and "metadata" in video_record:
        recording_url = video_record["metadata"].get("recording_url")
    
    if report_id and recording_url:
        trigger_drive_mirror(report_id, recording_url, is_audio=False)

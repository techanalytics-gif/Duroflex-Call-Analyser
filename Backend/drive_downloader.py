import gdown
import os
from pathlib import Path
import re


def extract_file_id(drive_url: str) -> str:
    """
    Extract file ID from Google Drive URL
    
    Supports formats:
    - https://drive.google.com/file/d/FILE_ID/view?usp=sharing
    - https://drive.google.com/open?id=FILE_ID
    - https://drive.google.com/uc?id=FILE_ID
    """
    patterns = [
        r'/d/([a-zA-Z0-9_-]+)',  # /d/FILE_ID
        r'id=([a-zA-Z0-9_-]+)',   # id=FILE_ID
    ]
    
    for pattern in patterns:
        match = re.search(pattern, drive_url)
        if match:
            return match.group(1)
    
    raise ValueError(f"Could not extract file ID from URL: {drive_url}")


def download_from_drive(drive_url: str, video_id: str) -> str:
    """
    Download video from Google Drive
    
    Args:
        drive_url: Google Drive sharing URL
        video_id: Unique identifier for the video
    
    Returns:
        Path to downloaded video file
    """
    try:
        # Extract file ID from URL
        file_id = extract_file_id(drive_url)
        print(f"Extracted file ID: {file_id}")
        
        # Create temp directory if not exists
        temp_dir = Path("temp")
        temp_dir.mkdir(exist_ok=True)
        
        # Output path
        output_path = temp_dir / f"video_{video_id}.mp4"
        
        # Download using gdown
        # Format: https://drive.google.com/uc?id=FILE_ID
        download_url = f"https://drive.google.com/uc?id={file_id}"
        
        print(f"Downloading from: {download_url}")
        print(f"Saving to: {output_path}")
        
        gdown.download(download_url, str(output_path), quiet=False, fuzzy=True)
        
        if output_path.exists():
            file_size = output_path.stat().st_size / (1024 * 1024)  # Size in MB
            print(f"Download successful! File size: {file_size:.2f} MB")
            return str(output_path)
        else:
            raise Exception("Download completed but file not found")
        
    except Exception as e:
        print(f"Error downloading from Google Drive: {str(e)}")
        raise Exception(f"Failed to download video: {str(e)}")


if __name__ == "__main__":
    # Test the downloader
    test_url = "https://drive.google.com/file/d/18NPNh32N-hQLcnWcMbkK-ofwrv-i4vcq/view?usp=sharing"
    print("Testing Google Drive downloader...")
    try:
        path = download_from_drive(test_url, "test")
        print(f"✓ Download successful: {path}")
    except Exception as e:
        print(f"✗ Download failed: {e}")

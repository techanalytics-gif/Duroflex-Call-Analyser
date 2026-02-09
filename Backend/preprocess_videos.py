import asyncio
from pathlib import Path
from video_analysis_service import (
    load_video_csv,
    analyze_video_with_gemini,
    save_video_analysis,
    load_all_video_analyses,
)
import pandas as pd
import json
from datetime import datetime


async def preprocess_all_videos():
    """
    Preprocess and analyze all videos from CSV
    This runs automatically on backend startup
    """
    print("\n" + "=" * 80)
    print("🎬 VIDEO PREPROCESSING STARTED")
    print("=" * 80)
    
    try:
        # Load CSV
        df = load_video_csv()
        if df.empty:
            print("❌ No videos found in CSV")
            return
        
        print(f"📊 Total videos to process: {len(df)}")
        
        # Load already analyzed videos
        existing_analyses = load_all_video_analyses()
        already_analyzed = len(existing_analyses)
        
        print(f"✓ Already analyzed: {already_analyzed}")
        print(f"⏳ Pending analysis: {len(df) - already_analyzed}")

        # If we already have analyses (from Mongo or seeded JSON), skip Gemini processing
        if already_analyzed > 0:
            print("✅ Analyses already available; skipping Gemini processing")
            return {
                "status": "complete",
                "newly_analyzed": 0,
                "already_analyzed": already_analyzed,
                "errors": 0,
                "total": already_analyzed
            }
        
        # Process each video
        analyzed_count = 0
        error_count = 0
        skipped_count = 0
        
        for idx, row in df.iterrows():
            report_id = f"video_{idx}"
            store_name = row.get('Store Name', f'Store {idx}')
            recording_url = row.get('Recording URL', '')
            
            # Skip if already analyzed
            if report_id in existing_analyses:
                print(f"⏭️  [{idx + 1}/{len(df)}] {store_name} - SKIPPED (already analyzed)")
                skipped_count += 1
                continue
            
            # Check if URL is valid
            if not recording_url or recording_url.strip() == '':
                print(f"❌ [{idx + 1}/{len(df)}] {store_name} - SKIPPED (no URL)")
                error_count += 1
                continue
            
            try:
                print(f"🔄 [{idx + 1}/{len(df)}] Analyzing {store_name}...", end=" ")
                
                # Build metadata from row data
                metadata = {
                    "store_name": store_name,
                    "recording_url": recording_url,
                    "date": row.get('Date'),
                    "clean_datetime": row.get('CleanDateTime'),
                }
                
                # Analyze video
                analysis_result = analyze_video_with_gemini(
                    video_url=recording_url,
                    store_name=store_name,
                    metadata=metadata
                )
                
                # Save result
                save_video_analysis(report_id, analysis_result)
                
                print("✅ DONE")
                analyzed_count += 1
                
            except Exception as e:
                print(f"❌ ERROR: {str(e)[:50]}")
                error_count += 1
                
                # Save error state
                error_analysis = {
                    "Functional": {
                        "Call_ID": report_id,
                        "Store_Location": store_name,
                        "error": str(e)
                    },
                    "error": True,
                    "timestamp": datetime.now().isoformat()
                }
                save_video_analysis(report_id, error_analysis)
        
        # Print summary
        print("\n" + "=" * 80)
        print("✅ PREPROCESSING COMPLETE")
        print("=" * 80)
        print(f"📊 Summary:")
        print(f"   ✓ Newly analyzed:    {analyzed_count}")
        print(f"   ⏭️  Already analyzed: {skipped_count}")
        print(f"   ❌ Errors:           {error_count}")
        print(f"   📦 Total available:  {analyzed_count + skipped_count}")
        print("=" * 80 + "\n")
        
        return {
            "status": "complete",
            "newly_analyzed": analyzed_count,
            "already_analyzed": skipped_count,
            "errors": error_count,
            "total": analyzed_count + skipped_count
        }
        
    except Exception as e:
        print(f"\n❌ PREPROCESSING ERROR: {e}")
        return {"status": "error", "message": str(e)}


def preprocess_all_videos_sync():
    """Synchronous wrapper for preprocessing"""
    try:
        loop = asyncio.get_event_loop()
    except RuntimeError:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
    
    return loop.run_until_complete(preprocess_all_videos())


if __name__ == "__main__":
    import sys
    sys.path.insert(0, str(Path(__file__).parent))
    
    result = preprocess_all_videos_sync()
    print(f"\nResult: {result}")

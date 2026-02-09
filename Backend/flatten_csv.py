"""
CSV JSON Flattening Script
Flattens the nested call_analysis_json column into separate columns
"""

import pandas as pd
import json
from pathlib import Path

# File paths
INPUT_CSV = Path(__file__).parent / "csv data.csv"
OUTPUT_CSV = Path(__file__).parent / "flattened_call_data.csv"


def flatten_json(nested_json, parent_key='', sep='_'):
    """
    Recursively flatten a nested JSON object
    
    Args:
        nested_json: The nested JSON object to flatten
        parent_key: The parent key for nested items
        sep: Separator between parent and child keys
    
    Returns:
        Flattened dictionary
    """
    items = []
    
    if isinstance(nested_json, dict):
        for key, value in nested_json.items():
            new_key = f"{parent_key}{sep}{key}" if parent_key else key
            
            # Skip Transcript_Log as it's too large and not suitable for columns
            if key == 'Transcript_Log':
                # Store transcript count instead
                items.append((f"{new_key}_count", len(value) if isinstance(value, list) else 0))
                continue
            
            if isinstance(value, dict):
                # Recursively flatten nested dictionaries
                items.extend(flatten_json(value, new_key, sep=sep).items())
            elif isinstance(value, list):
                # Handle lists by converting to string or extracting elements
                if len(value) > 0:
                    # For lists of strings (like reasons, questions)
                    if all(isinstance(item, str) for item in value):
                        for idx, item in enumerate(value, 1):
                            items.append((f"{new_key}_{idx}", item))
                        items.append((f"{new_key}_count", len(value)))
                    else:
                        # For complex lists, convert to string
                        items.append((new_key, str(value)))
                else:
                    items.append((new_key, None))
            else:
                items.append((new_key, value))
    else:
        items.append((parent_key, nested_json))
    
    return dict(items)


def process_csv():
    """
    Process the CSV file and flatten the call_analysis_json column
    """
    print(f"Reading CSV from: {INPUT_CSV}")
    
    # Read the CSV file
    df = pd.read_csv(INPUT_CSV)
    print(f"Loaded {len(df)} rows")
    
    # Create a list to store flattened records
    flattened_records = []
    
    for idx, row in df.iterrows():
        print(f"Processing row {idx + 1}/{len(df)}: {row['Store Name']}")
        
        # Start with the base CSV columns
        flattened_row = {
            'Store_Name': row['Store Name'],
            'Locality': row['Locality'],
            'City': row['City'],
            'State': row['State'],
            'Region': row['Region'],
            'Recording_URL': row['Recording URL'],
            'Duration_Seconds': row['Duration'],
            'Date': row['Date'],
            'Week_Number': row['WeekNum'],
            'Month': row['Month'],
            'Clean_Number': row['CleanNumber'],
            'Is_Converted': row['is_converted']
        }
        
        # Parse and flatten the call_analysis_json
        try:
            analysis_json = json.loads(row['call_analysis_json'])
            
            # Check if it's an error response
            if isinstance(analysis_json, dict) and 'error' in analysis_json:
                flattened_row['Analysis_Error'] = analysis_json.get('error', '')
                flattened_row['Processed_At'] = analysis_json.get('processed_at', '')
            else:
                # Flatten the nested JSON structure
                flattened_analysis = flatten_json(analysis_json)
                flattened_row.update(flattened_analysis)
        
        except json.JSONDecodeError as e:
            print(f"  ⚠️  JSON decode error in row {idx + 1}: {e}")
            flattened_row['Analysis_Error'] = f"JSON Parse Error: {str(e)}"
        except Exception as e:
            print(f"  ⚠️  Error processing row {idx + 1}: {e}")
            flattened_row['Analysis_Error'] = f"Processing Error: {str(e)}"
        
        flattened_records.append(flattened_row)
    
    # Create DataFrame from flattened records
    flattened_df = pd.DataFrame(flattened_records)
    
    # Save to new CSV
    flattened_df.to_csv(OUTPUT_CSV, index=False, encoding='utf-8')
    print(f"\n✓ Successfully saved flattened data to: {OUTPUT_CSV}")
    print(f"✓ Total columns: {len(flattened_df.columns)}")
    print(f"✓ Total rows: {len(flattened_df)}")
    
    # Display column names
    print("\n📋 Column names:")
    for i, col in enumerate(flattened_df.columns, 1):
        print(f"  {i}. {col}")
    
    return flattened_df


def get_column_summary(df):
    """
    Get a summary of all columns and their data types
    """
    print("\n📊 Column Summary:")
    print("-" * 80)
    for col in df.columns:
        non_null = df[col].notna().sum()
        null = df[col].isna().sum()
        dtype = df[col].dtype
        print(f"{col:50s} | Type: {str(dtype):10s} | Non-null: {non_null:3d} | Null: {null:3d}")


if __name__ == "__main__":
    print("=" * 80)
    print("CSV JSON FLATTENING SCRIPT")
    print("=" * 80)
    print()
    
    # Process the CSV
    flattened_df = process_csv()
    
    # Show column summary
    get_column_summary(flattened_df)
    
    print("\n" + "=" * 80)
    print("✓ PROCESSING COMPLETE")
    print("=" * 80)

import pandas as pd
from datetime import datetime, timedelta
from pathlib import Path

base_dir = Path(__file__).parent
input_path = base_dir / "abc30.csv"
df = pd.read_csv(input_path)

total_rows = len(df)
days = 30
if total_rows == 0:
    raise SystemExit("Input CSV is empty")

base, rem = divmod(total_rows, days)
day_indexes = []
for d in range(days):
    cnt = base + (1 if d < rem else 0)
    day_indexes.extend([d] * cnt)
day_indexes = day_indexes[:total_rows]

start_date = datetime(2026, 1, 1)
dates = [start_date + timedelta(days=di) for di in day_indexes]

df["Date"] = dates

output_path = base_dir / "abc30_with_dates.csv"
df.to_csv(output_path, index=False)

output_path


import pandas as pd
from pathlib import Path

source = Path(
    "ml/data/All-India_-Crop-wise-Area,-Production-&-Yield.csv"
)

df = pd.read_csv(source, encoding="utf-8-sig")

years = [
    "2021-22",
    "2022-23",
    "2023-24",
    "2024-25",
    "2025-26"
]

records = []

for _, row in df.iterrows():
    for year in years:
        records.append({
            "Crop": row["Crop"],
            "Season": row["Season"],
            "Year": int(year[:4]),
            "Area": row[f"Area-{year}"],
            "Production": row[f"Production-{year}"],
            "Yield": row[f"Yield-{year}"]
        })

result = pd.DataFrame(records)

# Missing or invalid yield records exclude karo.
result["Yield"] = pd.to_numeric(
    result["Yield"], errors="coerce"
)
result = result.dropna(subset=["Yield"])
result = result[result["Yield"] > 0]

output = Path("ml/data/processed_apy.csv")
result.to_csv(output, index=False)

print("Dataset prepared successfully!")
print("Total valid records:", len(result))
print("Years:", sorted(result["Year"].unique()))
print("Crops:", result["Crop"].nunique())
print("Saved:", output)

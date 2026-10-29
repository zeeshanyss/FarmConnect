
from pathlib import Path
import pandas as pd
import numpy as np
import joblib

from sklearn.ensemble import RandomForestRegressor
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
from sklearn.pipeline import Pipeline
from sklearn.compose import ColumnTransformer
from sklearn.preprocessing import OneHotEncoder

DATA = Path("ml/data/processed_apy.csv")
OUT = Path("ml/artifacts")
OUT.mkdir(parents=True, exist_ok=True)

df = pd.read_csv(DATA)

df["Yield"] = pd.to_numeric(df["Yield"], errors="coerce")
df["Year"] = pd.to_numeric(df["Year"], errors="coerce")

df = df.dropna(subset=["Crop", "Season", "Year", "Yield"])
df = df[df["Yield"] > 0]

# Previous-year yield as input
df = df.sort_values(["Crop", "Season", "Year"])

df["PreviousYield"] = (
    df.groupby(["Crop", "Season"])["Yield"].shift(1)
)

df = df.dropna(subset=["PreviousYield"])

features = ["Crop", "Season", "Year", "PreviousYield"]

# 2024-25 test; 2025-26 provisional records excluded
train = df[df["Year"] <= 2023].copy()
test = df[df["Year"] == 2024].copy()

if len(train) < 20 or len(test) < 5:
    raise ValueError(
        "Insufficient historical records for training/testing."
    )

preprocess = ColumnTransformer([
    ("categories", OneHotEncoder(handle_unknown="ignore"),
     ["Crop", "Season"]),
    ("numbers", "passthrough", ["Year", "PreviousYield"])
])

model = Pipeline([
    ("preprocess", preprocess),
    ("regressor", RandomForestRegressor(
        n_estimators=200,
        min_samples_leaf=2,
        random_state=42,
        n_jobs=-1
    ))
])

model.fit(train[features], train["Yield"])

predictions = model.predict(test[features])

mae = mean_absolute_error(test["Yield"], predictions)
rmse = np.sqrt(
    mean_squared_error(test["Yield"], predictions)
)
r2 = r2_score(test["Yield"], predictions)

print("\nTRAINING COMPLETE")
print("Training rows:", len(train))
print("Testing rows:", len(test))
print("MAE:", round(mae, 2), "kg/hectare")
print("RMSE:", round(rmse, 2), "kg/hectare")
print("R2 Score:", round(r2, 4))

joblib.dump(model, OUT / "yield_model.joblib")

results = test[["Crop", "Season", "Year", "Yield"]].copy()
results["PredictedYield"] = predictions
results.to_csv(OUT / "evaluation.csv", index=False)

print("\nModel saved:", OUT / "yield_model.joblib")
print("Evaluation saved:", OUT / "evaluation.csv")
.
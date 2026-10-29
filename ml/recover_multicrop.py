
from pathlib import Path
import json
import tensorflow as tf

ROOT = Path(__file__).resolve().parent
DATA = ROOT / "data" / "PlantVillage-Dataset" / "raw" / "color"
OUT = ROOT / "artifacts"
MODEL = OUT / "multicrop_cnn.keras"

EXT = {".jpg", ".jpeg", ".png"}

if not DATA.is_dir():
    raise FileNotFoundError(f"Dataset missing: {DATA}")

if not MODEL.is_file():
    raise FileNotFoundError(f"Trained model missing: {MODEL}")

# Exactly the same folder ordering as the original training script
folders = sorted(
    p for p in DATA.iterdir()
    if p.is_dir()
    and any(f.suffix.lower() in EXT for f in p.iterdir())
)

classes = [p.name for p in folders]

# Load existing model. No retraining.
model = tf.keras.models.load_model(MODEL, compile=False)

output_classes = int(model.output_shape[-1])

if len(classes) != output_classes:
    raise RuntimeError(
        f"Mismatch: dataset has {len(classes)} classes, "
        f"but model predicts {output_classes}. "
        "Do not save labels until this is resolved."
    )

OUT.mkdir(parents=True, exist_ok=True)

destination = OUT / "multicrop_classes.json"

destination.write_text(
    json.dumps(classes, indent=2, ensure_ascii=False),
    encoding="utf-8"
)

print("\nCLASS RECOVERY COMPLETE")
print("Model output classes:", output_classes)
print("Recovered labels:", len(classes))
print("Saved:", destination)

for index, name in enumerate(classes):
    print(f"{index}: {name}")

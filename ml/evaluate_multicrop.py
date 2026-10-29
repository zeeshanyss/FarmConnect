import json
import random
from pathlib import Path

import numpy as np
import tensorflow as tf
from sklearn.model_selection import train_test_split
from sklearn.metrics import classification_report, confusion_matrix

ROOT = Path(__file__).resolve().parent
DATA = ROOT / "data" / "PlantVillage-Dataset" / "raw" / "color"
OUT = ROOT / "artifacts"
SEED = 42
EXT = {".jpg", ".jpeg", ".png"}

random.seed(SEED)
np.random.seed(SEED)
tf.keras.utils.set_random_seed(SEED)

folders = sorted(
    p for p in DATA.iterdir()
    if p.is_dir() and any(f.suffix.lower() in EXT for f in p.iterdir())
)
classes = [p.name for p in folders]

saved_classes = json.loads(
    (OUT / "multicrop_classes.json").read_text(encoding="utf-8")
)
if classes != saved_classes:
    raise RuntimeError("Class order differs from saved model. Evaluation stopped.")

paths, labels = [], []
for i, folder in enumerate(folders):
    files = sorted(
        str(p) for p in folder.iterdir()
        if p.suffix.lower() in EXT
    )
    paths.extend(files)
    labels.extend([i] * len(files))

train_x, temp_x, train_y, temp_y = train_test_split(
    paths, labels, test_size=.30,
    stratify=labels, random_state=SEED
)
val_x, test_x, val_y, test_y = train_test_split(
    temp_x, temp_y, test_size=.50,
    stratify=temp_y, random_state=SEED
)

def decode(path, label):
    raw = tf.io.read_file(path)
    img = tf.io.decode_image(raw, channels=3, expand_animations=False)
    img.set_shape([None, None, 3])
    img = tf.image.resize(img, (224, 224))
    return tf.cast(img, tf.float32), label

test_ds = tf.data.Dataset.from_tensor_slices(
    (test_x, np.asarray(test_y, dtype=np.int32))
)
test_ds = test_ds.map(
    decode, num_parallel_calls=tf.data.AUTOTUNE
).batch(16).prefetch(tf.data.AUTOTUNE)

print("Loading saved CNN model...", flush=True)
model = tf.keras.models.load_model(OUT / "multicrop_cnn.keras")

if model.output_shape[-1] != len(classes):
    raise RuntimeError("Model output count does not match class count.")

print("Evaluating original reconstructed test split...", flush=True)
loss, accuracy = model.evaluate(test_ds, verbose=1)

probabilities = model.predict(test_ds, verbose=1)
predictions = np.argmax(probabilities, axis=1)

report = classification_report(
    test_y, predictions,
    labels=list(range(len(classes))),
    target_names=classes,
    output_dict=True,
    zero_division=0
)

results = {
    "test_accuracy": float(accuracy),
    "test_loss": float(loss),
    "train_count": len(train_x),
    "validation_count": len(val_x),
    "test_count": len(test_x),
    "class_count": len(classes),
    "classification_report": report,
    "confusion_matrix": confusion_matrix(
        test_y, predictions,
        labels=list(range(len(classes)))
    ).tolist(),
    "limitations": (
        "Reconstructed original random image split using seed 42. "
        "Related images or leaf leakage may inflate test performance. "
        "Independent real-field validation is still required."
    )
}

output = OUT / "multicrop_evaluation.json"
output.write_text(json.dumps(results, indent=2), encoding="utf-8")

print("\nEVALUATION COMPLETE")
print("Test images:", len(test_x))
print("Test accuracy:", round(accuracy * 100, 2), "%")
print("Macro F1:", round(report["macro avg"]["f1-score"], 4))
print("Report saved:", output)

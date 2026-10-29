
from pathlib import Path
import argparse
import json
import sys

import numpy as np
import tensorflow as tf
from PIL import Image, UnidentifiedImageError

ROOT = Path(__file__).resolve().parent
ARTIFACTS = ROOT / "artifacts"

MODEL_PATH = ARTIFACTS / "multicrop_cnn.keras"
CLASSES_PATH = ARTIFACTS / "multicrop_classes.json"

MAX_IMAGE_BYTES = 10 * 1024 * 1024


def predict(image_path):
    if not MODEL_PATH.is_file():
        raise FileNotFoundError("Trained CNN model not found")

    if not CLASSES_PATH.is_file():
        raise FileNotFoundError("CNN class mapping not found")

    with CLASSES_PATH.open("r", encoding="utf-8") as file:
        classes = json.load(file)

    if not isinstance(classes, list) or not all(
        isinstance(name, str) for name in classes
    ):
        raise ValueError("Invalid CNN class mapping")

    path = Path(image_path).resolve()

    if not path.is_file():
        raise FileNotFoundError("Input image not found")

    if path.stat().st_size > MAX_IMAGE_BYTES:
        raise ValueError("Image exceeds 10 MB limit")

    # Load saved best-validation checkpoint without retraining
    model = tf.keras.models.load_model(
        MODEL_PATH,
        compile=False
    )

    if int(model.output_shape[-1]) != len(classes):
        raise ValueError(
            "Model output count does not match class labels"
        )

    # Match original training preprocessing:
    # RGB, 224 x 224, float32 pixels in 0–255 range.
    # MobileNetV2 preprocessing is already INSIDE the saved model.
    try:
        with Image.open(path) as source:
            image = source.convert("RGB")
            image = image.resize(
                (224, 224),
                Image.Resampling.BILINEAR
            )
            array = np.asarray(image, dtype=np.float32)
    except (UnidentifiedImageError, OSError) as error:
        raise ValueError("Invalid or unsupported image") from error

    batch = np.expand_dims(array, axis=0)

    scores = model.predict(batch, verbose=0)[0]

    best_indices = np.argsort(scores)[::-1][:3]
    best_index = int(best_indices[0])

    def format_result(index):
        label = classes[int(index)]
        parts = label.split("___", 1)

        return {
            "crop": parts[0].replace("_", " "),
            "condition": (
                parts[1].replace("_", " ")
                if len(parts) == 2 else label
            ),
            "label": label,
            "confidence": round(float(scores[int(index)]) * 100, 2)
        }

    return {
        "success": True,
        "prediction": format_result(best_index),
        "top3": [
            format_result(index)
            for index in best_indices
        ],
        "disclaimer": (
            "Experimental image classification only. "
            "Confidence is not a guarantee of correctness. "
            "Consult a qualified agricultural expert before treatment."
        )
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--image", required=True)
    args = parser.parse_args()

    try:
        result = predict(args.image)
        print(json.dumps(result, ensure_ascii=False))
    except Exception as error:
        print(
            json.dumps({
                "success": False,
                "error": str(error)
            }),
            file=sys.stderr
        )
        sys.exit(1)

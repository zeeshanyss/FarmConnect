from pathlib import Path
import json, random
import numpy as np
import tensorflow as tf
from sklearn.model_selection import train_test_split
from sklearn.metrics import classification_report, confusion_matrix

ROOT = Path(__file__).resolve().parent
DATA = ROOT / 'data' / 'PlantVillage-Dataset' / 'raw' / 'color'
OUT = ROOT / 'artifacts'
OUT.mkdir(parents=True, exist_ok=True)
SEED = 42
random.seed(SEED); np.random.seed(SEED); tf.keras.utils.set_random_seed(SEED)
IMG = (224, 224)
BATCH = 16
EXT = {'.jpg', '.jpeg', '.png'}
if not DATA.is_dir():
    raise FileNotFoundError(f'Dataset not found: {DATA}')
folders = sorted(p for p in DATA.iterdir() if p.is_dir() and any(f.suffix.lower() in EXT for f in p.iterdir()))
if len(folders) < 2:
    raise RuntimeError('Expected multiple crop/disease folders under raw/color')
classes = [p.name for p in folders]
paths, labels = [], []
for i, folder in enumerate(folders):
    files = sorted(str(p) for p in folder.iterdir() if p.suffix.lower() in EXT)
    if len(files) < 20:
        raise RuntimeError(f'Class has fewer than 20 images: {folder.name} ({len(files)})')
    print(f'{folder.name}: {len(files)}')
    paths.extend(files); labels.extend([i] * len(files))
train_x, temp_x, train_y, temp_y = train_test_split(paths, labels, test_size=.30, stratify=labels, random_state=SEED)
val_x, test_x, val_y, test_y = train_test_split(temp_x, temp_y, test_size=.50, stratify=temp_y, random_state=SEED)

def decode(path, label):
    raw = tf.io.read_file(path)
    img = tf.io.decode_image(raw, channels=3, expand_animations=False)
    img.set_shape([None, None, 3])
    img = tf.image.resize(img, IMG)
    return tf.cast(img, tf.float32), label

def dataset(x, y, training=False):
    ds = tf.data.Dataset.from_tensor_slices((x, np.asarray(y, dtype=np.int32)))
    if training: ds = ds.shuffle(len(x), seed=SEED, reshuffle_each_iteration=True)
    ds = ds.map(decode, num_parallel_calls=tf.data.AUTOTUNE)
    return ds.batch(BATCH).prefetch(tf.data.AUTOTUNE)
train_ds = dataset(train_x, train_y, True)
val_ds = dataset(val_x, val_y)
test_ds = dataset(test_x, test_y)

base = tf.keras.applications.MobileNetV2(input_shape=(224,224,3), include_top=False, weights='imagenet')
base.trainable = False
inputs = tf.keras.Input(shape=(224,224,3))
x = tf.keras.layers.RandomFlip('horizontal')(inputs)
x = tf.keras.layers.RandomRotation(.07)(x)
x = tf.keras.layers.RandomZoom(.08)(x)
x = tf.keras.applications.mobilenet_v2.preprocess_input(x)
x = base(x, training=False)
x = tf.keras.layers.GlobalAveragePooling2D()(x)
x = tf.keras.layers.Dropout(.3)(x)
outputs = tf.keras.layers.Dense(len(classes), activation='softmax')(x)
model = tf.keras.Model(inputs, outputs)
model.compile(optimizer=tf.keras.optimizers.Adam(1e-3), loss='sparse_categorical_crossentropy', metrics=['accuracy'])
checkpoint = OUT / 'multicrop_cnn.keras'
callbacks = [tf.keras.callbacks.EarlyStopping(monitor='val_loss', patience=3, restore_best_weights=True), tf.keras.callbacks.ModelCheckpoint(str(checkpoint), monitor='val_loss', save_best_only=True)]
print(f'Classes: {len(classes)} | Train: {len(train_x)} | Validation: {len(val_x)} | Test: {len(test_x)}')
model.fit(train_ds, validation_data=val_ds, epochs=12, callbacks=callbacks)
# Evaluate the saved best-validation model, never the last arbitrary epoch.
best = tf.keras.models.load_model(checkpoint)
loss, acc = best.evaluate(test_ds)
preds = np.argmax(best.predict(test_ds), axis=1)
report = classification_report(test_y, preds, labels=list(range(len(classes))), target_names=classes, output_dict=True, zero_division=0)
(OUT / 'multicrop_classes.json').write_text(json.dumps(classes, indent=2), encoding='utf-8')
(OUT / 'multicrop_evaluation.json').write_text(json.dumps({'test_accuracy': float(acc), 'test_loss': float(loss), 'train_count': len(train_x), 'validation_count': len(val_x), 'test_count': len(test_x), 'classification_report': report, 'confusion_matrix': confusion_matrix(test_y, preds, labels=list(range(len(classes)))).tolist(), 'limitations': 'Random image split; may overestimate field performance due to related images/leaf leakage. Validate with leaf-grouped and real-field test sets.'}, indent=2), encoding='utf-8')
print('\nTRAINING COMPLETE')
print('Classes:', len(classes), 'Train:', len(train_x), 'Validation:', len(val_x), 'Test:', len(test_x))
print('Test accuracy:', round(acc*100, 2), '%')
print('Model:', checkpoint)
print('Class names:', OUT / 'multicrop_classes.json')
print('Evaluation:', OUT / 'multicrop_evaluation.json')

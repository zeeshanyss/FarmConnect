
const { db } = require("../config/firebase");

const priceHistory = db.collection("priceHistory");

const VALID_SOURCES = [
  "agmarknet",
  "enam",
  "farmconnect_internal",
  "manual",
];

function clean(data) {
  return Object.fromEntries(
    Object.entries(data).filter(([, value]) => value !== undefined)
  );
}

class PriceHistory {
  constructor(data = {}, id = null) {
    Object.assign(this, data);
    this._id = id || data._id || null;
  }

  static async create(data) {
    if (!data.crop || !data.mandi || !data.date) {
      throw new Error("Crop, mandi, and date are required");
    }

    if (
      typeof data.modalPrice !== "number" ||
      !Number.isFinite(data.modalPrice)
    ) {
      throw new Error("A valid modal price is required");
    }

    const source = data.source || "manual";

    if (!VALID_SOURCES.includes(source)) {
      throw new Error("Invalid price history source");
    }

    const now = new Date();

    const record = clean({
      ...data,
      crop: String(data.crop).trim(),
      source,
      date: new Date(data.date),
      createdAt: now,
      updatedAt: now,
    });

    if (Number.isNaN(record.date.getTime())) {
      throw new Error("Invalid price history date");
    }

    const doc = await priceHistory.add(record);

    return new PriceHistory(record, doc.id);
  }

  static async findById(id) {
    if (!id) return null;

    const doc = await priceHistory.doc(String(id)).get();

    return doc.exists
      ? new PriceHistory(doc.data(), doc.id)
      : null;
  }

  static async find(query = {}) {
    let ref = priceHistory;

    for (const [field, value] of Object.entries(query)) {
      ref = ref.where(field, "==", value);
    }

    const snapshot = await ref.get();

    return snapshot.docs.map(
      (doc) => new PriceHistory(doc.data(), doc.id)
    );
  }

  static async findByIdAndUpdate(id, updates) {
    if (!id) return null;

    const ref = priceHistory.doc(String(id));
    const doc = await ref.get();

    if (!doc.exists) return null;

    const changes = clean({
      ...updates,
      updatedAt: new Date(),
    });

    if (
      changes.source !== undefined &&
      !VALID_SOURCES.includes(changes.source)
    ) {
      throw new Error("Invalid price history source");
    }

    await ref.update(changes);

    const updated = await ref.get();

    return new PriceHistory(updated.data(), updated.id);
  }

  async save() {
    if (!this._id) {
      throw new Error("Cannot save price history without an ID");
    }

    const data = { ...this };
    delete data._id;

    data.updatedAt = new Date();

    await priceHistory.doc(String(this._id)).set(clean(data), {
      merge: true,
    });

    this.updatedAt = data.updatedAt;

    return this;
  }
}

module.exports = PriceHistory;

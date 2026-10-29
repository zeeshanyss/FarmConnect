
const { db } = require("../config/firebase");

const listings = db.collection("listings");

function clean(data) {
  return Object.fromEntries(
    Object.entries(data).filter(([, value]) => value !== undefined)
  );
}

const VALID_GRADES = ["Grade A", "Grade B", "Ungraded"];
const VALID_STATUSES = [
  "open",
  "in_negotiation",
  "sold",
  "withdrawn",
];
const VALID_HEALTH_BANDS = [
  "healthy",
  "early_stress",
  "significant_stress",
];

class Listing {
  constructor(data = {}, id = null) {
    Object.assign(this, data);
    this._id = id || data._id || null;
  }

  static async create(data) {
    if (!data.farmer || !data.crop) {
      throw new Error("Farmer and crop are required");
    }

    if (
      typeof data.quantityQuintals !== "number" ||
      !Number.isFinite(data.quantityQuintals) ||
      data.quantityQuintals < 0.1
    ) {
      throw new Error("Quantity must be at least 0.1 quintals");
    }

    if (
      typeof data.askingPricePerQuintal !== "number" ||
      !Number.isFinite(data.askingPricePerQuintal) ||
      data.askingPricePerQuintal < 1
    ) {
      throw new Error("Asking price must be at least 1");
    }

    const grade = data.grade || "Ungraded";
    const status = data.status || "open";

    if (!VALID_GRADES.includes(grade)) {
      throw new Error("Invalid listing grade");
    }

    if (!VALID_STATUSES.includes(status)) {
      throw new Error("Invalid listing status");
    }

    if (
      data.healthScan?.band &&
      !VALID_HEALTH_BANDS.includes(data.healthScan.band)
    ) {
      throw new Error("Invalid crop health band");
    }

    const now = new Date();

    const record = clean({
      ...data,
      crop: String(data.crop).trim(),
      grade,
      status,
      createdAt: now,
      updatedAt: now,
    });

    const doc = await listings.add(record);

    return new Listing(record, doc.id);
  }

  static async findById(id) {
    if (!id) return null;

    const doc = await listings.doc(String(id)).get();

    return doc.exists ? new Listing(doc.data(), doc.id) : null;
  }

  static async findByIdAndUpdate(id, updates) {
    if (!id) return null;

    const ref = listings.doc(String(id));
    const doc = await ref.get();

    if (!doc.exists) return null;

    const changes = clean({
      ...updates,
      updatedAt: new Date(),
    });

    if (
      changes.grade !== undefined &&
      !VALID_GRADES.includes(changes.grade)
    ) {
      throw new Error("Invalid listing grade");
    }

    if (
      changes.status !== undefined &&
      !VALID_STATUSES.includes(changes.status)
    ) {
      throw new Error("Invalid listing status");
    }

    await ref.update(changes);

    const updated = await ref.get();

    return new Listing(updated.data(), updated.id);
  }

  static async find(query = {}) {
    let ref = listings;

    for (const [field, value] of Object.entries(query)) {
      ref = ref.where(field, "==", value);
    }

    const snapshot = await ref.get();

    return snapshot.docs.map(
      (doc) => new Listing(doc.data(), doc.id)
    );
  }

  async save() {
    if (!this._id) {
      throw new Error("Cannot save a listing without an ID");
    }

    const data = { ...this };
    delete data._id;

    data.updatedAt = new Date();

    await listings.doc(String(this._id)).set(clean(data), {
      merge: true,
    });

    this.updatedAt = data.updatedAt;

    return this;
  }
}

module.exports = Listing;

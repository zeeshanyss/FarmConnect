
const { db } = require("../config/firebase");

const schemes = db.collection("schemes");

function clean(data) {
  return Object.fromEntries(
    Object.entries(data).filter(([, value]) => value !== undefined)
  );
}

class Scheme {
  constructor(data = {}, id = null) {
    Object.assign(this, data);
    this._id = id || data._id || null;
  }

  static async create(data) {
    if (!data.name || !data.description) {
      throw new Error("Scheme name and description are required");
    }

    const now = new Date();

    const record = clean({
      ...data,

      authority: data.authority || "Government of India",
      active: data.active ?? true,

      benefits: data.benefits || [],
      eligibility: data.eligibility || [],
      documents: data.documents || [],
      tutorial: data.tutorial || [],

      officialUrl: data.officialUrl || "",
      sourceUrl: data.sourceUrl || "",

      verificationStatus: data.verificationStatus || "pending",
      lastVerifiedAt: data.lastVerifiedAt || null,
      announcementDate: data.announcementDate || null,

      createdAt: now,
      updatedAt: now,
    });

    const doc = await schemes.add(record);

    return new Scheme(record, doc.id);
  }

  static async findById(id) {
    if (!id) return null;

    const doc = await schemes.doc(String(id)).get();

    return doc.exists ? new Scheme(doc.data(), doc.id) : null;
  }

  static async find(query = {}) {
    let ref = schemes;

    for (const [field, value] of Object.entries(query)) {
      ref = ref.where(field, "==", value);
    }

    const snapshot = await ref.get();

    return snapshot.docs.map(
      (doc) => new Scheme(doc.data(), doc.id)
    );
  }

  static async findByIdAndUpdate(id, updates) {
    if (!id) return null;

    const ref = schemes.doc(String(id));
    const doc = await ref.get();

    if (!doc.exists) return null;

    const changes = clean({
      ...updates,
      updatedAt: new Date(),
    });

    await ref.update(changes);

    const updated = await ref.get();

    return new Scheme(updated.data(), updated.id);
  }

  async save() {
    if (!this._id) {
      throw new Error("Cannot save a scheme without an ID");
    }

    const data = { ...this };
    delete data._id;

    data.updatedAt = new Date();

    await schemes.doc(String(this._id)).set(clean(data), {
      merge: true,
    });

    this.updatedAt = data.updatedAt;

    return this;
  }
}

module.exports = Scheme;

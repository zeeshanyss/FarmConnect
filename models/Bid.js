
const { db } = require("../config/firebase");

const bids = db.collection("bids");

function clean(data) {
  return Object.fromEntries(
    Object.entries(data).filter(([, value]) => value !== undefined)
  );
}

class Bid {
  constructor(data = {}, id = null) {
    Object.assign(this, data);
    this._id = id || data._id || null;
  }

  static async create(data) {
    if (!data.listing || !data.buyer) {
      throw new Error("Listing and buyer are required");
    }

    if (
      typeof data.amountPerQuintal !== "number" ||
      !Number.isFinite(data.amountPerQuintal) ||
      data.amountPerQuintal < 1
    ) {
      throw new Error("Bid amount must be at least 1");
    }

    const now = new Date();

    const record = clean({
      ...data,
      status: data.status || "pending",
      createdAt: now,
      updatedAt: now,
    });

    if (
      !["pending", "accepted", "rejected", "withdrawn"].includes(
        record.status
      )
    ) {
      throw new Error("Invalid bid status");
    }

    const doc = await bids.add(record);
    return new Bid(record, doc.id);
  }

  static async findById(id) {
    if (!id) return null;

    const doc = await bids.doc(String(id)).get();

    return doc.exists ? new Bid(doc.data(), doc.id) : null;
  }

  static async findByIdAndUpdate(id, updates) {
    if (!id) return null;

    const ref = bids.doc(String(id));
    const doc = await ref.get();

    if (!doc.exists) return null;

    await ref.update(
      clean({
        ...updates,
        updatedAt: new Date(),
      })
    );

    const updated = await ref.get();
    return new Bid(updated.data(), updated.id);
  }

  static async find(query = {}) {
    let ref = bids;

    for (const [field, value] of Object.entries(query)) {
      ref = ref.where(field, "==", value);
    }

    const snapshot = await ref.get();

    return snapshot.docs.map(
      (doc) => new Bid(doc.data(), doc.id)
    );
  }

  async save() {
    if (!this._id) {
      throw new Error("Cannot save a bid without an ID");
    }

    const data = { ...this };
    delete data._id;

    data.updatedAt = new Date();

    await bids.doc(String(this._id)).set(clean(data), {
      merge: true,
    });

    this.updatedAt = data.updatedAt;
    return this;
  }
}

module.exports = Bid;

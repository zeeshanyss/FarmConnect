
const { db } = require("../config/firebase");

const reviews = db.collection("reviews");

function clean(data) {
  return Object.fromEntries(
    Object.entries(data).filter(([, value]) => value !== undefined)
  );
}

class Review {
  constructor(data = {}, id = null) {
    Object.assign(this, data);
    this._id = id || data._id || null;
  }

  static async create(data) {
    if (!data.target || !data.author) {
      throw new Error("Target and author are required");
    }

    if (
      typeof data.rating !== "number" ||
      !Number.isFinite(data.rating) ||
      data.rating < 1 ||
      data.rating > 5
    ) {
      throw new Error("Rating must be between 1 and 5");
    }

    if (data.comment && data.comment.length > 500) {
      throw new Error("Comment cannot exceed 500 characters");
    }

    const now = new Date();

    const record = clean({
      ...data,
      createdAt: now,
      updatedAt: now,
    });

    // Firestore does not automatically enforce Mongoose's unique index.
    // If a listing is supplied, check for an existing author/listing review.
    if (record.listing) {
      const existing = await reviews
        .where("author", "==", record.author)
        .where("listing", "==", record.listing)
        .limit(1)
        .get();

      if (!existing.empty) {
        throw new Error("You have already reviewed this listing");
      }
    }

    const doc = await reviews.add(record);

    return new Review(record, doc.id);
  }

  static async findById(id) {
    if (!id) return null;

    const doc = await reviews.doc(String(id)).get();

    return doc.exists ? new Review(doc.data(), doc.id) : null;
  }

  static async find(query = {}) {
    let ref = reviews;

    for (const [field, value] of Object.entries(query)) {
      ref = ref.where(field, "==", value);
    }

    const snapshot = await ref.get();

    return snapshot.docs.map(
      (doc) => new Review(doc.data(), doc.id)
    );
  }

  static async findByIdAndUpdate(id, updates) {
    if (!id) return null;

    const ref = reviews.doc(String(id));
    const doc = await ref.get();

    if (!doc.exists) return null;

    const changes = clean({
      ...updates,
      updatedAt: new Date(),
    });

    if (changes.rating !== undefined) {
      if (
        typeof changes.rating !== "number" ||
        !Number.isFinite(changes.rating) ||
        changes.rating < 1 ||
        changes.rating > 5
      ) {
        throw new Error("Rating must be between 1 and 5");
      }
    }

    await ref.update(changes);

    const updated = await ref.get();

    return new Review(updated.data(), updated.id);
  }

  async save() {
    if (!this._id) {
      throw new Error("Cannot save a review without an ID");
    }

    const data = { ...this };
    delete data._id;

    data.updatedAt = new Date();

    await reviews.doc(String(this._id)).set(clean(data), {
      merge: true,
    });

    this.updatedAt = data.updatedAt;

    return this;
  }
}

module.exports = Review;

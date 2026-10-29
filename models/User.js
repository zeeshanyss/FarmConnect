
const { db } = require("../config/firebase");
const bcrypt = require("bcryptjs");

const users = db.collection("users");

function clean(data) {
  return Object.fromEntries(
    Object.entries(data).filter(([, value]) => value !== undefined)
  );
}

class User {
  constructor(data = {}, id = null) {
    Object.assign(this, data);
    this._id = id || data._id || null;
  }

  static async findOne(query) {
    const entries = Object.entries(query);

    if (entries.length === 0) return null;

    let ref = users;
    for (const [field, value] of entries) {
      ref = ref.where(field, "==", value);
    }

    const snapshot = await ref.limit(1).get();

    if (snapshot.empty) return null;

    const doc = snapshot.docs[0];
    return new User(doc.data(), doc.id);
  }

  static async findById(id) {
    if (!id) return null;

    const doc = await users.doc(String(id)).get();

    return doc.exists ? new User(doc.data(), doc.id) : null;
  }

  static async create(data) {
    const now = new Date();

    const record = clean({
      ...data,
      failedLoginAttempts: data.failedLoginAttempts ?? 0,
      isActive: data.isActive ?? true,
      isVerified: data.isVerified ?? false,
      trust: data.trust ?? {
        score: 0,
        reviewCount: 0,
      },
      createdAt: now,
      updatedAt: now,
    });

    const doc = await users.add(record);
    return new User(record, doc.id);
  }

  static async findByIdAndUpdate(id, updates) {
    const ref = users.doc(String(id));
    const doc = await ref.get();

    if (!doc.exists) return null;

    await ref.update(clean(updates));

    const updated = await ref.get();
    return new User(updated.data(), updated.id);
  }

  static async hashPassword(plain) {
    return bcrypt.hash(plain, 12);
  }

  async comparePassword(plain) {
    return bcrypt.compare(plain, this.passwordHash);
  }

  isLocked() {
    if (!this.lockUntil) return false;

    const lockTime = this.lockUntil.toDate
      ? this.lockUntil.toDate()
      : new Date(this.lockUntil);

    return lockTime > new Date();
  }

  async save() {
    const now = new Date();
    const data = { ...this };
    delete data._id;

    data.updatedAt = now;

    if (this._id) {
      await users.doc(String(this._id)).set(clean(data), {
        merge: true,
      });
    } else {
      const doc = await users.add(clean(data));
      this._id = doc.id;
    }

    this.updatedAt = now;
    return this;
  }
}

module.exports = User;

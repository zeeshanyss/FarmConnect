/**
 * A minimal, append-only trail of security-relevant events, so an
 * admin can answer "who did what, from where, when" without digging
 * through server logs. Written by auth routes (login success/failure,
 * lockouts) and by admin actions (verify/suspend a user).
 */

const { db } = require("../config/firebase");

const auditLogs = db.collection("auditLogs");

const ALLOWED_EVENTS = [
  "login_success",
  "login_failed",
  "account_locked",
  "logout",
  "register",
  "token_refresh",
  "admin_verify_user",
  "admin_suspend_user",
  "admin_unsuspend_user",
];

function removeUndefined(data) {
  return Object.fromEntries(
    Object.entries(data).filter(([, value]) => value !== undefined)
  );
}

class AuditLog {
  static async create(data) {
    if (!ALLOWED_EVENTS.includes(data.event)) {
      throw new Error("Invalid audit log event");
    }

    const record = removeUndefined({
      ...data,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const doc = await auditLogs.add(record);

    return { id: doc.id, ...record };
  }
}

module.exports = AuditLog;

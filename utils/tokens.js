const jwt = require("jsonwebtoken");
const crypto = require("crypto");

const ACCESS_TOKEN_TTL = "15m";
const REFRESH_TOKEN_TTL_DAYS = 30;

function signAccessToken(user) {
  return jwt.sign({ id: user._id, role: user.role, name: user.name }, process.env.JWT_SECRET, {
    expiresIn: ACCESS_TOKEN_TTL,
  });
}

/**
 * Refresh tokens are opaque random strings (not JWTs) so they carry
 * no decodable claims if leaked. Only a hash is stored server-side
 * (models/User.js#refreshTokenHash) — the same pattern as password
 * storage — and the token rotates on every use, so a stolen-and-reused
 * old token is detectable (the hash won't match after rotation).
 */
function generateRefreshToken() {
  const token = crypto.randomBytes(48).toString("hex");
  const hash = crypto.createHash("sha256").update(token).digest("hex");
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_DAYS * 86400000);
  return { token, hash, expiresAt };
}

function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

const REFRESH_COOKIE_NAME = "fc_refresh";
const REFRESH_COOKIE_OPTS = {
  httpOnly: true,
  // Browsers refuse `secure` cookies over plain http, which local dev
  // usually is. Set NODE_ENV=production behind real TLS in deployment
  // so the cookie is marked secure there.
  secure: process.env.NODE_ENV === "production",
  sameSite: "strict",
  path: "/api/auth",
  maxAge: REFRESH_TOKEN_TTL_DAYS * 86400000,
};

module.exports = {
  signAccessToken,
  generateRefreshToken,
  hashToken,
  REFRESH_COOKIE_NAME,
  REFRESH_COOKIE_OPTS,
};

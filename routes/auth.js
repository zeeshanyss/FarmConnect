const router = require("express").Router();
const rateLimit = require("express-rate-limit");
const { body } = require("express-validator");
const User = require("../models/User");
const AuditLog = require("../models/AuditLog");
const { validate } = require("../middleware/validate");
const { requireAuth } = require("../middleware/auth");
const {
  signAccessToken,
  generateRefreshToken,
  hashToken,
  REFRESH_COOKIE_NAME,
  REFRESH_COOKIE_OPTS,
} = require("../utils/tokens");

const MAX_FAILED_ATTEMPTS = 5;
const LOCK_MINUTES = 15;

// Auth endpoints get their own, stricter rate limit than the global
// one in server.js — brute-forcing a password is the specific risk here.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  message: { error: "Too many attempts. Try again later." },
});

function log(event, req, extra = {}) {
  AuditLog.create({
    event,
    ip: req.ip,
    userAgent: req.headers["user-agent"],
    ...extra,
  }).catch(() => {});
}

function publicUser(user) {
  const {
    _id, name, role, village, district, state,
    trust, isVerified, gender, landHolding,
    landArea, landUnit, farmerId
  } = user;

  return {
    id: _id, name, role, village, district, state,
    trust, isVerified,
    gender: gender || "",
    landHolding: landHolding || "",
    landArea: landArea ?? null,
    landUnit: landUnit || "",
    farmerId: farmerId || ""
  };
}

async function issueTokens(user, req, res) {
  const accessToken = signAccessToken(user);
  const { token: refreshToken, hash, expiresAt } = generateRefreshToken();
  user.refreshTokenHash = hash;
  user.lastLoginAt = new Date();
  user.lastLoginIp = req.ip;
  await user.save();
  res.cookie(REFRESH_COOKIE_NAME, refreshToken, { ...REFRESH_COOKIE_OPTS, expires: expiresAt });
  return accessToken;
}

router.post(
  "/register",
  authLimiter,
  [
    body("name").trim().isLength({ min: 2, max: 80 }).withMessage("Name must be 2-80 characters"),
    body("phone").trim().isMobilePhone("any").withMessage("Enter a valid phone number"),
    body("password")
      .isLength({ min: 8 })
      .withMessage("Password must be at least 8 characters")
      .matches(/\d/)
      .withMessage("Password must include a number"),
    body("role").isIn(["farmer", "buyer"]).withMessage("Role must be farmer or buyer"),
  ],
  validate,
  async (req, res) => {
    try {
      const { name, phone, password, role, village, district, state, farmerProfile } = req.body;
      const existing = await User.findOne({ phone });
      if (existing) return res.status(409).json({ error: "Phone number already registered" });

      const passwordHash = await User.hashPassword(password);
      const user = await User.create({ name, phone, passwordHash, role, village, district, state, farmerProfile });

      const accessToken = await issueTokens(user, req, res);
      log("register", req, { actor: user._id });
      res.status(201).json({ accessToken, user: publicUser(user) });
    } catch (e) {
      res.status(500).json({ error: "Registration failed" });
    }
  }
);

router.post(
  "/login",
  authLimiter,
  [body("phone").trim().notEmpty(), body("password").notEmpty()],
  validate,
  async (req, res) => {
    try {
      const { phone, password } = req.body;
      const user = await User.findOne({ phone });

      // Constant-shape response whether the phone exists or not, so an
      // attacker can't use response differences to enumerate accounts.
      if (!user) {
        log("login_failed", req, { meta: { phone, reason: "no_such_user" } });
        return res.status(401).json({ error: "Invalid phone or password" });
      }

      if (user.isLocked()) {
        log("login_failed", req, { actor: user._id, meta: { reason: "locked" } });
        return res.status(423).json({ error: `Account temporarily locked. Try again after ${user.lockUntil.toISOString()}` });
      }

      if (!user.isActive) {
        log("login_failed", req, { actor: user._id, meta: { reason: "suspended" } });
        return res.status(403).json({ error: "This account has been suspended. Contact an administrator." });
      }

      const ok = await user.comparePassword(password);
      if (!ok) {
        user.failedLoginAttempts += 1;
        if (user.failedLoginAttempts >= MAX_FAILED_ATTEMPTS) {
          user.lockUntil = new Date(Date.now() + LOCK_MINUTES * 60000);
          log("account_locked", req, { actor: user._id });
        }
        await user.save();
        log("login_failed", req, { actor: user._id, meta: { reason: "bad_password" } });
        return res.status(401).json({ error: "Invalid phone or password" });
      }

      user.failedLoginAttempts = 0;
      user.lockUntil = null;
      const accessToken = await issueTokens(user, req, res);
      log("login_success", req, { actor: user._id });
      res.json({ accessToken, user: publicUser(user) });
    } catch (e) {
      res.status(500).json({ error: "Login failed" });
    }
  }
);

// Exchange the httpOnly refresh cookie for a new short-lived access token.
router.post("/refresh", async (req, res) => {
  try {
    const token = req.cookies?.[REFRESH_COOKIE_NAME];
    if (!token) return res.status(401).json({ error: "No refresh token" });

    const hash = hashToken(token);
    const user = await User.findOne({ refreshTokenHash: hash });
    if (!user) return res.status(401).json({ error: "Refresh token invalid or already used" });

    const accessToken = await issueTokens(user, req, res); // rotates the refresh token too
    log("token_refresh", req, { actor: user._id });
    res.json({ accessToken, user: publicUser(user) });
  } catch (e) {
    res.status(500).json({ error: "Could not refresh session" });
  }
});

router.post("/logout", requireAuth, async (req, res) => {
  await User.findByIdAndUpdate(req.user.id, { refreshTokenHash: null });
  res.clearCookie(REFRESH_COOKIE_NAME, { path: "/api/auth" });
  log("logout", req, { actor: req.user.id });
  res.json({ ok: true });
});

router.get("/me", requireAuth, async (req, res) => {
  const user = await User.findById(req.user.id);
  if (!user) return res.status(404).json({ error: "Not found" });
  res.json({ user: publicUser(user) });
});

// Phase 11: authenticated, allowlisted profile edits. Verification status is never client-editable.
router.patch("/profile", requireAuth, [
  body("name").isString().trim().isLength({ min: 2, max: 80 }),
  body("village").isString().trim().isLength({ max: 80 }),
  body("district").isString().trim().isLength({ max: 80 }),
  body("state").isString().trim().isLength({ max: 80 }),
  body("gender").optional().isIn(["male", "female", "other", "prefer_not_to_say", ""]),
  body("landHolding").optional().isIn(["marginal", "small", "semi_medium", "medium", "large", ""]),
  body("landArea").optional({ nullable: true }).isFloat({ min: 0, max: 100000 }),
  body("landUnit").optional().isIn(["acre", "hectare", ""]),
  body("farmerId").optional().isString().trim().isLength({ max: 50 })
    .matches(/^[a-zA-Z0-9\/_-]*$/),
], validate, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user || !user.isActive) return res.status(403).json({ error: "Account unavailable" });
    const fields = ["name", "village", "district", "state", "gender", "landHolding", "landArea", "landUnit", "farmerId"];
    const updates = Object.fromEntries(fields.filter(k => req.body[k] !== undefined).map(k => [k, typeof req.body[k] === "string" ? req.body[k].trim() : req.body[k]]));
    const updated = await User.findByIdAndUpdate(req.user.id, updates);
    log("profile_updated", req, { actor: req.user.id });
    res.json({ user: publicUser(updated) });
  } catch (err) { res.status(500).json({ error: "Unable to update profile" }); }
});

router.get("/verification-status", requireAuth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ error: "Account not found" });
    res.json({ accountFlag: Boolean(user.isVerified), identityProviderConnected: false,
      identityStatus: "not_connected", landOrBusinessStatus: "not_connected",
      message: "An existing account flag does not establish government identity, landholding or business verification." });
  } catch (err) { res.status(500).json({ error: "Unable to load verification status" }); }
});

module.exports = router;

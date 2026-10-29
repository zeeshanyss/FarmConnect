# FarmConnect

A single-stack (JavaScript end to end) client-server app: one Node.js/
Express server serves both the REST API and the plain HTML/CSS/JS
frontend from the same origin, backed by MongoDB, with real-time
updates over Socket.io. Built for a farmer marketplace with a
fair-price model, a crop health scanner, a government scheme matcher,
and a trust ledger — now with real signup/login, an admin dashboard
over everything stored, and hardened session security.

## Stack (one language throughout)
- **Node.js + Express** — REST API and static file server, same process, same origin
- **Vanilla JavaScript** — the entire frontend (`client/`), no build step, no second framework
- **MongoDB / Mongoose** — persistence; see `models/` for the schema of each feature model
- **Socket.io** — real-time push for new listings, bids and activity
- **JWT (short-lived) + rotating refresh tokens (httpOnly cookie)** — session security
- **bcrypt, helmet, rate limiting, input validation, NoSQL-injection sanitizing** — hardening (see Security below)

## Setup

```bash
cp .env.example .env      # fill in MONGO_URI, a real long JWT_SECRET, and a seed admin password
npm install
npm run seed                # loads sample schemes, 30 days of mock mandi prices, and one admin login
npm run dev                  # nodemon, http://localhost:4000
```

Requires a MongoDB instance (local `mongod`, Docker, or a free MongoDB Atlas cluster — see the setup steps discussed in chat).

Open **http://localhost:4000** — the client, API, and Socket.io connection are all served from that one URL. Sign up as a Farmer or Buyer, or log in with the seeded admin login printed by `npm run seed` (change that password immediately after your first login — see Security below).

## What the admin dashboard shows
Log in with the seeded admin account (or any user you promote to `role: "admin"` directly in the database) to see:
- Live counts: total users, farmers, buyers, listings, open listings, bids, reviews
- Every user, with verify/suspend actions
- Every listing and every bid, across all farmers and buyers
- A full **security audit log**: every login success/failure, every account lockout, every admin action, with IP and timestamp

## Security measures in this build
- Passwords hashed with bcrypt (cost factor 12), never stored or logged in plaintext
- **Access tokens** are short-lived JWTs (15 min); **refresh tokens** are opaque random strings, stored server-side only as a SHA-256 hash, delivered as an `httpOnly`, `sameSite=strict` cookie (never readable by JavaScript, so XSS can't steal a session), and **rotated on every use**
- **Account lockout**: 5 failed logins locks the account for 15 minutes; every attempt is written to the audit log
- Login/register routes are rate-limited separately (20 requests / 15 min / IP) from the general API limit
- Input validated server-side with `express-validator` (phone format, password length + complexity, role whitelist) — never trust client-side checks alone
- NoSQL-injection payloads stripped with `express-mongo-sanitize`; HTTP parameter-pollution blocked with `hpp`
- `helmet` sets a locked-down Content-Security-Policy (only same-origin scripts/styles plus the two font/CDN hosts actually used)
- Every route that touches another user's data or admin data requires a valid access token **and** the matching role (`requireAuth` + `requireRole`)
- Constant-shape error responses on login (a non-existent phone and a wrong password return the identical message) to resist account enumeration

## API surface

| Method | Route | Purpose |
|---|---|---|
| POST | `/api/auth/register` | Create a farmer or buyer account |
| POST | `/api/auth/login` | Log in; sets the refresh cookie, returns a short-lived access token |
| POST | `/api/auth/refresh` | Exchange the refresh cookie for a new access token (rotates it) |
| POST | `/api/auth/logout` | Invalidate the current refresh token |
| GET | `/api/auth/me` | Current user's profile |
| GET | `/api/listings` | Browse open listings |
| POST | `/api/listings` | Post a listing (farmer only) — snapshots the fair-price model |
| POST | `/api/listings/:id/bids` | Place a bid (buyer only) — emits `bid:new` over socket.io |
| PATCH | `/api/listings/:id/bids/:bidId/accept` | Accept a bid, close the listing |
| GET | `/api/prices/:crop` | Fair-price model output + 30-day series for a crop |
| POST | `/api/scan` | Upload a crop photo (`multipart/form-data`, field `photo`) for the Leaf Vigour Index |
| POST | `/api/schemes/match` | Run a farmer profile against the scheme-eligibility engine |
| POST | `/api/reviews` | Leave a rating after a deal; recomputes the target's trust score |
| GET | `/api/reviews/:userId` | A user's reviews + current trust score |
| GET | `/api/admin/stats` | Platform-wide counts (admin only) |
| GET | `/api/admin/users` \| `/listings` \| `/bids` \| `/reviews` | Everything stored, for the admin dashboard |
| PATCH | `/api/admin/users/:id/verify` \| `/suspend` | Admin user management |
| GET | `/api/admin/audit-log` | Security audit trail |

## API surface

| Method | Route | Purpose |
|---|---|---|
| POST | `/api/auth/register` | Create a farmer or buyer account |
| POST | `/api/auth/login` | Get a JWT |
| GET | `/api/listings` | Browse open listings |
| POST | `/api/listings` | Post a listing (farmer only) — snapshots the fair-price model |
| POST | `/api/listings/:id/bids` | Place a bid (buyer only) — emits `bid:new` over socket.io |
| PATCH | `/api/listings/:id/bids/:bidId/accept` | Accept a bid, close the listing |
| GET | `/api/prices/:crop` | Fair-price model output + 30-day series for a crop |
| POST | `/api/scan` | Upload a crop photo (`multipart/form-data`, field `photo`) for the Leaf Vigour Index |
| POST | `/api/schemes/match` | Run a farmer profile against the scheme-eligibility engine |
| POST | `/api/reviews` | Leave a rating after a deal; recomputes the target's trust score |
| GET | `/api/reviews/:userId` | A user's reviews + current trust score |

## Real-time events (Socket.io)

- `listing:new`, `listing:updated`
- `bid:new` (scoped to room `listing:<id>`), `bid:accepted`
- `activity:pulse` — a short text event for a live "what's happening now" feed

Clients join a listing's bid room with `socket.emit('listing:watch', listingId)`.

## The four feature models

- **`utils/fairPriceModel.js`** — 7-day average anchored, trend-adjusted, volatility-banded price suggestion, confidence score included.
- **`utils/cropHealthModel.js`** — colour-balance heuristic (Leaf Vigour Index) over a downsampled image; swap the function body for a trained image classifier later without touching routes or schema.
- **`utils/schemeEngine.js`** — declarative rule matching against `Scheme` documents, plus a transparent sustainability ("Green") score from declared farming practices.
- **`utils/trustModel.js`** — recency-weighted, Bayesian-shrunk trust score from `Review` documents.

## Next steps for a real deployment
- Swap `PriceHistory` seeding for a scheduled ingest job against Agmarknet/eNAM's public price APIs.
- Replace the Leaf Vigour heuristic with a trained model behind the same `analyzeCropHealth()` interface.
- Add phone OTP login (most target users won't have a password-based flow as their first choice).
- Put uploaded photos in object storage (S3/GCS) rather than passing raw buffers through memory.

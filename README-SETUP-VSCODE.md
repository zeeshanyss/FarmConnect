# FarmConnect — VS Code setup (Windows)

## Features in this project
- Farmer/buyer sign-up and sign-in; bcrypt password hashes, JWT access token + rotating httpOnly refresh cookie.
- MongoDB persistence, REST API, Socket.IO events for marketplace activity and bidding.
- Farmer crop listings, buyer bidding, farmer bid acceptance, reviews/trust score, scheme matching, admin dashboard and audit log.
- Crop-price fair-price model and historical series endpoints (`GET /api/prices/Wheat`).
- Crop-photo scan endpoint (`POST /api/scan`, multipart field `photo`). If configured, it calls a hosted image-classification model; otherwise it explicitly reports a colour-balance heuristic, **not a CNN**.
- Responsive plain HTML/CSS/JavaScript frontend with animated 3D tilt cards.

## Important honesty about data
The included seed script generates **DEMO / SYNTHETIC** mandi price history. Do not present it as real current market prices. A true live-price feed requires an active official data provider/API key and mapping to its current schema. `.env.example` documents where provider credentials can be kept. No paid API key is bundled.

The CNN integration is optional and requires a suitable hosted plant-disease/image-classification model. Set `HF_API_TOKEN` and `HF_PLANT_MODEL` in `.env`. Without these values the scanner uses a simple colour-balance fallback and labels the mode accordingly. Model selection and crop/disease label compatibility must be validated before real agricultural use.

## Prerequisites
1. Install Node.js 18+ (recommended 20 LTS) and VS Code.
2. Use MongoDB Atlas (cloud) or install/start MongoDB Community locally.
3. Extract this ZIP, then open the `farmconnect-backend` folder in VS Code.
4. Copy `.env.example` to `.env`. Set `MONGO_URI` to your MongoDB connection string and `JWT_SECRET` to a long random secret. Keep `.env` private and never commit it.
5. Optional: change `SEED_ADMIN_PASSWORD`, `SEED_ADMIN_PHONE`. For CNN support, set `HF_API_TOKEN` and `HF_PLANT_MODEL` to a compatible model.
6. Run `npm install`, then `npm run seed`, then `npm run dev`.
7. Open `http://localhost:4000`.

Windows shortcut: double-click `START-WINDOWS.bat`; it installs dependencies and starts the server, but you must still configure `.env` correctly.

## Admin login
After `npm run seed`, the phone/password come from `.env` (`SEED_ADMIN_PHONE` / `SEED_ADMIN_PASSWORD`). Change the default password before sharing or deploying this project.

## Key API routes
- `POST /api/auth/register`, `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me`
- `GET /api/listings`, `POST /api/listings`, `POST /api/listings/:id/bids`, `PATCH /api/listings/:id/bids/:bidId/accept`
- `GET /api/prices/:crop`
- `POST /api/scan` (multipart form field: `photo`)
- `POST /api/schemes/match`, `POST /api/reviews`
- `GET /health`

## Troubleshooting
- `ECONNREFUSED` / database errors: confirm MongoDB is running and `MONGO_URI` is correct.
- Port busy: set another `PORT` in `.env`.
- Hosted model unavailable: check model access/token and model task compatibility; fallback scanner remains available.
- Do not use demo price seed data for financial decisions. Verify live rates from an official mandi source.


require("dotenv").config();

const path = require("path");
const express = require("express");
const http = require("http");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const cookieParser = require("cookie-parser");
const hpp = require("hpp");
const rateLimit = require("express-rate-limit");
const { Server } = require("socket.io");

// Initialize Firebase Admin / Firestore.
require("./config/firebase");

const initSockets = require("./sockets");

const authRoutes = require("./routes/auth");
const priceIntelRoutes = require("./routes/priceIntel");
const scanRoutes = require("./routes/scan");
const schemesRoutes = require("./routes/schemes");
const adminRoutes = require("./routes/admin");
const cropDiseaseRouter = require("./routes/cropDisease");



async function start() {
  const app = express();
  const server = http.createServer(app);

  const io = new Server(server, {
    cors: {
      origin: process.env.CLIENT_ORIGIN || "*",
    },
  });

  // Required when deployed behind a trusted reverse proxy.
  app.set("trust proxy", 1);

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: [
            "'self'",
            "https://cdn.jsdelivr.net",
            "https://cdnjs.cloudflare.com",
          ],
          styleSrc: [
            "'self'",
            "'unsafe-inline'",
            "https://fonts.googleapis.com",
          ],
          fontSrc: ["'self'", "https://fonts.gstatic.com"],
          imgSrc: ["'self'", "data:", "blob:"],
          connectSrc: ["'self'"],
        },
      },
    })
  );

  app.use(
    cors({
      origin: process.env.CLIENT_ORIGIN || "http://localhost:4000",
      credentials: true,
    })
  );

  app.use(express.json({ limit: "2mb" }));
  app.use(cookieParser());
  app.use(hpp());
  app.use(morgan("dev"));

  app.use(
    rateLimit({
      windowMs: 60 * 1000,
      limit: 120,
      standardHeaders: true,
    })
  );

  app.get("/health", (req, res) => {
    res.json({
      ok: true,
      service: "farmconnect-api",
    });
  });

  // Routes that emit socket events receive the shared Socket.IO instance.
  const listingsRoutes = require("./routes/listings")(io);
  const reviewsRoutes = require("./routes/reviews")(io);

  app.use("/api/auth", authRoutes);
  app.use("/api/listings", listingsRoutes);
  app.use("/api/prices", priceIntelRoutes);
  app.use("/api/mandi", require("./routes/mandiLive"));
  app.use("/api/integrations", require("./routes/integrations"));
  app.use("/api/scan", scanRoutes);
  app.use("/api/yield", require("./routes/yieldLocal"));
  app.use("/api/schemes", schemesRoutes);
  app.use("/api/reviews", reviewsRoutes);
  app.use("/api/admin", adminRoutes);
  app.use("/api/crop-disease", cropDiseaseRouter);

  // Serve the frontend from the client directory.
  app.use(express.static(path.join(__dirname, "client")));

  app.get(/^(?!\/api).*/, (req, res) => {
    res.sendFile(path.join(__dirname, "client", "index.html"));
  });

  initSockets(io);

  app.use((err, req, res, next) => {
    console.error(err);

    if (res.headersSent) {
      return next(err);
    }

    res.status(500).json({
      error: "Unexpected server error",
    });
  });

  const port = process.env.PORT || 4000;

  server.listen(port, () => {
    console.log(`[farmconnect-api] listening on :${port}`);
  });
}

start().catch((error) => {
  console.error("Failed to start server", error);
  process.exit(1);
});

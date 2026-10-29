const router = require("express").Router();
const multer = require("multer");
const { analyzeCropHealth } = require("../utils/cropHealthModel");

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 }, // 8MB
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith("image/")) return cb(new Error("Only image uploads are accepted"));
    cb(null, true);
  },
});

router.post("/", upload.single("photo"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No photo uploaded" });
  try {
    const result = await analyzeCropHealth(req.file.buffer);
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: "Could not analyze image" });
  }
});

module.exports = router;


const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const os = require("os");
const { spawn } = require("child_process");
const crypto = require("crypto");

const router = express.Router();

const ROOT = path.resolve(__dirname, "..");
const PYTHON = path.join(ROOT, ".venv", "Scripts", "python.exe");
const SCRIPT = path.join(ROOT, "ml", "predict_multicrop.py");

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, os.tmpdir()),
    filename: (req, file, cb) =>
      cb(null, `farmconnect-${crypto.randomUUID()}.upload`)
  }),
  limits: { fileSize: 10 * 1024 * 1024, files: 1 },
  fileFilter: (req, file, cb) => {
    const allowed = ["image/jpeg", "image/png", "image/webp"];
    if (!allowed.includes(file.mimetype)) {
      return cb(new Error("Only JPG, PNG or WebP images are allowed"));
    }
    cb(null, true);
  }
});

router.post("/predict", (req, res) => {
  upload.single("image")(req, res, (uploadError) => {
    if (uploadError) {
      return res.status(400).json({
        success: false,
        error: uploadError.message
      });
    }

    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: "Please upload a leaf image"
      });
    }

    const imagePath = req.file.path;
    let stdout = "";
    let stderr = "";
    let completed = false;

    const cleanup = () => {
      fs.unlink(imagePath, () => {});
    };

    const child = spawn(
      PYTHON,
      [SCRIPT, "--image", imagePath],
      {
        cwd: ROOT,
        windowsHide: true,
        env: {
          ...process.env,
          TF_CPP_MIN_LOG_LEVEL: "2"
        }
      }
    );

    const timeout = setTimeout(() => {
      child.kill();
    }, 120000);

    child.stdout.on("data", chunk => {
      stdout += chunk.toString();
      if (stdout.length > 100000) child.kill();
    });

    child.stderr.on("data", chunk => {
      stderr += chunk.toString();
      if (stderr.length > 100000) child.kill();
    });

    const finish = (status, result) => {
      if (completed) return;
      completed = true;
      clearTimeout(timeout);
      cleanup();
      res.status(status).json(result);
    };

    child.on("error", error => {
      console.error("CNN process error:", error.message);
      finish(500, {
        success: false,
        error: "Unable to start disease prediction service"
      });
    });

    child.on("close", code => {
      if (completed) return;

      if (code !== 0) {
        console.error("CNN inference failed:", stderr);
        return finish(500, {
          success: false,
          error: "Disease prediction failed. Check server terminal."
        });
      }

      try {
        const result = JSON.parse(stdout.trim());
        finish(200, result);
      } catch (error) {
        console.error("Invalid CNN response:", stdout, stderr);
        finish(500, {
          success: false,
          error: "Invalid prediction response"
        });
      }
    });
  });
});

module.exports = router;

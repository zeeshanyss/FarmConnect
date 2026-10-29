const sharp = require("sharp");

/**
 * Crop Health Model — Leaf Vigour Index
 * --------------------------------------
 * A colour-balance heuristic, not a trained classifier: it downsamples
 * the uploaded photo and buckets pixels into "green" (healthy tissue),
 * "brown/yellow" (stress or senescence) and "dark" (shadow/soil/blight),
 * then combines the ratios into a single 0-100 score.
 *
 * This is intentionally a fast, dependency-light first pass. The
 * `TODO` below is the natural next iteration: swap this function's
 * body for a call to a trained image model (e.g. a fine-tuned
 * MobileNet/EfficientNet on PlantVillage-style leaf-disease data)
 * behind the same interface, so the rest of the app — routes,
 * listing schema, frontend — doesn't need to change.
 */
async function analyzeCropHealth(imageBuffer) {
  // Optional CNN/image-classification provider. Configure HF_API_TOKEN and
  // HF_PLANT_MODEL in .env to call a hosted model; never expose the token in the browser.
  if (process.env.HF_API_TOKEN && process.env.HF_PLANT_MODEL) {
    try {
      const endpoint = `https://api-inference.huggingface.co/models/${process.env.HF_PLANT_MODEL}`;
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { Authorization: `Bearer ${process.env.HF_API_TOKEN}`, "Content-Type": "application/octet-stream" },
        body: imageBuffer,
      });
      if (response.ok) {
        const predictions = await response.json();
        if (Array.isArray(predictions) && predictions.length) {
          const best = predictions.slice().sort((a, b) => b.score - a.score)[0];
          return {
            mode: "hosted-image-model",
            model: process.env.HF_PLANT_MODEL,
            label: best.label,
            confidence: Math.round((best.score || 0) * 100),
            predictions: predictions.slice(0, 5).map(p => ({ label: p.label, confidence: Math.round((p.score || 0) * 100) })),
            advice: "Model output is a screening aid. Confirm suspected disease with a local agricultural expert before treatment.",
            disclaimer: "AI image classification can be wrong; image quality, crop type and lighting affect predictions."
          };
        }
      }
      console.warn("Hosted plant model unavailable; using colour-balance fallback:", response.status);
    } catch (err) {
      console.warn("Hosted plant model failed; using colour-balance fallback:", err.message);
    }
  }

  const { data, info } = await sharp(imageBuffer)
    .resize(120, 120, { fit: "cover" })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const totalPixels = info.width * info.height;
  let green = 0,
    brownYellow = 0,
    dark = 0;

  for (let i = 0; i < data.length; i += info.channels) {
    const r = data[i],
      g = data[i + 1],
      b = data[i + 2];
    const brightness = (r + g + b) / 3;

    if (g > r * 1.05 && g > b * 1.05) green++;
    else if (r > 90 && g > 60 && b < 90 && r >= g) brownYellow++;

    if (brightness < 55) dark++;
  }

  const greenRatio = green / totalPixels;
  const stressRatio = brownYellow / totalPixels;
  const darkRatio = dark / totalPixels;

  const vigorIndex = clamp(Math.round(greenRatio * 140 - stressRatio * 160 - darkRatio * 40 + 10), 0, 100);

  let band, advice;
  if (vigorIndex >= 65) {
    band = "healthy";
    advice = "Colour balance is typical of an actively growing, well-nourished crop.";
  } else if (vigorIndex >= 40) {
    band = "early_stress";
    advice = "Some yellow-brown tone detected — check for early nutrient or water stress, or emerging pest activity.";
  } else {
    band = "significant_stress";
    advice = "A large share of the frame reads as brown, yellow or dark tissue — worth an in-person look from an agronomist.";
  }

  return {
    mode: "colour-balance-fallback-not-a-CNN",
    vigorIndex,
    band,
    advice,
    ratios: {
      green: round4(greenRatio),
      stressed: round4(stressRatio),
      dark: round4(darkRatio),
    },
    disclaimer: "Heuristic colour-balance screening, not a lab diagnosis. Lighting and camera quality affect the reading.",
  };
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}
function round4(v) {
  return Math.round(v * 10000) / 10000;
}

module.exports = { analyzeCropHealth };

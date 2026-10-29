
(() => {
  const API = "/api/crop-disease/predict";

  function init() {
    if (document.getElementById("fc-disease-panel")) return;

    const panel = document.createElement("section");
    panel.id = "fc-disease-panel";
    panel.style.cssText = `
      max-width:850px;margin:28px auto;padding:24px;
      background:#11283b;color:#fff;border:1px solid #315268;
      border-radius:18px;font-family:inherit;
    `;

    panel.innerHTML = `
      <h2>🌿 AI Crop Disease Detection</h2>
      <p>Upload a crop leaf image for AI-based screening.</p>

      <form id="fc-disease-form">
        <input id="fc-disease-image" type="file"
          accept="image/jpeg,image/png,image/webp" required
          style="display:block;margin:18px 0">

        <img id="fc-disease-preview" alt="Selected leaf preview"
          style="display:none;max-width:260px;width:100%;
          border-radius:12px;margin:12px 0">

        <button id="fc-disease-submit" type="submit"
          style="background:#f59e0b;color:#17212b;border:0;
          padding:12px 20px;border-radius:10px;font-weight:700;
          cursor:pointer">
          Analyze Leaf
        </button>
      </form>

      <div id="fc-disease-result" role="status"
        aria-live="polite" style="margin-top:20px"></div>
    `;

    // Temporary standalone panel. Later we can move it into
    // the existing Farmer Dashboard navigation.
    document.querySelector("main")?.appendChild(panel);

    const form = panel.querySelector("#fc-disease-form");
    const input = panel.querySelector("#fc-disease-image");
    const preview = panel.querySelector("#fc-disease-preview");
    const result = panel.querySelector("#fc-disease-result");
    const button = panel.querySelector("#fc-disease-submit");

    let previewUrl = null;

    input.addEventListener("change", () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      previewUrl = null;
      preview.style.display = "none";
      result.textContent = "";

      const file = input.files?.[0];
      if (!file) return;

      if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
        result.textContent = "Please select a JPG, PNG or WebP image.";
        input.value = "";
        return;
      }

      if (file.size > 10 * 1024 * 1024) {
        result.textContent = "Maximum image size is 10 MB.";
        input.value = "";
        return;
      }

      previewUrl = URL.createObjectURL(file);
      preview.src = previewUrl;
      preview.style.display = "block";
    });

    form.addEventListener("submit", async (event) => {
      event.preventDefault();

      const file = input.files?.[0];
      if (!file) return;

      const data = new FormData();
      data.append("image", file);

      button.disabled = true;
      result.textContent = "Analyzing image with trained CNN...";

      try {
        const response = await fetch(API, {
          method: "POST",
          body: data,
          credentials: "same-origin"
        });

        const output = await response.json();

        if (!response.ok || !output.success) {
          throw new Error(output.error || "Prediction failed");
        }

        // Use textContent, not untrusted HTML.
        result.replaceChildren();

        const heading = document.createElement("h3");
        heading.textContent = "Prediction Result";
        result.appendChild(heading);

        const best = document.createElement("p");
        best.textContent =
          `${output.prediction.crop} — ${output.prediction.condition}
           (${output.prediction.confidence}% confidence)`;
        result.appendChild(best);

        const subheading = document.createElement("h4");
        subheading.textContent = "Top 3 Predictions";
        result.appendChild(subheading);

        const list = document.createElement("ol");
        for (const item of output.top3 || []) {
          const li = document.createElement("li");
          li.textContent =
            `${item.crop} — ${item.condition}: ${item.confidence}%`;
          list.appendChild(li);
        }
        result.appendChild(list);

        const note = document.createElement("p");
        note.textContent = output.disclaimer || "";
        note.style.opacity = "0.8";
        result.appendChild(note);
      } catch (error) {
        result.textContent = `Error: ${error.message}`;
      } finally {
        button.disabled = false;
      }
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();

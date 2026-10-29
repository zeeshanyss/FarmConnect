
const router = require("express").Router();

const { fairPriceModel } = require("../utils/fairPriceModel");
const PriceHistory = require("../models/PriceHistory");

router.get("/:crop", async (req, res) => {
  try {
    const { crop } = req.params;
    const { state } = req.query;

    const [model, records] = await Promise.all([
      fairPriceModel(crop, { state }),
      PriceHistory.find({ crop }),
    ]);

    const cutoff = new Date(Date.now() - 30 * 86400000);

    const series = records
      .filter((record) => {
        const date = record.date?.toDate
          ? record.date.toDate()
          : new Date(record.date);

        return !Number.isNaN(date.getTime()) && date >= cutoff;
      })
      .sort((a, b) => {
        const dateA = a.date?.toDate
          ? a.date.toDate()
          : new Date(a.date);

        const dateB = b.date?.toDate
          ? b.date.toDate()
          : new Date(b.date);

        return dateA - dateB;
      })
      .map((record) => ({
        date: record.date,
        modalPrice: record.modalPrice,
        mandi: record.mandi,
      }));

    res.json({ crop, model, series });
  } catch (error) {
    console.error("Price intelligence error:", error);
    res.status(500).json({ error: "Could not load price intelligence" });
  }
});

module.exports = router;

const router = require("express").Router();
const { matchSchemes, greenScore } = require("../utils/schemeEngine");
const { requireAuth } = require("../middleware/auth");
const User = require("../models/User");

router.post("/match", requireAuth, async (req, res) => {
  const profile = req.body.profile || (await User.findById(req.user.id)).farmerProfile;
  const matches = await matchSchemes(profile);
  const green = greenScore(profile.practices);
  res.json({ matches, greenScore: green });
});


// Government Scheme Hub
router.get("/", async (req, res) => {
  try {
    const Scheme = require("../models/Scheme");
    const records = await Scheme.find({ active: true });

    const verified = records.filter(
      (s) => s.verificationStatus === "verified"
    );

    res.json({
      success: true,
      count: verified.length,
      schemes: verified
    });
  } catch (error) {
    console.error("Scheme Hub error:", error);
    res.status(500).json({
      success: false,
      error: "Unable to load government schemes"
    });
  }
});
module.exports = router;


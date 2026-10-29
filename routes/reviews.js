
const router = require("express").Router();

const Review = require("../models/Review");
const User = require("../models/User");
const { requireAuth } = require("../middleware/auth");
const { recomputeTrust } = require("../utils/trustModel");

module.exports = (io) => {
  // Get reviews for a user
  router.get("/:userId", async (req, res) => {
    try {
      const user = await User.findById(req.params.userId);

      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      const reviews = await Review.find({
        target: req.params.userId,
      });

      reviews.sort((a, b) => {
        const dateA = a.createdAt?.toDate
          ? a.createdAt.toDate()
          : new Date(a.createdAt || 0);

        const dateB = b.createdAt?.toDate
          ? b.createdAt.toDate()
          : new Date(b.createdAt || 0);

        return dateB - dateA;
      });

      const populatedReviews = await Promise.all(
        reviews.map(async (review) => {
          const author = await User.findById(review.author);

          return {
            ...review,
            author: author
              ? {
                  _id: author._id,
                  name: author.name,
                }
              : null,
          };
        })
      );

      res.json({
        user: {
          _id: user._id,
          name: user.name,
          trust: user.trust,
        },
        reviews: populatedReviews,
      });
    } catch (error) {
      console.error("Get reviews error:", error);
      res.status(500).json({ error: "Could not load reviews" });
    }
  });

  // Submit a review
  router.post("/", requireAuth, async (req, res) => {
    try {
      const { targetId, listingId, rating, comment } = req.body;

      if (String(targetId) === String(req.user.id)) {
        return res.status(400).json({
          error: "Cannot review yourself",
        });
      }

      const target = await User.findById(targetId);

      if (!target) {
        return res.status(404).json({
          error: "Review target not found",
        });
      }

      const review = await Review.create({
        target: targetId,
        author: req.user.id,
        listing: listingId,
        rating,
        comment,
      });

      const trust = await recomputeTrust(targetId);

      io.emit("activity:pulse", {
        text: `${req.user.name} left a review`,
      });

      res.status(201).json({ review, trust });
    } catch (error) {
      console.error("Submit review error:", error);

      if (error.code === 11000) {
        return res.status(409).json({
          error: "You already reviewed this deal",
        });
      }

      if (
        error.message === "Invalid review rating" ||
        error.message === "Review target and author are required"
      ) {
        return res.status(400).json({ error: error.message });
      }

      res.status(500).json({
        error: "Could not submit review",
      });
    }
  });

  return router;
};

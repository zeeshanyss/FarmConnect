
const Review = require("../models/Review");
const User = require("../models/User");

const HALF_LIFE_DAYS = 60;
const PLATFORM_PRIOR = 4.0;
const PRIOR_WEIGHT = 2;

async function recomputeTrust(userId) {
  const reviews = await Review.find({ target: userId });

  if (reviews.length === 0) {
    await User.findByIdAndUpdate(userId, {
      trust: {
        score: 0,
        reviewCount: 0,
        lastRecomputedAt: new Date(),
      },
    });

    return { score: 0, reviewCount: 0 };
  }

  const now = Date.now();
  let weightedSum = 0;
  let weightTotal = 0;

  for (const review of reviews) {
    const createdAt = review.createdAt?.toDate
      ? review.createdAt.toDate()
      : new Date(review.createdAt);

    const ageDays = (now - createdAt.getTime()) / 86400000;
    const weight = 1 / (1 + ageDays / HALF_LIFE_DAYS);

    weightedSum += review.rating * weight;
    weightTotal += weight;
  }

  const rawScore = weightedSum / weightTotal;

  const shrunkScore =
    (rawScore * weightTotal + PLATFORM_PRIOR * PRIOR_WEIGHT) /
    (weightTotal + PRIOR_WEIGHT);

  const score = Math.round(shrunkScore * 10) / 10;

  await User.findByIdAndUpdate(userId, {
    trust: {
      score,
      reviewCount: reviews.length,
      lastRecomputedAt: new Date(),
    },
  });

  return {
    score,
    reviewCount: reviews.length,
  };
}

module.exports = { recomputeTrust };

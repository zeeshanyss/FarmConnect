
const Scheme = require("../models/Scheme");

/**
 * Scheme Matching Engine
 *
 * Evaluates active government schemes against a farmer's profile.
 * Returns eligibility and reasons for each scheme.
 */
async function matchSchemes(profile) {
  const schemes = await Scheme.find({ active: true });

  return schemes.map((s) => {
    const reasons = [];
    let eligible = true;
    const rule = s.rule || {};

    if (
      typeof rule.maxLandAcres === "number" &&
      profile.landholdingAcres > rule.maxLandAcres
    ) {
      eligible = false;
      reasons.push(`Landholding above ${rule.maxLandAcres} acre cap`);
    }

    if (
      typeof rule.minLandAcres === "number" &&
      profile.landholdingAcres < rule.minLandAcres
    ) {
      eligible = false;
      reasons.push(`Landholding below ${rule.minLandAcres} acre minimum`);
    }

    if (
      Array.isArray(rule.categories) &&
      rule.categories.length &&
      !rule.categories.includes(profile.category)
    ) {
      eligible = false;
      reasons.push(`Limited to ${rule.categories.join("/")} category`);
    }

    if (
      Array.isArray(rule.genders) &&
      rule.genders.length &&
      !rule.genders.includes(profile.gender)
    ) {
      eligible = false;
      reasons.push(`Limited to ${rule.genders.join("/")}`);
    }

    if (typeof rule.requiresKCC === "boolean") {
      if (rule.requiresKCC && !profile.hasKCC) {
        eligible = false;
        reasons.push("Requires an existing Kisan Credit Card");
      }

      if (rule.requiresKCC === false && profile.hasKCC) {
        eligible = false;
        reasons.push("For farmers who don't yet have a Kisan Credit Card");
      }
    }

    if (
      Array.isArray(rule.requiredPractices) &&
      rule.requiredPractices.length
    ) {
      const hasAny = rule.requiredPractices.some((practice) =>
        (profile.practices || []).includes(practice)
      );

      if (!hasAny) {
        eligible = false;
        reasons.push(
          `Targeted at farms practicing: ${rule.requiredPractices.join(", ")}`
        );
      }
    }

    return {
      id: s._id,
      name: s.name,
      authority: s.authority,
      description: s.description,
      officialUrl: s.officialUrl,
      eligible,
      reasons: eligible ? [] : reasons,
    };
  });
}

/**
 * Sustainability (Green) Score
 */
const PRACTICE_WEIGHTS = {
  organic: 30,
  drip: 25,
  rotation: 15,
  residue_managed: 10,
};

function greenScore(practices = []) {
  const base = 20;

  const earned = practices.reduce(
    (sum, practice) => sum + (PRACTICE_WEIGHTS[practice] || 0),
    0
  );

  return Math.min(100, base + earned);
}

module.exports = { matchSchemes, greenScore };

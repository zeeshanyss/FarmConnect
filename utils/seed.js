
require("dotenv").config();

require("../config/firebase");

const { db } = require("../config/firebase");
const Scheme = require("../models/Scheme");
const PriceHistory = require("../models/PriceHistory");
const User = require("../models/User");

async function seedAdmin() {
  const phone = process.env.SEED_ADMIN_PHONE || "9999900000";
  const existing = await User.findOne({ phone });

  if (existing) {
    console.log(`Admin already exists (${phone}) — skipping`);
    return;
  }

  const passwordHash = await User.hashPassword(
    process.env.SEED_ADMIN_PASSWORD || "ChangeMe123"
  );

  await User.create({
    name: "Platform Admin",
    phone,
    passwordHash,
    role: "admin",
    isVerified: true,
  });

  console.log("Seeded admin account. Use your configured credentials.");
}

const SCHEMES = [
  {
    name: "PM-KISAN Income Support",
    description:
      "Direct income support paid in instalments to landholding farmer families.",
    officialUrl: "https://pmkisan.gov.in",
    rule: { maxLandAcres: 12.5 },
  },
  {
    name: "Pradhan Mantri Fasal Bima Yojana",
    description:
      "Subsidised crop insurance against yield loss from natural causes.",
    officialUrl: "https://pmfby.gov.in",
    rule: { minLandAcres: 0.1 },
  },
  {
    name: "Kisan Credit Card",
    description:
      "Low-interest working-capital credit for crop and allied needs.",
    rule: { requiresKCC: false },
  },
  {
    name: "PM Krishi Sinchayee Yojana",
    description:
      "Support for micro-irrigation equipment such as drip and sprinkler systems.",
    rule: {},
  },
  {
    name: "National Mission on Natural Farming",
    description:
      "Incentives and training for chemical-free, input-light farming practices.",
    rule: { requiredPractices: ["organic", "rotation"] },
  },
  {
    name: "Mahila Kisan Sashaktikaran Pariyojana",
    description:
      "Support and training targeted at women farmers and women-led farm groups.",
    rule: { genders: ["Woman"] },
  },
];

async function deleteCollection(collectionName) {
  const collection = db.collection(collectionName);

  while (true) {
    const snapshot = await collection.limit(400).get();

    if (snapshot.empty) {
      break;
    }

    const batch = db.batch();

    snapshot.docs.forEach((doc) => {
      batch.delete(doc.ref);
    });

    await batch.commit();
  }
}

async function seedPriceHistory() {
  const crops = [
    "Wheat",
    "Paddy (Rice)",
    "Cotton",
    "Soybean",
    "Mustard",
  ];

  const mandis = {
    Wheat: "Karnal",
    "Paddy (Rice)": "Karnal",
    Cotton: "Adilabad",
    Soybean: "Indore",
    Mustard: "Alwar",
  };

  const bases = {
    Wheat: 2250,
    "Paddy (Rice)": 2050,
    Cotton: 7100,
    Soybean: 4550,
    Mustard: 5600,
  };

  const docs = [];

  for (const crop of crops) {
    let price = bases[crop];

    for (let i = 30; i >= 0; i--) {
      price += (Math.random() - 0.5) * bases[crop] * 0.02;

      const date = new Date(Date.now() - i * 86400000);

      docs.push({
        crop,
        mandi: mandis[crop],
        date,
        modalPrice: Math.round(price),
        minPrice: Math.round(price * 0.96),
        maxPrice: Math.round(price * 1.04),
        source: "manual",
      });
    }
  }

  // Firestore supports up to 500 writes per batch.
  for (let i = 0; i < docs.length; i += 400) {
    const batch = db.batch();
    const chunk = docs.slice(i, i + 400);

    chunk.forEach((record) => {
      const ref = db.collection("priceHistory").doc();
      batch.set(ref, record);
    });

    await batch.commit();
  }

  console.log(`Seeded ${docs.length} price history rows`);
}

async function main() {
  await deleteCollection("schemes");

  for (const scheme of SCHEMES) {
    await Scheme.create({
      ...scheme,
      active: true,
    });
  }

  console.log(`Seeded ${SCHEMES.length} schemes`);

  await deleteCollection("priceHistory");
  await seedPriceHistory();
  await seedAdmin();

  console.log("Firestore seeding completed");
}

main().catch((error) => {
  console.error("Firestore seed failed:", error);
  process.exitCode = 1;
});

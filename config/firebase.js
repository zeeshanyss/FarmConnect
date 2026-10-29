
require("dotenv").config();

const {
  initializeApp,
  applicationDefault,
  getApps,
} = require("firebase-admin/app");

const { getFirestore } = require("firebase-admin/firestore");

if (getApps().length === 0) {
  initializeApp({
    credential: applicationDefault(),
  });
}

const db = getFirestore();

module.exports = { db };


require("dotenv").config();

const { db } = require("./config/firebase");

async function testFirebase() {
  try {
    await db.collection("_connection_test").limit(1).get();
    console.log("Firebase connection successful!");
  } catch (error) {
    console.error("Firebase connection failed:");
    console.error(error.message);
  }
}

testFirebase();

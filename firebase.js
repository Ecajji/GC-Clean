require("dotenv").config();
const admin = require("firebase-admin");

let app;

if (!admin.apps.length) {
  app = admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n"),
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    }),
  });
} else {
  app = admin.app();
}

// ✅ Get Firestore instance explicitly from the app
const db = admin.firestore(app);

// Export Firestore (not admin)
module.exports = db;

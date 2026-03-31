const admin = require('firebase-admin');

// Initialize Admin SDK
// Local usage assumes GOOGLE_APPLICATION_CREDENTIALS points to service account key file
// or running in an environment where ADC (Application Default Credentials) is available
admin.initializeApp({
  projectId: 'bin-group-57c60'
});

const db = admin.firestore();

async function createGrant() {
  const email = "ceo@bin-groups.com";
  const docId = "rashid_pvt420_gmail_com";

  const grantData = {
    email: email,
    role: "admin",
    isAdmin: true,
    godMode: true,
    status: "pending_first_login",
    displayName: "Rashid Admin",
    grantedAt: admin.firestore.FieldValue.serverTimestamp()
  };

  try {
    console.log(`[BOOTSTRAP] Attempting to create grant for ${email}...`);
    await db.collection("pending_admin_grants").doc(docId).set(grantData);
    console.log(`[SUCCESS] Admin grant created for ${email}.`);
    process.exit(0);
  } catch (err) {
    console.error(`[ERROR] Failed to create grant:`, err);
    process.exit(1);
  }
}

createGrant();

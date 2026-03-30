// scripts/assign-role.js
const admin = require('firebase-admin');

// Authenticate using GOOGLE_APPLICATION_CREDENTIALS env var or local file fallback
if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    admin.initializeApp({
        credential: admin.credential.applicationDefault()
    });
    console.log("[IAM] Authenticated via Application Default Credentials.");
} else {
    try {
        const serviceAccount = require('../serviceAccountKey.json');
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount)
        });
        console.log("[IAM] Authenticated via local serviceAccountKey.json.");
    } catch (e) {
        console.error("CRITICAL: No authentication method found. Please set GOOGLE_APPLICATION_CREDENTIALS.");
        process.exit(1);
    }
}

const assignRole = async (email, role) => {
  try {
    const user = await admin.auth().getUserByEmail(email);
    const claims = { role: role };
    if (role === 'admin') {
      claims.admin = true;
    }
    
    await admin.auth().setCustomUserClaims(user.uid, claims);
    console.log(`Successfully assigned role ${role} to ${email}`);
    
    await admin.firestore().collection('users').doc(user.uid).set({
      role: role,
      isAdmin: role === 'admin',
      status: 'active',
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
    
    console.log(`Updated Firestore profile for ${email}`);
    process.exit(0);
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
};

const [,, email, role] = process.argv;
if (!email || !role) {
  console.log('Usage: node assign-role.js <email> <role>');
  process.exit(1);
}

assignRole(email, role);

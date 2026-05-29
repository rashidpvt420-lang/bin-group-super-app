const admin = require('firebase-admin');
const path = require('path');

// Ensure you have a service account JSON file set in GOOGLE_APPLICATION_CREDENTIALS
// e.g. export GOOGLE_APPLICATION_CREDENTIALS="path/to/serviceAccountKey.json"
// Or default application credentials if running on GCP.

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();
const auth = admin.auth();

const E2E_PASSWORD = process.env.E2E_UNIVERSAL_PASSWORD || 'E2e!Test!Pass2026';

const PROFILES = [
  {
    email: 'e2e-admin@bingroup.com',
    role: 'admin',
    isAdmin: true,
    displayName: 'E2E Admin',
  },
  {
    email: 'e2e-owner@bingroup.com',
    role: 'owner',
    isAdmin: false,
    displayName: 'E2E Owner',
  },
  {
    email: 'e2e-tenant@bingroup.com',
    role: 'tenant',
    isAdmin: false,
    displayName: 'E2E Tenant',
  },
  {
    email: 'e2e-technician@bingroup.com',
    role: 'technician',
    isAdmin: false,
    displayName: 'E2E Tech',
  },
  {
    email: 'e2e-broker@bingroup.com',
    role: 'broker',
    isAdmin: false,
    displayName: 'E2E Broker',
  }
];

async function provisionAccounts() {
  console.log('🚀 Starting E2E Account Provisioning...');

  for (const profile of PROFILES) {
    try {
      let userRecord;
      try {
        // Try to get user if they already exist
        userRecord = await auth.getUserByEmail(profile.email);
        console.log(`[${profile.role}] Auth user already exists (${userRecord.uid}). Updating password...`);
        // Force update password for consistency
        await auth.updateUser(userRecord.uid, { password: E2E_PASSWORD });
      } catch (error) {
        if (error.code === 'auth/user-not-found') {
          console.log(`[${profile.role}] Creating new auth user...`);
          userRecord = await auth.createUser({
            email: profile.email,
            password: E2E_PASSWORD,
            displayName: profile.displayName,
            emailVerified: true
          });
        } else {
          throw error;
        }
      }

      // Set custom claims (optional depending on app structure)
      await auth.setCustomUserClaims(userRecord.uid, { 
        role: profile.role,
        admin: profile.isAdmin 
      });

      // Write to Firestore users collection
      console.log(`[${profile.role}] Provisioning Firestore document...`);
      await db.collection('users').doc(userRecord.uid).set({
        uid: userRecord.uid,
        email: profile.email,
        role: profile.role,
        isAdmin: profile.isAdmin,
        displayName: profile.displayName,
        status: 'active',
        onboardingComplete: true,
        legalAcceptedAt: new Date().toISOString(),
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      }, { merge: true });

      console.log(`✅ Provisioned: ${profile.email}`);
    } catch (e) {
      console.error(`❌ Failed to provision ${profile.email}:`, e);
    }
  }
  
  console.log('\n=======================================');
  console.log('🎉 E2E Provisioning Complete!');
  console.log('Ensure these credentials match your GitHub Secrets:');
  for (const profile of PROFILES) {
    console.log(`${profile.role.toUpperCase()} EMAIL: ${profile.email}`);
  }
  console.log(`UNIVERSAL PASSWORD: ${E2E_PASSWORD}`);
  console.log('=======================================\n');
}

provisionAccounts().then(() => process.exit(0)).catch((e) => {
  console.error(e);
  process.exit(1);
});

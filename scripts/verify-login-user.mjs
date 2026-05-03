import admin from 'firebase-admin';
import chalk from 'chalk';
import fs from 'fs';
import path from 'path';

// Initialize Firebase Admin
// We assume the user has a service account key or is authenticated via CLI
const serviceAccountPath = path.resolve('service-account.json');

if (fs.existsSync(serviceAccountPath)) {
  const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
} else {
  // Try default credentials
  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
    projectId: 'bin-group-57c60'
  });
}

const db = admin.firestore();
const auth = admin.auth();

async function verifyUser(email) {
  console.log(chalk.blue(`\n🔍 Checking User: ${email}`));
  let authUser;
  let firestoreProfile;
  
  try {
    authUser = await auth.getUserByEmail(email);
    console.log(chalk.green(`✅ AUTH_EXISTS: YES (UID: ${authUser.uid})`));
    
    const providers = authUser.providerData.map(p => p.providerId);
    console.log(`   PASSWORD_PROVIDER: ${providers.includes('password') ? chalk.green('YES') : chalk.red('NO')}`);
    console.log(`   GOOGLE_PROVIDER: ${providers.includes('google.com') ? chalk.green('YES') : chalk.red('NO')}`);
    console.log(`   EMAIL_VERIFIED: ${authUser.emailVerified ? chalk.green('YES') : chalk.red('NO')}`);
    console.log(`   DISABLED: ${authUser.disabled ? chalk.red('YES') : chalk.green('NO')}`);
    
    const claims = authUser.customClaims || {};
    console.log(`   CUSTOM_CLAIMS: ${JSON.stringify(claims)}`);
    
  } catch (err) {
    console.log(chalk.red(`❌ AUTH_EXISTS: NO (${err.message})`));
  }

  if (authUser) {
    try {
      const doc = await db.collection('users').doc(authUser.uid).get();
      if (doc.exists) {
        firestoreProfile = doc.data();
        console.log(chalk.green(`✅ FIRESTORE_PROFILE: YES`));
        console.log(`   ROLE: ${firestoreProfile.role || 'NONE'}`);
        console.log(`   STATUS: ${firestoreProfile.status || 'NONE'}`);
        console.log(`   IS_ADMIN: ${firestoreProfile.isAdmin ? chalk.green('YES') : 'NO'}`);
        console.log(`   ADMIN_APPROVED: ${firestoreProfile.adminApproved ? chalk.green('YES') : 'NO'}`);
        
        if (firestoreProfile.role === 'technician') {
          console.log(`   TECH_ON_DUTY: ${firestoreProfile.onDuty ? chalk.green('YES') : 'NO'}`);
          console.log(`   TECH_DUTY_STATUS: ${firestoreProfile.dutyStatus}`);
        }
      } else {
        console.log(chalk.red(`❌ FIRESTORE_PROFILE: NO (Document missing at users/${authUser.uid})`));
      }
    } catch (err) {
      console.log(chalk.red(`❌ FIRESTORE_ERROR: ${err.message}`));
    }
  }

  const roleReady = authUser && firestoreProfile && (firestoreProfile.role || authUser.customClaims?.role);
  console.log(`   ROLE_READY: ${roleReady ? chalk.green('YES') : chalk.red('NO')}`);
  
  const loginReady = roleReady && !authUser.disabled && (firestoreProfile?.status === 'active' || firestoreProfile?.status === 'ACTIVE');
  console.log(`   LOGIN_READY: ${loginReady ? chalk.bgGreen.black(' PASS ') : chalk.bgRed.white(' FAIL ')}`);
}

async function run() {
  const emails = [
    'ceo@bin-groups.com',
    'rashidpvt420@gmail.com'
  ];

  for (const email of emails) {
    await verifyUser(email);
  }
  process.exit(0);
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});

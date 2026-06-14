import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import chalk from 'chalk';

/**
 * VERIFY ADMIN ACCESS SCRIPT (STAGE 9 EMERGENCY)
 * Usage: node scripts/verify-admin-access.mjs <email>
 */

const email = process.argv[2];

if (!email) {
    console.error(chalk.red("❌ Missing email. Usage: node scripts/verify-admin-access.mjs <email>"));
    process.exit(1);
}

initializeApp({
    projectId: 'bin-group-57c60'
});

const db = getFirestore();
const auth = getAuth();

async function verifyAdmin(targetEmail) {
    try {
        console.log(chalk.blue(`🔍 [AUTH] Verifying user: ${targetEmail}...`));
        const user = await auth.getUserByEmail(targetEmail);
        const uid = user.uid;

        console.log(chalk.white(`\n--- AUTH DETAILS ---`));
        console.log(`UID: ${uid}`);
        console.log(`Custom Claims:`, JSON.stringify(user.customClaims || {}, null, 2));

        const userDoc = await db.collection('users').doc(uid).get();
        const userData = userDoc.data() || {};

        console.log(chalk.white(`\n--- FIRESTORE PROFILE ---`));
        console.log(`Role: ${userData.role}`);
        console.log(`isAdmin: ${userData.isAdmin}`);
        console.log(`Admin Approved: ${userData.adminApproved}`);

        const hasAuthClaim = user.customClaims?.admin === true;
        const hasFirestoreRole = userData.role === 'admin' || userData.isAdmin === true;

        console.log(chalk.white(`\n--- VERDICT ---`));
        if (hasAuthClaim && hasFirestoreRole) {
            console.log(chalk.green(`✅ User HAS full admin access.`));
        } else if (hasAuthClaim || hasFirestoreRole) {
            console.log(chalk.yellow(`⚠️ User has PARTIAL access (Auth Claim: ${hasAuthClaim}, Firestore Role: ${hasFirestoreRole}).`));
            console.log(chalk.yellow(`👉 Run node scripts/grant-admin.mjs ${targetEmail} to sync.`));
        } else {
            console.log(chalk.red(`❌ User DOES NOT have admin access.`));
        }

        process.exit(0);
    } catch (err) {
        console.error(chalk.red(`\n❌ [ERROR] Verification failed:`));
        console.error(err);
        process.exit(1);
    }
}

verifyAdmin(email.toLowerCase().trim());

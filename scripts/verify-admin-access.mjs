import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import chalk from 'chalk';

/**
 * READ-ONLY ADMIN ACCESS VERIFICATION
 * Usage: node scripts/verify-admin-access.mjs <email>
 *
 * This script never changes users, passwords, claims, profiles, or audit logs.
 * Any repair must use the protected Admin Staff Access callable or the protected
 * founder/Admin MFA bootstrap workflow.
 */

const email = process.argv[2];

if (!email) {
  console.error(chalk.red('Missing email. Usage: node scripts/verify-admin-access.mjs <email>'));
  process.exit(1);
}

initializeApp({ projectId: 'bin-group-57c60' });

const db = getFirestore();
const auth = getAuth();

async function verifyAdmin(targetEmail) {
  try {
    console.log(chalk.blue(`Verifying user: ${targetEmail}...`));
    const user = await auth.getUserByEmail(targetEmail);
    const uid = user.uid;

    console.log(chalk.white('\n--- AUTH DETAILS ---'));
    console.log(`UID: ${uid}`);
    console.log('Custom Claims:', JSON.stringify(user.customClaims || {}, null, 2));

    const userDoc = await db.collection('users').doc(uid).get();
    const userData = userDoc.data() || {};

    console.log(chalk.white('\n--- FIRESTORE PROFILE ---'));
    console.log(`Role: ${userData.role}`);
    console.log(`isAdmin: ${userData.isAdmin}`);
    console.log(`Admin Approved: ${userData.adminApproved}`);

    const hasAuthClaim = user.customClaims?.admin === true;
    const hasFirestoreRole = userData.role === 'admin' || userData.isAdmin === true;

    console.log(chalk.white('\n--- VERDICT ---'));
    if (hasAuthClaim && hasFirestoreRole) {
      console.log(chalk.green('User has full Admin role binding.'));
    } else if (hasAuthClaim || hasFirestoreRole) {
      console.log(chalk.yellow(`Partial Admin binding detected (Auth Claim: ${hasAuthClaim}, Firestore Role: ${hasFirestoreRole}).`));
      console.log(chalk.yellow('Repair only through the dedicated Admin Staff Access page backed by adminCreateUser, or the protected founder/Admin MFA bootstrap workflow.'));
    } else {
      console.log(chalk.red('User does not have Admin access.'));
    }

    process.exit(0);
  } catch (err) {
    console.error(chalk.red('\nVerification failed:'));
    console.error(err);
    process.exit(1);
  }
}

verifyAdmin(email.toLowerCase().trim());

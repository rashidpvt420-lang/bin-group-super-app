import admin from 'firebase-admin';
import chalk from 'chalk';
import { initializeFirebaseAdmin, resolveFirebaseAdminProjectId } from './firebase-admin-bootstrap.mjs';

const projectId = resolveFirebaseAdminProjectId();
const gateKey = process.argv[2];
const verifiedBy = process.argv[3];
const evidence = process.argv[4];

if (!gateKey || !verifiedBy || !evidence) {
    console.error(chalk.red('❌ Missing arguments.'));
    console.error(chalk.yellow('Usage: node scripts/verify-launch-gate-live.mjs <gateKey> "<Verified By>" "<Evidence text/URL>"'));
    console.error(chalk.gray('Example: node scripts/verify-launch-gate-live.mjs adminCredentialLogin "Rashid" "docs/LIVE_FIVE_PROFILE_SMOKE_TEST_2026-06-27.md"'));
    process.exit(1);
}

initializeFirebaseAdmin(admin, projectId);
const db = admin.firestore();

async function verifyGate() {
    console.log(chalk.blue(`==> Verifying launch gate: ${gateKey}`));
    console.log(chalk.gray(`Firebase project: ${projectId}`));

    const docRef = db.doc('system_health/admin_summaries');

    const updateData = {
        [gateKey]: true,
        [`${gateKey}VerifiedAt`]: admin.firestore.FieldValue.serverTimestamp(),
        [`${gateKey}VerifiedBy`]: verifiedBy,
        [`${gateKey}Evidence`]: evidence
    };

    try {
        await docRef.set(updateData, { merge: true });
        console.log(chalk.green(`✅ Successfully recorded live proof for '${gateKey}'.`));
        console.log(chalk.gray(`Evidence logged: ${evidence}`));
        console.log(chalk.green('The Admin Launch Health panel will now display PASS for this item.'));
        process.exit(0);
    } catch (err) {
        console.error(chalk.red('❌ Failed to record evidence to Firestore:'));
        console.error(err);
        process.exit(1);
    }
}

verifyGate();

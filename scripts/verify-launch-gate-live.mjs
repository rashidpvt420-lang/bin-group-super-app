import { initializeApp, cert, applicationDefault } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import chalk from 'chalk';

const projectId = process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT || 'bin-group-57c60';

const gateKey = process.argv[2];
const verifiedBy = process.argv[3];
const evidence = process.argv[4];

if (!gateKey || !verifiedBy || !evidence) {
    console.error(chalk.red('❌ Missing arguments.'));
    console.error(chalk.yellow('Usage: node scripts/verify-launch-gate-live.mjs <gateKey> "<Verified By>" "<Evidence text/URL>"'));
    console.error(chalk.gray('Example: node scripts/verify-launch-gate-live.mjs adminCredentialLogin "Rashid" "docs/LIVE_FIVE_PROFILE_SMOKE_TEST_2026-06-27.md"'));
    process.exit(1);
}

const appOptions = { projectId };
if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    appOptions.credential = applicationDefault();
}
try {
    initializeApp(appOptions);
} catch (e) {
    if (e.code !== 'app/duplicate-app') throw e;
}

const db = getFirestore();

async function verifyGate() {
    console.log(chalk.blue(`==> Verifying launch gate: ${gateKey}`));
    
    const docRef = db.doc('system_health/admin_summaries');
    
    const updateData = {
        [gateKey]: true,
        [`${gateKey}VerifiedAt`]: FieldValue.serverTimestamp(),
        [`${gateKey}VerifiedBy`]: verifiedBy,
        [`${gateKey}Evidence`]: evidence
    };
    
    try {
        await docRef.set(updateData, { merge: true });
        console.log(chalk.green(`✅ Successfully recorded live proof for '${gateKey}'.`));
        console.log(chalk.gray(`Evidence logged: ${evidence}`));
        console.log(chalk.green(`The Admin Launch Health panel will now display PASS for this item.`));
        process.exit(0);
    } catch (err) {
        console.error(chalk.red('❌ Failed to record evidence to Firestore:'));
        console.error(err);
        process.exit(1);
    }
}

verifyGate();

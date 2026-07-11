/**
 * Gate 12 — Production SMTP live delivery proof via Firestore mail queue.
 * Creates a mail/{id} doc, waits for sendQueuedMailOnCreate, requires delivery.state=SUCCESS.
 */
import admin from 'firebase-admin';
import chalk from 'chalk';
import { applyFirebaseAdminEnvSanitize, initializeFirebaseAdmin } from './firebase-admin-bootstrap.mjs';

applyFirebaseAdminEnvSanitize();
initializeFirebaseAdmin(admin);

const db = admin.firestore();
const maxWaitSec = Number(process.env.SMTP_VERIFY_MAX_SEC || 120);
const pollSec = Number(process.env.SMTP_VERIFY_POLL_SEC || 4);
const testTo = String(process.env.SMTP_TEST_TO || process.env.E2E_ADMIN_EMAIL || 'e2e-admin@bingroup.com').trim();

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

console.log('\n=== Gate 12 SMTP Live Delivery ===\n');
console.log(`Recipient: ${testTo}`);
console.log(`Polling up to ${maxWaitSec}s for delivery.state=SUCCESS...\n`);

const mailId = `gate12-smtp-proof-${Date.now()}`;
const mailRef = db.collection('mail').doc(mailId);

await mailRef.set({
  to: testTo,
  message: {
    from: 'BIN GROUP <ceo@bin-groups.com>',
    replyTo: 'BIN GROUP Admin <ceo@bin-groups.com>',
    subject: `BIN GROUP Gate 12 SMTP proof ${new Date().toISOString()}`,
    html: '<p>Automated Gate 12 SMTP delivery proof. Safe to ignore.</p>',
    text: 'Automated Gate 12 SMTP delivery proof. Safe to ignore.',
  },
  metadata: { type: 'gate12_smtp_live_proof', automated: true },
  createdAt: admin.firestore.FieldValue.serverTimestamp(),
});

let delivery = null;
const deadline = Date.now() + maxWaitSec * 1000;

while (Date.now() < deadline) {
  const snap = await mailRef.get();
  delivery = snap.data()?.delivery || null;
  const state = String(delivery?.state || '').toUpperCase();
  if (state === 'SUCCESS') break;
  if (state === 'ERROR') {
    console.error(chalk.red(`[FAIL] SMTP delivery error: ${delivery?.error || 'unknown'}`));
    process.exit(1);
  }
  process.stdout.write('.');
  await sleep(pollSec * 1000);
}

console.log('');

if (!delivery || String(delivery.state || '').toUpperCase() !== 'SUCCESS') {
  console.error(chalk.red('[FAIL] Mail queue did not reach delivery.state=SUCCESS in time.'));
  console.error('Check Cloud Functions logs for sendQueuedMailOnCreate and SMTP secrets.');
  process.exit(1);
}

const from = String(delivery.from || '');
if (!/BIN GROUP/i.test(from)) {
  console.warn(chalk.yellow(`[WARN] delivery.from may not be branded: ${from || '(missing)'}`));
}

console.log(chalk.green(`[PASS] SMTP live delivery — state=SUCCESS messageId=${delivery.messageId || 'n/a'}`));
console.log(`from=${from || '(server default)'}`);
process.exit(0);

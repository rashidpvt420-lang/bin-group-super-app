/**
 * Poll Firestore for a verified Stripe live payment after admin completes AED checkout.
 * Does not fake evidence — exits 1 until payment_transactions shows STRIPE + PAID/VERIFIED.
 */
import admin from 'firebase-admin';

const projectId = process.env.GCLOUD_PROJECT || 'bin-group-57c60';
const maxWaitSec = Number(process.env.STRIPE_VERIFY_MAX_SEC || 120);
const pollSec = Number(process.env.STRIPE_VERIFY_POLL_SEC || 5);

if (!admin.apps.length) {
  admin.initializeApp({ projectId });
}

const db = admin.firestore();

function isLiveStripePayment(data) {
  const method = String(data.paymentMethod || data.provider || '').toUpperCase();
  const stripeId = data.stripePaymentIntentId || data.stripeSessionId || data.stripeChargeId;
  
  const statuses = [
    data.status,
    data.paymentStatus,
    data.paymentState,
    data.verificationState
  ].map((s) => String(s || '').toUpperCase());

  const successTerms = ['PAID', 'PAYMENT_VERIFIED', 'SUCCEEDED', 'SUCCESS', 'COMPLETED', 'AUTO_VERIFIED'];
  const paid = successTerms.some((term) => statuses.some((val) => val.includes(term)));

  return method.includes('STRIPE') && paid && Boolean(stripeId);
}

async function findRecentLivePayment() {
  const snap = await db.collection('payment_transactions')
    .orderBy('updatedAt', 'desc')
    .limit(25)
    .get()
    .catch(async () => db.collection('payment_transactions').limit(25).get());

  for (const doc of snap.docs) {
    if (isLiveStripePayment(doc.data())) {
      return { id: doc.id, ...doc.data() };
    }
  }
  return null;
}

console.log(`\n=== Stripe Live Webhook Proof (${projectId}) ===\n`);
console.log(`Polling up to ${maxWaitSec}s for payment_transactions STRIPE + PAID...\n`);

const deadline = Date.now() + maxWaitSec * 1000;
let payment = await findRecentLivePayment();

while (!payment && Date.now() < deadline) {
  await new Promise((r) => setTimeout(r, pollSec * 1000));
  payment = await findRecentLivePayment();
  process.stdout.write('.');
}

console.log('');

if (!payment) {
  console.log('[FAIL] No verified Stripe live payment found in Firestore.');
  console.log('Admin steps:');
  console.log('1. Complete a real AED checkout on production owner activation');
  console.log('2. Confirm Stripe webhook delivered (payment_transactions updated)');
  console.log('3. Re-run: node scripts/verify-stripe-live-webhook.mjs');
  process.exit(1);
}

const evidence = `paymentId=${payment.paymentId || payment.id}; stripe=${payment.stripePaymentIntentId || payment.stripeSessionId}; amount=${payment.amount || payment.amountAed || 'n/a'} ${payment.currency || 'AED'}`;
console.log(`[PASS] Live Stripe payment verified — ${evidence}`);

const { spawnSync } = await import('node:child_process');
const verifier = process.env.LAUNCH_VERIFIER_NAME || 'Rashid AbdulGhani';
const record = spawnSync(process.execPath, [
  'scripts/verify-launch-gate-live.mjs',
  'stripeLiveMode',
  verifier,
  evidence,
], { encoding: 'utf8', stdio: 'inherit' });

process.exit(record.status === 0 ? 0 : 1);

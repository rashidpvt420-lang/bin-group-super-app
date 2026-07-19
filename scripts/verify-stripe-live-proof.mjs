#!/usr/bin/env node

import crypto from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import * as admin from 'firebase-admin';

const fail = (message) => {
  console.error(`[stripe-live-proof] FAIL — ${message}`);
  process.exit(1);
};
const text = (value) => String(value || '').trim();
const commitSha = text(process.env.GITHUB_SHA);
const repository = text(process.env.GITHUB_REPOSITORY);
const workflowRunId = text(process.env.GITHUB_RUN_ID);
const workflowRunAttempt = Number(process.env.GITHUB_RUN_ATTEMPT || 0);
const releaseId = text(process.env.RELEASE_ID);
const artifactDigest = text(process.env.VALIDATED_ARTIFACT_DIGEST).toLowerCase();
const secretKey = text(process.env.STRIPE_SECRET_KEY);
const webhookSecret = text(process.env.STRIPE_WEBHOOK_SECRET);
const webhookUrl = text(process.env.STRIPE_WEBHOOK_URL);
const requireReplayProof = text(process.env.STRIPE_REQUIRE_REPLAY_PROOF).toLowerCase() === 'true';
const checkoutSessionId = text(process.env.STRIPE_LIVE_CHECKOUT_SESSION_ID);
const webhookEventId = text(process.env.STRIPE_LIVE_WEBHOOK_EVENT_ID);

if (process.env.GITHUB_ACTIONS !== 'true' || process.env.GITHUB_REF !== 'refs/heads/main') {
  fail('live Stripe proof may only run in the protected main workflow');
}
if (!/^[0-9a-f]{40}$/.test(commitSha) || !/^sha256:[a-f0-9]{64}$/.test(artifactDigest)) {
  fail('exact SHA and validated artifact digest are required');
}
if (!secretKey.startsWith('sk_live_')) fail('a live-mode Stripe secret binding is required');
if (!checkoutSessionId.startsWith('cs_live_') || !webhookEventId.startsWith('evt_')) {
  fail('live checkout session and webhook event IDs are required');
}
if (requireReplayProof && (!webhookSecret.startsWith('whsec_') || !/^https:\/\//.test(webhookUrl))) {
  fail('replay proof requires STRIPE_WEBHOOK_SECRET and an HTTPS STRIPE_WEBHOOK_URL');
}

async function stripeGet(resource) {
  const response = await fetch(`https://api.stripe.com/v1/${resource}`, {
    headers: { Authorization: `Bearer ${secretKey}` },
  });
  if (!response.ok) fail(`Stripe API rejected ${resource} with HTTP ${response.status}`);
  return response.json();
}

const session = await stripeGet(`checkout/sessions/${encodeURIComponent(checkoutSessionId)}`);
const event = await stripeGet(`events/${encodeURIComponent(webhookEventId)}`);
const observedAt = new Date().toISOString();
const eventAgeMs = Date.now() - Number(event.created || 0) * 1000;
if (
  session.livemode !== true ||
  session.payment_status !== 'paid' ||
  text(session.currency).toLowerCase() !== 'aed' ||
  Number(session.amount_total || 0) <= 0
) {
  fail('checkout session is not a successful live AED payment');
}
if (
  event.livemode !== true ||
  event.type !== 'checkout.session.completed' ||
  event.data?.object?.id !== checkoutSessionId ||
  eventAgeMs < 0 ||
  eventAgeMs > 72 * 60 * 60 * 1000
) {
  fail('webhook event is stale, incomplete, or mismatched');
}

if (!admin.apps.length) admin.initializeApp({ projectId: 'bin-group-57c60' });
const webhookRef = admin.firestore().collection('stripe_webhook_events').doc(webhookEventId);
const webhookSnap = await webhookRef.get();
const webhook = webhookSnap.data() || {};
const webhookAmountMinor = Number.isFinite(Number(webhook.amountMinor))
  ? Number(webhook.amountMinor)
  : Math.round(Number(webhook.amount || 0) * 100);
if (
  !webhookSnap.exists ||
  webhook.processed !== true ||
  webhook.processing === true ||
  webhook.ignored === true ||
  webhook.sessionId !== checkoutSessionId ||
  text(webhook.currency).toUpperCase() !== 'AED' ||
  webhookAmountMinor !== Number(session.amount_total)
) {
  fail('Firestore webhook evidence is missing, unprocessed, or does not match Stripe');
}

const webhookAttemptsBeforeReplay = Number(webhook.attempts || 0);
let webhookAttemptsAfterReplay = webhookAttemptsBeforeReplay;
let replayHttpStatus = null;
let replayDuplicate = false;
let duplicateReplaySafe = false;

if (requireReplayProof) {
  if (webhookAttemptsBeforeReplay !== 1) {
    fail(`exactly-once replay proof requires one initial webhook attempt, found ${webhookAttemptsBeforeReplay}`);
  }
  const payload = JSON.stringify(event);
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = crypto
    .createHmac('sha256', webhookSecret)
    .update(`${timestamp}.${payload}`, 'utf8')
    .digest('hex');
  const replayResponse = await fetch(webhookUrl, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'stripe-signature': `t=${timestamp},v1=${signature}`,
    },
    body: payload,
  });
  replayHttpStatus = replayResponse.status;
  let replayPayload = null;
  try { replayPayload = await replayResponse.json(); }
  catch { replayPayload = null; }
  replayDuplicate = replayPayload?.duplicate === true;
  if (replayHttpStatus !== 200 || !replayDuplicate) {
    fail(`duplicate webhook replay was not safely acknowledged: HTTP ${replayHttpStatus}`);
  }

  const deadline = Date.now() + 30_000;
  let replayWebhook = null;
  while (Date.now() < deadline) {
    const replaySnap = await webhookRef.get();
    replayWebhook = replaySnap.data() || {};
    webhookAttemptsAfterReplay = Number(replayWebhook.attempts || 0);
    if (replayWebhook.processed === true && replayWebhook.processing !== true) break;
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
  duplicateReplaySafe =
    webhookAttemptsAfterReplay === webhookAttemptsBeforeReplay &&
    replayWebhook?.processed === true &&
    replayWebhook?.ignored !== true &&
    replayWebhook?.sessionId === checkoutSessionId;
  if (!duplicateReplaySafe) fail('duplicate replay changed durable webhook processing state');
}

const proof = {
  schemaVersion: 1,
  status: 'passed',
  source: 'stripe-api-live-verifier',
  liveMode: true,
  commitSha,
  repository,
  workflowRunId,
  workflowRunAttempt,
  releaseId,
  validatedArtifactDigest: artifactDigest,
  checkoutSessionId,
  paymentIntentId: text(session.payment_intent),
  webhookEventId,
  webhookType: event.type,
  webhookPendingDeliveries: Number(event.pending_webhooks || 0),
  webhookProcessed: true,
  webhookAttemptsBeforeReplay,
  webhookAttemptsAfterReplay,
  replayHttpStatus,
  replayDuplicate,
  duplicateReplaySafe,
  amountMinor: Number(session.amount_total),
  currency: 'AED',
  observedAt,
  hardLaunchClaim: false,
};
const outputPath = path.resolve('launch_package/stripe-live-proof.json');
mkdirSync(path.dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(proof, null, 2)}\n`, { mode: 0o600 });
console.log(`[stripe-live-proof] PASS — live Stripe and webhook evidence bound to ${commitSha}`);
if (requireReplayProof) console.log('[stripe-live-proof] duplicate replay acknowledged without a second processing attempt');

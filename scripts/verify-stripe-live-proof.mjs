#!/usr/bin/env node

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
const webhookSnap = await admin.firestore().collection('stripe_webhook_events').doc(webhookEventId).get();
const webhook = webhookSnap.data() || {};
if (
  !webhookSnap.exists ||
  webhook.processed !== true ||
  webhook.processing === true ||
  webhook.ignored === true ||
  webhook.sessionId !== checkoutSessionId ||
  text(webhook.currency).toUpperCase() !== 'AED' ||
  (
    Number.isFinite(Number(webhook.amountMinor))
      ? Number(webhook.amountMinor)
      : Math.round(Number(webhook.amount || 0) * 100)
  ) !== Number(session.amount_total)
) {
  fail('Firestore webhook evidence is missing, unprocessed, or does not match Stripe');
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
  amountMinor: Number(session.amount_total),
  currency: 'AED',
  observedAt,
  hardLaunchClaim: false,
};
const outputPath = path.resolve('launch_package/stripe-live-proof.json');
mkdirSync(path.dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(proof, null, 2)}\n`, { mode: 0o600 });
console.log(`[stripe-live-proof] PASS — live Stripe and webhook evidence bound to ${commitSha}`);

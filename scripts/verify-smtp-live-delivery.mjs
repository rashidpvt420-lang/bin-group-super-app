#!/usr/bin/env node

import { randomUUID } from 'node:crypto';
import admin from 'firebase-admin';

if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();

const recipient = String(process.env.E2E_ADMIN_EMAIL || '').trim();
if (!recipient) {
  console.error('[smtp-live] E2E_ADMIN_EMAIL is required as the delivery recipient.');
  process.exit(1);
}

const runId = String(process.env.GITHUB_RUN_ID || 'local');
const commitSha = String(process.env.GITHUB_SHA || '').trim();
const mailId = `launch_smtp_${runId}_${randomUUID()}`;
const ref = db.collection('mail').doc(mailId);

await ref.set({
  to: [recipient],
  message: {
    subject: `BIN GROUP production SMTP proof ${runId}`,
    text: `Production SMTP verification for commit ${commitSha || 'unknown'}.`,
  },
  proof: {
    kind: 'production-smtp-live-delivery',
    workflowRunId: runId,
    commitSha: commitSha || null,
  },
  createdAt: admin.firestore.FieldValue.serverTimestamp(),
});

const deadline = Date.now() + 120_000;
while (Date.now() < deadline) {
  await new Promise((resolve) => setTimeout(resolve, 5_000));
  const snapshot = await ref.get();
  const data = snapshot.data() || {};
  const state = String(data.delivery?.state || '').toUpperCase();
  if (state === 'SUCCESS') {
    const messageId = String(data.delivery?.messageId || '').trim();
    if (!messageId) {
      console.error('[smtp-live] delivery marked SUCCESS without provider messageId.');
      process.exit(1);
    }
    console.log(`[smtp-live] PASS mailId=${mailId} providerMessageId=${messageId}`);
    process.exit(0);
  }
  if (state === 'ERROR') {
    console.error(`[smtp-live] FAIL ${String(data.delivery?.error || 'unknown delivery error')}`);
    process.exit(1);
  }
}

console.error(`[smtp-live] FAIL timed out waiting for delivery confirmation for ${mailId}`);
process.exit(1);

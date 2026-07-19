#!/usr/bin/env node

import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import admin from 'firebase-admin';
import { initializeFirebaseAdmin, resolveFirebaseAdminProjectId } from './firebase-admin-bootstrap.mjs';

const PROJECT_ID = 'bin-group-57c60';
const BRANDED_FROM = 'BIN GROUP <ceo@bin-groups.com>';
const BRANDED_REPLY_TO = 'BIN GROUP Admin <ceo@bin-groups.com>';
const text = (value) => String(value ?? '').trim();
const asArray = (value) => Array.isArray(value) ? value.map((item) => text(item)).filter(Boolean) : [];
const timestampIso = (value) => {
  if (!value) return '';
  if (typeof value?.toDate === 'function') return value.toDate().toISOString();
  const parsed = Date.parse(String(value));
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : '';
};
const fail = (message) => {
  console.error(`[smtp-live] FAIL ${message}`);
  process.exit(1);
};

const recipient = text(process.env.E2E_ADMIN_EMAIL);
if (!recipient) fail('E2E_ADMIN_EMAIL is required as the delivery recipient.');

const projectId = resolveFirebaseAdminProjectId();
if (projectId !== PROJECT_ID) fail(`unexpected Firebase project: ${projectId}`);
initializeFirebaseAdmin(admin, projectId);
const db = admin.firestore();

const runId = text(process.env.GITHUB_RUN_ID || 'local');
const commitSha = text(process.env.GITHUB_SHA);
if (process.env.GITHUB_ACTIONS === 'true') {
  if (process.env.GITHUB_REF !== 'refs/heads/main') fail('GitHub Actions SMTP proof requires refs/heads/main.');
  if (!/^[0-9a-f]{40}$/.test(commitSha) || !/^\d+$/.test(runId)) fail('exact commit SHA and numeric run ID are required.');
}

const mailId = `launch_smtp_${runId}_${randomUUID()}`;
const ref = db.collection('mail').doc(mailId);
await ref.set({
  to: [recipient],
  message: {
    from: BRANDED_FROM,
    replyTo: BRANDED_REPLY_TO,
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
  const delivery = data.delivery || {};
  const state = text(delivery.state).toUpperCase();
  if (state === 'SUCCESS') {
    const providerMessageId = text(delivery.messageId);
    const from = text(delivery.from);
    const replyTo = text(delivery.replyTo);
    const accepted = asArray(delivery.accepted);
    const rejected = asArray(delivery.rejected);
    const observedAt = timestampIso(delivery.deliveredAt) || new Date().toISOString();
    if (!providerMessageId) fail('delivery marked SUCCESS without provider messageId.');
    if (from !== BRANDED_FROM || replyTo !== BRANDED_REPLY_TO) fail('provider delivery did not preserve the approved BIN GROUP sender identity.');
    if (!accepted.map((item) => item.toLowerCase()).includes(recipient.toLowerCase())) fail('SMTP provider did not accept the intended recipient.');
    if (rejected.length !== 0) fail('SMTP provider rejected one or more recipients.');

    const proof = {
      schemaVersion: 1,
      status: 'passed',
      source: 'cloud-function-smtp-live-verifier',
      commitSha,
      projectId,
      workflowRunId: runId,
      mailId,
      providerMessageId,
      deliveryState: state,
      from,
      replyTo,
      acceptedCount: accepted.length,
      rejectedCount: rejected.length,
      observedAt,
      hardLaunchClaim: false,
    };
    const outputPath = path.resolve('launch_package/smtp-live-proof.json');
    mkdirSync(path.dirname(outputPath), { recursive: true });
    writeFileSync(outputPath, `${JSON.stringify(proof, null, 2)}\n`, { mode: 0o600 });
    console.log(`[smtp-live] PASS mailId=${mailId} providerMessageId=${providerMessageId}`);
    console.log(`[smtp-live] wrote ${outputPath}`);
    process.exit(0);
  }
  if (state === 'ERROR') fail(text(delivery.error || 'unknown delivery error'));
}

fail(`timed out waiting for delivery confirmation for ${mailId}`);

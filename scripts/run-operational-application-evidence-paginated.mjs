#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sourcePath = path.join(__dirname, 'verify-operational-application-evidence.mjs');
const temporaryPath = path.join(
  __dirname,
  `.verify-operational-application-evidence-paginated-${process.pid}-${randomUUID()}.mjs`,
);

const fail = (message) => {
  console.error(`[operational-application-evidence-pagination] FAIL — ${message}`);
  process.exit(1);
};

if (
  !process.argv.includes('--prepare-in-place') ||
  process.env.GITHUB_ACTIONS !== 'true' ||
  process.env.GITHUB_REF !== 'refs/heads/main' ||
  process.env.GITHUB_WORKFLOW !== 'Operational Application Evidence' ||
  process.env.GITHUB_JOB !== 'verify-and-publish'
) {
  fail('in-place evidence preparation requires the protected exact-main operational evidence workflow');
}
if (!existsSync(sourcePath)) fail(`source verifier is missing: ${sourcePath}`);
let source = readFileSync(sourcePath, 'utf8');

function replaceExactlyOnce(before, after, label) {
  const first = source.indexOf(before);
  if (first < 0 || source.indexOf(before, first + before.length) >= 0) {
    fail(`${label} no longer matches the reviewed source exactly once`);
  }
  source = source.replace(before, after);
}

function replaceExactCount(before, after, expectedCount, label) {
  const occurrences = source.split(before).length - 1;
  if (occurrences !== expectedCount) {
    fail(`${label} expected ${expectedCount} reviewed matches but found ${occurrences}`);
  }
  source = source.split(before).join(after);
}

replaceExactlyOnce(
  "import { initializeFirebaseAdmin, resolveFirebaseAdminProjectId } from './firebase-admin-bootstrap.mjs';",
  "import { initializeFirebaseAdmin, resolveFirebaseAdminProjectId } from './firebase-admin-bootstrap.mjs';\nimport { signInWithRequiredTotpMfa } from './lib/firebase-mfa-sign-in.mjs';",
  'Founder MFA helper import',
);
replaceExactlyOnce(
  "const APPLICATION_PROOF_PATH = 'launch_package/application-proof.json';",
  "const APPLICATION_PROOF_PATH = 'launch_package/application-proof.json';\nconst PAGE_SIZE = 250;",
  'page-size insertion',
);
replaceExactlyOnce(
  `const sortedResults = (snapshot, fields) => snapshot.docs
  .map(docResult)`,
  `const sortedResults = (documents, fields) => documents
  .map(docResult)`,
  'document sorting helper',
);
replaceExactlyOnce(
  'const db = admin.firestore();',
  `const db = admin.firestore();

async function readAllMatchingDocuments(baseQuery) {
  const documents = [];
  let cursor = null;
  for (;;) {
    let pageQuery = baseQuery
      .orderBy(admin.firestore.FieldPath.documentId())
      .limit(PAGE_SIZE);
    if (cursor) pageQuery = pageQuery.startAfter(cursor);
    const page = await pageQuery.get();
    documents.push(...page.docs);
    if (page.size < PAGE_SIZE) return documents;
    cursor = page.docs[page.docs.length - 1];
  }
}

async function readAllMatchingSnapshot(baseQuery) {
  const docs = await readAllMatchingDocuments(baseQuery);
  return { docs, size: docs.length };
}`,
  'paginated Firestore readers',
);

const originalSignIn = `async function signInAdminWithAppCheck() {
  const apiKey = text(process.env.VITE_FIREBASE_API_KEY);
  const appId = text(process.env.VITE_FIREBASE_APP_ID);
  const debugToken = text(process.env.VITE_FIREBASE_APPCHECK_DEBUG_TOKEN);
  const email = text(process.env.E2E_ADMIN_EMAIL).toLowerCase();
  const password = text(process.env.E2E_ADMIN_PASSWORD);
  if (!apiKey || !appId || !debugToken || !email || !password) fail('Firebase Auth and App Check protected bindings are incomplete');

  const signInEndpoint = new URL('https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword');
  signInEndpoint.searchParams.set('key', apiKey);
  const signInResponse = await fetch(signInEndpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json', Referer: 'https://admin.bin-groups.com/' },
    body: JSON.stringify({ email, password, returnSecureToken: true }),
  });
  const signInPayload = await responseJson(signInResponse);
  if (!signInResponse.ok || !text(signInPayload?.idToken) || !text(signInPayload?.localId)) {
    fail(\`Firebase Admin sign-in failed with HTTP \${signInResponse.status}\`);
  }

  const exchangeEndpoint = new URL(
    \`https://content-firebaseappcheck.googleapis.com/v1/projects/\${PROJECT_ID}/apps/\${encodeURIComponent(appId)}:exchangeDebugToken\`,
  );
  exchangeEndpoint.searchParams.set('key', apiKey);
  const exchangeResponse = await fetch(exchangeEndpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json', Referer: 'https://admin.bin-groups.com/' },
    body: JSON.stringify({ debugToken }),
  });
  const exchangePayload = await responseJson(exchangeResponse);
  if (!exchangeResponse.ok || !text(exchangePayload?.token)) {
    fail(\`App Check token exchange failed with HTTP \${exchangeResponse.status}\`);
  }
  return {
    idToken: text(signInPayload.idToken),
    appCheckToken: text(exchangePayload.token),
    uid: text(signInPayload.localId),
  };
}`;

const hardenedSignIn = `async function signInAdminWithAppCheck() {
  const apiKey = text(process.env.VITE_FIREBASE_API_KEY);
  const appId = text(process.env.VITE_FIREBASE_APP_ID);
  const debugToken = text(process.env.VITE_FIREBASE_APPCHECK_DEBUG_TOKEN);
  const email = text(process.env.E2E_FOUNDER_EMAIL).toLowerCase();
  const password = text(process.env.E2E_FOUNDER_PASSWORD);
  const totpSecret = text(process.env.E2E_FOUNDER_TOTP_SECRET);
  if (!apiKey || !appId || !debugToken || email !== 'ceo@bin-groups.com' || !password || !totpSecret) {
    fail('Canonical Founder Auth, TOTP, and App Check protected bindings are incomplete');
  }

  let founderAuth;
  try {
    founderAuth = await signInWithRequiredTotpMfa({
      apiKey,
      email,
      password,
      totpSecret,
      referer: 'https://admin.bin-groups.com/',
    });
  } catch (error) {
    fail(error instanceof Error ? error.message : 'Founder MFA sign-in failed');
  }

  const exchangeEndpoint = new URL(
    \`https://content-firebaseappcheck.googleapis.com/v1/projects/\${PROJECT_ID}/apps/\${encodeURIComponent(appId)}:exchangeDebugToken\`,
  );
  exchangeEndpoint.searchParams.set('key', apiKey);
  const exchangeResponse = await fetch(exchangeEndpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json', Referer: 'https://admin.bin-groups.com/' },
    body: JSON.stringify({ debugToken }),
  });
  const exchangePayload = await responseJson(exchangeResponse);
  if (!exchangeResponse.ok || !text(exchangePayload?.token)) {
    fail(\`App Check token exchange failed with HTTP \${exchangeResponse.status}\`);
  }
  return {
    idToken: founderAuth.idToken,
    appCheckToken: text(exchangePayload.token),
    uid: founderAuth.uid,
    secondFactorIdentifier: founderAuth.secondFactorIdentifier,
  };
}`;
replaceExactlyOnce(originalSignIn, hardenedSignIn, 'Founder TOTP and App Check sign-in');
replaceExactlyOnce(
  'return { replayActorUidHash: sha256(auth.uid), responseStatus: replayResponse.status };',
  `return {
    replayActorUidHash: sha256(auth.uid),
    responseStatus: replayResponse.status,
    secondFactorHash: sha256(auth.secondFactorIdentifier),
  };`,
  'verified TOTP factor evidence hash',
);

const selectorReplacements = [
  [
    "const snapshot = await db.collection('payment_transactions').where('status', '==', 'APPROVED').limit(100).get();\n  const candidates = sortedResults(snapshot, ['approvedAt', 'updatedAt', 'createdAt']);",
    "const documents = await readAllMatchingDocuments(db.collection('payment_transactions').where('status', '==', 'APPROVED'));\n  const candidates = sortedResults(documents, ['approvedAt', 'updatedAt', 'createdAt']);",
    'approved-payment selector',
  ],
  [
    "const snapshot = await db.collection('notifications').where('pushDeliveryState', '==', 'SUCCESS').limit(100).get();\n  const candidates = sortedResults(snapshot, ['pushAttemptedAt', 'updatedAt', 'createdAt']);",
    "const documents = await readAllMatchingDocuments(db.collection('notifications').where('pushDeliveryState', '==', 'SUCCESS'));\n  const candidates = sortedResults(documents, ['pushAttemptedAt', 'updatedAt', 'createdAt']);",
    'notification selector',
  ],
  [
    "const snapshot = await db.collection('broker_commissions').limit(100).get();\n  const candidates = sortedResults(snapshot, ['createdAt', 'updatedAt']);",
    "const documents = await readAllMatchingDocuments(db.collection('broker_commissions'));\n  const candidates = sortedResults(documents, ['createdAt', 'updatedAt']);",
    'Broker commission selector',
  ],
  [
    "const snapshot = await db.collection('audit_logs').where('action', '==', 'ADMIN_CREATE_STAFF_USER').limit(100).get();\n  const candidates = sortedResults(snapshot, ['createdAt', 'timestamp']);",
    "const documents = await readAllMatchingDocuments(db.collection('audit_logs').where('action', '==', 'ADMIN_CREATE_STAFF_USER'));\n  const candidates = sortedResults(documents, ['createdAt', 'timestamp']);",
    'staff-audit selector',
  ],
  [
    "const snapshot = await db.collection('contract_renewal_watch').limit(100).get();\n  const candidates = sortedResults(snapshot, ['generatedAt', 'updatedAt', 'createdAt']);",
    "const documents = await readAllMatchingDocuments(db.collection('contract_renewal_watch'));\n  const candidates = sortedResults(documents, ['generatedAt', 'updatedAt', 'createdAt']);",
    'renewal-watch selector',
  ],
];
for (const [before, after, label] of selectorReplacements) replaceExactlyOnce(before, after, label);

replaceExactlyOnce(
  "db.collection('properties').where('intakeId', '==', bindings.intakeId).limit(100).get(),",
  "readAllMatchingSnapshot(db.collection('properties').where('intakeId', '==', bindings.intakeId)),",
  'Owner property count query',
);
replaceExactCount(
  "db.collection('invoices').where('paymentId', '==', bindings.paymentId).limit(20).get(),",
  "readAllMatchingSnapshot(db.collection('invoices').where('paymentId', '==', bindings.paymentId)),",
  2,
  'payment invoice exactly-once queries',
);
replaceExactCount(
  "db.collection('audit_logs').where('paymentId', '==', bindings.paymentId).limit(100).get(),",
  "readAllMatchingSnapshot(db.collection('audit_logs').where('paymentId', '==', bindings.paymentId)),",
  2,
  'payment audit exactly-once queries',
);
replaceExactCount(
  "db.collection('broker_commissions').where('contractId', '==', contractId).limit(20).get()",
  "readAllMatchingSnapshot(db.collection('broker_commissions').where('contractId', '==', contractId))",
  2,
  'commission exactly-once queries',
);
replaceExactlyOnce(
  "db.collection('audit_logs').where('targetId', '==', staffUid).limit(100).get(),",
  "readAllMatchingSnapshot(db.collection('audit_logs').where('targetId', '==', staffUid)),",
  'staff creation audit count query',
);

const forbidden = [
  ...selectorReplacements.map(([before]) => before),
  'process.env.E2E_ADMIN_EMAIL',
  'process.env.E2E_ADMIN_PASSWORD',
  ".limit(100).get()",
  ".limit(20).get()",
  'sha256(auth.secondFactor)',
];
for (const fragment of forbidden) {
  if (source.includes(fragment)) fail(`a reviewed obsolete evidence path survived hardening: ${fragment}`);
}
for (const required of [
  'signInWithRequiredTotpMfa',
  "email !== 'ceo@bin-groups.com'",
  'const PAGE_SIZE = 250;',
  'async function readAllMatchingDocuments(baseQuery)',
  'async function readAllMatchingSnapshot(baseQuery)',
  'FieldPath.documentId()',
  'startAfter(cursor)',
  'secondFactorIdentifier: founderAuth.secondFactorIdentifier,',
  'secondFactorHash: sha256(auth.secondFactorIdentifier),',
  "readAllMatchingDocuments(db.collection('payment_transactions')",
  "readAllMatchingDocuments(db.collection('notifications')",
  "readAllMatchingDocuments(db.collection('broker_commissions')",
  "readAllMatchingDocuments(db.collection('audit_logs')",
  "readAllMatchingDocuments(db.collection('contract_renewal_watch')",
  "readAllMatchingSnapshot(db.collection('properties')",
  "readAllMatchingSnapshot(db.collection('invoices')",
  "readAllMatchingSnapshot(db.collection('audit_logs').where('paymentId'",
  "readAllMatchingSnapshot(db.collection('broker_commissions').where('contractId'",
  "readAllMatchingSnapshot(db.collection('audit_logs').where('targetId'",
]) {
  if (!source.includes(required)) fail(`transformed verifier is missing required control: ${required}`);
}

try {
  writeFileSync(temporaryPath, source, { mode: 0o600 });
  const syntax = spawnSync(process.execPath, ['--check', temporaryPath], { encoding: 'utf8' });
  if ((syntax.status ?? 1) !== 0) {
    fail(`transformed verifier failed Node syntax validation: ${String(syntax.stderr || syntax.stdout || '').slice(0, 1000)}`);
  }
  renameSync(temporaryPath, sourcePath);
} finally {
  rmSync(temporaryPath, { force: true });
}
console.log('[operational-application-evidence-pagination] PASS — canonical verifier prepared with complete pagination and Founder TOTP');

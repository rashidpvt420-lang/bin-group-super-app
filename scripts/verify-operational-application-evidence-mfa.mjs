#!/usr/bin/env node

import crypto, { randomUUID } from 'node:crypto';
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { signInWithRequiredTotpMfa } from './lib/firebase-mfa-sign-in.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SOURCE_PATH = path.join(__dirname, 'verify-operational-application-evidence.mjs');
const TEMPORARY_PATH = path.join(
  __dirname,
  `.verify-operational-application-evidence-mfa-${process.pid}-${randomUUID()}.mjs`,
);
const PROOF_PATH = 'launch_package/application-proof.json';
const PAGE_SIZE = 250;
const MFA_REPLAY_GATES = new Set(['paymentUnlockExactlyOnce', 'brokerCommissionLockExactlyOnce']);
const text = (value) => String(value ?? '').trim();
const sha256 = (value) => crypto.createHash('sha256').update(String(value)).digest('hex');

const founderEmail = text(process.env.E2E_FOUNDER_EMAIL).toLowerCase();
const founderPassword = text(process.env.E2E_FOUNDER_PASSWORD);
const founderTotpSecret = text(process.env.E2E_FOUNDER_TOTP_SECRET);
const apiKey = text(process.env.VITE_FIREBASE_API_KEY);
const gate = text(process.env.OPERATIONAL_GATE);

if (founderEmail !== 'ceo@bin-groups.com' || !founderPassword || !founderTotpSecret || !apiKey) {
  throw new Error('Canonical Founder email, password, TOTP secret, and Firebase API key are required.');
}
if (!existsSync(SOURCE_PATH)) {
  throw new Error(`Operational application verifier is missing: ${SOURCE_PATH}`);
}

let source = readFileSync(SOURCE_PATH, 'utf8');
function replaceExactlyOnce(before, after, label) {
  const first = source.indexOf(before);
  if (first < 0 || source.indexOf(before, first + before.length) >= 0) {
    throw new Error(`${label} no longer matches the reviewed operational verifier exactly once.`);
  }
  source = source.replace(before, after);
}

replaceExactlyOnce(
  "const APPLICATION_PROOF_PATH = 'launch_package/application-proof.json';",
  `const APPLICATION_PROOF_PATH = 'launch_package/application-proof.json';\nconst PAGE_SIZE = ${PAGE_SIZE};`,
  'pagination page-size insertion',
);
replaceExactlyOnce(
  `const sortedResults = (snapshot, fields) => snapshot.docs
  .map(docResult)`,
  `const sortedResults = (documents, fields) => documents
  .map(docResult)`,
  'paginated result sorting',
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
}`,
  'paginated Firestore reader',
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
for (const [before] of selectorReplacements) {
  if (source.includes(before)) throw new Error('An unpaginated operational selector survived source hardening.');
}
for (const required of [
  'const PAGE_SIZE = 250;',
  'async function readAllMatchingDocuments(baseQuery)',
  'FieldPath.documentId()',
  'startAfter(cursor)',
]) {
  if (!source.includes(required)) throw new Error(`Operational verifier is missing required pagination control: ${required}`);
}

const originalFetch = globalThis.fetch;
if (typeof originalFetch !== 'function') throw new Error('Node fetch is required for protected operational evidence.');
let verifiedMfa = null;

globalThis.fetch = async (input, init = {}) => {
  const url = input instanceof URL ? input.href : String(input?.url || input || '');
  if (!/identitytoolkit\.googleapis\.com\/v1\/accounts:signInWithPassword/.test(url)) {
    return originalFetch(input, init);
  }

  let requestBody;
  try {
    requestBody = JSON.parse(String(init?.body || '{}'));
  } catch {
    throw new Error('Operational Firebase sign-in request body is malformed.');
  }
  if (text(requestBody?.email).toLowerCase() !== founderEmail || text(requestBody?.password) !== founderPassword) {
    throw new Error('Operational finance replay attempted to use a non-Founder credential.');
  }

  verifiedMfa = await signInWithRequiredTotpMfa({
    apiKey,
    email: founderEmail,
    password: founderPassword,
    totpSecret: founderTotpSecret,
    referer: 'https://admin.bin-groups.com/',
    fetchImpl: originalFetch,
  });

  return new Response(JSON.stringify({
    idToken: verifiedMfa.idToken,
    localId: verifiedMfa.uid,
    registered: true,
  }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
};

process.env.E2E_ADMIN_EMAIL = founderEmail;
process.env.E2E_ADMIN_PASSWORD = founderPassword;
writeFileSync(TEMPORARY_PATH, source, { mode: 0o600 });
try {
  await import(`${pathToFileURL(TEMPORARY_PATH).href}?run=${randomUUID()}`);
} finally {
  globalThis.fetch = originalFetch;
  rmSync(TEMPORARY_PATH, { force: true });
}

if (MFA_REPLAY_GATES.has(gate)) {
  if (
    !verifiedMfa?.uid ||
    verifiedMfa.secondFactorType !== 'totp' ||
    !verifiedMfa.secondFactorIdentifier
  ) {
    throw new Error(`${gate} completed without a verified Firebase TOTP factor identity.`);
  }
  if (!existsSync(PROOF_PATH)) throw new Error(`${PROOF_PATH} is missing after operational evidence verification.`);
  const proof = JSON.parse(readFileSync(PROOF_PATH, 'utf8'));
  if (proof?.status !== 'passed' || proof?.gate !== gate || !proof?.evidence) {
    throw new Error('Operational application proof is malformed or bound to another gate.');
  }
  proof.evidence.replayMfaVerified = true;
  proof.evidence.replayMfaFactorType = 'totp';
  proof.evidence.replayActorUidHash = sha256(verifiedMfa.uid);
  proof.evidence.replaySecondFactorHash = sha256(verifiedMfa.secondFactorIdentifier);
  proof.evidence.applicationSelectorPagination = { pageSize: PAGE_SIZE, completeScan: true };
  writeFileSync(PROOF_PATH, `${JSON.stringify(proof, null, 2)}\n`, { mode: 0o600 });
  console.log(`[operational-application-evidence-mfa] PASS gate=${gate} founderTotp=true paginated=true`);
}

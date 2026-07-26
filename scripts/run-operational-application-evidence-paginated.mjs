#!/usr/bin/env node

import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
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

if (!existsSync(sourcePath)) fail(`source verifier is missing: ${sourcePath}`);
let source = readFileSync(sourcePath, 'utf8');

function replaceExactlyOnce(before, after, label) {
  const first = source.indexOf(before);
  if (first < 0 || source.indexOf(before, first + before.length) >= 0) {
    fail(`${label} no longer matches the reviewed source exactly once`);
  }
  source = source.replace(before, after);
}

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

for (const [before, after, label] of selectorReplacements) {
  replaceExactlyOnce(before, after, label);
}

for (const forbidden of selectorReplacements.map(([before]) => before)) {
  if (source.includes(forbidden)) fail('a reviewed limit(100) selector survived pagination hardening');
}
for (const required of [
  'const PAGE_SIZE = 250;',
  'async function readAllMatchingDocuments(baseQuery)',
  'FieldPath.documentId()',
  'startAfter(cursor)',
  "readAllMatchingDocuments(db.collection('payment_transactions')",
  "readAllMatchingDocuments(db.collection('notifications')",
  "readAllMatchingDocuments(db.collection('broker_commissions')",
  "readAllMatchingDocuments(db.collection('audit_logs')",
  "readAllMatchingDocuments(db.collection('contract_renewal_watch')",
]) {
  if (!source.includes(required)) fail(`transformed verifier is missing required pagination control: ${required}`);
}

writeFileSync(temporaryPath, source, { mode: 0o600 });
try {
  const result = spawnSync(process.execPath, [temporaryPath], {
    cwd: process.cwd(),
    env: process.env,
    stdio: 'inherit',
  });
  process.exitCode = result.status ?? 1;
} finally {
  rmSync(temporaryPath, { force: true });
}

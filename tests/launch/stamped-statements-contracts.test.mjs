// Official stamped statements & contracts (#1880): source guards.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

// Fixed allowlist of literal repo paths (no dynamic path construction).
const SOURCES = {
  'firestore.rules': new URL('../../firestore.rules', import.meta.url),
  'functions/companySeal.ts': new URL('../../functions/companySeal.ts', import.meta.url),
  'functions/moneyStatements.ts': new URL('../../functions/moneyStatements.ts', import.meta.url),
  'functions/pdfEngine.ts': new URL('../../functions/pdfEngine.ts', import.meta.url),
  'functions/runtime.ts': new URL('../../functions/runtime.ts', import.meta.url),
  'src/App.tsx': new URL('../../src/App.tsx', import.meta.url),
  'src/broker/pages/BrokerCommissionsPage.tsx': new URL('../../src/broker/pages/BrokerCommissionsPage.tsx', import.meta.url),
  'src/components/DocumentCenterCard.tsx': new URL('../../src/components/DocumentCenterCard.tsx', import.meta.url),
  'src/components/MoneyStatementDownload.tsx': new URL('../../src/components/MoneyStatementDownload.tsx', import.meta.url),
  'src/pages/OwnerMoneyControlPage.tsx': new URL('../../src/pages/OwnerMoneyControlPage.tsx', import.meta.url),
  'src/pages/public/DocumentVerificationPage.tsx': new URL('../../src/pages/public/DocumentVerificationPage.tsx', import.meta.url),
  'src/components/ContractDigitalSignature.tsx': new URL('../../src/components/ContractDigitalSignature.tsx', import.meta.url),
  'apps/owner-app/src/components/ContractDigitalSignature.tsx': new URL('../../apps/owner-app/src/components/ContractDigitalSignature.tsx', import.meta.url),
  'src/owner/pages/OwnerSimpleDashboardPage.tsx': new URL('../../src/owner/pages/OwnerSimpleDashboardPage.tsx', import.meta.url),
  'src/tenant/pages/TenantSimpleDashboardPage.tsx': new URL('../../src/tenant/pages/TenantSimpleDashboardPage.tsx', import.meta.url),
  'src/technician/pages/TechnicianSimpleDashboardPage.tsx': new URL('../../src/technician/pages/TechnicianSimpleDashboardPage.tsx', import.meta.url),
  'src/broker/pages/BrokerSimpleDashboardPage.tsx': new URL('../../src/broker/pages/BrokerSimpleDashboardPage.tsx', import.meta.url),
};
const read = (key) => {
  const url = SOURCES[key];
  if (!url) throw new Error(`unlisted source ${key}`);
  return fs.readFileSync(url, 'utf8');
};

test('statement callable uses only the caller uid, App Check and active-account checks', () => {
  const src = read('functions/moneyStatements.ts');
  assert.match(src, /onCall\(\{[^}]*enforceAppCheck: true/);
  assert.match(src, /const uid = request\.auth\?\.uid;/);
  assert.doesNotMatch(src, /request\.data\?\.(uid|ownerId|userId|accountId|email)/);
  assert.match(src, /assertActiveAccount\(uid/);
  assert.match(src, /registerIssuedDocument\(/);
});

test('seal is server-only, configurable and marked "Digitally issued"', () => {
  const src = read('functions/companySeal.ts');
  assert.match(src, /sealLabel: "Digitally issued"/);
  assert.match(src, /stampImageFile: null/);
  assert.match(src, /signatoryName:/);
  assert.match(src, /verifyIssuedDocument = onCall\(\{[^}]*enforceAppCheck: true/);
  assert.doesNotMatch(src, /Math\.random/);
  const runtime = read('functions/runtime.ts');
  assert.match(runtime, /export \* from "\.\/companySeal"/);
  assert.match(runtime, /export \* from "\.\/moneyStatements"/);
});

test('server contract PDF carries the seal, signatory and QR', () => {
  const src = read('functions/pdfEngine.ts');
  assert.match(src, /drawCompanySeal\(doc, 345, y/);
  assert.match(src, /drawVerificationQr\(doc, verificationUrl\(verificationId\)/);
  assert.match(src, /documentType: 'owner_service_agreement'/);
});

test('phone no longer makes contract PDFs or fake hashes', () => {
  for (const p of ['src/components/ContractDigitalSignature.tsx', 'apps/owner-app/src/components/ContractDigitalSignature.tsx']) {
    const src = read(p);
    assert.doesNotMatch(src, /Math\.random/);
    assert.doesNotMatch(src, /jsPDF|doc\.save\(/);
  }
  const card = read('src/components/DocumentCenterCard.tsx');
  assert.match(card, /Download official copy/);
  assert.match(card, /isOfficialContract/);
});

test('statement buttons are wired for owner, tenant, technician and broker', () => {
  for (const p of ['src/owner/pages/OwnerSimpleDashboardPage.tsx', 'src/tenant/pages/TenantSimpleDashboardPage.tsx', 'src/technician/pages/TechnicianSimpleDashboardPage.tsx', 'src/broker/pages/BrokerSimpleDashboardPage.tsx']) {
    assert.match(read(p), /<MoneyStatementDownload \/>/, p);
  }
  assert.match(read('src/pages/OwnerMoneyControlPage.tsx'), /onClick=\{\(\) => setShowStatement/);
  const broker = read('src/broker/pages/BrokerCommissionsPage.tsx');
  assert.doesNotMatch(broker, /jsPDF/);
  assert.match(broker, /MoneyStatementDownload/);
  assert.match(read('src/components/MoneyStatementDownload.tsx'), /'generateMyMoneyStatement'/);
});

test('public verification page and rules', () => {
  const app = read('src/App.tsx');
  assert.match(app, /path="\/verify\/document\/:id"/);
  assert.match(read('src/pages/public/DocumentVerificationPage.tsx'), /'verifyIssuedDocument'/);
  const rules = read('firestore.rules');
  assert.match(rules, /match \/issued_document_registry\/\{documentId\} \{\s*allow read: if isAdmin\(\);\s*allow create, update, delete: if false;/);
  assert.equal((rules.match(/'issued_document_registry',/g) || []).length, 2);
  assert.equal((rules.match(/'money_statement_rate_limits',/g) || []).length, 2);
});

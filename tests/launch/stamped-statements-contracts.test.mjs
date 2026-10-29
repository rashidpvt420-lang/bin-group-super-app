// Official stamped statements & contracts (#1880): source guards.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

// Fixed allowlist of literal repo paths (no dynamic path construction).
const SOURCES = {
  'firestore.rules': fs.readFileSync('firestore.rules', 'utf8'),
  'functions/companySeal.ts': fs.readFileSync('functions/companySeal.ts', 'utf8'),
  'functions/moneyStatements.ts': fs.readFileSync('functions/moneyStatements.ts', 'utf8'),
  'functions/pdfEngine.ts': fs.readFileSync('functions/pdfEngine.ts', 'utf8'),
  'functions/runtime.ts': fs.readFileSync('functions/runtime.ts', 'utf8'),
  'src/App.tsx': fs.readFileSync('src/App.tsx', 'utf8'),
  'src/broker/pages/BrokerCommissionsPage.tsx': fs.readFileSync('src/broker/pages/BrokerCommissionsPage.tsx', 'utf8'),
  'src/components/DocumentCenterCard.tsx': fs.readFileSync('src/components/DocumentCenterCard.tsx', 'utf8'),
  'src/components/MoneyStatementDownload.tsx': fs.readFileSync('src/components/MoneyStatementDownload.tsx', 'utf8'),
  'src/pages/OwnerMoneyControlPage.tsx': fs.readFileSync('src/pages/OwnerMoneyControlPage.tsx', 'utf8'),
  'src/pages/public/DocumentVerificationPage.tsx': fs.readFileSync('src/pages/public/DocumentVerificationPage.tsx', 'utf8'),
  'src/components/ContractDigitalSignature.tsx': fs.readFileSync('src/components/ContractDigitalSignature.tsx', 'utf8'),
  'apps/owner-app/src/components/ContractDigitalSignature.tsx': fs.readFileSync('apps/owner-app/src/components/ContractDigitalSignature.tsx', 'utf8'),
  'src/owner/pages/OwnerSimpleDashboardPage.tsx': fs.readFileSync('src/owner/pages/OwnerSimpleDashboardPage.tsx', 'utf8'),
  'src/tenant/pages/TenantSimpleDashboardPage.tsx': fs.readFileSync('src/tenant/pages/TenantSimpleDashboardPage.tsx', 'utf8'),
  'src/technician/pages/TechnicianSimpleDashboardPage.tsx': fs.readFileSync('src/technician/pages/TechnicianSimpleDashboardPage.tsx', 'utf8'),
  'src/broker/pages/BrokerSimpleDashboardPage.tsx': fs.readFileSync('src/broker/pages/BrokerSimpleDashboardPage.tsx', 'utf8'),
};
const read = (key) => {
  const src = SOURCES[key];
  if (src === undefined) throw new Error(`unlisted source ${key}`);
  return src;
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

'use strict';
// Owner-flow documents must show the amounts the server locked, exact to the fils, and the
// bilingual invoice must render its Arabic labels. EMU repro (audit/emu/owner-flow, r2): the
// contract PDF printed "AED 62,420 / AED 9,363" and the PAID invoice "AED 9,363" for a locked
// ACV 62,420.27 / deposit 9,363.04, and the invoice's Arabic labels were garbage glyphs
// (no Arabic-capable font registered).
const assert = require('node:assert/strict');
const test = require('node:test');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { admin, lib } = require('./_setup.cjs');

// The Storage emulator cannot sign URLs (no service-account credentials); stub signing only.
const storageModule = require(require.resolve('@google-cloud/storage', { paths: [path.join(__dirname, '..', '..', 'functions')] }));
const originalGetSignedUrl = storageModule.File.prototype.getSignedUrl;
storageModule.File.prototype.getSignedUrl = async function stubbedSignedUrl() {
  return [`https://storage.example.invalid/${encodeURIComponent(this.name)}?signed=1`];
};
test.after(() => { storageModule.File.prototype.getSignedUrl = originalGetSignedUrl; });

const { generateMobilizationInvoicePdfArtifact, generateContractPdfArtifact } = lib('pdfEngine.js');
let hasPdftotext = true;
try { execFileSync('pdftotext', ['-v'], { stdio: 'ignore' }); } catch { hasPdftotext = false; }

async function textOf(storagePath) {
  const [bytes] = await admin.storage().bucket().file(storagePath).download();
  const file = path.join(os.tmpdir(), `doc_${crypto.randomUUID()}.pdf`);
  fs.writeFileSync(file, bytes);
  try { return execFileSync('pdftotext', ['-layout', file, '-'], { encoding: 'utf8' }); } finally { fs.rmSync(file, { force: true }); }
}

test('PAID mobilisation invoice shows the exact locked amount and real Arabic text', { skip: !hasPdftotext && 'pdftotext not installed' }, async () => {
  const artifact = await generateMobilizationInvoicePdfArtifact({
    invoiceId: 'MOB-TEST-0001', paymentId: 'pay_doc', contractId: 'contract_doc', ownerId: 'owner_doc',
    amount: 9363.04, paymentReferenceId: 'CASH-0001', proofHash: 'a'.repeat(64),
  });
  const text = await textOf(artifact.storagePath);
  assert.match(text, /AED 9,363\.04/);
  assert.doesNotMatch(text, /AED 9,363(?!\.04)/);
  assert.match(text, /[\u0600-\u06FF\uFB50-\uFDFF\uFE70-\uFEFF]/, 'invoice Arabic labels must be real Arabic glyphs');
});

test('owner service agreement shows the exact annual value and mobilisation', { skip: !hasPdftotext && 'pdftotext not installed' }, async () => {
  const artifact = await generateContractPdfArtifact({
    contractId: 'contract_doc_amounts', ownerId: 'owner_doc', ownerName: 'Doc Owner', ownerEmail: 'doc@example.invalid',
    contractMode: 'FM_ONLY', propertyName: 'Doc Tower', annualValue: 62420.27, mobilizationAmount: 9363.04, signedAt: new Date().toISOString(),
  });
  const text = await textOf(artifact.storagePath);
  assert.match(text, /AED 62,420\.27/);
  assert.match(text, /AED 9,363\.04/);
});

// Tenant rent proof UI must be a Cash / Cheque flow (no bank transfer / IBAN) that sends the method
// and cheque details the server requires (functions/paymentEvidence.ts submitTenantPaymentProof).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const page = readFileSync(new URL('../../src/tenant/pages/TenantPaymentsPage.tsx', import.meta.url), 'utf8');
const rules = readFileSync(new URL('../../src/tenant/tenantPaymentProof.ts', import.meta.url), 'utf8');

test('tenant payment proof page offers only Cash and Cheque and never asks for a bank transfer', () => {
  assert.doesNotMatch(page, /Bank Transfer Reference|Transaction ID|Transfer rent directly|bank account|IBAN/i);
  assert.match(page, /<MenuItem value="CASH">Cash<\/MenuItem>/);
  assert.match(page, /<MenuItem value="CHEQUE">Cheque<\/MenuItem>/);
  assert.doesNotMatch(page, /MenuItem value="(BANK|TRANSFER|CARD|ONLINE)/i);
  assert.match(page, /paymentMethod: proofForm\.paymentMethod/);
  assert.match(page, /chequeNumber: proofForm\./);
  assert.match(page, /chequeBank: proofForm\./);
  assert.match(page, /chequeDate: proofForm\./);
  assert.match(page, /disabled=\{uploading \|\| Boolean\(proofFormError\) \|\| !receiptFile\}/);
});

test('tenant proof form rules require a method, exact-fils amount and cheque details', async () => {
  // Transpile the TS helper module with the repo's TypeScript compiler (types only, no runtime deps).
  const { default: ts } = await import('typescript');
  const js = ts.transpileModule(rules, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } }).outputText;
  const mod = await import(`data:text/javascript,${encodeURIComponent(js)}`);
  const base = { ...mod.EMPTY_PROOF_FORM };
  assert.match(mod.tenantProofFormError({ ...base, amount: '100' }), /Cash or Cheque/);
  assert.match(mod.tenantProofFormError({ ...base, paymentMethod: 'BANK_TRANSFER', amount: '100', reference: 'FT-1234' }), /Cash or Cheque/);
  assert.match(mod.tenantProofFormError({ ...base, paymentMethod: 'CASH', amount: '7083.385', reference: 'CR-1234' }), /two decimals/);
  assert.equal(mod.tenantProofFormError({ ...base, paymentMethod: 'CASH', amount: '7083.38', reference: 'CR-1234' }), null);
  assert.match(mod.tenantProofFormError({ ...base, paymentMethod: 'CHEQUE', amount: '7083.38' }), /cheque number/);
  assert.match(mod.tenantProofFormError({ ...base, paymentMethod: 'CHEQUE', amount: '7083.38', chequeNumber: '000777' }), /issuing bank/);
  assert.match(mod.tenantProofFormError({ ...base, paymentMethod: 'CHEQUE', amount: '7083.38', chequeNumber: '000777', chequeBank: 'ENBD' }), /cheque date/);
  assert.equal(mod.tenantProofFormError({ ...base, paymentMethod: 'CHEQUE', amount: '7083.38', chequeNumber: '000777', chequeBank: 'ENBD', chequeDate: '2026-10-01' }), null);
});

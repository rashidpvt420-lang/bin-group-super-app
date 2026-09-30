import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(path, 'utf8');

test('Phase 15 canonical Owner contract is server-rendered, bilingual and byte-hashed', async () => {
  const [pdf, signing] = await Promise.all([read('functions/pdfEngine.ts'), read('functions/adminOwnerOperations.ts')]);
  for (const token of ['PDFDocument', 'Cairo-Regular.ttf', 'bidiText', 'layoutBidiText', "language: 'en-ar'", 'generateContractPdfArtifact', "createHash('sha256').update(buffer)", 'pdfSha256', 'generation']) {
    assert.ok(pdf.includes(token), `Server PDF engine missing ${token}`);
  }
  for (const token of ['validateVerifiedContractSignatureOtp', 'canonicalPdfSha256', 'canonicalPdfStoragePath', 'canonicalPdfGeneration', 'canonicalPdfSource: "SERVER_PDF_ENGINE"', 'signedPdfUrl: pdfUrl']) {
    assert.ok(signing.includes(token), `Signed contract authority missing ${token}`);
  }
});

test('Phase 15 browser PDF can never override canonical signed contract', async () => {
  const [callable, browser, rules] = await Promise.all([read('functions/index.ts'), read('src/utils/bilingualContractPdf.ts'), read('storage.rules')]);
  assert.ok(browser.includes('jsPDF'));
  assert.ok(browser.includes('savePdfMobileSafe'));
  const start = callable.indexOf('export const generateInstitutionalContract');
  const end = callable.indexOf('export const generateAndEmailPayslip', start);
  const canonical = callable.slice(start, end);
  assert.ok(canonical.includes('db.collection("contracts").doc(contractId).get()'));
  assert.ok(canonical.includes('Only the canonical OTP-signed contract may be rendered.'));
  assert.ok(canonical.includes('Browser payload is identification-only'));
  assert.ok(canonical.includes('canonicalPdfSource: "SERVER_PDF_ENGINE"'));
  assert.ok(!canonical.includes('const payload = hasPrivilegedAccess ? contractData'));
  assert.ok(rules.includes('match /contracts/{contractId}/{allPaths=**}'));
  assert.ok(rules.includes('allow write: if isAdmin() && isDocumentUpload(25)'));
});

test('Phase 15 Owner/Admin Storage visibility and Property Passport attachment are explicit', async () => {
  const [rules, signing] = await Promise.all([read('storage.rules'), read('functions/adminOwnerOperations.ts')]);
  for (const token of ['canReadContractFile', 'isAdmin()', "contract(contractId).get('ownerId', null) == request.auth.uid"]) assert.ok(rules.includes(token));
  for (const token of ['propertyPassports', 'canonicalContractPdfUrl', 'canonicalContractPdfSha256', 'canonicalContractPdfStoragePath']) assert.ok(signing.includes(token));
});

test('Phase 15 renewal PDF reloads canonical contract and persists immutable artifact identity', async () => {
  const renewal = await read('functions/contractRenewalPdfSystem.ts');
  assert.ok(renewal.includes('db.collection("contracts").doc(record.contractId).get()'));
  assert.match(renewal, /generateContractPdfArtifact\(\{[\s\S]*?\.\.\.canonicalContract/);
  for (const token of ['pdfSha256', 'pdfGeneration', 'canonicalPdfSource: "SERVER_CONTRACT_RENEWAL_SYSTEM"']) {
    assert.ok(renewal.includes(token), `Renewal authority missing ${token}`);
  }
});

test('Phase 15 monthly Owner report is server-generated and byte-hashed', async () => {
  const report = await read('functions/monthlyOwnerPropertyReportSystem.ts');
  for (const token of ['PDFDocument', 'createHash("sha256").update(buffer)', 'owner_reports/', 'pdfSha256', 'pdfGeneration', 'canonicalPdfSource: "SERVER_MONTHLY_OWNER_REPORT_SYSTEM"', 'document_generation_requests']) {
    assert.ok(report.includes(token), `Monthly report authority missing ${token}`);
  }
});

test('Phase 15 signed contract issues one unpaid 15% invoice and approval creates a separate bilingual receipt', async () => {
  const [signing, approval, pdf, invoiceHelper, invoicePage] = await Promise.all([
    read('functions/adminOwnerOperations.ts'),
    read('functions/paymentTransactionApproval.ts'),
    read('functions/pdfEngine.ts'),
    read('functions/mobilizationInvoice.ts'),
    read('src/pages/InvoiceDetailsPage.tsx'),
  ]);
  for (const token of [
    'buildMobilizationInvoiceSnapshot',
    'status: "PENDING"',
    'paymentStatus: "UNPAID"',
    'generateMobilizationUnpaidInvoicePdfArtifact',
    'owner_payment_invoice_issued_',
  ]) assert.ok(signing.includes(token), `Signed-contract invoice lifecycle missing ${token}`);
  for (const token of [
    'assertMobilizationInvoiceImmutable',
    'status: "PAID"',
    'paymentStatus: "PAID"',
    'generateOwnerPaymentReceiptPdfArtifact',
    'receiptPdfUrl',
    'PAID_RECEIPT_READY',
    'owner_payment_approved_',
  ]) assert.ok(approval.includes(token), `Payment approval lifecycle missing ${token}`);
  assert.ok(approval.includes('if (!String(approvedInvoice.receiptPdfUrl || "").trim()'), 'Approval replay must repair a missing receipt.');
  for (const token of [
    '15% MOBILISATION INVOICE - UNPAID',
    'فاتورة دفعة التفعيل 15% - غير مدفوعة',
    'PAYMENT RECEIPT',
    'إيصال دفع',
    'invoices/${invoiceId}/mobilization-invoice.pdf',
    'invoices/${invoiceId}/payment-receipt.pdf',
  ]) assert.ok(pdf.includes(token), `Bilingual invoice/receipt PDF missing ${token}`);
  assert.ok(invoiceHelper.includes('mobilizationInvoiceId'));
  assert.ok(invoiceHelper.includes('proofHash'));
  assert.ok(invoicePage.includes("doc(db, 'invoices', id)"));
  assert.ok(invoicePage.includes('receiptPdfUrl'));
});

test('Phase 15 PDF artifacts retain verification identity instead of URL-only authority', async () => {
  const [pdf, report, renewal, approval] = await Promise.all([
    read('functions/pdfEngine.ts'), read('functions/monthlyOwnerPropertyReportSystem.ts'), read('functions/contractRenewalPdfSystem.ts'), read('functions/paymentTransactionApproval.ts')
  ]);
  for (const source of [pdf, report, renewal, approval]) assert.match(source, /pdfSha256/);
  assert.match(pdf, /Storage generation is missing/);
  assert.match(report, /Storage generation is missing/);
});

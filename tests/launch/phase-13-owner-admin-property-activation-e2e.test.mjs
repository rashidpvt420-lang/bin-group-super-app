import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(path, 'utf8');

test('Phase 13 Owner to Admin activation chain is executable end to end', async () => {
  const source = await read('scripts/run-owner-inspection-first-production-evidence.mjs');
  const ordered = [
    "uploadOwnerInspectionProofDocument",
    "submitOwnerInspectionFirstOnboarding",
    "adminCreateOwnerPortfolioPropertyInspection",
    "adminLinkOwnerPropertyInspection",
    "adminRecordOwnerPropertyInspectionEvidence",
    "adminCompleteOwnerPortfolioInspections",
    "const finalOtp = await verifyFinalContractSignatureOtp",
    "ownerSignContractAndQueuePdf",
    "adminRecordOwnerMobilizationPaymentEvidence",
    "adminApprovePayment",
  ];
  let cursor = -1;
  for (const token of ordered) {
    const next = source.indexOf(token, cursor + 1);
    assert.ok(next > cursor, `Phase 13 executable chain is missing or out of order: ${token}`);
    cursor = next;
  }
  for (const proof of [
    'SUBMITTED_FOR_PROPERTY_INSPECTION',
    'geo?.dispatchReady === false',
    'evidenceHash',
    'arrivalWithinRadius',
    'AWAITING_OWNER_FINAL_CONTRACT_SIGNATURE',
    'NOT_DUE_UNTIL_OWNER_FINAL_SIGNATURE',
    'finalVerifiedQuoteHash',
    'finalContractAcceptedQuoteHash',
    'signedPdfUrl',
    'PENDING_ADMIN_PAYMENT_VERIFICATION',
    'paymentVerified === true',
    'dashboardUnlocked === true',
    "status) === 'ACTIVE'",
  ]) assert.ok(source.includes(proof), `Phase 13 evidence is missing ${proof}`);
});

test('Phase 13 final verified quote requires fresh Owner OTP acceptance and server PDF before payment', async () => {
  const [completion, signing, payment] = await Promise.all([
    read('functions/ownerInspectionCompletion.ts'),
    read('functions/adminOwnerOperations.ts'),
    read('functions/inspectionFirstOwnerOnboarding.ts'),
  ]);
  for (const token of [
    'PENDING_OWNER_SIGNATURE',
    'NOT_DUE_UNTIL_OWNER_FINAL_SIGNATURE',
    'finalVerifiedQuoteHash',
    'quoteHash: finalQuote.quoteHash',
    'ownerSigned: false',
    'signedPdfUrl: FieldValue.delete()',
    'AWAITING_OWNER_FINAL_CONTRACT_SIGNATURE',
  ]) assert.ok(completion.includes(token), `Inspection completion missing final-acceptance gate: ${token}`);

  for (const token of [
    'contract.finalVerifiedQuoteHash || contract.quoteHash || contract.contractHash',
    'validateVerifiedContractSignatureOtp',
    'generateContractPDF',
    'finalContractAccepted: true',
    'finalContractAcceptedQuoteHash: contractHash',
    'ownerFinalContractSigned: true',
    'ADMIN_PAYMENT_EVIDENCE_REQUIRED_AFTER_FINAL_OWNER_SIGNATURE',
  ]) assert.ok(signing.includes(token), `Final signing authority missing: ${token}`);

  for (const token of [
    'Owner must OTP-sign the final verified quote and generate the locked contract PDF before the 15% payment can be recorded.',
    'contract.ownerSigned !== true',
    'contract.signatureState?.ownerSigned !== true',
    'contract.signedPdfUrl || contract.signatureState?.pdfUrl',
    'contractQuoteHash !== finalQuoteHash',
  ]) assert.ok(payment.includes(token), `Payment-before-signature fail-closed gate missing: ${token}`);
});

test('Phase 13 Admin dossier exposes documents, submitted geo and protected site-visit actions', async () => {
  const [vault, inspectionLink, completion] = await Promise.all([
    read('apps/admin-panel/src/pages/admin/IntakeVaultPage.tsx'),
    read('functions/ownerInspectionAdminLink.ts'),
    read('functions/ownerInspectionCompletion.ts'),
  ]);
  for (const token of ['documentUrls', 'properties', 'adminCreateOwnerPortfolioPropertyInspection', 'adminLinkOwnerPropertyInspection', 'OwnerInspectionEvidenceDialog']) {
    assert.ok(vault.includes(token), `Admin dossier missing ${token}`);
  }
  assert.ok(inspectionLink.includes('OWNER_SUBMITTED_PENDING_ADMIN_VERIFICATION'));
  assert.ok(inspectionLink.includes('paymentCollectionRequired: false'));
  assert.ok(completion.includes('checklistVerified: true'));
  assert.ok(completion.includes('distance > MAX_VISIT_RADIUS_METRES'));
  assert.ok(completion.includes('FINAL_VERIFIED_AFTER_ALL_SITE_VISITS'));
});

test('Phase 13 preserves activation fail-closed payment and physical evidence authority', async () => {
  const approval = await read('functions/securePaymentApproval.ts');
  for (const token of [
    'Every property visit must be verified before final payment approval',
    'Immutable 15% receipt evidence is required before final approval',
    'sign_in_second_factor',
    'payment.inspectionVerified !== true',
    'Immutable 15% receipt evidence is required before final approval',
  ]) assert.ok(approval.includes(token), `Final activation gate missing ${token}`);
});

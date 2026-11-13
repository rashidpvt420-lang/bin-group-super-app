import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

const CASH_RECORDING_SOURCES = [
  'functions/paymentEvidence.ts',
  'functions/ownerPaymentLedgerCallables.ts',
  'functions/inspectionFirstOwnerOnboarding.ts',
  'functions/secureOwnerRegistrationRequest.ts',
  'functions/ownerFinancialOperations.ts',
  'functions/designPayments.ts',
];

test('cash recording callables enforce the AED 50,000 per-property-contract cap', () => {
  for (const path of CASH_RECORDING_SOURCES) {
    const source = read(path);
    assert.match(source, /assertCashWithinPropertyContractCap/, `${path} must call assertCashWithinPropertyContractCap`);
  }
  const helper = read('functions/ownerCashCap.ts');
  assert.match(helper, /OWNER_CASH_ACCEPTANCE_THRESHOLD_AED/);
  assert.match(helper, /linkedContractId/);
  assert.match(helper, /ownerCashCapRejectionMessage/);
});

test('in-app legal modal requires explicit processing, retention and cross-border AI consents', () => {
  for (const path of ['src/components/LegalModal.tsx', 'packages/shared/src/components/LegalModal.tsx']) {
    const source = read(path);
    assert.match(source, /legal-review-2026-11-12/);
    assert.match(source, /legal-consent-processing/);
    assert.match(source, /legal-consent-retention/);
    assert.match(source, /legal-consent-cross-border-ai/);
    assert.match(source, /third-party AI processors/);
    assert.match(source, /disabled=\{!scrolledToBottom \|\| !allConsents \|\| loading\}|if \(loading \|\| !allConsents/);
    assert.match(source, /يُعتد بالنص العربي|أوافق موافقة صريحة/);
  }
  const role = read('src/context/RoleContext.tsx');
  assert.match(role, /LEGAL_CONSENT_VERSION/);
  assert.match(role, /TechnicianGpsConsentModal/);
  assert.match(role, /technicianGpsActiveDutyConsent/);
  const tech = read('src/components/TechnicianGpsConsentModal.tsx');
  assert.match(tech, /recordTechnicianGpsConsent/);
  assert.match(tech, /active duty/);
  assert.match(tech, /enforceAppCheck|consentActiveDutyOnly/);
  const callable = read('functions/technicianGpsConsent.ts');
  assert.match(callable, /enforceAppCheck: true/);
  assert.match(callable, /consentActiveDutyOnly/);
  assert.match(callable, /TECHNICIAN_GPS_CONSENT_COLLECTION/);
});

test('signed-contract audit trail is append-only for 10 years and recorded on final signature', () => {
  const rules = read('firestore.rules');
  assert.match(rules, /match \/contract_acceptance_audit\/\{auditId\}/);
  assert.match(rules, /match \/technician_gps_consents\/\{consentId\}/);
  const auditBlock = rules.split('match /contract_acceptance_audit/{auditId}')[1].split('match /')[0];
  assert.match(auditBlock, /allow create, update, delete: if false;/);
  const gpsBlock = rules.split('match /technician_gps_consents/{consentId}')[1].split('match /')[0];
  assert.match(gpsBlock, /allow create, update, delete: if false;/);
  const helper = read('functions/contractAcceptanceAudit.ts');
  assert.match(helper, /SIGNED_CONTRACT_AUDIT_RETENTION_YEARS/);
  assert.match(helper, /acceptedTermsSha256/);
  assert.match(helper, /serverTimestamp/);
  const sign = read('functions/adminOwnerOperations.ts');
  assert.match(sign, /enqueueContractAcceptanceAudit/);
  assert.match(sign, /pdfArtifact.pdfSha256/);
});

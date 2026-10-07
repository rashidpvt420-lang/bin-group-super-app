// Technician dispatch readiness requires a verified medical card, driving licence and certifications,
// but the Admin/HR app had no way to record them. The HR staff dialog now has a "Verified credentials"
// panel that calls the audited adminRecordTechnicianCredentials callable. The panel must never
// pre-fill or invent values: HR enters what they confirmed on the original documents.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const panel = read('apps/admin-panel/src/pages/admin/TechnicianCredentialsPanel.tsx');
const dialog = read('apps/admin-panel/src/pages/admin/StaffLifecycleDetailsDialog.tsx');
const helperSource = read('apps/admin-panel/src/lib/technicianCredentialForm.ts');
const callable = read('functions/adminTechnicianCredentials.ts');
const runtime = read('functions/runtime.ts');
const staffLifecycle = read('functions/adminStaffLifecycle.ts');

async function loadHelpers() {
  const { default: ts } = await import('typescript');
  const js = ts.transpileModule(helperSource, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } }).outputText;
  return import(`data:text/javascript,${encodeURIComponent(js)}`);
}

test('the HR staff dialog shows the credentials panel for technicians', () => {
  assert.match(dialog, /import TechnicianCredentialsPanel from '\.\/TechnicianCredentialsPanel';/);
  assert.match(dialog, /staff\.role === 'technician' && <TechnicianCredentialsPanel uid=\{uid\} credentials=\{staff\.credentials \|\| null\} canManage=\{canManage\}/);
  assert.match(staffLifecycle, /credentials: staff\.role === "technician" \? technicianCredentialSummary\(staff\.data, staff\.technician, includePrivate\) : null/);
  assert.match(staffLifecycle, /medicalCardReference: includePrivate \?/, 'document references stay manager-only');
});

test('the panel saves through the audited callable and surfaces server errors', () => {
  assert.ok(panel.includes("httpsCallable(functions, 'adminRecordTechnicianCredentials')"));
  assert.match(panel, /setNotice\(\{ severity: 'error', message: safeError\(error\) \}\)/);
  assert.match(panel, /remainingReadinessFailures/);
  assert.match(panel, /useState<CredentialDraft>\(emptyCredentialDraft\(\)\)/, 'form starts empty');
  assert.doesNotMatch(panel, /setDraft\(\{[^}]*current\./, 'form never copies stored values into a new decision');
  assert.match(runtime, /export \* from "\.\/adminTechnicianCredentials";/);
  assert.match(callable, /await requirePrivilegedMfaSession\(request\.auth\)/);
  assert.match(callable, /action: "ADMIN_RECORD_TECHNICIAN_CREDENTIALS"/);
});

test('payload builder requires attestation, note, expiry and reference for verified documents', async () => {
  const { buildCredentialPayload, emptyCredentialDraft } = await loadHelpers();
  const draft = emptyCredentialDraft();
  assert.equal(buildCredentialPayload('t1', draft).ok, false, 'not attested');
  draft.attested = true;
  draft.reviewNote = 'short';
  assert.equal(buildCredentialPayload('t1', draft).ok, false, 'note too short');
  draft.reviewNote = 'Checked original medical card at the office.';
  assert.match(buildCredentialPayload('t1', draft).error, /at least one credential/);
  draft.medicalCard = { decision: 'VERIFIED', expiryDate: '', documentReference: 'MC-1' };
  assert.match(buildCredentialPayload('t1', draft).error, /expiry date/);
  draft.medicalCard = { decision: 'VERIFIED', expiryDate: '2030-01-31', documentReference: ' ' };
  assert.match(buildCredentialPayload('t1', draft).error, /document number/);
  draft.medicalCard = { decision: 'VERIFIED', expiryDate: '2030-01-31', documentReference: 'MC-1' };
  draft.drivingLicence = { decision: 'REJECTED', expiryDate: '2031-01-01', documentReference: '' };
  draft.certifications = [{ name: 'HVAC', decision: 'VERIFIED', expiryDate: '2029-05-01', documentReference: 'C-9' }];
  const built = buildCredentialPayload('t1', draft, 'renew_7');
  assert.equal(built.ok, true);
  assert.deepEqual(built.payload, {
    technicianId: 't1',
    reviewNote: 'Checked original medical card at the office.',
    medicalCard: { decision: 'VERIFIED', expiryDate: '2030-01-31', documentReference: 'MC-1' },
    drivingLicence: { decision: 'REJECTED', documentReference: '' },
    certifications: [{ name: 'HVAC', decision: 'VERIFIED', expiryDate: '2029-05-01', documentReference: 'C-9' }],
    renewalRequestId: 'renew_7',
  });
  draft.certifications = [{ name: '', decision: 'VERIFIED', expiryDate: '2029-05-01', documentReference: 'C-9' }];
  assert.equal(buildCredentialPayload('t1', draft).ok, false, 'unnamed certificate');
});

test('status chip colour reflects verification and expiry', async () => {
  const { credentialChipColor } = await loadHelpers();
  const now = Date.parse('2026-10-04T00:00:00Z');
  assert.equal(credentialChipColor('verified', '2027-01-01T00:00:00Z', now), 'success');
  assert.equal(credentialChipColor('verified', '2026-01-01T00:00:00Z', now), 'error');
  assert.equal(credentialChipColor('rejected', null, now), 'error');
  assert.equal(credentialChipColor(null, null, now), 'warning');
});

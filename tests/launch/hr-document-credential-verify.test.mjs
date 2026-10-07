// HR Documents already took CERTIFICATE / DRIVING_LICENCE uploads (and technicians upload licences
// and trade certificates in the staff vault), but those documents never reached the readiness
// fields dispatch reads. The HR Documents tab now lets an MFA Admin/HR Manager verify a credential
// document (decision + expiry read from the original), which links it through the audited
// adminRecordTechnicianCredentials callable. Upload/registration alone never verifies anything.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const page = read('apps/admin-panel/src/pages/admin/HRManagementPage.tsx');
const dialog = read('apps/admin-panel/src/pages/admin/HrDocumentVerifyDialog.tsx');
const helperSource = read('apps/admin-panel/src/lib/technicianCredentialForm.ts');
const hrOps = read('functions/adminHrOperations.ts');
const callable = read('functions/adminTechnicianCredentials.ts');

async function loadHelpers() {
  const { default: ts } = await import('typescript');
  const js = ts.transpileModule(helperSource, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } }).outputText;
  return import(`data:text/javascript,${encodeURIComponent(js)}`);
}

const draft = (extra = {}) => ({ decision: 'VERIFIED', expiryDate: '2030-01-31', documentReference: '', certificationName: '', reviewNote: 'Checked the original card.', attested: true, ...extra });

test('HR document types include MEDICAL_CARD, distinct from MEDICAL_INSURANCE', () => {
  const line = page.slice(page.indexOf('const DOCUMENT_TYPES = ['), page.indexOf('];', page.indexOf('const DOCUMENT_TYPES = [')));
  for (const type of ['MEDICAL_CARD', 'MEDICAL_INSURANCE', 'CERTIFICATE', 'DRIVING_LICENCE']) assert.ok(line.includes(`'${type}'`), type);
});

test('document type maps to the readiness credential only for credential types', async () => {
  const { credentialKindForDocument } = await loadHelpers();
  assert.equal(credentialKindForDocument('staffHrDocuments', 'MEDICAL_CARD'), 'medicalCard');
  assert.equal(credentialKindForDocument('staffHrDocuments', 'MEDICAL_INSURANCE'), null);
  assert.equal(credentialKindForDocument('staffHrDocuments', 'DRIVING_LICENCE'), 'drivingLicence');
  assert.equal(credentialKindForDocument('staffHrDocuments', 'CERTIFICATE'), 'certification');
  assert.equal(credentialKindForDocument('staffDocuments', 'driving_license'), 'drivingLicence');
  assert.equal(credentialKindForDocument('staffDocuments', 'trade_certificate'), 'certification');
  assert.equal(credentialKindForDocument('staffDocuments', 'medical_certificate'), null, 'a sick note is not a medical card');
  assert.equal(credentialKindForDocument('staffDocuments', 'passport'), null);
});

test('verification payload links the document and needs attestation, note and a typed expiry', async () => {
  const { buildDocumentVerificationPayload, emptyDocumentVerificationDraft } = await loadHelpers();
  const hrDoc = { source: 'staffHrDocuments', id: 'doc1', uid: 'tech1', documentType: 'MEDICAL_CARD' };
  assert.deepEqual(emptyDocumentVerificationDraft().expiryDate, '', 'expiry is never pre-filled from metadata');
  const ok = buildDocumentVerificationPayload(hrDoc, draft());
  assert.equal(ok.ok, true);
  assert.deepEqual(ok.payload, { technicianId: 'tech1', reviewNote: 'Checked the original card.', medicalCard: { decision: 'VERIFIED', expiryDate: '2030-01-31', hrDocumentId: 'doc1' } });
  assert.equal(buildDocumentVerificationPayload(hrDoc, draft({ attested: false })).ok, false);
  assert.equal(buildDocumentVerificationPayload(hrDoc, draft({ reviewNote: 'ok' })).ok, false);
  assert.equal(buildDocumentVerificationPayload(hrDoc, draft({ expiryDate: '' })).ok, false);
  assert.equal(buildDocumentVerificationPayload(hrDoc, draft({ decision: '' })).ok, false);
  assert.equal(buildDocumentVerificationPayload({ ...hrDoc, documentType: 'MEDICAL_INSURANCE' }, draft()).ok, false);
  const rejected = buildDocumentVerificationPayload(hrDoc, draft({ decision: 'REJECTED', expiryDate: '' }));
  assert.deepEqual(rejected.payload.medicalCard, { decision: 'REJECTED', hrDocumentId: 'doc1' });
  const upload = buildDocumentVerificationPayload({ source: 'staffDocuments', id: 'up1', uid: 'tech1', documentType: 'trade_certificate' }, draft({ certificationName: 'HVAC Technician', documentReference: 'C-9' }));
  assert.deepEqual(upload.payload.certifications, [{ name: 'HVAC Technician', decision: 'VERIFIED', expiryDate: '2030-01-31', staffDocumentId: 'up1', documentReference: 'C-9' }]);
  assert.equal(buildDocumentVerificationPayload({ source: 'staffDocuments', id: 'up1', uid: 'tech1', documentType: 'trade_certificate' }, draft()).ok, false, 'certificate needs a name');
});

test('HR Documents tab wires Verify for technician credential documents and staff uploads', () => {
  assert.ok(page.includes("import HrDocumentVerifyDialog, { type VerifiableDocument } from './HrDocumentVerifyDialog';"));
  assert.ok(page.includes("renderVerification('staffHrDocuments', entry)"));
  assert.ok(page.includes("renderVerification('staffDocuments', entry)"));
  assert.ok(page.includes('data-testid="hr-staff-uploads"'));
  assert.ok(page.includes("isHRManager && isTechnician && entry.uid !== user?.uid"), 'only managers, only technicians, never own documents');
  assert.ok(page.includes('onSaved={async (message) => { setNotice({ type: \'success\', message }); await loadProtectedHr(); }}'));
  assert.ok(dialog.includes("httpsCallable(functions, 'adminRecordTechnicianCredentials')(built.payload)"));
  assert.ok(dialog.includes('useState<DocumentVerificationDraft>(emptyDocumentVerificationDraft())'));
  assert.ok(dialog.includes('I personally checked the original document.'));
});

test('server: registration starts UNVERIFIED and linkage is validated and audited', () => {
  assert.ok(hrOps.includes('...(CREDENTIAL_DOCUMENT_TYPES.has(documentType) ? { verificationStatus: "UNVERIFIED" } : {})'));
  assert.ok(!/medicalCardStatus|drivingLicenseStatus|certificationsStatus/.test(hrOps), 'registering a document never touches readiness fields');
  assert.ok(hrOps.includes('staffUploads: mapDocs(uploadSnap)'));
  assert.ok(callable.includes('assertLinkedDocument('));
  assert.ok(callable.includes('the linked document belongs to a different staff member'));
  assert.ok(callable.includes('linkedDocuments: links.map('));
  assert.ok(callable.includes('One HR document cannot back two different credentials.'));
});

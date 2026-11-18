// Employee ID cards + employment contract DRAFTS (Rashid, 18 Nov 2026): role gating, honesty and audit.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

const read = (path) => readFileSync(path, 'utf8');
const transpile = (path) => ts.transpileModule(read(path), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
function load(path, modules = {}) {
  const sandbox = { exports: {}, module: { exports: {} }, Intl, Date, Number, String, Math, Object, Array, JSON, Error, Set, Map };
  sandbox.module.exports = sandbox.exports;
  sandbox.require = (name) => {
    if (modules[name]) return modules[name];
    throw new Error(`unexpected import ${name}`);
  };
  runInNewContext(transpile(path), sandbox);
  return sandbox.module.exports;
}
const contractPolicy = load('functions/ownerInitialContractPolicy.ts');
const policy = load('functions/employeeCredentialPolicy.ts', { './ownerInitialContractPolicy': contractPolicy });
const server = read('functions/employeeCredentials.ts');
const uiPolicy = read('apps/admin-panel/src/security/staffAccessPolicy.ts');
const panel = read('apps/admin-panel/src/pages/admin/EmployeeCredentialsPanel.tsx');
const firestoreRules = read('firestore.rules');
const storageRules = read('storage.rules');

function setFromSource(name) {
  const marker = `export const ${name} = new Set([`;
  const start = uiPolicy.indexOf(marker);
  assert.notEqual(start, -1, `${name} not found in staffAccessPolicy`);
  const body = uiPolicy.slice(start + marker.length, uiPolicy.indexOf(']', start + marker.length));
  return [...body.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
}

test('eligible staff = every Admin-panel role from staffAccessPolicy (technicians and customers excluded)', () => {
  const derived = new Set([
    ...setFromSource('FULL_ADMIN_ROLES'),
    ...setFromSource('STAFF_PORTAL_ROLES'),
    ...setFromSource('PAINTING_FINANCE_ROLES'),
    ...setFromSource('PAYROLL_ADMIN_ROLES'),
  ]);
  assert.deepEqual([...policy.EMPLOYEE_CREDENTIAL_ELIGIBLE_ROLES].sort(), [...derived].sort());
  for (const role of ['technician', 'owner', 'tenant', 'broker', '']) assert.equal(policy.isEligibleEmployeeRole(role), false, role);
  for (const role of derived) assert.ok(policy.EMPLOYEE_ROLE_LABELS[role]?.ar, `${role} needs an Arabic label`);
});

test('only HR manager tier and the Founder generate; UI mirror matches the server list', () => {
  for (const claims of [{ role: 'hr_admin' }, { role: 'hr_manager' }, { role: 'ceo' }, { role: 'super_admin' }, { ceo: true }, { superAdmin: true }]) {
    assert.equal(policy.canGenerateEmployeeCredentials(claims), true, JSON.stringify(claims));
  }
  for (const claims of [{ role: 'admin', admin: true }, { role: 'hr_staff' }, { role: 'finance_admin' }, { role: 'finance_controller' }, { role: 'operations_admin' }, { role: 'technician' }, { role: 'hr_manager', suspended: true }, {}]) {
    assert.equal(policy.canGenerateEmployeeCredentials(claims), false, JSON.stringify(claims));
  }
  assert.deepEqual(setFromSource('EMPLOYEE_CREDENTIAL_GENERATOR_ROLES').sort(), [...policy.EMPLOYEE_CREDENTIAL_GENERATOR_ROLES].sort());
  assert.match(uiPolicy, /mfaVerified !== true\) return false/);
});

test('every callable enforces App Check, generation needs MFA + live claims, and self-generation is refused', () => {
  assert.match(server, /enforceAppCheck: true/);
  assert.doesNotMatch(server, /enforceAppCheck: false/);
  const generator = server.slice(server.indexOf('async function requireEmployeeCredentialGenerator'), server.indexOf('/** Owner self-service'));
  assert.match(generator, /canGenerateEmployeeCredentials\(token\)/);
  assert.match(generator, /requirePrivilegedMfaSession\(request\.auth\)/);
  assert.match(generator, /admin\.auth\(\)\.getUser/);
  assert.match(generator, /canGenerateEmployeeCredentials\(liveClaims\)/);
  for (const name of ['adminListEmployeeCredentials', 'adminGenerateEmployeeCredentials', 'adminGenerateMissingEmployeeCredentials', 'verifyEmployeeCard']) {
    const body = server.slice(server.indexOf(`export const ${name} = onCall`));
    assert.match(body.slice(0, 400), /requireEmployeeCredentialGenerator\(request\)/, name);
  }
  assert.match(server, /if \(staffUid === actor\.uid\) \{\s*throw new HttpsError\("failed-precondition"/);
  assert.match(server, /\.filter\(\(uid\) => uid && uid !== actor\.uid\)/);
  // Opening a document: authorise before reading, owner only for their own, otherwise HR/Founder + MFA.
  const open = server.slice(server.indexOf('export const openEmployeeDocument'), server.indexOf('export const getMyEmployeeCredentials'));
  assert.ok(open.indexOf('requireEmployeeCredentialGenerator(request)') < open.indexOf('.get()'));
  assert.match(open, /requestedUid === request\.auth\.uid/);
  assert.match(read('functions/runtime.ts'), /export \* from "\.\/employeeCredentials";/);
});

test('contract drafts never claim registration, approval or signature; AI never approves', () => {
  assert.match(policy.CONTRACT_DRAFT_BANNER_EN, /^DRAFT - pending legal review and MOHRE registration\. Not registered with MOHRE\. Not signed\./);
  assert.match(policy.CONTRACT_DRAFT_BANNER_AR, /^مسودة/);
  assert.equal(policy.EMPLOYMENT_CONTRACT_DRAFT_STATUS, 'DRAFT_PENDING_LEGAL_REVIEW_AND_MOHRE_REGISTRATION');
  assert.equal(policy.EMPLOYMENT_CONTRACT_MOHRE_STATUS, 'NOT_REGISTERED');
  assert.match(policy.CONTRACT_HUMAN_SIGNING_EN, /No system or AI step approves or signs it/);
  assert.match(server, /aiApproved: false/);
  assert.match(server, /approvalStatus: "NOT_APPROVED"/);
  assert.doesNotMatch(server, /status: "(SIGNED|APPROVED|REGISTERED)"/);
  assert.doesNotMatch(server + JSON.stringify(policy), /registered with MOHRE(?!\.)|MOHRE[- ]registered|government[- ](certificate|registered|approved)/i);
  const clauses = policy.employmentContractClauses();
  assert.ok(clauses.some((clause) => clause.bodyEn === policy.CONTRACT_ARABIC_PREVAILS_EN && clause.bodyAr === policy.CONTRACT_ARABIC_PREVAILS_AR));
  assert.match(policy.CONTRACT_ARABIC_PREVAILS_EN, /the Arabic text prevails/);
  assert.match(panel, /DRAFTS pending legal review and MOHRE registration/);
});

test('contract terms come only from the HR record; missing data stays blank', () => {
  const identity = policy.employeeIdentityFrom('uid_1', { role: 'hr_manager', displayName: 'A' }, { joiningDate: '2026-11-01' }, { salaryPackage: { basicSalary: 0, housingAllowance: 1500 } });
  const fields = Object.fromEntries(policy.employmentContractFields(identity).map((field) => [field.key, field.value]));
  assert.equal(fields.basicSalary, null, 'zero salary must stay blank, not AED 0');
  assert.equal(fields.housingAllowance, 'AED 1,500.00');
  assert.equal(fields.joiningDate, '2026-11-01');
  for (const key of ['probationPeriod', 'noticePeriod', 'annualLeave', 'emiratesId', 'nationality', 'contractEndDate']) assert.equal(fields[key], null, key);
  const empty = policy.employeeIdentityFrom('uid_2', { role: 'admin' }, {}, {});
  const missing = policy.missingContractFieldKeys(policy.employmentContractFields(empty));
  for (const key of ['basicSalary', 'housingAllowance', 'salaryPaymentDay', 'staffId', 'joiningDate']) assert.ok(missing.includes(key), key);
  assert.match(policy.BLANK_FIELD_EN, /HR to complete before signing/);
});

test('company identity comes from repo config, keeps the pending-name flag and never prints a TRN', () => {
  const company = policy.EMPLOYEE_COMPANY_IDENTITY;
  assert.equal(company.legalEntityName, contractPolicy.BIN_GROUP_LEGAL_ENTITY_NAME);
  assert.equal(company.legalEntityName, 'All Kind Building Projects Contracting L.L.C S.P.C, trading as BIN GROUP L.L.C - S.P.C');
  assert.equal(company.legalEntityNameStatus, 'FOUNDER_SUPPLIED_PENDING_CONFIRMATION');
  assert.equal(company.tradeLicenceNumber, 'CN-5914744');
  assert.equal(company.tradeLicenceEmirate, 'Abu Dhabi');
  assert.equal(company.vatTrnStatus, 'UNDER_PROCESS');
  assert.match(company.vatTrnDisplayEn, /under process/);
  assert.doesNotMatch(server + read('functions/employeeCredentialPolicy.ts'), /\b1\d{14}\b/, 'no 15-digit TRN may appear');
  assert.match(server, /not a government document/);
});

test('card QR carries only a random card id; expiry is bounded and honest', () => {
  const id = `card_${'a1'.repeat(16)}`;
  assert.equal(policy.employeeCardVerifyUrl(id), `https://admin.bin-groups.com/hr?verifyCard=${id}`);
  assert.throws(() => policy.employeeCardVerifyUrl('uid_abc@example.com'));
  assert.match(server, /drawVerificationQr\(doc, employeeCardVerifyUrl\(args\.cardId\)/);
  assert.equal(policy.employeeCardExpiry('2026-11-18', ''), '2027-11-17');
  assert.equal(policy.employeeCardExpiry('2026-11-18', '2027-03-31'), '2027-03-31');
  assert.equal(policy.employeeCardExpiry('2026-11-18', '2029-01-01'), '2027-11-17');
  assert.equal(policy.employeeCardExpiry('2026-11-18', '2020-01-01'), '2027-11-17');
});

test('audit trail: generation, opening and verification are all logged', () => {
  for (const action of ['EMPLOYEE_ID_CARD_GENERATED', 'EMPLOYMENT_CONTRACT_DRAFT_GENERATED', 'EMPLOYEE_DOCUMENT_OPENED', 'EMPLOYEE_CARD_VERIFIED']) {
    assert.ok(server.includes(action), action);
  }
  assert.match(server, /generatedBy: actor\.uid/);
  assert.match(server, /generatedByRole: actor\.role/);
  assert.match(server, /sha256Hash/);
});

test('rules: owner, HR manager tier and Founder (MFA) read; nobody writes from a browser', () => {
  assert.match(firestoreRules, /match \/private_hr_profiles\/\{staffUid\}\/employee_documents\/\{documentId\} \{\s*allow read: if \(signedIn\(\) && staffUid == request\.auth\.uid[^\n]*\|\| isEmployeeCredentialHrOrFounder\(\);\s*allow create, update, delete: if false;/);
  assert.match(firestoreRules, /match \/private_hr_profiles\/\{staffUid\}\/employee_credentials\/\{summaryId\} \{[\s\S]{0,200}allow create, update, delete: if false;/);
  const helper = firestoreRules.slice(firestoreRules.indexOf('function isEmployeeCredentialHrOrFounder'), firestoreRules.indexOf('match /private_hr_profiles/{staffUid}/employee_documents'));
  assert.match(helper, /hasAdminSecondFactor\(\)/);
  assert.match(helper, /\['hr_admin', 'hr_manager', 'ceo', 'super_admin'\]/);
  assert.doesNotMatch(helper, /'admin'|hr_staff|finance|isAdmin\(\)|hasAdminClaim/);
  const storageBlock = storageRules.slice(storageRules.indexOf('match /privateHrDocuments/{staffId}/employee-documents/{fileName}'));
  assert.match(storageBlock.slice(0, 700), /hasAdminSecondFactor\(\)/);
  assert.match(storageBlock.slice(0, 700), /allow write: if false;/);
  assert.doesNotMatch(storageBlock.slice(0, 700), /isHrRole\(\)|hr_staff|finance/);
  assert.match(storageBlock.slice(0, 700), /isAdmin\(\) && claimedRole\(\) in \['ceo', 'super_admin'/);
  assert.match(storageRules, /match \/privateHrDocuments\/\{staffId\}\/\{allPaths=\*\*\} \{\s*allow read, write: if false;/);
});

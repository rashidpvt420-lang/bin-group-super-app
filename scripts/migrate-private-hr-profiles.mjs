#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import admin from 'firebase-admin';

const PROJECT_ID = 'bin-group-57c60';
const REPOSITORY = 'rashidpvt420-lang/bin-group-super-app';
const EXECUTE_CONFIRMATION = 'MIGRATE_PRIVATE_HR_BIN_GROUP_57C60';
const REPORT_PATH = 'launch_package/private-hr-migration.json';
const execute = process.argv.includes('--execute');

const SENSITIVE_KEYS = Object.freeze([
  'employeeId',
  'emiratesId',
  'salaryPackage',
  'basicSalary',
  'housingAllowance',
  'transportAllowance',
  'foodAllowance',
  'otherAllowance',
  'salaryGrade',
  'salaryPaymentDay',
  'contractEndDate',
  'overtimeEligible',
  'companyAccommodationProvided',
  'companyTransportProvided',
  'companyMedicalInsuranceProvided',
]);

function hashId(value) {
  return createHash('sha256').update(String(value)).digest('hex');
}

function presentSensitiveFields(...documents) {
  const result = {};
  for (const document of documents) {
    if (!document || typeof document !== 'object') continue;
    for (const key of SENSITIVE_KEYS) {
      if (result[key] === undefined && document[key] !== undefined && document[key] !== null && document[key] !== '') {
        result[key] = document[key];
      }
    }
  }
  return result;
}

function deletionPatch() {
  return Object.fromEntries(SENSITIVE_KEYS.map((key) => [key, admin.firestore.FieldValue.delete()]));
}

function assertExecutionContext() {
  if (!execute) return;
  const errors = [];
  if (process.env.GITHUB_ACTIONS !== 'true') errors.push('execution requires GitHub Actions');
  if (process.env.GITHUB_REPOSITORY !== REPOSITORY) errors.push('repository mismatch');
  if (process.env.GITHUB_REF !== 'refs/heads/main') errors.push('execution requires refs/heads/main');
  if (!/^[0-9a-f]{40}$/.test(String(process.env.GITHUB_SHA || ''))) errors.push('exact commit SHA required');
  if (process.env.PRIVATE_HR_MIGRATION_CONFIRMATION !== EXECUTE_CONFIRMATION) errors.push('execution confirmation mismatch');
  const actors = String(process.env.AUTHORIZED_FOUNDER_ACTORS || '').split(',').map((actor) => actor.trim()).filter(Boolean);
  if (!actors.includes(String(process.env.GITHUB_ACTOR || ''))) errors.push('GitHub actor is not an authorized Founder approver');
  if (errors.length) throw new Error(errors.join('; '));
}

assertExecutionContext();

if (!admin.apps.length) {
  admin.initializeApp({ credential: admin.credential.applicationDefault(), projectId: PROJECT_ID });
}
const db = admin.firestore();

const hrSnapshot = await db.collection('hrProfiles').get();
const candidates = [];

for (const hrDocument of hrSnapshot.docs) {
  const uid = hrDocument.id;
  const [userDocument, technicianDocument, privateDocument] = await Promise.all([
    db.collection('users').doc(uid).get(),
    db.collection('technicians').doc(uid).get(),
    db.collection('private_hr_profiles').doc(uid).get(),
  ]);
  const sensitive = presentSensitiveFields(hrDocument.data(), userDocument.data(), technicianDocument.data());
  if (Object.keys(sensitive).length === 0) continue;
  candidates.push({ uid, hrDocument, userDocument, technicianDocument, privateDocument, sensitive });
}

let migrated = 0;
let verified = 0;
const failedHashes = [];

if (execute) {
  for (const candidate of candidates) {
    try {
      const { uid, hrDocument, userDocument, technicianDocument, sensitive } = candidate;
      await db.runTransaction(async (transaction) => {
        transaction.set(db.collection('private_hr_profiles').doc(uid), {
          ...sensitive,
          uid,
          accessClassification: 'PRIVATE_HR_SERVER_ONLY',
          migrationSource: 'protected-private-hr-migration',
          migratedAt: admin.firestore.FieldValue.serverTimestamp(),
          migratedByWorkflowRunId: String(process.env.GITHUB_RUN_ID || ''),
          migratedCommitSha: String(process.env.GITHUB_SHA || ''),
        }, { merge: true });
        transaction.update(hrDocument.ref, deletionPatch());
        if (userDocument.exists) transaction.update(userDocument.ref, deletionPatch());
        if (technicianDocument.exists) transaction.update(technicianDocument.ref, deletionPatch());
      });
      migrated += 1;

      const [freshHr, freshUser, freshTechnician, freshPrivate] = await Promise.all([
        hrDocument.ref.get(),
        userDocument.ref.get(),
        technicianDocument.ref.get(),
        db.collection('private_hr_profiles').doc(uid).get(),
      ]);
      const residue = presentSensitiveFields(freshHr.data(), freshUser.data(), freshTechnician.data());
      if (Object.keys(residue).length !== 0 || !freshPrivate.exists) {
        throw new Error('post-migration verification failed');
      }
      verified += 1;
    } catch (error) {
      failedHashes.push({ uidHash: hashId(candidate.uid), errorCode: 'MIGRATION_OR_VERIFICATION_FAILED' });
    }
  }
}

const report = {
  schemaVersion: 1,
  projectId: PROJECT_ID,
  repository: REPOSITORY,
  commitSha: String(process.env.GITHUB_SHA || 'LOCAL_DRY_RUN'),
  workflowRunId: String(process.env.GITHUB_RUN_ID || 'LOCAL'),
  mode: execute ? 'EXECUTE' : 'DRY_RUN',
  generatedAt: new Date().toISOString(),
  hrProfilesScanned: hrSnapshot.size,
  recordsRequiringMigration: candidates.length,
  migrated,
  verified,
  failureCount: failedHashes.length,
  failedRecords: failedHashes,
  sensitiveValuesLogged: false,
  rawIdentifiersLogged: false,
  hardLaunchClaim: false,
};

mkdirSync('launch_package', { recursive: true });
writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(`[private-hr-migration] mode=${report.mode} scanned=${report.hrProfilesScanned} candidates=${report.recordsRequiringMigration} migrated=${migrated} verified=${verified} failures=${report.failureCount}`);

if (execute && (migrated !== candidates.length || verified !== candidates.length || failedHashes.length > 0)) {
  throw new Error('Private HR migration did not complete and verify every candidate.');
}

#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import admin from 'firebase-admin';

const PROJECT_ID = 'bin-group-57c60';
const REPOSITORY = 'rashidpvt420-lang/bin-group-super-app';
const EXECUTE_CONFIRMATION = 'MIGRATE_PRIVATE_HR_BIN_GROUP_57C60';
const REPORT_PATH = 'launch_package/private-hr-migration.json';
const execute = process.argv.includes('--execute');

function hashId(value) {
  return createHash('sha256').update(String(value)).digest('hex');
}

function present(value) {
  return value !== undefined && value !== null && value !== '';
}

function firstPresent(...values) {
  return values.find((value) => present(value));
}

function extractSensitiveFields(hrData = {}, userData = {}, technicianData = {}) {
  const result = {};
  const employeeId = firstPresent(hrData.employeeId, userData.employeeId, technicianData.employeeId);
  const emiratesId = firstPresent(hrData.emiratesId, userData.emiratesId, technicianData.emiratesId);
  const salaryPackage = firstPresent(hrData.salaryPackage, userData.salaryPackage, technicianData.salaryPackage);
  const basicSalary = firstPresent(hrData.basicSalary, userData.basicSalary, technicianData.basicSalary);
  const housingAllowance = firstPresent(hrData.housingAllowance, userData.housingAllowance, technicianData.housingAllowance);
  const transportAllowance = firstPresent(hrData.transportAllowance, userData.transportAllowance, technicianData.transportAllowance);
  const foodAllowance = firstPresent(hrData.foodAllowance, userData.foodAllowance, technicianData.foodAllowance);
  const otherAllowance = firstPresent(hrData.otherAllowance, userData.otherAllowance, technicianData.otherAllowance);
  const salaryGrade = firstPresent(hrData.salaryGrade, userData.salaryGrade, technicianData.salaryGrade);
  const salaryPaymentDay = firstPresent(hrData.salaryPaymentDay, userData.salaryPaymentDay, technicianData.salaryPaymentDay);
  const contractEndDate = firstPresent(hrData.contractEndDate, userData.contractEndDate, technicianData.contractEndDate);
  const overtimeEligible = firstPresent(hrData.overtimeEligible, userData.overtimeEligible, technicianData.overtimeEligible);
  const companyAccommodationProvided = firstPresent(hrData.companyAccommodationProvided, userData.companyAccommodationProvided, technicianData.companyAccommodationProvided);
  const companyTransportProvided = firstPresent(hrData.companyTransportProvided, userData.companyTransportProvided, technicianData.companyTransportProvided);
  const companyMedicalInsuranceProvided = firstPresent(hrData.companyMedicalInsuranceProvided, userData.companyMedicalInsuranceProvided, technicianData.companyMedicalInsuranceProvided);

  if (present(employeeId)) result.employeeId = employeeId;
  if (present(emiratesId)) result.emiratesId = emiratesId;
  if (present(salaryPackage)) result.salaryPackage = salaryPackage;
  if (present(basicSalary)) result.basicSalary = basicSalary;
  if (present(housingAllowance)) result.housingAllowance = housingAllowance;
  if (present(transportAllowance)) result.transportAllowance = transportAllowance;
  if (present(foodAllowance)) result.foodAllowance = foodAllowance;
  if (present(otherAllowance)) result.otherAllowance = otherAllowance;
  if (present(salaryGrade)) result.salaryGrade = salaryGrade;
  if (present(salaryPaymentDay)) result.salaryPaymentDay = salaryPaymentDay;
  if (present(contractEndDate)) result.contractEndDate = contractEndDate;
  if (present(overtimeEligible)) result.overtimeEligible = overtimeEligible;
  if (present(companyAccommodationProvided)) result.companyAccommodationProvided = companyAccommodationProvided;
  if (present(companyTransportProvided)) result.companyTransportProvided = companyTransportProvided;
  if (present(companyMedicalInsuranceProvided)) result.companyMedicalInsuranceProvided = companyMedicalInsuranceProvided;
  return result;
}

function deletionPatch() {
  const remove = admin.firestore.FieldValue.delete();
  return {
    employeeId: remove,
    emiratesId: remove,
    salaryPackage: remove,
    basicSalary: remove,
    housingAllowance: remove,
    transportAllowance: remove,
    foodAllowance: remove,
    otherAllowance: remove,
    salaryGrade: remove,
    salaryPaymentDay: remove,
    contractEndDate: remove,
    overtimeEligible: remove,
    companyAccommodationProvided: remove,
    companyTransportProvided: remove,
    companyMedicalInsuranceProvided: remove,
  };
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
  const [userDocument, technicianDocument] = await Promise.all([
    db.collection('users').doc(uid).get(),
    db.collection('technicians').doc(uid).get(),
  ]);
  const sensitive = extractSensitiveFields(hrDocument.data(), userDocument.data(), technicianDocument.data());
  if (Object.keys(sensitive).length === 0) continue;
  candidates.push({ uid, hrDocument, userDocument, technicianDocument, sensitive });
}

let migrated = 0;
let verified = 0;
const failedHashes = [];

if (execute) {
  for (const candidate of candidates) {
    try {
      const { uid, hrDocument, userDocument, technicianDocument, sensitive } = candidate;
      const privateReference = db.collection('private_hr_profiles').doc(uid);
      await db.runTransaction(async (transaction) => {
        transaction.set(privateReference, {
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
        privateReference.get(),
      ]);
      const residue = extractSensitiveFields(freshHr.data(), freshUser.data(), freshTechnician.data());
      if (Object.keys(residue).length !== 0 || !freshPrivate.exists) {
        throw new Error('post-migration verification failed');
      }
      verified += 1;
    } catch {
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

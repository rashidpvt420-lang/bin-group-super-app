import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const read = (path) => readFileSync(path, 'utf8');
const deployPreflight = read('scripts/verify-firebase-production-secrets.mjs');
const deployScript = read('scripts/deploy-firebase-production.mjs');
const brokerHook = read('src/broker/hooks/useBrokerAttributionSignals.ts');
const onboarding = read('src/pages/PropertyOnboardingPage.tsx');
const brokerCallable = read('functions/brokerReferralAttribution.ts');
const runtime = read('functions/runtime.ts');
const aiLaunchHold = read('functions/aiDesignStudioLaunchHold.ts');
const ownerApp = read('src/owner/OwnerApp.tsx');
const designStudio = read('src/pages/DesignStudioPage.tsx');
const gpsHardener = read('scripts/harden-technician-live-location-authority.mjs');
const rulesWriter = read('scripts/write-production-firestore-rules.mjs');
const firebaseConfig = JSON.parse(read('firebase.json'));
const packageJson = JSON.parse(read('package.json'));
const adminMap = read('apps/admin-panel/src/pages/map/LiveMapPage.tsx');
const gpsOverflow = read('functions/technicianLiveLocationOverflow.ts');
const technicianApp = read('src/technician/TechnicianApp.tsx');
const payrollBridge = read('functions/technicianPayrollCompatibility.ts');
const hrRules = read('scripts/harden-hr-privacy-rules.mjs');
const tenantChat = read('src/tenant/pages/TenantChatPage.tsx');
const technicianChat = read('src/technician/pages/TechnicianChatPage.tsx');

test('production deploy preflight refuses any workflow that is not exact current main', () => {
  assert.match(deployPreflight, /assertExactCurrentMain/);
  assert.match(deployPreflight, /remoteMainSha !== githubSha/);
  assert.match(deployPreflight, /Refusing stale production mutation/);
  assert.match(deployPreflight, /exactMainVerifier\(\{ env \}\)/);
  const verificationCall = deployPreflight.lastIndexOf('exactMainVerifier({ env })');
  const repairCall = deployPreflight.lastIndexOf('requireAdminMfaDomainRepairContext({ env, approvalPath })');
  assert.ok(verificationCall >= 0 && repairCall >= 0 && verificationCall < repairCall,
    'exact-main verification must occur before any protected domain repair call');
  assert.doesNotMatch(deployPreflight, /merge-base.*--is-ancestor/s);
  assert.match(deployScript, /verifyFirebaseProductionSecrets/);
});

test('Broker referral link reaches public onboarding and locks attribution server-side', () => {
  assert.match(brokerHook, /\/onboarding\?broker=\$\{encodeURIComponent\(user\.uid\)\}/);
  assert.doesNotMatch(brokerHook, /\/owner\/onboarding/);
  assert.match(onboarding, /searchParams\.get\('broker'\)/);
  assert.match(onboarding, /captureBrokerReferralAttribution/);
  assert.match(onboarding, /referralState !== 'captured'/);
  assert.match(brokerCallable, /enforceAppCheck: true/);
  assert.match(brokerCallable, /db\.runTransaction/);
  assert.match(brokerCallable, /broker_attributions/);
  assert.match(brokerCallable, /attributionLocked: true/);
  assert.match(brokerCallable, /already locked to another Broker referral/);
  assert.match(runtime, /export \* from "\.\/brokerReferralAttribution"/);
});

test('Owner inspections route uses the full inspections workspace', () => {
  assert.match(ownerApp, /import OwnerInspectionsPage/);
  assert.match(ownerApp, /path="\/inspections" element=\{<OwnerInspectionsPage \/>\}/);
  assert.match(ownerApp, /path="\/review-queue" element=\{<OwnerReviewQueuePage \/>\}/);
});

test('public AI Design Studio is fail-closed and old endpoint is overwritten safely', () => {
  assert.match(designStudio, /LAUNCH SAFETY HOLD/);
  assert.match(designStudio, /No design request, quote, approval, payment status or generated property image/);
  assert.doesNotMatch(designStudio, /addDoc|setDoc|uploadBytes|generateAIDesignConceptImages/);
  assert.doesNotMatch(runtime, /export \* from "\.\/aiDesignStudio";/);
  assert.match(runtime, /export \* from "\.\/aiDesignStudioLaunchHold";/);
  assert.match(aiLaunchHold, /export const generateAIDesignConceptImages/);
  assert.match(aiLaunchHold, /enforceAppCheck: true/);
  assert.match(aiLaunchHold, /failed-precondition/);
  assert.doesNotMatch(aiLaunchHold, /images\.generate|makePublic|design_requests|design_quotes/);
});

test('Technician GPS browser writes are denied and orphan direct writer is removed', () => {
  assert.equal(existsSync('src/hooks/useGPS.ts'), false);
  assert.match(gpsHardener, /safeTechnicianProfileUpdate/);
  assert.match(gpsHardener, /return false;/);
  assert.match(gpsHardener, /callable-only GPS/);
  const helperStart = gpsHardener.indexOf('const evidenceOnlyTechnicianUpdate');
  const helperEnd = gpsHardener.indexOf('const serverOnlyTechnicianProfileUpdate');
  const helper = gpsHardener.slice(helperStart, helperEnd);
  for (const field of ['arrivedLocation', 'technicianLocation', 'technicianLocationUpdatedAt', 'currentLocation', 'lastLocation', 'isTracking']) {
    assert.doesNotMatch(helper, new RegExp(`'${field}'`));
  }
});

test('Firebase deploy consumes a generated reviewed rules artifact', () => {
  assert.equal(firebaseConfig.firestore.rules, 'launch_generated/firestore.rules');
  assert.match(packageJson.scripts['prepare:rules'], /write:production-rules/);
  assert.equal(packageJson.scripts['write:production-rules'], 'node scripts/write-production-firestore-rules.mjs');
  assert.match(rulesWriter, /sha256/);
  assert.match(rulesWriter, /allow create: if isAdmin\(\);/);
  assert.match(rulesWriter, /client-authoritative GPS field remains/);
});

test('Admin map uses complete listeners instead of silent technician and GPS caps', () => {
  assert.match(adminMap, /no silent client-side caps/i);
  assert.doesNotMatch(adminMap, /limit\(100\)|limit\(200\)|limit\(101\)|limit\(201\)/);
  assert.match(adminMap, /collection\(db, 'technicians'\)/);
  assert.match(adminMap, /collection\(db, 'technician_live_locations'\)/);
});

test('expired GPS sessions are drained in bounded pages with transactional rechecks', () => {
  assert.match(gpsOverflow, /PAGE_SIZE = 100/);
  assert.match(gpsOverflow, /MAX_PAGES_PER_RUN = 5/);
  assert.match(gpsOverflow, /while \(page < MAX_PAGES_PER_RUN\)/);
  assert.match(gpsOverflow, /db\.runTransaction/);
  assert.match(gpsOverflow, /expiryMs > transactionNow\.toMillis\(\)/);
  assert.match(runtime, /export \* from "\.\/technicianLiveLocationOverflow"/);
});

test('Technician HR and payroll self-service no longer default to an empty path', () => {
  assert.match(technicianApp, /VITE_ENABLE_HR_MODULE !== 'false'/);
  assert.match(payrollBridge, /onDocumentWritten/);
  assert.match(payrollBridge, /payroll\/\{payrollId\}/);
  assert.match(payrollBridge, /collection\("payroll_entries"\)/);
  assert.match(payrollBridge, /backfillTechnicianPayrollEntries/);
  assert.match(hrRules, /match \/payroll_entries\/\{entryId\}/);
  assert.match(hrRules, /resource\.data\.get\('technicianId', null\) == request\.auth\.uid/);
  assert.match(hrRules, /allow create, update, delete: if false/);
  assert.match(runtime, /export \* from "\.\/technicianPayrollCompatibility"/);
});

test('Tenant and Technician chat recognise canonical identity aliases without alert UX', () => {
  for (const alias of ['tenantId', 'tenantUid', 'userId', 'authUid', 'createdByUid', 'tenantEmail']) assert.match(tenantChat, new RegExp(alias));
  for (const alias of ['assignedTechnicianId', 'technicianId', 'techId', 'technicianUid', 'assignedTechId']) assert.match(technicianChat, new RegExp(alias));
  assert.doesNotMatch(tenantChat, /alert\(/);
  assert.doesNotMatch(technicianChat, /alert\(/);
  assert.match(tenantChat, /Message stream unavailable/);
  assert.match(technicianChat, /Message stream unavailable/);
});

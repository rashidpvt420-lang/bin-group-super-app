import { readFileSync } from 'node:fs';

const rules = readFileSync('firestore.rules', 'utf8').replace(/\r\n?/g, '\n');

function readFunction(name) {
  const needle = `    function ${name}(`;
  const start = rules.indexOf(needle);
  if (start < 0) return null;
  const open = rules.indexOf('{', start);
  let depth = 0;
  for (let index = open; index < rules.length; index += 1) {
    if (rules[index] === '{') depth += 1;
    if (rules[index] === '}') {
      depth -= 1;
      if (depth === 0) return rules.slice(start, index + 1);
    }
  }
  return null;
}

const monolithicUpdate = 'allow update: if isAdmin() || safeDispatcherTicketUpdate() || safeTenantEvidenceUpdate() || safeTechnicianTicketUpdate();';
const actorSpecificRules = [
  'allow update: if isAdmin() && isNotSuspended();',
  'allow update: if hasNonAdminDispatchClaimOnly() && safeDispatcherTicketUpdate();',
  'allow update: if tenantOwns(resource.data) && safeTenantEvidenceUpdate();',
  'allow update: if hasTechnicianClaim() && techOwns(resource.data) && safeTechnicianTicketUpdate();',
];

const forbiddenFragments = [
  ['broad tenant property read fallback', "get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'tenant'"],
  ['unrestricted notification creation', '      allow create: if signedIn();'],
  ['open mission pool exposes private tickets before dispatch', 'function openMissionPoolRead(data)'],
  ['tenant ticket create without unit/property validation', "ownerDraftCreate(request.resource.data) || tenantOwns(request.resource.data);"],
  ['direct client-side technician mission claim helper', 'function safeOpenMissionClaim() {'],
  ['direct client-side mission assignment field helper', 'function missionClaimFieldsLookValid() {'],
  ['tickets update rule still permits direct technician claiming', '|| safeOpenMissionClaim()'],
  ['boolean-only database suspension guard', "get(/databases/$(database)/documents/users/$(request.auth.uid)).data.get('suspended', false) != true"],
  ['token-only directory list suspension guard', "allow list: if (request.auth != null && request.auth.token.get('suspended', false) != true) && ("],
  ['broad user-subcollection authorization', 'allow create: if isNotSuspended() && (isAdmin() || (signedIn() && request.auth.uid == userId));'],
  ['monolithic ticket update authorization', monolithicUpdate],
];

const requiredFragments = [
  ['hardened property read rule', 'ownerCanRead(resource.data) || tenantOwns(resource.data)'],
  ['hardened notification create rule', 'allow create: if isAdmin() || safeClientNotificationCreate(request.resource.data);'],
  ['safe client notification helper', 'function safeClientNotificationCreate(data) {'],
  ['technician dispatch authority helper', 'function hasTechnicianDispatchAuthority() {\n      return canDispatchJobs();\n    }'],
  ['approved technician read helper', 'function isApprovedTechnician() {'],
  ['dedicated technician write-approval helper', 'function hasApprovedTechnicianRecord() {'],
  ['tenant ticket unit/property binding helper', 'function canCreateTenantBoundTicket(data) {'],
  ['tenant ticket create uses binding helper', 'allow create: if isAdmin() || canCreateTenantBoundTicket(request.resource.data);'],
  ['technician evidence update helper', 'function safeTechnicianTicketUpdate() {'],
  ['production status-aware suspension helper', 'function profileAllowsAccess(data) {'],
  ['production suspension status variants', "data.get('status', '') in ["],
  ['dispatch checks claims before database suspension', 'function hasDispatchAuthorityClaimOnly() {'],
  ['non-admin dispatch helper exists', 'function hasNonAdminDispatchClaimOnly() {'],
  ['directory list checks database-backed suspension once', 'allow list: if isNotSuspended() && ('],
  ['FCM token path is explicitly allowlisted', 'match /fcmTokens/{tokenId} {'],
  ['device readiness path is explicitly allowlisted', 'match /deviceReadiness/{readinessId} {'],
  ['unknown user subcollections are denied', 'match /{subcollection}/{document=**} {\n        allow read, write: if false;'],
  ['ticket and Broker rate-limit read fallback exclusions', "!(collection in ['system_secrets', 'users', 'tickets', 'maintenanceTickets', 'broker_kyc_submission_limits']) && hasAdminClaim()"],
  ['ticket write fallback excludes explicit ticket hierarchies', "'tickets',\n          'maintenanceTickets',\n          'audit_logs'"],
  ['private Broker KYC profile rule exists', 'match /broker_kyc_profiles/{brokerId} {'],
  ['private Broker KYC profile writes are server-only', 'allow create, update, delete: if false;'],
  ['Broker KYC rate limits are server-only', "match /broker_kyc_submission_limits/{brokerId} {\n      allow read, write: if false;"],
  ['Broker KYC collections excluded from generic writes', "'broker_kyc_profiles',\n          'broker_kyc_submission_limits',\n          'ai_usage'"],
  ['payment transaction writes are server-only', "match /payment_transactions/{paymentId} {\n      allow read:"],
  ['payment transaction create denied', "// transaction type and enter a weaker admin approval path.\n      allow create: if false;\n      allow update, delete: if false;"],
  ['financial transaction create denied', 'allow create: if false; // Financial ledger rows are server-authored only.'],
  ['public rate limits are server-only', "match /public_rate_limits/{rateId} {\n      allow read, write: if false;"],
  ['AI quota records are server-only', "match /ai_usage/{usageId} {\n      allow read: if isAdmin();\n      allow write: if false;"],
];

const failures = [];

for (const [label, text] of forbiddenFragments) {
  if (rules.includes(text)) failures.push(`Forbidden rule fragment still exists: ${label}`);
}

for (const [label, text] of requiredFragments) {
  if (!rules.includes(text)) failures.push(`Required rule fragment missing: ${label}`);
}

for (const rule of actorSpecificRules) {
  if (rules.split(rule).length - 1 !== 2) {
    failures.push(`Actor-specific ticket update rule must exist exactly twice: ${rule}`);
  }
}

const tenantUpdate = readFunction('safeTenantEvidenceUpdate');
if (!tenantUpdate || !tenantUpdate.includes('affectedKeys().hasOnly([') || !tenantUpdate.includes('isNotSuspended() &&')) {
  failures.push('Tenant evidence helper must reject mutation shape before enforcing suspension and append-only evidence.');
}

const dispatcherUpdate = readFunction('safeDispatcherTicketUpdate');
if (!dispatcherUpdate || dispatcherUpdate.includes('hasDispatchAuthorityClaimOnly() &&') || !dispatcherUpdate.includes('affectedKeys().hasOnly([') || !dispatcherUpdate.includes('isNotSuspended() &&')) {
  failures.push('Dispatcher helper must rely on the outer claim gate and check mutation shape before database suspension.');
}

const technicianUpdate = readFunction('safeTechnicianTicketUpdate');
if (!technicianUpdate || technicianUpdate.includes('hasTechnicianClaim() &&') || technicianUpdate.includes('techOwns(resource.data) &&')) {
  failures.push('Technician helper must rely on the outer actor/assignment gate.');
} else {
  const diffIndex = technicianUpdate.indexOf('affectedKeys().hasOnly([');
  const suspensionIndex = technicianUpdate.indexOf('isNotSuspended() &&');
  const approvalIndex = technicianUpdate.indexOf('hasApprovedTechnicianRecord() &&');
  if (diffIndex < 0 || suspensionIndex < 0 || approvalIndex < 0 || !(diffIndex < suspensionIndex && suspensionIndex < approvalIndex)) {
    failures.push('Technician helper must reject mutation shape before suspension and the dedicated approval read.');
  }
  for (const immutableField of ["'beforePhotos',", "'assignedTechnicianId',", "'technicianId',", "'techId',", "'priority',", "'paymentVerified',"]) {
    if (technicianUpdate.includes(immutableField)) failures.push(`Technician mutable allowlist contains obsolete or immutable field: ${immutableField}`);
  }
  for (const requiredProof of ["'afterPhotos',", "'proofPhotos',", "'completionPhotos',", "'evidencePhotos',"]) {
    if (!technicianUpdate.includes(requiredProof)) failures.push(`Technician live proof field missing: ${requiredProof}`);
  }
}

for (const rule of [
  'allow update: if isAdmin() && isNotSuspended();',
  'allow update: if hasNonAdminDispatchClaimOnly() && safeDispatcherTicketUpdate();',
  'allow update: if tenantOwns(resource.data) && safeTenantEvidenceUpdate();',
  'allow update: if hasTechnicianClaim() && techOwns(resource.data) && safeTechnicianTicketUpdate();',
]) {
  if ((rules.split(rule).length - 1) !== 2) {
    failures.push(`Explicit actor-gated ticket update rule must exist exactly twice: ${rule}`);
  }
}

if (!technicianUpdate) {
  failures.push('Technician update helper could not be parsed.');
} else {
  for (const forbiddenField of [
    "'assignedTechnicianId',",
    "'technicianId',",
    "'techId',",
    "'priority',",
    "'paymentVerified',",
  ]) {
    if (technicianUpdate.includes(forbiddenField)) {
      failures.push(`Technician update allowlist exposes immutable field: ${forbiddenField}`);
    }
  }
  for (const requiredProof of [
    "request.resource.data.get('proofPhotos', []).hasAll(resource.data.get('proofPhotos', []))",
    "request.resource.data.get('completionPhotos', []).hasAll(resource.data.get('completionPhotos', []))",
    "request.resource.data.get('evidencePhotos', []).hasAll(resource.data.get('evidencePhotos', []))",
  ]) {
    if (!technicianUpdate.includes(requiredProof)) {
      failures.push(`Technician append-only proof guard missing: ${requiredProof}`);
    }
  }
}

if (failures.length > 0) {
  console.error('Firestore launch hardening verification failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('Firestore launch hardening verification passed.');

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

const legacyTicketUpdates = [
  'allow update: if isAdmin() || safeDispatcherTicketUpdate() || safeTenantEvidenceUpdate() || safeTechnicianTicketUpdate();',
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
  ...legacyTicketUpdates.map((fragment) => ['overlapping ticket update authorization', fragment]),
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
  ['bounded ticket update router', 'function safeTicketUpdateByActor() {'],
  ['single ticket update gate', 'allow update: if safeTicketUpdateByActor();'],
  ['tenant branch uses ownership', 'tenantOwns(resource.data) && safeTenantEvidenceUpdate()'],
  ['technician branch is role-discriminated', "claimedRole() in ['technician', 'tech'] && techOwns(resource.data) && safeTechnicianTicketUpdate()"],
  ['technician checks changed fields', 'let changed = request.resource.data.diff(resource.data).affectedKeys();'],
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
  ['Broker KYC rate limits are server-only', "match /broker_kyc_submission_limits/{brokerId} {\n      allow read, write: if false;"],
];

const failures = [];
for (const [label, text] of forbiddenFragments) if (rules.includes(text)) failures.push(`Forbidden rule fragment still exists: ${label}`);
for (const [label, text] of requiredFragments) if (!rules.includes(text)) failures.push(`Required rule fragment missing: ${label}`);
if (rules.split('allow update: if safeTicketUpdateByActor();').length - 1 !== 2) failures.push('Single ticket update gate must exist exactly twice.');
if (rules.split('function safeTicketUpdateByActor() {').length - 1 !== 1) failures.push('Shared ticket update router must exist exactly once.');

const router = readFunction('safeTicketUpdateByActor');
if (!router) failures.push('Ticket update router could not be parsed.');
else {
  const admin = router.indexOf('(hasAdminClaim() && isNotSuspended())');
  const dispatcher = router.indexOf('hasNonAdminDispatchClaimOnly() && safeDispatcherTicketUpdate()');
  const technician = router.indexOf("claimedRole() in ['technician', 'tech'] && techOwns(resource.data) && safeTechnicianTicketUpdate()");
  const tenant = router.indexOf('tenantOwns(resource.data) && safeTenantEvidenceUpdate()');
  if (admin < 0 || dispatcher < 0 || technician < 0 || tenant < 0 || !(admin < dispatcher && dispatcher < technician && technician < tenant)) failures.push('Ticket update router must short-circuit in admin, dispatcher, technician, tenant order.');
  if (router.includes('!hasAdminClaim()') || router.includes('!hasNonAdminDispatchClaimOnly()')) failures.push('Ticket router must not repeat expensive negative authority predicates.');
}

const technicianUpdate = readFunction('safeTechnicianTicketUpdate');
if (!technicianUpdate) failures.push('Technician update helper could not be parsed.');
else {
  for (const forbiddenField of ["'assignedTechnicianId',", "'technicianId',", "'techId',", "'priority',", "'paymentVerified',", "'beforePhotos',"]) if (technicianUpdate.includes(forbiddenField)) failures.push(`Technician update allowlist exposes immutable field: ${forbiddenField}`);
  for (const requiredProof of ["!changed.hasAny(['afterPhotos'])", "!changed.hasAny(['proofPhotos'])", "!changed.hasAny(['completionPhotos'])", "!changed.hasAny(['evidencePhotos'])", 'hasApprovedTechnicianRecord() &&']) if (!technicianUpdate.includes(requiredProof)) failures.push(`Technician bounded proof guard missing: ${requiredProof}`);
}
if (failures.length > 0) {
  console.error('Firestore launch hardening verification failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log('Firestore launch hardening verification passed.');

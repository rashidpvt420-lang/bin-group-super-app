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
  ['unbounded ticket read fallback', "allow read: if !(collection in ['system_secrets', 'users', 'tickets', 'maintenanceTickets', 'broker_kyc_submission_limits']) && hasAdminClaim();"],
  ['unbounded ticket write fallback list', "'users',\n          'tickets',\n          'maintenanceTickets',\n          'audit_logs'"],
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
  ['router caches authentication once', 'let authenticated = signedIn();'],
  ['router caches canonical role once', 'let role = authenticated'],
  ['router caches admin authority once', 'let admin = authenticated && ('],
  ['router caches dispatcher authority once', 'let dispatcher = authenticated && ('],
  ['admin branch uses cached authority', '(admin && isNotSuspended())'],
  ['dispatcher branch uses cached authority', '(!admin && dispatcher && safeDispatcherTicketUpdate())'],
  ['tenant branch supports roleless legacy claims but excludes named non-tenant roles', "(!admin && !dispatcher && role in ['', 'tenant'] && tenantOwns(resource.data) && safeTenantEvidenceUpdate())"],
  ['technician branch is role-discriminated', "(!admin && !dispatcher && role in ['technician', 'tech'] && techOwns(resource.data) && safeTechnicianTicketUpdate())"],
  ['production status-aware suspension helper', 'function profileAllowsAccess(data) {'],
  ['production suspension status variants', "data.get('status', '') in ["],
  ['dispatch checks claims before database suspension', 'function hasDispatchAuthorityClaimOnly() {'],
  ['non-admin dispatch helper exists', 'function hasNonAdminDispatchClaimOnly() {'],
  ['directory list checks database-backed suspension once', 'allow list: if isNotSuspended() && ('],
  ['FCM token path is explicitly allowlisted', 'match /fcmTokens/{tokenId} {'],
  ['device readiness path is explicitly allowlisted', 'match /deviceReadiness/{readinessId} {'],
  ['unknown user subcollections are denied', 'match /{subcollection}/{document=**} {\n        allow read, write: if false;'],
  ['ticket and Broker rate-limit read fallback exclusions', "allow read: if collection != 'tickets' && collection != 'maintenanceTickets' && !(collection in ['system_secrets', 'users', 'broker_kyc_submission_limits']) && hasAdminClaim();"],
  ['ticket create fallback rejects explicit ticket hierarchies first', "allow create: if collection != 'tickets' && collection != 'maintenanceTickets' && !("],
  ['ticket update fallback rejects explicit ticket hierarchies first', "allow update, delete: if collection != 'tickets' && collection != 'maintenanceTickets' && !("],
  ['ticket write fallback excludes explicit ticket hierarchies', "'system_secrets',\n          'users',\n          'audit_logs'"],
  ['private Broker KYC profile rule exists', 'match /broker_kyc_profiles/{brokerId} {'],
  ['Broker KYC rate limits are server-only', "match /broker_kyc_submission_limits/{brokerId} {\n      allow read, write: if false;"],
];

const failures = [];
for (const [label, text] of forbiddenFragments) if (rules.includes(text)) failures.push(`Forbidden rule fragment still exists: ${label}`);
for (const [label, text] of requiredFragments) if (!rules.includes(text)) failures.push(`Required rule fragment missing: ${label}`);

if (rules.split('allow update: if safeTicketUpdateByActor();').length - 1 !== 2) failures.push('Single ticket update gate must exist exactly twice.');
if (rules.split('function safeTicketUpdateByActor() {').length - 1 !== 1) failures.push('Shared ticket update router must exist exactly once.');

const router = readFunction('safeTicketUpdateByActor');
if (!router) {
  failures.push('Ticket update router could not be parsed.');
} else {
  const authentication = router.indexOf('let authenticated = signedIn();');
  const role = router.indexOf('let role = authenticated');
  const adminClaim = router.indexOf('let admin = authenticated && (');
  const dispatcherClaim = router.indexOf('let dispatcher = authenticated && (');
  const admin = router.indexOf('(admin && isNotSuspended())');
  const dispatcher = router.indexOf('(!admin && dispatcher && safeDispatcherTicketUpdate())');
  const tenant = router.indexOf("(!admin && !dispatcher && role in ['', 'tenant'] && tenantOwns(resource.data) && safeTenantEvidenceUpdate())");
  const technician = router.indexOf("(!admin && !dispatcher && role in ['technician', 'tech'] && techOwns(resource.data) && safeTechnicianTicketUpdate())");
  if (
    [authentication, role, adminClaim, dispatcherClaim, admin, dispatcher, tenant, technician].some((index) => index < 0) ||
    !(authentication < role && role < adminClaim && adminClaim < dispatcherClaim && dispatcherClaim < admin && admin < dispatcher && dispatcher < tenant && tenant < technician)
  ) {
    failures.push('Ticket update router must short-circuit in admin, dispatcher, tenant, technician order.');
  }
  for (const repeatedHelper of ['hasAdminClaim()', 'hasNonAdminDispatchClaimOnly()', 'claimedRole()']) {
    if (router.includes(repeatedHelper)) failures.push(`Ticket update router re-evaluates expensive actor helper: ${repeatedHelper}`);
  }
}

const technicianUpdate = readFunction('safeTechnicianTicketUpdate');
if (!technicianUpdate) {
  failures.push('Technician update helper could not be parsed.');
} else {
  for (const forbiddenField of ["'assignedTechnicianId',", "'technicianId',", "'techId',", "'priority',", "'paymentVerified',", "'beforePhotos',"]) {
    if (technicianUpdate.includes(forbiddenField)) failures.push(`Technician update allowlist exposes immutable field: ${forbiddenField}`);
  }
  for (const requiredProof of [
    "request.resource.data.get('proofPhotos', []).hasAll(resource.data.get('proofPhotos', []))",
    "request.resource.data.get('completionPhotos', []).hasAll(resource.data.get('completionPhotos', []))",
    "request.resource.data.get('evidencePhotos', []).hasAll(resource.data.get('evidencePhotos', []))",
  ]) {
    if (!technicianUpdate.includes(requiredProof)) failures.push(`Technician append-only proof guard missing: ${requiredProof}`);
  }
}

if (failures.length > 0) {
  console.error('Firestore launch hardening verification failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log('Firestore launch hardening verification passed.');

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

function readMatchBlock(marker) {
  const start = rules.indexOf(marker);
  if (start < 0) return '';
  const open = start + marker.length - 1;
  if (rules[open] !== '{') return '';
  let depth = 0;
  for (let index = open; index < rules.length; index += 1) {
    if (rules[index] === '{') depth += 1;
    if (rules[index] === '}') {
      depth -= 1;
      if (depth === 0) return rules.slice(start, index + 1);
    }
  }
  return '';
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
  ['direct Tenant browser ticket creation', 'allow create: if isAdmin() || canCreateTenantBoundTicket(request.resource.data);'],
  ['direct client-side technician mission claim helper', 'function safeOpenMissionClaim() {'],
  ['direct client-side mission assignment field helper', 'function missionClaimFieldsLookValid() {'],
  ['tickets update rule still permits direct technician claiming', '|| safeOpenMissionClaim()'],
  ['boolean-only database suspension guard', "get(/databases/$(database)/documents/users/$(request.auth.uid)).data.get('suspended', false) != true"],
  ['token-only directory list suspension guard', "allow list: if (request.auth != null && request.auth.token.get('suspended', false) != true) && ("],
  ['broad user-subcollection authorization', 'allow create: if isNotSuspended() && (isAdmin() || (signedIn() && request.auth.uid == userId));'],
  ['unbounded ticket read fallback', "allow read: if !(collection in ['system_secrets', 'users', 'tickets', 'maintenanceTickets', 'broker_kyc_submission_limits']) && hasAdminClaim();"],
  ['private HR omitted from global read fallback exclusions', "allow read: if collection != 'tickets' && collection != 'maintenanceTickets' && !(collection in ['system_secrets', 'users', 'broker_kyc_submission_limits', 'admin_security_sessions']) && hasAdminClaim();"],
  ['canonical live location omitted from global read fallback exclusions', "allow read: if collection != 'tickets' && collection != 'maintenanceTickets' && !(collection in ['system_secrets', 'users', 'broker_kyc_submission_limits', 'admin_security_sessions', 'private_hr_profiles']) && hasAdminClaim();"],
  ['invoice registry omitted from global read fallback exclusions', "allow read: if collection != 'tickets' && collection != 'maintenanceTickets' && !(collection in ['system_secrets', 'users', 'broker_kyc_submission_limits', 'admin_security_sessions', 'private_hr_profiles', 'technician_live_locations']) && hasAdminClaim();"],
  ['payroll mirror omitted from global read fallback exclusions', "allow read: if collection != 'tickets' && collection != 'maintenanceTickets' && !(collection in ['system_secrets', 'users', 'broker_kyc_submission_limits', 'admin_security_sessions', 'private_hr_profiles', 'technician_live_locations', 'invoice_registry']) && hasAdminClaim();"],
  ['unbounded ticket write fallback list', "'users',\n          'tickets',\n          'maintenanceTickets',\n          'audit_logs'"],
  ['canonical property geo omitted from global write fallback exclusions', "'system_secrets',\n          'technician_live_locations',\n          'users',\n          'audit_logs',\n          'admin_security_sessions',\n          'private_hr_profiles'"],
  ['legacy Owner-only property geo create helper', 'function ownerCannotSupplyCanonicalPropertyGeo(data) {'],
  ['legacy unbounded submitted property geo helper', 'function ownerSubmittedPropertyGeoIsUnverified(data) {'],
  ...legacyTicketUpdates.map((fragment) => ['overlapping ticket update authorization', fragment]),
];

const requiredFragments = [
  ['hardened property read rule', 'ownerCanRead(resource.data) || tenantOwns(resource.data)'],
  ['hardened notification create rule', 'allow create: if isAdmin() || safeClientNotificationCreate(request.resource.data);'],
  ['safe client notification helper', 'function safeClientNotificationCreate(data) {'],
  ['technician dispatch authority helper', 'function hasTechnicianDispatchAuthority() {\n      return canDispatchJobs();\n    }'],
  ['approved technician read helper', 'function isApprovedTechnician() {'],
  ['dedicated technician write-approval helper', 'function hasApprovedTechnicianRecord() {'],
  ['canonical ticket creation is Admin/server only', 'allow create: if isAdmin();'],
  ['legacy tickets are read-only compatibility data', 'allow create, update, delete: if false;'],
  ['technician evidence update helper', 'function safeTechnicianTicketUpdate() {'],
  ['bounded ticket update router', 'function safeTicketUpdateByActor() {'],
  ['single canonical ticket update gate', 'allow update: if safeTicketUpdateByActor();'],
  ['router caches authentication once', 'let authenticated = signedIn();'],
  ['router caches canonical role once', 'let role = authenticated'],
  ['router caches admin authority once', 'let admin = authenticated && ('],
  ['router caches dispatcher authority once', 'let dispatcher = authenticated && ('],
  ['admin branch uses cached authority', '(admin && isNotSuspended())'],
  ['dispatcher branch uses cached authority', '(!admin && dispatcher && safeDispatcherTicketUpdate())'],
  ['tenant branch supports roleless legacy claims but excludes named non-tenant roles', "(!admin && !dispatcher && role in ['', 'tenant'] && tenantOwns(resource.data) && safeTenantEvidenceUpdate())"],
  ['technician branch is role-discriminated', "(!admin && !dispatcher && role in ['technician', 'tech'] && techOwns(resource.data) && safeTechnicianTicketUpdate())"],
  ['submitted property geo validates coordinates and unverified state', 'function submittedPropertyGeoIsUnverified(data) {'],
  ['property creation excludes every canonical geo field', 'function propertyCreateHasNoCanonicalGeo(data) {'],
  ['managed property updates preserve canonical geo', 'function safeManagedPropertyUpdate() {'],
  ['property create uses shared canonical-geo guard', 'propertyCreateHasNoCanonicalGeo(request.resource.data) &&'],
  ['Admin browser property update uses safe managed guard', '(canManageProperties() && safeManagedPropertyUpdate())'],
  ['production status-aware suspension helper', 'function profileAllowsAccess(data) {'],
  ['production suspension status variants', "data.get('status', '') in ["],
  ['dispatch checks claims before database suspension', 'function hasDispatchAuthorityClaimOnly() {'],
  ['non-admin dispatch helper exists', 'function hasNonAdminDispatchClaimOnly() {'],
  ['directory list checks database-backed suspension once', 'allow list: if isNotSuspended() && ('],
  ['FCM token path is explicitly allowlisted', 'match /fcmTokens/{tokenId} {'],
  ['device readiness path is explicitly allowlisted', 'match /deviceReadiness/{readinessId} {'],
  ['unknown user subcollections are denied', 'match /{subcollection}/{document=**} {\n        allow read, write: if false;'],
  ['ticket, Broker rate-limit, Admin-session, private-HR, live-location, invoice-registry and payroll-mirror read fallback exclusions', "allow read: if collection != 'tickets' && collection != 'maintenanceTickets' && !(collection in ['system_secrets', 'users', 'broker_kyc_submission_limits', 'admin_security_sessions', 'private_hr_profiles', 'technician_live_locations', 'invoice_registry', 'payroll_entries']) && hasAdminClaim();"],
  ['ticket create fallback rejects explicit ticket hierarchies first', "allow create: if collection != 'tickets' && collection != 'maintenanceTickets' && !("],
  ['ticket update fallback rejects explicit ticket hierarchies first', "allow update, delete: if collection != 'tickets' && collection != 'maintenanceTickets' && !("],
  ['ticket write fallback excludes explicit ticket hierarchies, live location, canonical property geo, HR cases and private HR', "'system_secrets',\n          'technician_live_locations',\n          'properties',\n          'users',\n          'staffRequests',\n          'hrAiConversations',\n          'audit_logs',\n          'admin_security_sessions',\n          'private_hr_profiles'"],
  ['payroll mirror excluded from generic create and update/delete fallbacks', "'transactions',\n          'payroll_entries',\n          'invoices'"],
  ['private Broker KYC profile rule exists', 'match /broker_kyc_profiles/{brokerId} {'],
  ['Broker KYC rate limits are server-only', "match /broker_kyc_submission_limits/{brokerId} {\n      allow read, write: if false;"],
  ['Admin security sessions are server-only', "match /admin_security_sessions/{sessionId} {\n      allow read, write: if false;"],
  ['private HR profiles are server-only', "match /private_hr_profiles/{profileId} {\n      allow read, write: if false;"],
  ['canonical live locations are suspension-aware dispatch-readable only', "match /technician_live_locations/{technicianId} {\n      allow read: if canDispatchJobs();\n      allow create, update, delete: if false;"],
  ['payroll mirror is Technician-scoped read-only', "match /payroll_entries/{entryId} {\n      allow read: if isAdmin() || isTechnicianId(resource.data.get('technicianId', null));\n      allow create, update, delete: if false;\n    }"],
];

const failures = [];
for (const [label, text] of forbiddenFragments) if (rules.includes(text)) failures.push(`Forbidden rule fragment still exists: ${label}`);
for (const [label, text] of requiredFragments) if (!rules.includes(text)) failures.push(`Required rule fragment missing: ${label}`);

const legacyBlock = readMatchBlock('    match /tickets/{ticketId} {');
const canonicalBlock = readMatchBlock('    match /maintenanceTickets/{ticketId} {');
const payrollBlock = readMatchBlock('    match /payroll_entries/{entryId} {');
if (!legacyBlock.includes('allow create, update, delete: if false;')) failures.push('Legacy /tickets must deny every browser write.');
if (legacyBlock.includes('allow update: if safeTicketUpdateByActor();')) failures.push('Legacy /tickets still has an operational update gate.');
if (!canonicalBlock.includes('allow create: if isAdmin();')) failures.push('Canonical /maintenanceTickets must reserve direct creates for Admin/server authority.');
if (!canonicalBlock.includes('allow update: if safeTicketUpdateByActor();')) failures.push('Canonical /maintenanceTickets update router is missing.');
if (
  !payrollBlock.includes("resource.data.get('technicianId', null) == request.auth.uid") &&
  !payrollBlock.includes("isTechnicianId(resource.data.get('technicianId', null))")
) failures.push('Payroll mirror read is not bound to the matching Technician UID.');
if (!payrollBlock.includes('allow create, update, delete: if false;')) failures.push('Payroll mirror must deny every browser write.');
if (rules.split('allow update: if safeTicketUpdateByActor();').length - 1 !== 1) failures.push('Exactly one canonical ticket update gate is required.');
if (rules.split('function safeTicketUpdateByActor() {').length - 1 !== 1) failures.push('Shared ticket update router must exist exactly once.');
if (rules.split('match /admin_security_sessions/{sessionId}').length - 1 !== 1) failures.push('Admin security session rule must exist exactly once.');
if (rules.split('match /private_hr_profiles/{profileId}').length - 1 !== 1) failures.push('Private HR profile rule must exist exactly once.');
if (rules.split('match /technician_live_locations/{technicianId}').length - 1 !== 1) failures.push('Canonical live-location rule must exist exactly once.');
if (rules.split('match /payroll_entries/{entryId}').length - 1 !== 1) failures.push('Payroll mirror rule must exist exactly once.');
if ((rules.match(/'payroll_entries'/g) || []).length !== 3) failures.push('Payroll mirror must be excluded from read, create and update/delete catch-alls exactly once each.');

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
  ) failures.push('Ticket update router must short-circuit in admin, dispatcher, tenant, technician order.');
  for (const repeatedHelper of ['hasAdminClaim()', 'hasNonAdminDispatchClaimOnly()', 'claimedRole()']) {
    if (router.includes(repeatedHelper)) failures.push(`Ticket update router re-evaluates expensive actor helper: ${repeatedHelper}`);
  }
}

const technicianUpdate = readFunction('safeTechnicianTicketUpdate');
if (!technicianUpdate) {
  failures.push('Technician update helper could not be parsed.');
} else {
  for (const forbiddenField of ["'assignedTechnicianId',", "'technicianId',", "'techId',", "'priority',", "'paymentVerified',", "'beforePhotos',", "'arrivedLocation',", "'technicianLocation',", "'technicianLocationUpdatedAt',"]) {
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

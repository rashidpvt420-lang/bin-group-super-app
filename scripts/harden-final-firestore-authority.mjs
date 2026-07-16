import { readFileSync, writeFileSync } from 'node:fs';

const rulesPath = 'firestore.rules';
const legacyReadCatchAll = "      allow read: if !(collection in ['system_secrets', 'users', 'tickets', 'maintenanceTickets']) && hasAdminClaim();";
const brokerReadCatchAll = "      allow read: if !(collection in ['system_secrets', 'users', 'tickets', 'maintenanceTickets', 'broker_kyc_submission_limits']) && hasAdminClaim();";
const boundedReadCatchAll = "      allow read: if collection != 'tickets' && collection != 'maintenanceTickets' && !(collection in ['system_secrets', 'users', 'broker_kyc_submission_limits']) && hasAdminClaim();";
const legacyWriteList = `          'system_secrets',
          'users',
          'tickets',
          'maintenanceTickets',
          'audit_logs',`;
const boundedWriteList = `          'system_secrets',
          'users',
          'audit_logs',`;
const legacyCreateCatchAll = '      allow create: if !(';
const boundedCreateCatchAll = "      allow create: if collection != 'tickets' && collection != 'maintenanceTickets' && !(";
const legacyUpdateCatchAll = '      allow update, delete: if !(';
const boundedUpdateCatchAll = "      allow update, delete: if collection != 'tickets' && collection != 'maintenanceTickets' && !(";

let text = readFileSync(rulesPath, 'utf8').replace(/\r\n?/g, '\n');

// Keep the dedicated technician proof optimizer, but do not re-run the legacy
// split-rule normalizer after apply-ticket-rule-binding has installed the
// single role-discriminated update router.
await import('./optimize-current-main-technician-ticket-rule.mjs');
text = readFileSync(rulesPath, 'utf8').replace(/\r\n?/g, '\n');

if (text.includes(legacyReadCatchAll)) {
  text = text.replace(legacyReadCatchAll, brokerReadCatchAll);
}
if (text.includes(brokerReadCatchAll)) {
  text = text.replace(brokerReadCatchAll, boundedReadCatchAll);
} else if (!text.includes(boundedReadCatchAll)) {
  throw new Error('[final-firestore-authority] global read catch-all could not be bounded with ticket and Broker KYC exclusions');
}

const legacyWriteCount = text.split(legacyWriteList).length - 1;
const boundedWriteCount = text.split(boundedWriteList).length - 1;
if (legacyWriteCount === 2 && boundedWriteCount === 0) {
  text = text.replaceAll(legacyWriteList, boundedWriteList);
} else if (!(legacyWriteCount === 0 && boundedWriteCount === 2)) {
  throw new Error(`[final-firestore-authority] unexpected ticket write fallback lists: legacy=${legacyWriteCount}, bounded=${boundedWriteCount}`);
}

if (text.includes(legacyCreateCatchAll) && !text.includes(boundedCreateCatchAll)) {
  text = text.replace(legacyCreateCatchAll, boundedCreateCatchAll);
} else if (!text.includes(boundedCreateCatchAll)) {
  throw new Error('[final-firestore-authority] global create catch-all could not be bounded');
}
if (text.includes(legacyUpdateCatchAll) && !text.includes(boundedUpdateCatchAll)) {
  text = text.replace(legacyUpdateCatchAll, boundedUpdateCatchAll);
} else if (!text.includes(boundedUpdateCatchAll)) {
  throw new Error('[final-firestore-authority] global update/delete catch-all could not be bounded');
}

writeFileSync(rulesPath, text, 'utf8');

const required = [
  'function profileAllowsAccess(data) {',
  "data.get('status', '') in [",
  'function hasDispatchAuthorityClaimOnly() {',
  'function hasNonAdminDispatchClaimOnly() {',
  'function safeTicketUpdateByActor() {',
  'let authenticated = signedIn();',
  'let role = authenticated',
  'let admin = authenticated && (',
  'let dispatcher = authenticated && (',
  '(admin && isNotSuspended())',
  '(!admin && dispatcher && safeDispatcherTicketUpdate())',
  "(!admin && !dispatcher && role == 'tenant' && tenantOwns(resource.data) && safeTenantEvidenceUpdate())",
  "(!admin && !dispatcher && role in ['technician', 'tech'] && techOwns(resource.data) && safeTechnicianTicketUpdate())",
  'return hasDispatchAuthorityClaimOnly() && isNotSuspended();',
  'function hasApprovedTechnicianRecord() {',
  'match /fcmTokens/{tokenId} {',
  'match /deviceReadiness/{readinessId} {',
  'match /{subcollection}/{document=**} {\n        allow read, write: if false;',
  'allow list: if isNotSuspended() && (',
  'allow update: if safeTicketUpdateByActor();',
  boundedReadCatchAll.trim(),
  boundedCreateCatchAll.trim(),
  boundedUpdateCatchAll.trim(),
  "'system_secrets',\n          'users',\n          'audit_logs'",
  "'broker_kyc_profiles',\n          'broker_kyc_submission_limits',\n          'ai_usage'",
];

for (const fragment of required) {
  if (!text.includes(fragment)) throw new Error(`[final-firestore-authority] missing required fragment: ${fragment}`);
}

if (text.split('allow update: if safeTicketUpdateByActor();').length - 1 !== 2) {
  throw new Error('[final-firestore-authority] bounded ticket update gate must exist exactly twice');
}
if (text.split('function safeTicketUpdateByActor() {').length - 1 !== 1) {
  throw new Error('[final-firestore-authority] shared ticket update router must exist exactly once');
}

const forbidden = [
  "get(/databases/$(database)/documents/users/$(request.auth.uid)).data.get('suspended', false) != true",
  "allow list: if (request.auth != null && request.auth.token.get('suspended', false) != true) && (",
  'allow read: if (signedIn() && request.auth.uid == userId) || canReadUserDirectory();',
  'allow create: if isNotSuspended() && (isAdmin() || (signedIn() && request.auth.uid == userId));',
  'allow update: if isAdmin() || safeDispatcherTicketUpdate() || safeTenantEvidenceUpdate() || safeTechnicianTicketUpdate();',
  'allow update: if isAdmin() && isNotSuspended();',
  'allow update: if hasNonAdminDispatchClaimOnly() && safeDispatcherTicketUpdate();',
  'allow update: if tenantOwns(resource.data) && safeTenantEvidenceUpdate();',
  'allow update: if hasTechnicianClaim() && techOwns(resource.data) && safeTechnicianTicketUpdate();',
  brokerReadCatchAll.trim(),
  legacyReadCatchAll.trim(),
  legacyWriteList,
];

for (const fragment of forbidden) {
  if (text.includes(fragment)) throw new Error(`[final-firestore-authority] forbidden fragment remains: ${fragment}`);
}

console.log('[final-firestore-authority] status-aware single-branch ticket authorization and bounded global fallbacks are canonical');

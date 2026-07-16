import { readFileSync, writeFileSync } from 'node:fs';

const rulesPath = 'firestore.rules';
const standardReadCatchAll = "      allow read: if !(collection in ['system_secrets', 'users', 'tickets', 'maintenanceTickets']) && hasAdminClaim();";
const brokerHardenedReadCatchAll = "      allow read: if !(collection in ['system_secrets', 'users', 'tickets', 'maintenanceTickets', 'broker_kyc_submission_limits']) && hasAdminClaim();";

let text = readFileSync(rulesPath, 'utf8').replace(/\r\n?/g, '\n');
await import('./optimize-current-main-technician-ticket-rule.mjs');
text = readFileSync(rulesPath, 'utf8').replace(/\r\n?/g, '\n');

if (text.includes(standardReadCatchAll)) {
  text = text.replace(standardReadCatchAll, brokerHardenedReadCatchAll);
  writeFileSync(rulesPath, text, 'utf8');
} else if (!text.includes(brokerHardenedReadCatchAll)) {
  throw new Error('[final-firestore-authority] global read catch-all could not be restored with Broker KYC rate-limit exclusion');
}

const required = [
  'function profileAllowsAccess(data) {',
  "data.get('status', '') in [",
  'function hasDispatchAuthorityClaimOnly() {',
  'function hasNonAdminDispatchClaimOnly() {',
  'function safeTicketUpdateByActor() {',
  'return !signedIn() ? false :',
  'hasAdminClaim() ? isNotSuspended() :',
  'hasNonAdminDispatchClaimOnly() ? safeDispatcherTicketUpdate() :',
  "claimedRole() in ['technician', 'tech'] ? (techOwns(resource.data) && safeTechnicianTicketUpdate()) :",
  'tenantOwns(resource.data) ? safeTenantEvidenceUpdate() :',
  'return hasDispatchAuthorityClaimOnly() && isNotSuspended();',
  'function hasApprovedTechnicianRecord() {',
  "let changed = request.resource.data.diff(resource.data).affectedKeys();",
  'match /fcmTokens/{tokenId} {',
  'match /deviceReadiness/{readinessId} {',
  'match /{subcollection}/{document=**} {\n        allow read, write: if false;',
  'allow list: if isNotSuspended() && (',
  'allow update: if safeTicketUpdateByActor();',
  "!(collection in ['system_secrets', 'users', 'tickets', 'maintenanceTickets', 'broker_kyc_submission_limits']) && hasAdminClaim()",
  "'tickets',\n          'maintenanceTickets',\n          'audit_logs'",
  "'broker_kyc_profiles',\n          'broker_kyc_submission_limits',\n          'ai_usage'",
];
for (const fragment of required) if (!text.includes(fragment)) throw new Error(`[final-firestore-authority] missing required fragment: ${fragment}`);
if (text.split('allow update: if safeTicketUpdateByActor();').length - 1 !== 2) throw new Error('[final-firestore-authority] bounded ticket update gate must exist exactly twice');
if (text.split('function safeTicketUpdateByActor() {').length - 1 !== 1) throw new Error('[final-firestore-authority] shared ticket update router must exist exactly once');

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
];
for (const fragment of forbidden) if (text.includes(fragment)) throw new Error(`[final-firestore-authority] forbidden fragment remains: ${fragment}`);
console.log('[final-firestore-authority] single-path conditional ticket authorization is canonical');

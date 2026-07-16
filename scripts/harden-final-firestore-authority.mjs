import { readFileSync, writeFileSync } from 'node:fs';

const rulesPath = 'firestore.rules';
const standardReadCatchAll = "      allow read: if !(collection in ['system_secrets', 'users', 'tickets', 'maintenanceTickets']) && hasAdminClaim();";
const brokerHardenedReadCatchAll = "      allow read: if !(collection in ['system_secrets', 'users', 'tickets', 'maintenanceTickets', 'broker_kyc_submission_limits']) && hasAdminClaim();";

// The expression-budget normalizer predates the private Broker KYC rate-limit
// collection. Present its recognised baseline, then restore the stronger
// exclusion immediately after the canonical ticket transforms complete.
let before = readFileSync(rulesPath, 'utf8').replace(/\r\n?/g, '\n');
const hadBrokerRateLimitExclusion = before.includes(brokerHardenedReadCatchAll);
if (hadBrokerRateLimitExclusion) {
  before = before.replace(brokerHardenedReadCatchAll, standardReadCatchAll);
  writeFileSync(rulesPath, before, 'utf8');
}

// Both normalizers are deterministic and idempotent. Importing them keeps
// local prepare:rules, CI, and the committed Firestore policy aligned.
await import('./apply-current-main-firestore-expression-budget.mjs');
await import('./optimize-current-main-technician-ticket-rule.mjs');

let text = readFileSync(rulesPath, 'utf8').replace(/\r\n?/g, '\n');
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
  'return hasDispatchAuthorityClaimOnly() && isNotSuspended();',
  'function hasApprovedTechnicianRecord() {',
  'match /fcmTokens/{tokenId} {',
  'match /deviceReadiness/{readinessId} {',
  'match /{subcollection}/{document=**} {\n        allow read, write: if false;',
  'allow list: if isNotSuspended() && (',
  'allow update: if isAdmin() && isNotSuspended();',
  'allow update: if hasNonAdminDispatchClaimOnly() && safeDispatcherTicketUpdate();',
  'allow update: if tenantOwns(resource.data) && safeTenantEvidenceUpdate();',
  'allow update: if hasTechnicianClaim() && techOwns(resource.data) && safeTechnicianTicketUpdate();',
  "!(collection in ['system_secrets', 'users', 'tickets', 'maintenanceTickets', 'broker_kyc_submission_limits']) && hasAdminClaim()",
  "'tickets',\n          'maintenanceTickets',\n          'audit_logs'",
  "'broker_kyc_profiles',\n          'broker_kyc_submission_limits',\n          'ai_usage'",
];

for (const fragment of required) {
  if (!text.includes(fragment)) throw new Error(`[final-firestore-authority] missing required fragment: ${fragment}`);
}

for (const rule of [
  'allow update: if isAdmin() && isNotSuspended();',
  'allow update: if hasNonAdminDispatchClaimOnly() && safeDispatcherTicketUpdate();',
  'allow update: if tenantOwns(resource.data) && safeTenantEvidenceUpdate();',
  'allow update: if hasTechnicianClaim() && techOwns(resource.data) && safeTechnicianTicketUpdate();',
]) {
  if (text.split(rule).length - 1 !== 2) {
    throw new Error(`[final-firestore-authority] actor-specific ticket rule must exist exactly twice: ${rule}`);
  }
}

const forbidden = [
  "get(/databases/$(database)/documents/users/$(request.auth.uid)).data.get('suspended', false) != true",
  "allow list: if (request.auth != null && request.auth.token.get('suspended', false) != true) && (",
  'allow read: if (signedIn() && request.auth.uid == userId) || canReadUserDirectory();',
  'allow create: if isNotSuspended() && (isAdmin() || (signedIn() && request.auth.uid == userId));',
  'allow update: if isAdmin() || safeDispatcherTicketUpdate() || safeTenantEvidenceUpdate() || safeTechnicianTicketUpdate();',
];

for (const fragment of forbidden) {
  if (text.includes(fragment)) throw new Error(`[final-firestore-authority] forbidden fragment remains: ${fragment}`);
}

console.log('[final-firestore-authority] status-aware, explicit, bounded rules are canonical');

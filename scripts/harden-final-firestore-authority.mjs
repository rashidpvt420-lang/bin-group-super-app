import { readFileSync, writeFileSync } from 'node:fs';

const rulesPath = 'firestore.rules';
const legacyReadCatchAll = "      allow read: if !(collection in ['system_secrets', 'users', 'tickets', 'maintenanceTickets']) && hasAdminClaim();";
const brokerReadCatchAll = "      allow read: if !(collection in ['system_secrets', 'users', 'tickets', 'maintenanceTickets', 'broker_kyc_submission_limits']) && hasAdminClaim();";
const boundedReadCatchAll = "      allow read: if collection != 'tickets' && collection != 'maintenanceTickets' && !(collection in ['system_secrets', 'users', 'broker_kyc_submission_limits']) && hasAdminClaim();";
const adminSecurityReadCatchAll = "      allow read: if collection != 'tickets' && collection != 'maintenanceTickets' && !(collection in ['system_secrets', 'users', 'broker_kyc_submission_limits', 'admin_security_sessions']) && hasAdminClaim();";
const legacyWriteList = `          'system_secrets',
          'users',
          'tickets',
          'maintenanceTickets',
          'audit_logs',`;
const boundedWriteList = `          'system_secrets',
          'users',
          'audit_logs',`;
const adminSecurityWriteList = `          'system_secrets',
          'users',
          'audit_logs',
          'admin_security_sessions',`;
const legacyCreateCatchAll = '      allow create: if !(';
const boundedCreateCatchAll = "      allow create: if collection != 'tickets' && collection != 'maintenanceTickets' && !(";
const legacyUpdateCatchAll = '      allow update, delete: if !(';
const boundedUpdateCatchAll = "      allow update, delete: if collection != 'tickets' && collection != 'maintenanceTickets' && !(";
const adminSecurityBlock = `    // Firebase Admin SDK only. Browser administrators must use App Check-protected callables.
    match /admin_security_sessions/{sessionId} {
      allow read, write: if false;
    }

`;

const reviewedRoleFields = Object.freeze({
  tenant: [
    'displayName',
    'phone',
    'phoneNumber',
    'mobile',
    'emergencyContact',
  ],
  owner: [
    'displayName',
    'phone',
    'phoneNumber',
    'mobile',
    'companyName',
    'ownerCompanyName',
    'billingContact',
  ],
  technician: [
    'displayName',
    'phone',
    'phoneNumber',
    'mobile',
    'requestedTrade',
    'serviceZonePreference',
    'emergencyContact',
  ],
  broker: [
    'displayName',
    'phone',
    'phoneNumber',
    'mobile',
    'companyName',
    'reraLicense',
    'reraStatus',
    'reraVerified',
    'primaryRegion',
    'brokerTerritory',
    'tradeLicenseNumber',
    'emiratesIdNumber',
    'passportNumber',
    'bankName',
    'bankAccountHolder',
    'bankIban',
    'iban',
    'commissionAgreementAccepted',
    'commissionAgreementAcceptedAt',
    'commissionTermsVersion',
    'brokerKycStatus',
    'brokerProfileCompletion',
    'profileCompletionScore',
  ],
});

function reviewedRoleMarker(role) {
  return `claimedRole() != '${role}' ||\n          !request.resource.data.diff(resource.data).affectedKeys().hasAny([\n            '${reviewedRoleFields[role][0]}'`;
}

function reviewedRoleGuard(role) {
  const fields = reviewedRoleFields[role]
    .map((field) => `            '${field}'`)
    .join(',\n');
  return `
        (
          claimedRole() != '${role}' ||
          !request.resource.data.diff(resource.data).affectedKeys().hasAny([
${fields}
          ])
        ) &&`;
}

function hardenReviewedRoleSelfUpdates(rulesText) {
  const functionStart = rulesText.indexOf('    function safeUserSelfUpdate(userId) {');
  const functionEnd = rulesText.indexOf('    function safeOwnerProfileCreate', functionStart);
  if (functionStart < 0 || functionEnd < 0) {
    throw new Error('[final-firestore-authority] safeUserSelfUpdate function boundaries missing');
  }

  let block = rulesText.slice(functionStart, functionEnd);
  const allowlistStart = block.indexOf('request.resource.data.diff(resource.data).affectedKeys().hasOnly([');
  const allowlistEndToken = '        ]) &&';
  const allowlistEnd = block.indexOf(allowlistEndToken, allowlistStart);
  if (allowlistStart < 0 || allowlistEnd < 0) {
    throw new Error('[final-firestore-authority] reviewed profile mutation allowlist boundary missing');
  }

  let insertionPoint = allowlistEnd + allowlistEndToken.length;
  for (const role of Object.keys(reviewedRoleFields)) {
    const marker = reviewedRoleMarker(role);
    if (block.includes(marker)) continue;
    const guard = reviewedRoleGuard(role);
    block = `${block.slice(0, insertionPoint)}${guard}${block.slice(insertionPoint)}`;
    insertionPoint += guard.length;
  }
  return `${rulesText.slice(0, functionStart)}${block}${rulesText.slice(functionEnd)}`;
}

let text = readFileSync(rulesPath, 'utf8').replace(/\r\n?/g, '\n');

await import('./optimize-current-main-technician-ticket-rule.mjs');
text = readFileSync(rulesPath, 'utf8').replace(/\r\n?/g, '\n');

if (!text.includes('match /admin_security_sessions/{sessionId}')) {
  const anchor = '    // Server-managed cryptographic material. Cloud Functions use the Admin SDK;';
  if (!text.includes(anchor)) {
    throw new Error('[final-firestore-authority] system secrets anchor missing for Admin security session block');
  }
  text = text.replace(anchor, `${adminSecurityBlock}${anchor}`);
}

if (text.includes(legacyReadCatchAll)) text = text.replace(legacyReadCatchAll, adminSecurityReadCatchAll);
if (text.includes(brokerReadCatchAll)) text = text.replace(brokerReadCatchAll, adminSecurityReadCatchAll);
if (text.includes(boundedReadCatchAll)) text = text.replace(boundedReadCatchAll, adminSecurityReadCatchAll);
if (!text.includes(adminSecurityReadCatchAll)) {
  throw new Error('[final-firestore-authority] global read catch-all could not be bounded with ticket, Broker KYC, and Admin security exclusions');
}

const legacyWriteCount = text.split(legacyWriteList).length - 1;
const boundedWriteCount = text.split(boundedWriteList).length - 1;
const adminSecurityWriteCount = text.split(adminSecurityWriteList).length - 1;
if (legacyWriteCount === 2 && boundedWriteCount === 0 && adminSecurityWriteCount === 0) {
  text = text.replaceAll(legacyWriteList, adminSecurityWriteList);
} else if (boundedWriteCount === 2 && legacyWriteCount === 0 && adminSecurityWriteCount === 0) {
  text = text.replaceAll(boundedWriteList, adminSecurityWriteList);
} else if (!(legacyWriteCount === 0 && adminSecurityWriteCount === 2)) {
  throw new Error(`[final-firestore-authority] unexpected ticket/Admin security write fallback lists: legacy=${legacyWriteCount}, bounded=${boundedWriteCount}, adminSecurity=${adminSecurityWriteCount}`);
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

text = hardenReviewedRoleSelfUpdates(text);
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
  "(!admin && !dispatcher && role in ['', 'tenant'] && tenantOwns(resource.data) && safeTenantEvidenceUpdate())",
  "(!admin && !dispatcher && role in ['technician', 'tech'] && techOwns(resource.data) && safeTechnicianTicketUpdate())",
  'return hasDispatchAuthorityClaimOnly() && isNotSuspended();',
  'function hasApprovedTechnicianRecord() {',
  'match /fcmTokens/{tokenId} {',
  'match /deviceReadiness/{readinessId} {',
  'match /{subcollection}/{document=**} {\n        allow read, write: if false;',
  'allow list: if isNotSuspended() && (',
  'allow update: if safeTicketUpdateByActor();',
  'match /admin_security_sessions/{sessionId} {',
  'allow read, write: if false;',
  ...Object.keys(reviewedRoleFields).map(reviewedRoleMarker),
  adminSecurityReadCatchAll.trim(),
  boundedCreateCatchAll.trim(),
  boundedUpdateCatchAll.trim(),
  "'system_secrets',\n          'users',\n          'audit_logs',\n          'admin_security_sessions'",
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
if (text.split('match /admin_security_sessions/{sessionId}').length - 1 !== 1) {
  throw new Error('[final-firestore-authority] Admin security session block must exist exactly once');
}
for (const role of Object.keys(reviewedRoleFields)) {
  const marker = reviewedRoleMarker(role);
  if (text.split(marker).length - 1 !== 1) {
    throw new Error(`[final-firestore-authority] ${role} reviewed profile guard must exist exactly once`);
  }
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
  boundedReadCatchAll.trim(),
  legacyReadCatchAll.trim(),
  legacyWriteList,
];

for (const fragment of forbidden) {
  if (text.includes(fragment)) throw new Error(`[final-firestore-authority] forbidden fragment remains: ${fragment}`);
}

console.log('[final-firestore-authority] status-aware ticket authorization, server-only Admin security sessions, reviewed profile authority for all five roles, and bounded global fallbacks are canonical');

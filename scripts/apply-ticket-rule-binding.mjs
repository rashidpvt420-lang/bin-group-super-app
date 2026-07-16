import { readFileSync, writeFileSync } from 'node:fs';

const file = 'firestore.rules';
let text = readFileSync(file, 'utf8').replace(/\r\n?/g, '\n');
let changed = false;

const canonicalCreate = "      allow create: if isAdmin() || canCreateTenantBoundTicket(request.resource.data);";
for (const legacyCreate of [
  "      allow create: if isAdmin() || hasPermission('canDispatchJobs') || ownerDraftCreate(request.resource.data) || tenantOwns(request.resource.data);",
  "      allow create: if canDispatchJobs() || ownerDraftCreate(request.resource.data) || canCreateTenantBoundTicket(request.resource.data);",
  "      allow create: if canDispatchJobs() || canCreateTenantBoundTicket(request.resource.data);",
]) {
  if (text.includes(legacyCreate)) {
    text = text.split(legacyCreate).join(canonicalCreate);
    changed = true;
  }
}

function removeRuleFunction(functionName) {
  const needle = `    function ${functionName}(`;
  let removed = 0;

  while (true) {
    const start = text.indexOf(needle);
    if (start < 0) break;
    const openingBrace = text.indexOf('{', start);
    if (openingBrace < 0) throw new Error(`[ticket-rule-binding] Could not locate opening brace for ${functionName}.`);

    let depth = 0;
    let end = -1;
    for (let index = openingBrace; index < text.length; index += 1) {
      if (text[index] === '{') depth += 1;
      if (text[index] === '}') {
        depth -= 1;
        if (depth === 0) {
          end = index + 1;
          while (text[end] === '\r' || text[end] === '\n') end += 1;
          break;
        }
      }
    }
    if (end < 0) throw new Error(`[ticket-rule-binding] Could not parse ${functionName}.`);
    text = `${text.slice(0, start)}${text.slice(end)}`;
    removed += 1;
    changed = true;
  }
  return removed;
}

const removedClaimFields = removeRuleFunction('missionClaimFieldsLookValid');
const removedDirectClaims = removeRuleFunction('safeOpenMissionClaim');
const removedOpenPool = removeRuleFunction('openMissionPoolRead');
const removedOpenAvailability = removeRuleFunction('openMissionAvailable');
removeRuleFunction('safeTicketUpdateByActor');

const directClaimReference = /\s*\|\|\s*safeOpenMissionClaim\(\)/g;
if (directClaimReference.test(text)) {
  text = text.replace(directClaimReference, '');
  changed = true;
}

const router = `    function safeTicketUpdateByActor() {
      // One ordered actor branch performs database-backed authorization. Cheap
      // token and ownership checks select the branch before profile reads or
      // append-only evidence validation.
      return signedIn() && (
        (hasAdminClaim() && isNotSuspended()) ||
        (hasNonAdminDispatchClaimOnly() && safeDispatcherTicketUpdate()) ||
        (claimedRole() in ['technician', 'tech'] && techOwns(resource.data) && safeTechnicianTicketUpdate()) ||
        (tenantOwns(resource.data) && safeTenantEvidenceUpdate())
      );
    }

`;
const routerAnchor = '    function canDispatchJobs() {';
if (!text.includes(routerAnchor)) throw new Error('[ticket-rule-binding] canDispatchJobs anchor is missing.');
text = text.replace(routerAnchor, `${router}${routerAnchor}`);
changed = true;

const monolithicUpdate = '      allow update: if isAdmin() || safeDispatcherTicketUpdate() || safeTenantEvidenceUpdate() || safeTechnicianTicketUpdate();';
const splitRules = [
  '      allow update: if isAdmin() && isNotSuspended();',
  '      allow update: if hasNonAdminDispatchClaimOnly() && safeDispatcherTicketUpdate();',
  '      allow update: if tenantOwns(resource.data) && safeTenantEvidenceUpdate();',
  '      allow update: if hasTechnicianClaim() && techOwns(resource.data) && safeTechnicianTicketUpdate();',
];
const canonicalUpdate = '      allow update: if safeTicketUpdateByActor();';

if (text.includes(monolithicUpdate)) {
  text = text.split(monolithicUpdate).join(canonicalUpdate);
  changed = true;
}
const splitBlock = splitRules.join('\n');
if (text.includes(splitBlock)) {
  text = text.split(splitBlock).join(canonicalUpdate);
  changed = true;
}

if (!text.includes('function hasNonAdminDispatchClaimOnly() {')) {
  throw new Error('[ticket-rule-binding] Non-admin dispatch authority helper is missing.');
}
if (text.split(canonicalUpdate).length - 1 !== 2) {
  throw new Error('[ticket-rule-binding] Expected exactly two single ticket update gates.');
}
if (text.split('function safeTicketUpdateByActor() {').length - 1 !== 1) {
  throw new Error('[ticket-rule-binding] Expected exactly one shared ticket update router.');
}

for (const forbidden of [
  'function safeOpenMissionClaim(',
  'function missionClaimFieldsLookValid(',
  'safeOpenMissionClaim()',
  'function openMissionPoolRead(',
  'function openMissionAvailable(',
  'openMissionPoolRead(resource.data)',
  monolithicUpdate.trim(),
  ...splitRules.map((rule) => rule.trim()),
]) {
  if (text.includes(forbidden)) {
    throw new Error(`[ticket-rule-binding] Forbidden ticket authorization fragment remains: ${forbidden}`);
  }
}

if (!text.includes(canonicalCreate)) {
  throw new Error('[ticket-rule-binding] Ticket creation is not callable/admin or tenant-binding authoritative.');
}

if (changed) writeFileSync(file, text);
console.log(`Applied bounded single ticket update gate (legacy helpers removed: ${removedClaimFields + removedDirectClaims + removedOpenPool + removedOpenAvailability}).`);

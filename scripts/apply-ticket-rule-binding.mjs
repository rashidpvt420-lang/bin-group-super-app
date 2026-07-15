import { readFileSync, writeFileSync } from 'node:fs';

const file = 'firestore.rules';
let text = readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
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
    if (openingBrace < 0) {
      throw new Error(`[ticket-rule-binding] Could not locate opening brace for ${functionName}.`);
    }

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

    if (end < 0) {
      throw new Error(`[ticket-rule-binding] Could not parse ${functionName}.`);
    }

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

const directClaimReference = /\s*\|\|\s*safeOpenMissionClaim\(\)/g;
if (directClaimReference.test(text)) {
  text = text.replace(directClaimReference, '');
  changed = true;
}

const canonicalTicketUpdate = '      allow update: if isAdmin() || safeDispatcherTicketUpdate() || safeTenantEvidenceUpdate() || safeTechnicianTicketUpdate();';
if (!text.includes(canonicalTicketUpdate)) {
  throw new Error('[ticket-rule-binding] Tickets update rule is not server-authoritative after cleanup.');
}

for (const forbidden of [
  'function safeOpenMissionClaim(',
  'function missionClaimFieldsLookValid(',
  'safeOpenMissionClaim()',
  'function openMissionPoolRead(',
  'function openMissionAvailable(',
  'openMissionPoolRead(resource.data)',
]) {
  if (text.includes(forbidden)) {
    throw new Error(`[ticket-rule-binding] Forbidden direct technician claim fragment remains: ${forbidden}`);
  }
}

if (!text.includes(canonicalCreate)) {
  throw new Error('[ticket-rule-binding] Ticket creation is not callable/admin or tenant-binding authoritative.');
}

if (changed) writeFileSync(file, text);

console.log(
  changed
    ? `Applied server-authoritative ticket dispatch cleanup (legacy helpers removed: ${removedClaimFields + removedDirectClaims + removedOpenPool + removedOpenAvailability}).`
    : 'Ticket and dispatch rules already server-authoritative.',
);

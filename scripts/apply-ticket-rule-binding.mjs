import { readFileSync, writeFileSync } from 'node:fs';

const file = 'firestore.rules';
let text = readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
let changed = false;

const oldCreate = "      allow create: if isAdmin() || hasPermission('canDispatchJobs') || ownerDraftCreate(request.resource.data) || tenantOwns(request.resource.data);";
const newCreate = "      allow create: if isAdmin() || hasPermission('canDispatchJobs') || ownerDraftCreate(request.resource.data) || canCreateTenantBoundTicket(request.resource.data);";

if (text.includes(oldCreate)) {
  text = text.split(oldCreate).join(newCreate);
  changed = true;
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

const canonicalPool = '    function openMissionPoolRead(data) { return isApprovedTechnician() && openMissionAvailable(data); }';
const poolPattern = /^    function openMissionPoolRead\(data\) \{ return .*openMissionAvailable\(data\); \}$/gm;
if (poolPattern.test(text)) {
  text = text.replace(poolPattern, canonicalPool);
  changed = true;
}

const removedClaimFields = removeRuleFunction('missionClaimFieldsLookValid');
const removedDirectClaims = removeRuleFunction('safeOpenMissionClaim');

const directClaimReference = /\s*\|\|\s*safeOpenMissionClaim\(\)/g;
if (directClaimReference.test(text)) {
  text = text.replace(directClaimReference, '');
  changed = true;
}

const canonicalTicketUpdate = '      allow update: if canDispatchJobs() || safeTenantEvidenceUpdate() || safeTechnicianTicketUpdate();';
if (!text.includes(canonicalTicketUpdate)) {
  throw new Error('[ticket-rule-binding] Tickets update rule is not server-authoritative after cleanup.');
}

const legacyAmenitySlotCreate = `      allow create: if signedIn() &&
        request.resource.data.get('tenantUid', null) == request.auth.uid &&
        request.resource.data.get('propertyId', null) == getTenantPropertyId();`;
const hardenedAmenitySlotCreate = `      allow create: if signedIn() &&
        request.resource.data.get('tenantUid', null) == request.auth.uid &&
        request.resource.data.get('propertyId', null) is string &&
        request.resource.data.get('propertyId', null) == getTenantPropertyId();`;

if (text.includes(legacyAmenitySlotCreate)) {
  text = text.replace(legacyAmenitySlotCreate, hardenedAmenitySlotCreate);
  changed = true;
} else if (!text.includes(hardenedAmenitySlotCreate)) {
  throw new Error('[ticket-rule-binding] Amenity slot create rule is missing or not property scoped.');
}

for (const forbidden of ['function safeOpenMissionClaim(', 'function missionClaimFieldsLookValid(', 'safeOpenMissionClaim()']) {
  if (text.includes(forbidden)) {
    throw new Error(`[ticket-rule-binding] Forbidden direct technician claim fragment remains: ${forbidden}`);
  }
}

if (!text.includes(canonicalPool)) {
  throw new Error('[ticket-rule-binding] Open mission visibility is not restricted to approved technicians.');
}

if (!text.includes(hardenedAmenitySlotCreate)) {
  throw new Error('[ticket-rule-binding] Amenity slot locks must require a non-null propertyId.');
}

if (changed) writeFileSync(file, text);

console.log(
  changed
    ? `Applied server-authoritative ticket dispatch and amenity scope cleanup (claim helpers removed: ${removedClaimFields + removedDirectClaims}).`
    : 'Ticket dispatch and amenity slot rules already server-authoritative.',
);

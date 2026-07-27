import './harden-property-geo-authority.mjs';
import { readFileSync, writeFileSync } from 'node:fs';

const file = 'firestore.rules';
let text = readFileSync(file, 'utf8').replace(/\r\n?/g, '\n');
let changed = false;

// Browser applications create canonical tickets through App Check callables.
// Direct Firestore creation remains Admin-only for controlled operations.
const canonicalCreate = '      allow create: if isAdmin();';
for (const legacyCreate of [
  "      allow create: if isAdmin() || canCreateTenantBoundTicket(request.resource.data);",
  "      allow create: if isAdmin() || hasPermission('canDispatchJobs') || ownerDraftCreate(request.resource.data) || tenantOwns(request.resource.data);",
  "      allow create: if canDispatchJobs() || ownerDraftCreate(request.resource.data) || canCreateTenantBoundTicket(request.resource.data);",
  "      allow create: if canDispatchJobs() || canCreateTenantBoundTicket(request.resource.data);",
]) {
  if (text.includes(legacyCreate)) {
    text = text.split(legacyCreate).join(canonicalCreate);
    changed = true;
  }
}

function blockEnd(input, openingBrace, label) {
  let depth = 0;
  for (let index = openingBrace; index < input.length; index += 1) {
    if (input[index] === '{') depth += 1;
    if (input[index] === '}') {
      depth -= 1;
      if (depth === 0) return index + 1;
    }
  }
  throw new Error(`[ticket-rule-binding] Could not parse ${label}.`);
}

function removeRuleFunction(functionName) {
  const needle = `    function ${functionName}(`;
  let removed = 0;
  while (true) {
    const start = text.indexOf(needle);
    if (start < 0) break;
    const openingBrace = text.indexOf('{', start);
    if (openingBrace < 0) throw new Error(`[ticket-rule-binding] Could not locate opening brace for ${functionName}.`);
    let end = blockEnd(text, openingBrace, functionName);
    while (text[end] === '\r' || text[end] === '\n') end += 1;
    text = `${text.slice(0, start)}${text.slice(end)}`;
    removed += 1;
    changed = true;
  }
  return removed;
}

function readMatchBlock(header, label) {
  const start = text.indexOf(header);
  if (start < 0) throw new Error(`[ticket-rule-binding] Missing ${label} block.`);
  if (text.indexOf(header, start + header.length) >= 0) throw new Error(`[ticket-rule-binding] Duplicate ${label} block.`);
  const openingBrace = start + header.length - 1;
  const end = blockEnd(text, openingBrace, label);
  return { start, end, content: text.slice(start, end) };
}

function replaceMatchBlock(header, replacement, label) {
  const current = readMatchBlock(header, label);
  if (current.content === replacement) return;
  text = `${text.slice(0, current.start)}${replacement}${text.slice(current.end)}`;
  changed = true;
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
      let authenticated = signedIn();
      let role = authenticated
        ? request.auth.token.get('role', request.auth.token.get('userRole', request.auth.token.get('primaryRole', '')))
        : '';
      let admin = authenticated && (
        (
          role == '' &&
          (
            request.auth.token.get('admin', false) == true ||
            request.auth.token.get('isAdmin', false) == true
          )
        ) ||
        request.auth.token.get('superAdmin', false) == true ||
        request.auth.token.get('super_admin', false) == true ||
        request.auth.token.get('ceo', false) == true ||
        role in ['admin', 'super_admin', 'ceo']
      );
      let dispatcher = authenticated && (
        ('permissions' in request.auth.token && request.auth.token.permissions.get('canDispatchJobs', false) == true) ||
        role in ['operations_admin', 'operations_manager', 'dispatcher']
      );
      return authenticated && (
        (admin && isNotSuspended()) ||
        (!admin && dispatcher && safeDispatcherTicketUpdate()) ||
        (!admin && !dispatcher && role in ['', 'tenant'] && tenantOwns(resource.data) && safeTenantEvidenceUpdate()) ||
        (!admin && !dispatcher && role in ['technician', 'tech'] && techOwns(resource.data) && safeTechnicianTicketUpdate())
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

if (!text.includes('function hasNonAdminDispatchClaimOnly() {')) throw new Error('[ticket-rule-binding] Non-admin dispatch authority helper is missing.');
const updateGateCount = text.split(canonicalUpdate).length - 1;
if (![1, 2].includes(updateGateCount)) throw new Error(`[ticket-rule-binding] Expected one canonical gate or two pre-retirement gates, found ${updateGateCount}.`);
if (text.split('function safeTicketUpdateByActor() {').length - 1 !== 1) throw new Error('[ticket-rule-binding] Expected exactly one shared ticket update router.');

for (const required of [
  'let authenticated = signedIn();',
  'let role = authenticated',
  'let admin = authenticated && (',
  'let dispatcher = authenticated && (',
  '(admin && isNotSuspended())',
  '(!admin && dispatcher && safeDispatcherTicketUpdate())',
  "(!admin && !dispatcher && role in ['', 'tenant'] && tenantOwns(resource.data) && safeTenantEvidenceUpdate())",
  "(!admin && !dispatcher && role in ['technician', 'tech'] && techOwns(resource.data) && safeTechnicianTicketUpdate())",
]) {
  if (!text.includes(required)) throw new Error(`[ticket-rule-binding] Bounded router fragment missing: ${required}`);
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
  'allow create: if isAdmin() || canCreateTenantBoundTicket(request.resource.data);',
]) {
  if (text.includes(forbidden)) throw new Error(`[ticket-rule-binding] Forbidden ticket authorization fragment remains: ${forbidden}`);
}

const legacyHeader = '    match /tickets/{ticketId} {';
const legacyReadOnlyBlock = `    match /tickets/{ticketId} {
      allow read: if isNotSuspended() && (participantCanRead(resource.data) || canDispatchJobs());
      allow create, update, delete: if false;
    }`;
replaceMatchBlock(legacyHeader, legacyReadOnlyBlock, 'legacy /tickets');

const maintenanceHeader = '    match /maintenanceTickets/{ticketId} {';
const maintenanceBlock = readMatchBlock(maintenanceHeader, 'canonical /maintenanceTickets').content;
for (const required of [
  'allow read: if isNotSuspended() && (participantCanRead(resource.data) || canDispatchJobs());',
  canonicalCreate.trim(),
  canonicalUpdate.trim(),
  'allow delete: if isAdmin();',
]) {
  if (!maintenanceBlock.includes(required)) throw new Error(`[ticket-rule-binding] Canonical /maintenanceTickets fragment is missing: ${required}`);
}

if (changed) writeFileSync(file, text);
console.log(`Applied canonical maintenanceTickets authority and read-only legacy tickets (legacy helpers removed: ${removedClaimFields + removedDirectClaims + removedOpenPool + removedOpenAvailability}).`);

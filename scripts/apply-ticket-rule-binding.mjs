import './harden-property-geo-authority.mjs';
import { readFileSync, writeFileSync } from 'node:fs';

const file = 'firestore.rules';
let text = readFileSync(file, 'utf8').replace(/\r\n?/g, '\n');
let changed = false;

// Browser applications create canonical tickets through App Check callables.
// Direct Firestore creation remains Admin-only for controlled non-terminal intake.
const canonicalCreate = '      allow create: if safeAdminTicketCreate();';
const assignedTechnicianList = '      allow list: if canListAssignedTechnicianTicket(resource.data);';
const dispatchList = '      allow list: if isNotSuspended() && canDispatchJobs();';
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

function ensureRuleInMatchBlock(header, rule, label) {
  const current = readMatchBlock(header, label);
  if (current.content.includes(rule)) return;
  const insertionPoint = current.start + header.length;
  text = `${text.slice(0, insertionPoint)}\n${rule}${text.slice(insertionPoint)}`;
  changed = true;
}

const removedClaimFields = removeRuleFunction('missionClaimFieldsLookValid');
const removedDirectClaims = removeRuleFunction('safeOpenMissionClaim');
const removedOpenPool = removeRuleFunction('openMissionPoolRead');
const removedOpenAvailability = removeRuleFunction('openMissionAvailable');
removeRuleFunction('isClosedTicketStatus');
removeRuleFunction('safeAdminTicketCreate');
removeRuleFunction('safeAdminTicketUpdate');
removeRuleFunction('safeTicketUpdateByActor');

const directClaimReference = /\s*\|\|\s*safeOpenMissionClaim\(\)/g;
if (directClaimReference.test(text)) {
  text = text.replace(directClaimReference, '');
  changed = true;
}

const router = `    function isClosedTicketStatus(status) {
      return status in [
        'CLOSED', 'closed',
        'CANCELLED', 'cancelled',
        'REJECTED', 'rejected',
        'RESOLVED', 'resolved'
      ];
    }

    function safeAdminTicketCreate() {
      // Closed/cancelled tickets are created only by audited server callables (Admin SDK).
      return isAdmin() && !isClosedTicketStatus(request.resource.data.get('status', 'OPEN'));
    }

    function safeAdminTicketUpdate() {
      // Admin browsers may not reopen a closed ticket by rewriting status (#1552).
      // Job evidence gate: an admin browser may still manage a ticket directly (estimates,
      // owner-approval routing, assignment, metadata) but can neither complete / resolve /
      // close a job nor write proof, arrival, approval, closure-gate or exception fields.
      // Those are callable-only, so the server evidence gate (functions/jobEvidenceGate.ts)
      // cannot be skipped by a direct write.
      let changed = request.resource.data.diff(resource.data).affectedKeys();
      let nextStatus = string(request.resource.data.get('status', '')).upper();
      return isAdmin() &&
        isNotSuspended() &&
        (
          !isClosedTicketStatus(resource.data.get('status', '')) ||
          request.resource.data.get('status', resource.data.get('status', '')) == resource.data.get('status', '')
        ) &&
        !changed.hasAny([
          'technicianBeforePhotos',
          'technicianBeforePhotoUrl',
          'technicianBeforeStoragePath',
          'technicianBeforeObjectGeneration',
          'technicianBeforeContentHash',
          'technicianBeforeEvidenceAt',
          'technicianBeforeEvidenceBy',
          'technicianBeforeEvidenceState',
          'technicianBeforeConfirmationId',
          'technicianAfterPhotos',
          'technicianAfterPhotoUrl',
          'technicianAfterStoragePath',
          'technicianAfterObjectGeneration',
          'technicianAfterContentHash',
          'technicianAfterEvidenceAt',
          'technicianAfterEvidenceBy',
          'technicianAfterEvidenceState',
          'technicianAfterConfirmationId',
          'arrivedAt',
          'arrivedLocation',
          'gpsVerified',
          'gpsVerifiedAt',
          'onSiteVerification',
          'physicalDeviceBound',
          'arrivalEvidenceMode',
          'reopenedAt',
          'completedAt',
          'closedAt',
          'closureSource',
          'closureStatus',
          'finalApproval',
          'tenantApproved',
          'tenantApprovalStatus',
          'ownerApproved',
          'ownerVerifiedAt',
          'closureEvidenceGate',
          'evidenceExceptionId',
          'evidenceExceptionStatus',
          'evidenceExceptionRequestedAt',
          'evidenceExceptionDecidedAt',
          'evidenceExceptionDecidedBy'
        ]) &&
        (
          !changed.hasAny(['status']) ||
          !(nextStatus in [
            'COMPLETED',
            'COMPLETED_PENDING_APPROVAL',
            'COMPLETED_PENDING_TENANT_APPROVAL',
            'CLOSED',
            'RESOLVED',
            'RESOLVED_PENDING_APPROVAL',
            'TENANT_APPROVED',
            'AWAITING_REVIEW',
            'PENDING_TENANT_REVIEW'
          ])
        );
    }

    function safeTicketUpdateByActor() {
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
        (admin && safeAdminTicketUpdate()) ||
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
  'function isClosedTicketStatus(status) {',
  'function safeAdminTicketCreate() {',
  'function safeAdminTicketUpdate() {',
  'let authenticated = signedIn();',
  'let role = authenticated',
  'let admin = authenticated && (',
  'let dispatcher = authenticated && (',
  '(admin && safeAdminTicketUpdate())',
  'function safeAdminTicketUpdate() {',
  "'closureEvidenceGate',",
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
${assignedTechnicianList}
${dispatchList}
      allow read: if isNotSuspended() && (participantCanRead(resource.data) || canDispatchJobs());
      allow create, update, delete: if false;
    }`;
replaceMatchBlock(legacyHeader, legacyReadOnlyBlock, 'legacy /tickets');

const maintenanceHeader = '    match /maintenanceTickets/{ticketId} {';
ensureRuleInMatchBlock(maintenanceHeader, dispatchList, 'canonical /maintenanceTickets');
const maintenanceBeforeCreate = readMatchBlock(maintenanceHeader, 'canonical /maintenanceTickets');
const legacyAdminCreate = '      allow create: if isAdmin();';
if (maintenanceBeforeCreate.content.includes(legacyAdminCreate)) {
  const repaired = maintenanceBeforeCreate.content.split(legacyAdminCreate).join(canonicalCreate);
  text = `${text.slice(0, maintenanceBeforeCreate.start)}${repaired}${text.slice(maintenanceBeforeCreate.end)}`;
  changed = true;
}
const maintenanceBlock = readMatchBlock(maintenanceHeader, 'canonical /maintenanceTickets').content;
for (const required of [
  assignedTechnicianList.trim(),
  dispatchList.trim(),
  'allow read: if isNotSuspended() && (participantCanRead(resource.data) || canDispatchJobs());',
  canonicalCreate.trim(),
  canonicalUpdate.trim(),
  'allow delete: if isAdmin();',
]) {
  if (!maintenanceBlock.includes(required)) throw new Error(`[ticket-rule-binding] Canonical /maintenanceTickets fragment is missing: ${required}`);
}

if (changed) writeFileSync(file, text);
console.log(`Applied canonical maintenanceTickets authority and read-only legacy tickets (legacy helpers removed: ${removedClaimFields + removedDirectClaims + removedOpenPool + removedOpenAvailability}).`);

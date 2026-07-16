import fs from 'node:fs';

const rulesPath = 'firestore.rules';
let rules = fs.readFileSync(rulesPath, 'utf8').replace(/\r\n?/g, '\n');

function readFunction(source, name) {
  const needle = `    function ${name}(`;
  const start = source.indexOf(needle);
  if (start < 0) throw new Error(`Function not found: ${name}`);
  const open = source.indexOf('{', start);
  let depth = 0;
  for (let index = open; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1;
    if (source[index] === '}') {
      depth -= 1;
      if (depth === 0) return { start, end: index + 1, text: source.slice(start, index + 1) };
    }
  }
  throw new Error(`Unclosed function: ${name}`);
}

function replaceFunction(source, name, replacement) {
  const current = readFunction(source, name);
  if (current.text === replacement) {
    console.log(`[already applied] ${name}`);
    return source;
  }
  console.log(`[patched] ${name}`);
  return source.slice(0, current.start) + replacement + source.slice(current.end);
}

function replaceExpectedCount(source, before, after, expected, label) {
  const beforeCount = source.split(before).length - 1;
  const afterCount = source.split(after).length - 1;
  if (beforeCount === 0 && afterCount === expected) {
    console.log(`[already applied] ${label}`);
    return source;
  }
  if (beforeCount !== expected || afterCount !== 0) {
    throw new Error(`${label}: before=${beforeCount}, after=${afterCount}, expected=${expected}`);
  }
  console.log(`[patched] ${label}`);
  return source.split(before).join(after);
}

const dispatchMarker = `    function hasDispatchAuthorityClaimOnly() {
      return signedIn() && (
        hasAdminClaim() ||
        hasPermission('canDispatchJobs') ||
        claimedRole() in ['operations_admin', 'operations_manager', 'dispatcher']
      );
    }`;
const dispatchWithNonAdmin = `${dispatchMarker}

    function hasNonAdminDispatchClaimOnly() {
      return signedIn() && (
        hasPermission('canDispatchJobs') ||
        claimedRole() in ['operations_admin', 'operations_manager', 'dispatcher']
      );
    }`;
if (!rules.includes('    function hasNonAdminDispatchClaimOnly() {')) {
  if (!rules.includes(dispatchMarker)) throw new Error('Dispatch authority helper baseline not found.');
  rules = rules.replace(dispatchMarker, dispatchWithNonAdmin);
  console.log('[patched] non-admin dispatch authority helper');
}

const tenantEvidence = `    function safeTenantEvidenceUpdate() {
      // The outer rule already proves ticket ownership. Reject unrelated fields
      // before the database-backed suspension check and array invariants.
      return request.resource.data.diff(resource.data).affectedKeys().hasOnly([
          'photos',
          'primaryPhotoUrl',
          'tenantPhotos',
          'evidenceStatus',
          'evidenceUploadedAt',
          'evidenceUploadError',
          'updatedAt'
        ]) &&
        isNotSuspended() &&
        resource.data.get('evidenceStatus', '') != 'TENANT_EVIDENCE_UPLOADED' &&
        (!('evidenceStatus' in request.resource.data) || request.resource.data.evidenceStatus in ['PENDING_TENANT_UPLOAD', 'TENANT_EVIDENCE_UPLOADED', 'TENANT_EVIDENCE_UPLOAD_FAILED']) &&
        request.resource.data.get('photos', []).size() >= resource.data.get('photos', []).size() &&
        request.resource.data.get('photos', []).hasAll(resource.data.get('photos', [])) &&
        request.resource.data.get('tenantPhotos', []).size() >= resource.data.get('tenantPhotos', []).size() &&
        request.resource.data.get('tenantPhotos', []).hasAll(resource.data.get('tenantPhotos', [])) &&
        (
          resource.data.get('primaryPhotoUrl', '') == '' ||
          request.resource.data.get('primaryPhotoUrl', '') == resource.data.get('primaryPhotoUrl', '')
        );
    }`;
rules = replaceFunction(rules, 'safeTenantEvidenceUpdate', tenantEvidence);

const dispatcherUpdate = `    function safeDispatcherTicketUpdate() {
      // The outer rule proves dispatch authority. Reject unrelated fields before
      // the database-backed suspension check.
      return request.resource.data.diff(resource.data).affectedKeys().hasOnly([
          'assignedTechnicianId',
          'technicianId',
          'techId',
          'status',
          'dispatchStatus',
          'assignedAt',
          'autoAssignedAt',
          'reassignedAt',
          'assignmentSource',
          'reassignmentReason',
          'assignedBy',
          'assignedByRole',
          'updatedAt'
        ]) &&
        isNotSuspended() &&
        request.resource.data.get('status', resource.data.get('status', '')) in [
          'OPEN',
          'open',
          'PENDING_ASSIGNMENT',
          'pending_assignment',
          'EMERGENCY_SUBMITTED',
          'emergency_submitted',
          'ASSIGNED',
          'assigned',
          'AUTO_ASSIGNED',
          'auto_assigned',
          'REASSIGNED',
          'reassigned'
        ];
    }`;
rules = replaceFunction(rules, 'safeDispatcherTicketUpdate', dispatcherUpdate);

const technicianUpdate = `    function safeTechnicianTicketUpdate() {
      // The outer rule proves the technician claim and current assignment.
      // Mutation shape is checked before suspension and approval profile reads.
      return request.resource.data.diff(resource.data).affectedKeys().hasOnly([
          'updatedAt',
          'technicianNotes',
          'techNotes',
          'workNotes',
          'notes',
          'beforePhotos',
          'afterPhotos',
          'afterPhotoUrl',
          'proofPhotos',
          'completionPhotos',
          'evidencePhotos',
          'evidenceStatus',
          'resolutionSummary',
          'materialsUsed',
          'partsDisposition',
          'proofReadiness',
          'arrivedLocation',
          'technicianLocation',
          'technicianLocationUpdatedAt'
        ]) &&
        isNotSuspended() &&
        isApprovedTechnician() &&
        !(resource.data.get('status', '') in ['COMPLETED', 'completed', 'CLOSED', 'closed', 'TENANT_APPROVED']) &&
        request.resource.data.get('beforePhotos', []).size() >= resource.data.get('beforePhotos', []).size() &&
        request.resource.data.get('beforePhotos', []).hasAll(resource.data.get('beforePhotos', [])) &&
        request.resource.data.get('afterPhotos', []).size() >= resource.data.get('afterPhotos', []).size() &&
        request.resource.data.get('afterPhotos', []).hasAll(resource.data.get('afterPhotos', [])) &&
        request.resource.data.get('proofPhotos', []).size() >= resource.data.get('proofPhotos', []).size() &&
        request.resource.data.get('proofPhotos', []).hasAll(resource.data.get('proofPhotos', [])) &&
        request.resource.data.get('completionPhotos', []).size() >= resource.data.get('completionPhotos', []).size() &&
        request.resource.data.get('completionPhotos', []).hasAll(resource.data.get('completionPhotos', [])) &&
        request.resource.data.get('evidencePhotos', []).size() >= resource.data.get('evidencePhotos', []).size() &&
        request.resource.data.get('evidencePhotos', []).hasAll(resource.data.get('evidencePhotos', [])) &&
        (
          resource.data.get('afterPhotoUrl', '') == '' ||
          request.resource.data.get('afterPhotoUrl', '') == resource.data.get('afterPhotoUrl', '')
        );
    }`;
rules = replaceFunction(rules, 'safeTechnicianTicketUpdate', technicianUpdate);

const monolithicUpdate = '      allow update: if isAdmin() || safeDispatcherTicketUpdate() || safeTenantEvidenceUpdate() || safeTechnicianTicketUpdate();';
const splitUpdate = `      allow update: if isAdmin() && isNotSuspended();
      allow update: if hasNonAdminDispatchClaimOnly() && safeDispatcherTicketUpdate();
      allow update: if tenantOwns(resource.data) && safeTenantEvidenceUpdate();
      allow update: if hasTechnicianClaim() && techOwns(resource.data) && safeTechnicianTicketUpdate();`;
rules = replaceExpectedCount(rules, monolithicUpdate, splitUpdate, 2, 'actor-specific ticket update rules');

const readCatchAll = "      allow read: if !(collection in ['system_secrets', 'users']) && hasAdminClaim();";
const readCatchAllFinal = "      allow read: if !(collection in ['system_secrets', 'users', 'tickets', 'maintenanceTickets']) && hasAdminClaim();";
if (rules.includes(readCatchAll)) {
  rules = rules.replace(readCatchAll, readCatchAllFinal);
  console.log('[patched] ticket read catch-all exclusion');
} else if (!rules.includes(readCatchAllFinal)) {
  throw new Error('Global read catch-all baseline not found.');
}

const writeList = `          'system_secrets',
          'users',
          'audit_logs',`;
const writeListFinal = `          'system_secrets',
          'users',
          'tickets',
          'maintenanceTickets',
          'audit_logs',`;
rules = replaceExpectedCount(rules, writeList, writeListFinal, 2, 'ticket write catch-all exclusions');

for (const required of [
  'function hasNonAdminDispatchClaimOnly() {',
  'allow update: if isAdmin() && isNotSuspended();',
  'allow update: if hasNonAdminDispatchClaimOnly() && safeDispatcherTicketUpdate();',
  'allow update: if tenantOwns(resource.data) && safeTenantEvidenceUpdate();',
  'allow update: if hasTechnicianClaim() && techOwns(resource.data) && safeTechnicianTicketUpdate();',
  "!(collection in ['system_secrets', 'users', 'tickets', 'maintenanceTickets']) && hasAdminClaim()",
  "'tickets',\n          'maintenanceTickets',\n          'audit_logs'",
]) {
  if (!rules.includes(required)) throw new Error(`Required expression-budget fragment missing: ${required}`);
}

if (rules.includes(monolithicUpdate)) throw new Error('Monolithic ticket update rule remains.');

fs.writeFileSync(rulesPath, rules, 'utf8');
console.log('[current-main-expression-budget] Firestore ticket rules patched');

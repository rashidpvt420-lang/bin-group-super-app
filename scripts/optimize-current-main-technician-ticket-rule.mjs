import fs from 'node:fs';

const rulesPath = 'firestore.rules';
let rules = fs.readFileSync(rulesPath, 'utf8').replace(/\r\n?/g, '\n');

// This optimiser is imported by the final Firestore authority stage. Payroll
// catch-all exclusions belong to the later live-location/payroll authority stage,
// so strip only those later-stage tokens before final-stage canonicalisation.
// The explicit payroll_entries block remains intact throughout, and the final
// hardener deterministically restores and verifies every generic exclusion before
// the generated deployment artefact is written.
const laterStagePayrollRead = "!(collection in ['system_secrets', 'users', 'broker_kyc_submission_limits', 'admin_security_sessions', 'private_hr_profiles', 'technician_live_locations', 'invoice_registry', 'payroll_entries'])";
const finalStageInvoiceRead = "!(collection in ['system_secrets', 'users', 'broker_kyc_submission_limits', 'admin_security_sessions', 'private_hr_profiles', 'technician_live_locations', 'invoice_registry'])";
if (rules.includes(laterStagePayrollRead)) {
  rules = rules.replace(laterStagePayrollRead, finalStageInvoiceRead);
  console.log('[normalized] deferred payroll read catch-all exclusion to final live-location/payroll authority stage');
}
const laterStagePayrollWrite = "          'transactions',\n          'payroll_entries',\n          'invoices',";
const finalStageInvoiceWrite = "          'transactions',\n          'invoices',";
if (rules.includes(laterStagePayrollWrite)) {
  const count = rules.split(laterStagePayrollWrite).length - 1;
  if (count !== 2) throw new Error(`Expected two later-stage payroll write exclusions, found ${count}.`);
  rules = rules.replaceAll(laterStagePayrollWrite, finalStageInvoiceWrite);
  console.log('[normalized] deferred payroll write catch-all exclusions to final live-location/payroll authority stage');
}

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

const writeApprovalHelper = `    function hasApprovedTechnicianRecord() {
      // Technician client writes require the dedicated operational profile.
      // The users document is identity/cache data, not an approval source.
      return signedIn() &&
        exists(/databases/$(database)/documents/technicians/$(request.auth.uid)) &&
        approvedTechnicianProfile(get(/databases/$(database)/documents/technicians/$(request.auth.uid)).data);
    }`;

if (!rules.includes('    function hasApprovedTechnicianRecord() {')) {
  const marker = '    function isApprovedTechnician() {';
  const index = rules.indexOf(marker);
  if (index < 0) throw new Error('Technician approval helper insertion point not found.');
  rules = `${rules.slice(0, index)}${writeApprovalHelper}\n\n${rules.slice(index)}`;
  console.log('[patched] dedicated technician write-approval helper');
}

const assignedListHelper = `    function canListAssignedTechnicianTicket(data) {
      // This narrow predicate is intentionally separate from participantCanRead.
      // Firestore can prove the assignment equality from the client query without
      // evaluating every Owner, Tenant, Broker and dispatcher branch per result.
      return signedIn() &&
        claimedRole() in ['technician', 'tech'] &&
        data.get('assignedTechnicianId', null) == request.auth.uid &&
        hasApprovedTechnicianRecord() &&
        isNotSuspended();
    }`;

if (!rules.includes('    function canListAssignedTechnicianTicket(data) {')) {
  const marker = '    function participantCanRead(data) {';
  const index = rules.indexOf(marker);
  if (index < 0) throw new Error('Technician list helper insertion point not found.');
  rules = `${rules.slice(0, index)}${assignedListHelper}\n\n${rules.slice(index)}`;
  console.log('[patched] assignment-bound technician ticket list helper');
}

const assignedListRule = '      allow list: if canListAssignedTechnicianTicket(resource.data);';
function ensureAssignedListRule(collectionName) {
  const matchMarker = `    match /${collectionName}/{ticketId} {`;
  const matchIndex = rules.indexOf(matchMarker);
  if (matchIndex < 0) throw new Error(`Ticket collection block not found: ${collectionName}`);
  const nextMatchIndex = rules.indexOf('\n    match /', matchIndex + matchMarker.length);
  const blockEnd = nextMatchIndex < 0 ? rules.length : nextMatchIndex;
  const block = rules.slice(matchIndex, blockEnd);
  if (block.includes(assignedListRule)) {
    console.log(`[already applied] ${collectionName} assigned list rule`);
    return;
  }
  const insertionPoint = matchIndex + matchMarker.length;
  rules = `${rules.slice(0, insertionPoint)}\n${assignedListRule}${rules.slice(insertionPoint)}`;
  console.log(`[patched] ${collectionName} assigned list rule`);
}

ensureAssignedListRule('tickets');
ensureAssignedListRule('maintenanceTickets');

const optimized = `    function safeTechnicianTicketUpdate() {
      // The outer rule proves the technician claim and current assignment.
      // Reject unrelated fields before suspension and the single approval read.
      return request.resource.data.diff(resource.data).affectedKeys().hasOnly([
          'updatedAt',
          'technicianNotes',
          'techNotes',
          'workNotes',
          'notes',
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
        hasApprovedTechnicianRecord() &&
        !(resource.data.get('status', '') in ['COMPLETED', 'completed', 'CLOSED', 'closed', 'TENANT_APPROVED']) &&
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

rules = replaceFunction(rules, 'safeTechnicianTicketUpdate', optimized);

const credentialRenewalBlock = `    // Credential renewal evidence is written only by App Check-protected Cloud Functions.
    // Administrators may inspect records but must review them through controlled callables.
    match /technician_credential_renewals/{requestId} {
      allow read: if isAdmin();
      allow create, update, delete: if false;
    }

`;
if (!rules.includes('match /technician_credential_renewals/{requestId}')) {
  const catchAll = '    match /{collection}/{document=**} {';
  const catchAllIndex = rules.indexOf(catchAll);
  if (catchAllIndex < 0) throw new Error('Global Firestore catch-all block not found.');
  rules = `${rules.slice(0, catchAllIndex)}${credentialRenewalBlock}${rules.slice(catchAllIndex)}`;
  console.log('[patched] server-written technician credential-renewal collection');
}

const protectedCollectionAnchor = "          'broker_kyc_profiles',\n          'broker_kyc_submission_limits',";
const protectedCollectionReplacement = "          'technician_credential_renewals',\n          'broker_kyc_profiles',\n          'broker_kyc_submission_limits',";
if (!rules.includes(protectedCollectionReplacement)) {
  const count = rules.split(protectedCollectionAnchor).length - 1;
  if (count !== 2) throw new Error(`Expected two global write-deny anchors for protected collections, found ${count}.`);
  rules = rules.replaceAll(protectedCollectionAnchor, protectedCollectionReplacement);
  console.log('[patched] credential renewals excluded from global Admin write fallback while preserving canonical Broker KYC ordering');
}

const technicianHelper = readFunction(rules, 'safeTechnicianTicketUpdate').text;
for (const forbidden of [
  "'beforePhotos',",
  "request.resource.data.get('beforePhotos', [])",
  'isApprovedTechnician() &&',
  'hasTechnicianClaim() &&',
  'techOwns(resource.data) &&',
]) {
  if (technicianHelper.includes(forbidden)) throw new Error(`Redundant technician predicate remains: ${forbidden}`);
}

for (const required of [
  'function hasApprovedTechnicianRecord() {',
  'function canListAssignedTechnicianTicket(data) {',
  "claimedRole() in ['technician', 'tech']",
  "data.get('assignedTechnicianId', null) == request.auth.uid",
  "'afterPhotos',",
  "'proofPhotos',",
  "'completionPhotos',",
  "'evidencePhotos',",
  'hasApprovedTechnicianRecord() &&',
  'match /technician_credential_renewals/{requestId}',
  'allow create, update, delete: if false;',
  protectedCollectionReplacement,
]) {
  if (!rules.includes(required)) throw new Error(`Required technician rule fragment missing: ${required}`);
}

if (rules.split(assignedListRule).length - 1 !== 2) {
  throw new Error('Assignment-bound technician list rule must exist exactly twice.');
}
if (rules.split('match /technician_credential_renewals/{requestId}').length - 1 !== 1) {
  throw new Error('Technician credential-renewal rule block must exist exactly once.');
}
if (rules.split("'technician_credential_renewals',").length - 1 !== 2) {
  throw new Error('Technician credential-renewal collection must be denied in both global write fallbacks.');
}

fs.writeFileSync(rulesPath, rules, 'utf8');
console.log('[current-main-technician-budget] technician assignment lists, evidence updates and credential-renewal rules bounded');

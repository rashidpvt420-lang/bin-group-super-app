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
  "'afterPhotos',",
  "'proofPhotos',",
  "'completionPhotos',",
  "'evidencePhotos',",
  'hasApprovedTechnicianRecord() &&',
]) {
  if (!rules.includes(required)) throw new Error(`Required technician rule fragment missing: ${required}`);
}

fs.writeFileSync(rulesPath, rules, 'utf8');
console.log('[current-main-technician-budget] technician evidence rule bounded');

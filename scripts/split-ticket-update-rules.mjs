import fs from 'node:fs';

const rulesPath = 'firestore.rules';
let rules = fs.readFileSync(rulesPath, 'utf8').replace(/\r\n?/g, '\n');

function replaceOnce(source, before, after, label) {
  const count = source.split(before).length - 1;
  if (count === 0 && source.includes(after)) {
    console.log(`[already applied] ${label}`);
    return source;
  }
  if (count !== 1) {
    throw new Error(`${label}: expected one source block, found ${count}.`);
  }
  console.log(`[patched] ${label}`);
  return source.replace(before, after);
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
      if (depth === 0) {
        return { start, end: index + 1, text: source.slice(start, index + 1) };
      }
    }
  }
  throw new Error(`Unclosed function: ${name}`);
}

function replaceFunction(source, name, transform) {
  const current = readFunction(source, name);
  const next = transform(current.text);
  if (next === current.text) {
    console.log(`[already applied] ${name}`);
    return source;
  }
  console.log(`[patched] ${name}`);
  return source.slice(0, current.start) + next + source.slice(current.end);
}

function removeFunction(source, name) {
  if (!source.includes(`    function ${name}(`)) return source;
  const current = readFunction(source, name);
  let end = current.end;
  while (source[end] === '\r' || source[end] === '\n') end += 1;
  console.log(`[removed] ${name}`);
  return source.slice(0, current.start) + source.slice(end);
}

rules = replaceOnce(
  rules,
`    function hasDispatchAuthorityClaimOnly() {
      return signedIn() && (
        hasAdminClaim() ||
        hasPermission('canDispatchJobs') ||
        claimedRole() in ['operations_admin', 'operations_manager', 'dispatcher']
      );
    }`,
`    function hasDispatchAuthorityClaimOnly() {
      return signedIn() && (
        hasAdminClaim() ||
        hasPermission('canDispatchJobs') ||
        claimedRole() in ['operations_admin', 'operations_manager', 'dispatcher']
      );
    }

    function hasNonAdminDispatchClaimOnly() {
      return signedIn() && (
        hasPermission('canDispatchJobs') ||
        claimedRole() in ['operations_admin', 'operations_manager', 'dispatcher']
      );
    }`,
  'non-admin dispatch claim helper',
);

rules = replaceFunction(rules, 'safeTenantEvidenceUpdate', (text) => {
  const before = `      return signedIn() &&
        tenantOwns(resource.data) &&
        isNotSuspended() &&
        // Reject unrelated mutations before evaluating array invariants.
        request.resource.data.diff(resource.data).affectedKeys().hasOnly([`;
  const after = `      return signedIn() &&
        // Reject unrelated mutations before database reads and array invariants.
        request.resource.data.diff(resource.data).affectedKeys().hasOnly([`;
  let next = text.replace(before, after);
  if (next === text && !text.includes('before database reads and array invariants')) {
    throw new Error('safeTenantEvidenceUpdate prefix did not match.');
  }
  const marker = `        ]) &&
        resource.data.get('evidenceStatus', '') != 'TENANT_EVIDENCE_UPLOADED'`;
  const replacement = `        ]) &&
        isNotSuspended() &&
        resource.data.get('evidenceStatus', '') != 'TENANT_EVIDENCE_UPLOADED'`;
  next = next.replace(marker, replacement);
  if (!next.includes(replacement)) throw new Error('safeTenantEvidenceUpdate guard insertion failed.');
  return next;
});

rules = replaceFunction(rules, 'safeDispatcherTicketUpdate', (text) => {
  const before = `      // Non-dispatch callers fail on claims before any Firestore profile read.
      return hasDispatchAuthorityClaimOnly() &&
        isNotSuspended() &&
        request.resource.data.diff(resource.data).affectedKeys().hasOnly([`;
  const after = `      // Non-dispatch callers and unrelated mutations fail before database reads.
      return hasNonAdminDispatchClaimOnly() &&
        request.resource.data.diff(resource.data).affectedKeys().hasOnly([`;
  let next = text.replace(before, after);
  if (next === text && !text.includes('unrelated mutations fail before database reads')) {
    throw new Error('safeDispatcherTicketUpdate prefix did not match.');
  }
  const marker = `        ]) &&
        request.resource.data.get('status', resource.data.get('status', '')) in [`;
  const replacement = `        ]) &&
        isNotSuspended() &&
        request.resource.data.get('status', resource.data.get('status', '')) in [`;
  next = next.replace(marker, replacement);
  if (!next.includes(replacement)) throw new Error('safeDispatcherTicketUpdate guard insertion failed.');
  return next;
});

rules = replaceFunction(rules, 'safeTechnicianTicketUpdate', (text) => {
  const before = `      // Non-technicians and unassigned technicians fail before profile reads.
      return hasTechnicianClaim() &&
        techOwns(resource.data) &&
        isNotSuspended() &&
        isApprovedTechnician() &&
        !(resource.data.get('status', '') in ['COMPLETED', 'completed', 'CLOSED', 'closed', 'TENANT_APPROVED']) &&
        request.resource.data.diff(resource.data).affectedKeys().hasOnly([`;
  const after = `      // Non-technicians, unassigned technicians, and unrelated mutations
      // fail before suspension and approval profile reads.
      return hasTechnicianClaim() &&
        techOwns(resource.data) &&
        request.resource.data.diff(resource.data).affectedKeys().hasOnly([`;
  let next = text.replace(before, after);
  if (next === text && !text.includes('fail before suspension and approval profile reads')) {
    throw new Error('safeTechnicianTicketUpdate prefix did not match.');
  }
  const marker = `        ]) &&
        request.resource.data.get('beforePhotos', []).size()`;
  const replacement = `        ]) &&
        isNotSuspended() &&
        isApprovedTechnician() &&
        !(resource.data.get('status', '') in ['COMPLETED', 'completed', 'CLOSED', 'closed', 'TENANT_APPROVED']) &&
        request.resource.data.get('beforePhotos', []).size()`;
  next = next.replace(marker, replacement);
  if (!next.includes(replacement)) throw new Error('safeTechnicianTicketUpdate guard insertion failed.');
  return next;
});

rules = removeFunction(rules, 'safeTicketUpdateByActor');

const routedRule = '      allow update: if safeTicketUpdateByActor();';
const splitRules = `      allow update: if isAdmin() && isNotSuspended();
      allow update: if hasNonAdminDispatchClaimOnly() && safeDispatcherTicketUpdate();
      allow update: if tenantOwns(resource.data) && safeTenantEvidenceUpdate();
      allow update: if hasTechnicianClaim() && techOwns(resource.data) && safeTechnicianTicketUpdate();`;
const routedCount = rules.split(routedRule).length - 1;
if (routedCount === 2) {
  rules = rules.split(routedRule).join(splitRules);
  console.log('[patched] split ticket update allow rules');
} else if (routedCount !== 0 || rules.split(splitRules).length - 1 !== 2) {
  throw new Error(`Ticket update rule count invalid: routed=${routedCount}, split=${rules.split(splitRules).length - 1}.`);
}

for (const required of [
  'function hasNonAdminDispatchClaimOnly() {',
  'allow update: if isAdmin() && isNotSuspended();',
  'allow update: if hasNonAdminDispatchClaimOnly() && safeDispatcherTicketUpdate();',
  'allow update: if tenantOwns(resource.data) && safeTenantEvidenceUpdate();',
  'allow update: if hasTechnicianClaim() && techOwns(resource.data) && safeTechnicianTicketUpdate();',
]) {
  if (!rules.includes(required)) throw new Error(`Required split rule missing: ${required}`);
}

if (rules.includes('function safeTicketUpdateByActor() {') || rules.includes(routedRule)) {
  throw new Error('Legacy shared ticket router remains.');
}

fs.writeFileSync(rulesPath, rules, 'utf8');
console.log('[split-ticket-update-rules] explicit actor-gated ticket rules installed');

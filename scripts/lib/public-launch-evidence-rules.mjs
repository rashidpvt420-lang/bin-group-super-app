const HELPER_MARKER = "    function canReadUserDirectory() {";
const GLOBAL_FALLBACK_HEADER = '    match /{collection}/{document=**} {';

const LAUNCH_EVIDENCE_HELPERS = `    function canReadLaunchEvidence() {
      return isNotSuspended() && (
        isAdmin() ||
        hasPermission('canManageLaunchEvidence') ||
        claimedRole() in ['manager', 'operations_admin', 'finance_admin', 'hr_admin', 'support_admin']
      );
    }

    function canManageLaunchEvidence() {
      return isNotSuspended() && (
        isAdmin() ||
        hasPermission('canManageLaunchEvidence')
      );
    }

    function validLaunchEvidenceCreate(data) {
      return canManageLaunchEvidence() &&
        data.get('schemaVersion', 0) == 2 &&
        data.get('source', '') == 'admin-command-center' &&
        data.get('gateId', '') is string && data.get('gateId', '').size() > 0 && data.get('gateId', '').size() <= 120 &&
        data.get('gateTitle', '') is string && data.get('gateTitle', '').size() > 0 && data.get('gateTitle', '').size() <= 240 &&
        data.get('gateGroup', '') in ['Owner', 'Tenant', 'Technician', 'Broker', 'Admin', 'Provider', 'Device', 'Business', 'Role Buttons'] &&
        data.get('status', '') in ['pending', 'passed', 'blocked', 'waived'] &&
        data.get('testerName', '') is string && data.get('testerName', '').size() > 0 && data.get('testerName', '').size() <= 160 &&
        data.get('role', '') in ['admin', 'owner', 'tenant', 'technician', 'broker'] &&
        data.get('device', '') is string && data.get('device', '').size() > 0 && data.get('device', '').size() <= 120 &&
        data.get('productionUrl', '') is string && data.get('productionUrl', '').matches('^https://(bin-group-57c60|bin-group-admin-panel)\\.web\\.app(/.*)?$') &&
        data.get('releaseSha', '') is string && data.get('releaseSha', '').size() == 40 && data.get('releaseSha', '').matches('^[0-9a-f]+$') &&
        data.get('proofRef', '') is string && data.get('proofRef', '').size() > 0 && data.get('proofRef', '').size() <= 1200 &&
        data.get('notes', '') is string && data.get('notes', '').size() <= 5000 &&
        data.get('workflowRunId', '') is string && data.get('workflowRunId', '').size() <= 32 &&
        data.get('evidenceHash', '') is string && data.get('evidenceHash', '').size() == 64 && data.get('evidenceHash', '').matches('^[0-9a-f]+$') &&
        data.get('recordedBy', null) == request.auth.uid &&
        data.get('recordedByEmail', null) == authEmail() &&
        data.get('createdAt', null) == request.time &&
        data.keys().hasOnly([
          'schemaVersion', 'source', 'gateId', 'gateTitle', 'gateGroup', 'status', 'testerName', 'role', 'device',
          'productionUrl', 'releaseSha', 'workflowRunId', 'proofRef', 'notes', 'evidenceHash', 'recordedBy', 'recordedByEmail', 'createdAt'
        ]);
    }

    function validSignedInSmokeCreate(data) {
      return canManageLaunchEvidence() &&
        data.get('schemaVersion', 0) == 2 &&
        data.get('source', '') == 'admin-command-center' &&
        data.get('role', '') in ['owner', 'tenant', 'technician', 'broker', 'admin'] &&
        data.get('status', '') in ['pending', 'passed', 'blocked', 'waived'] &&
        data.get('accountEmail', '') is string && data.get('accountEmail', '').size() > 3 && data.get('accountEmail', '').size() <= 320 &&
        data.get('route', '') is string && data.get('route', '').size() > 0 && data.get('route', '').size() <= 240 &&
        data.get('requiredRoute', '') is string && data.get('requiredRoute', '').size() > 0 && data.get('requiredRoute', '').size() <= 240 &&
        data.get('checkpoints', '') is string && data.get('checkpoints', '').size() > 0 && data.get('checkpoints', '').size() <= 2000 &&
        data.get('proofRef', '') is string && data.get('proofRef', '').size() > 0 && data.get('proofRef', '').size() <= 1200 &&
        data.get('notes', '') is string && data.get('notes', '').size() <= 5000 &&
        data.get('releaseSha', '') is string && data.get('releaseSha', '').size() == 40 && data.get('releaseSha', '').matches('^[0-9a-f]+$') &&
        data.get('workflowRunId', '') is string && data.get('workflowRunId', '').size() <= 32 &&
        data.get('evidenceHash', '') is string && data.get('evidenceHash', '').size() == 64 && data.get('evidenceHash', '').matches('^[0-9a-f]+$') &&
        data.get('recordedBy', null) == request.auth.uid &&
        data.get('recordedByEmail', null) == authEmail() &&
        data.get('createdAt', null) == request.time &&
        data.keys().hasOnly([
          'schemaVersion', 'source', 'role', 'status', 'accountEmail', 'route', 'requiredRoute', 'checkpoints', 'proofRef', 'notes',
          'releaseSha', 'workflowRunId', 'evidenceHash', 'recordedBy', 'recordedByEmail', 'createdAt'
        ]);
    }

`;

const LAUNCH_EVIDENCE_BLOCK = `    match /launch_evidence/{evidenceId} {
      allow read: if canReadLaunchEvidence();
      allow create: if validLaunchEvidenceCreate(request.resource.data);
      allow update, delete: if false;
    }`;
const SMOKE_EVIDENCE_BLOCK = `    match /signed_in_smoke_checks/{checkId} {
      allow read: if canReadLaunchEvidence();
      allow create: if validSignedInSmokeCreate(request.resource.data);
      allow update, delete: if false;
    }`;

const countOccurrences = (source, token) => source.split(token).length - 1;

function readBalancedBlock(source, start, open) {
  let depth = 0;
  let quote = '';
  let escaped = false;
  for (let index = open; index < source.length; index += 1) {
    const character = source[index];
    if (escaped) { escaped = false; continue; }
    if (quote) {
      if (character === '\\') escaped = true;
      else if (character === quote) quote = '';
      continue;
    }
    if (character === "'" || character === '"') { quote = character; continue; }
    if (character === '{') depth += 1;
    else if (character === '}') {
      depth -= 1;
      if (depth === 0) return { start, end: index + 1, text: source.slice(start, index + 1) };
    }
  }
  throw new Error('[launch-evidence-rules] unclosed balanced block');
}

function readMatchBlock(source, header) {
  const start = source.indexOf(header);
  if (start < 0) throw new Error(`[launch-evidence-rules] match block missing: ${header}`);
  const open = start + header.length - 1;
  if (source[open] !== '{') throw new Error(`[launch-evidence-rules] malformed match block: ${header}`);
  return readBalancedBlock(source, start, open);
}

function readFunctionBlock(source, name) {
  const header = `    function ${name}(`;
  const start = source.indexOf(header);
  if (start < 0) return null;
  const open = source.indexOf('{', start);
  if (open < 0) throw new Error(`[launch-evidence-rules] malformed function: ${name}`);
  return readBalancedBlock(source, start, open);
}

function removeFunctionIfPresent(source, name) {
  const current = readFunctionBlock(source, name);
  if (!current) return source;
  let end = current.end;
  while (source[end] === '\n') end += 1;
  return `${source.slice(0, current.start)}${source.slice(end)}`;
}

function replaceMatchBlock(source, header, replacement) {
  const current = readMatchBlock(source, header);
  return `${source.slice(0, current.start)}${replacement}${source.slice(current.end)}`;
}

function installCanonicalHelpers(source) {
  let next = source;
  for (const name of ['canReadLaunchEvidence', 'canManageLaunchEvidence', 'validLaunchEvidenceCreate', 'validSignedInSmokeCreate']) {
    next = removeFunctionIfPresent(next, name);
  }
  if (!next.includes(HELPER_MARKER)) throw new Error('[launch-evidence-rules] canReadUserDirectory marker missing');
  return next.replace(HELPER_MARKER, () => `${LAUNCH_EVIDENCE_HELPERS}${HELPER_MARKER}`);
}

function installCanonicalEvidenceBlocks(source) {
  let next = replaceMatchBlock(source, '    match /launch_evidence/{evidenceId} {', LAUNCH_EVIDENCE_BLOCK);
  next = replaceMatchBlock(next, '    match /signed_in_smoke_checks/{checkId} {', SMOKE_EVIDENCE_BLOCK);
  return next;
}

function hardenGlobalFallback(source) {
  const current = readMatchBlock(source, GLOBAL_FALLBACK_HEADER);
  let block = current.text;
  const launchCount = countOccurrences(block, "'launch_evidence'");
  const smokeCount = countOccurrences(block, "'signed_in_smoke_checks'");
  if (launchCount === 3 && smokeCount === 3) return source;
  if (launchCount !== 0 || smokeCount !== 0) throw new Error(`[launch-evidence-rules] partially hardened global fallback: launch=${launchCount} smoke=${smokeCount}`);

  const readAnchor = "['system_secrets',";
  if (countOccurrences(block, readAnchor) !== 1) throw new Error(`[launch-evidence-rules] expected one global read exclusion anchor; found ${countOccurrences(block, readAnchor)}`);
  block = block.replace(readAnchor, "['system_secrets', 'launch_evidence', 'signed_in_smoke_checks',");

  const mutableAnchor = "          'system_secrets',\n";
  if (countOccurrences(block, mutableAnchor) !== 2) throw new Error(`[launch-evidence-rules] expected two global mutable exclusion anchors; found ${countOccurrences(block, mutableAnchor)}`);
  block = block.replaceAll(mutableAnchor, "          'system_secrets',\n          'launch_evidence',\n          'signed_in_smoke_checks',\n");

  if (countOccurrences(block, "'launch_evidence'") !== 3 || countOccurrences(block, "'signed_in_smoke_checks'") !== 3) {
    throw new Error('[launch-evidence-rules] global fallback hardening incomplete');
  }
  return `${source.slice(0, current.start)}${block}${source.slice(current.end)}`;
}

export function hardenPublicLaunchEvidenceRules(input) {
  let source = String(input || '').replace(/\r\n?/g, '\n');
  source = installCanonicalHelpers(source);
  source = installCanonicalEvidenceBlocks(source);
  source = hardenGlobalFallback(source);
  assertPublicLaunchEvidenceRules(source);
  return source;
}

export function assertPublicLaunchEvidenceRules(source) {
  const failures = [];
  for (const token of [
    'function canReadLaunchEvidence() {',
    "hasPermission('canManageLaunchEvidence')",
    'function canManageLaunchEvidence() {',
    'function validLaunchEvidenceCreate(data) {',
    'function validSignedInSmokeCreate(data) {',
    'allow read: if canReadLaunchEvidence();',
    'allow create: if validLaunchEvidenceCreate(request.resource.data);',
    'allow create: if validSignedInSmokeCreate(request.resource.data);',
    'allow update, delete: if false;',
    "data.get('createdAt', null) == request.time",
    "data.get('releaseSha', '').size() == 40",
    "data.get('releaseSha', '').matches('^[0-9a-f]+$')",
    "data.get('evidenceHash', '').size() == 64",
    "data.get('evidenceHash', '').matches('^[0-9a-f]+$')",
  ]) if (!source.includes(token)) failures.push(`missing ${token}`);

  for (const [header, createToken] of [
    ['    match /launch_evidence/{evidenceId} {', 'allow create: if validLaunchEvidenceCreate(request.resource.data);'],
    ['    match /signed_in_smoke_checks/{checkId} {', 'allow create: if validSignedInSmokeCreate(request.resource.data);'],
  ]) {
    try {
      const block = readMatchBlock(source, header).text;
      if (!block.includes('allow read: if canReadLaunchEvidence();')) failures.push(`${header} read policy is not canonical`);
      if (!block.includes(createToken)) failures.push(`${header} create policy is not canonical`);
      if (!block.includes('allow update, delete: if false;')) failures.push(`${header} is not append-only`);
    } catch (error) { failures.push(error instanceof Error ? error.message : String(error)); }
  }

  try {
    const block = readMatchBlock(source, GLOBAL_FALLBACK_HEADER).text;
    const launchCount = countOccurrences(block, "'launch_evidence'");
    const smokeCount = countOccurrences(block, "'signed_in_smoke_checks'");
    if (launchCount !== 3 || smokeCount !== 3) failures.push(`global fallback must exclude evidence from read/create/update-delete paths; launch=${launchCount} smoke=${smokeCount}`);
  } catch (error) { failures.push(error instanceof Error ? error.message : String(error)); }

  if (failures.length) throw new Error(`[launch-evidence-rules] ${failures.join('; ')}`);
}

#!/usr/bin/env node

import { readFileSync, writeFileSync } from 'node:fs';

const WORKFLOW_FILES = [
  '.github/workflows/firebase-production-deploy.yml',
  'launch_package/generated/firebase-production-deploy-phase1.yml',
];

function replaceExactly(source, before, after, expected, label) {
  const count = source.split(before).length - 1;
  if (count !== expected) {
    throw new Error(`${label}: expected ${expected} occurrence(s), found ${count}.`);
  }
  return source.split(before).join(after);
}

function patchWorkflow(source, label) {
  const oldBlock = [
    '      E2E_FOUNDER_EMAIL: ${{ secrets.E2E_FOUNDER_EMAIL }}',
    '      E2E_FOUNDER_PASSWORD: ${{ secrets.E2E_FOUNDER_PASSWORD }}',
    '      E2E_FOUNDER_TOTP_SECRET: ${{ secrets.E2E_FOUNDER_TOTP_SECRET }}',
    "      E2E_REQUIRE_FOUNDER_MFA: 'true'",
  ].join('\n');
  const newBlock = [
    '      E2E_FOUNDER_EMAIL: ${{ inputs.founder_email }}',
    '      E2E_FOUNDER_PASSWORD: ${{ secrets.E2E_FOUNDER_PASSWORD }}',
    '      E2E_FOUNDER_TOTP_SECRET: ${{ secrets.E2E_FOUNDER_TOTP_SECRET }}',
    '      E2E_FOUNDER_REAL_MFA_CODE: ${{ secrets.E2E_FOUNDER_REAL_MFA_CODE }}',
    "      E2E_REQUIRE_FOUNDER_MFA: 'true'",
  ].join('\n');
  return replaceExactly(source, oldBlock, newBlock, 2, `${label} founder bindings`);
}

function patchProductionVerifier(source) {
  let patched = source;
  patched = replaceExactly(
    patched,
    "const EXPECTED_ADMIN_URL = 'https://bin-group-admin-panel.web.app';\n",
    "const EXPECTED_ADMIN_URL = 'https://bin-group-admin-panel.web.app';\nconst CANONICAL_FOUNDER_EMAIL = 'ceo@bin-groups.com';\n",
    1,
    'production verifier canonical Founder constant',
  );
  patched = replaceExactly(
    patched,
    "  'E2E_ADMIN_PASSWORD',\n  'E2E_OWNER_MAILBOX_EMAIL',",
    "  'E2E_ADMIN_PASSWORD',\n  'E2E_FOUNDER_EMAIL',\n  'E2E_FOUNDER_PASSWORD',\n  'E2E_OWNER_MAILBOX_EMAIL',",
    1,
    'production verifier required Founder values',
  );
  const founderAuthorizationValidation = [
    "  if (value(env, 'AUTHORIZED_FOUNDER_EMAILS') && (founderEmails.length === 0 || founderEmails.some((email) => !EMAIL_RE.test(email)))) {",
    "    failures.push('AUTHORIZED_FOUNDER_EMAILS must contain valid comma-separated email addresses');",
    '  }',
  ].join('\n');
  const founderEvidenceValidation = [
    founderAuthorizationValidation,
    '',
    "  const founderEmail = value(env, 'E2E_FOUNDER_EMAIL').toLowerCase();",
    "  const adminEmail = value(env, 'E2E_ADMIN_EMAIL').toLowerCase();",
    "  if (founderEmail && founderEmail !== CANONICAL_FOUNDER_EMAIL) {",
    "    failures.push(`E2E_FOUNDER_EMAIL must equal ${CANONICAL_FOUNDER_EMAIL}`);",
    '  }',
    '  if (founderEmail && adminEmail && founderEmail === adminEmail) {',
    "    failures.push('E2E_FOUNDER_EMAIL must differ from the ephemeral E2E_ADMIN_EMAIL');",
    '  }',
    "  const founderPassword = value(env, 'E2E_FOUNDER_PASSWORD');",
    "  if (founderPassword && founderPassword.length < 8) failures.push('E2E_FOUNDER_PASSWORD must contain at least 8 characters');",
    "  const founderTotp = value(env, 'E2E_FOUNDER_TOTP_SECRET').toUpperCase().replace(/[\\s=-]/g, '');",
    "  const founderRealMfaCode = value(env, 'E2E_FOUNDER_REAL_MFA_CODE');",
    '  const validFounderTotp = founderTotp.length >= 16 && /^[A-Z2-7]+$/.test(founderTotp);',
    '  const validFounderRealMfaCode = /^\\d{6}$/.test(founderRealMfaCode);',
    '  if (!validFounderTotp && !validFounderRealMfaCode) {',
    "    failures.push('Set a valid E2E_FOUNDER_TOTP_SECRET or six-digit E2E_FOUNDER_REAL_MFA_CODE');",
    '  }',
  ].join('\n');
  patched = replaceExactly(
    patched,
    founderAuthorizationValidation,
    founderEvidenceValidation,
    1,
    'production verifier Founder evidence validation',
  );
  patched = replaceExactly(
    patched,
    "    appCheckEnabled: value(env, 'VITE_ENABLE_FIREBASE_APPCHECK') === 'true',\n",
    [
      "    appCheckEnabled: value(env, 'VITE_ENABLE_FIREBASE_APPCHECK') === 'true',",
      '    founderMfaConfigured:',
      "      (value(env, 'E2E_FOUNDER_TOTP_SECRET').toUpperCase().replace(/[\\s=-]/g, '').length >= 16 &&",
      "        /^[A-Z2-7]+$/.test(value(env, 'E2E_FOUNDER_TOTP_SECRET').toUpperCase().replace(/[\\s=-]/g, ''))) ||",
      "      /^\\d{6}$/.test(value(env, 'E2E_FOUNDER_REAL_MFA_CODE')),",
      '',
    ].join('\n'),
    1,
    'production verifier summary',
  );
  return patched;
}

function patchProductionVerifierTests(source) {
  let patched = source;
  patched = replaceExactly(
    patched,
    "    E2E_ADMIN_PASSWORD: 'admin-password',\n    E2E_OWNER_MAILBOX_EMAIL:",
    [
      "    E2E_ADMIN_PASSWORD: 'admin-password',",
      "    E2E_FOUNDER_EMAIL: 'ceo@bin-groups.com',",
      "    E2E_FOUNDER_PASSWORD: 'founder-password',",
      "    E2E_FOUNDER_TOTP_SECRET: 'JBSWY3DPEHPK3PXP',",
      "    E2E_FOUNDER_REAL_MFA_CODE: '',",
      '    E2E_OWNER_MAILBOX_EMAIL:',
    ].join('\n'),
    1,
    'production verifier test Founder fixture',
  );
  patched = replaceExactly(
    patched,
    "  assert.ok(REQUIRED_PRODUCTION_VALUES.includes('VITE_ENABLE_FIREBASE_APPCHECK'));\n  const summary = productionWorkflowEnvSummary(env);",
    [
      "  assert.ok(REQUIRED_PRODUCTION_VALUES.includes('VITE_ENABLE_FIREBASE_APPCHECK'));",
      "  assert.ok(REQUIRED_PRODUCTION_VALUES.includes('E2E_FOUNDER_EMAIL'));",
      "  assert.ok(REQUIRED_PRODUCTION_VALUES.includes('E2E_FOUNDER_PASSWORD'));",
      '  const summary = productionWorkflowEnvSummary(env);'
    ].join('\n'),
    1,
    'production verifier test required values',
  );
  patched = replaceExactly(
    patched,
    "  assert.equal(summary.appCheckEnabled, true);\n  assert.equal(summary.firebaseAndMapsKeysSeparated, true);",
    "  assert.equal(summary.appCheckEnabled, true);\n  assert.equal(summary.founderMfaConfigured, true);\n  assert.equal(summary.firebaseAndMapsKeysSeparated, true);",
    1,
    'production verifier test summary assertion',
  );
  const insertionAnchor = "test('production client value failures never disclose supplied credentials', () => {";
  const founderTest = [
    "test('production client value preflight fails closed for missing or invalid Founder MFA values', () => {",
    '  const missing = validEnv();',
    "  missing.E2E_FOUNDER_EMAIL = '';",
    "  missing.E2E_FOUNDER_PASSWORD = '';",
    "  missing.E2E_FOUNDER_TOTP_SECRET = '';",
    "  missing.E2E_FOUNDER_REAL_MFA_CODE = '';",
    "  const missingFailures = validateProductionWorkflowEnv(missing).join('\\n');",
    "  assert.match(missingFailures, /Missing required production value: E2E_FOUNDER_EMAIL/);",
    "  assert.match(missingFailures, /Missing required production value: E2E_FOUNDER_PASSWORD/);",
    "  assert.match(missingFailures, /valid E2E_FOUNDER_TOTP_SECRET or six-digit E2E_FOUNDER_REAL_MFA_CODE/);",
    '',
    '  const realCode = validEnv();',
    "  realCode.E2E_FOUNDER_TOTP_SECRET = '';",
    "  realCode.E2E_FOUNDER_REAL_MFA_CODE = '123456';",
    '  assert.deepEqual(validateProductionWorkflowEnv(realCode), []);',
    '',
    '  const wrongIdentity = validEnv();',
    "  wrongIdentity.E2E_FOUNDER_EMAIL = 'other@bin-groups.com';",
    "  assert.match(validateProductionWorkflowEnv(wrongIdentity).join('\\n'), /must equal ceo@bin-groups.com/);",
    '});',
    '',
    insertionAnchor,
  ].join('\n');
  patched = replaceExactly(
    patched,
    insertionAnchor,
    founderTest,
    1,
    'production verifier Founder regression test',
  );
  return patched;
}

function patchOwnerWorkflowPatcher(source) {
  let patched = source;
  const oldEarlyReturn = [
    "  if (normalized.includes('E2E_FOUNDER_TOTP_SECRET: ${{ secrets.E2E_FOUNDER_TOTP_SECRET }}')) {",
    "    const count = normalized.split('E2E_FOUNDER_TOTP_SECRET: ${{ secrets.E2E_FOUNDER_TOTP_SECRET }}').length - 1;",
    "    if (count !== 2) throw new Error(`${label}: expected exactly two Founder MFA bindings, found ${count}.`);",
    '    return source;',
    '  }',
  ].join('\n');
  const newEarlyReturn = [
    "  const completeBinding = 'E2E_FOUNDER_REAL_MFA_CODE: ${{ secrets.E2E_FOUNDER_REAL_MFA_CODE }}';",
    '  if (normalized.includes(completeBinding)) {',
    '    const count = normalized.split(completeBinding).length - 1;',
    "    if (count !== 2) throw new Error(`${label}: expected exactly two complete Founder MFA bindings, found ${count}.`);",
    '    return source;',
    '  }',
  ].join('\n');
  patched = replaceExactly(patched, oldEarlyReturn, newEarlyReturn, 1, 'Owner patcher complete binding guard');
  patched = replaceExactly(
    patched,
    "        `${indent}E2E_FOUNDER_EMAIL: \\${{ secrets.E2E_FOUNDER_EMAIL }}`,\n        `${indent}E2E_FOUNDER_PASSWORD: \\${{ secrets.E2E_FOUNDER_PASSWORD }}`,\n        `${indent}E2E_FOUNDER_TOTP_SECRET: \\${{ secrets.E2E_FOUNDER_TOTP_SECRET }}`,\n        `${indent}E2E_REQUIRE_FOUNDER_MFA: 'true'`,",
    "        `${indent}E2E_FOUNDER_EMAIL: \\${{ inputs.founder_email }}`,\n        `${indent}E2E_FOUNDER_PASSWORD: \\${{ secrets.E2E_FOUNDER_PASSWORD }}`,\n        `${indent}E2E_FOUNDER_TOTP_SECRET: \\${{ secrets.E2E_FOUNDER_TOTP_SECRET }}`,\n        `${indent}E2E_FOUNDER_REAL_MFA_CODE: \\${{ secrets.E2E_FOUNDER_REAL_MFA_CODE }}`,\n        `${indent}E2E_REQUIRE_FOUNDER_MFA: 'true'`,",
    1,
    'Owner patcher generated Founder block',
  );
  patched = replaceExactly(
    patched,
    "    'E2E_FOUNDER_EMAIL: ${{ secrets.E2E_FOUNDER_EMAIL }}',\n    'E2E_FOUNDER_PASSWORD: ${{ secrets.E2E_FOUNDER_PASSWORD }}',\n    'E2E_FOUNDER_TOTP_SECRET: ${{ secrets.E2E_FOUNDER_TOTP_SECRET }}',",
    "    'E2E_FOUNDER_EMAIL: ${{ inputs.founder_email }}',\n    'E2E_FOUNDER_PASSWORD: ${{ secrets.E2E_FOUNDER_PASSWORD }}',\n    'E2E_FOUNDER_TOTP_SECRET: ${{ secrets.E2E_FOUNDER_TOTP_SECRET }}',\n    'E2E_FOUNDER_REAL_MFA_CODE: ${{ secrets.E2E_FOUNDER_REAL_MFA_CODE }}',",
    1,
    'Owner patcher required controls',
  );
  return patched;
}

function patchOwnerWorkflowTests(source) {
  let patched = source;
  patched = replaceExactly(
    patched,
    "test('production workflow patch binds Founder TOTP evidence to bank-pilot and public evidence jobs', () => {",
    "test('production workflow patch binds canonical Founder credentials and MFA alternatives to both evidence jobs', () => {",
    1,
    'Owner workflow test title',
  );
  patched = replaceExactly(
    patched,
    "    assert.equal(patched.split('E2E_FOUNDER_EMAIL: ${{ secrets.E2E_FOUNDER_EMAIL }}').length - 1, 2);\n    assert.equal(patched.split('E2E_FOUNDER_PASSWORD: ${{ secrets.E2E_FOUNDER_PASSWORD }}').length - 1, 2);\n    assert.equal(patched.split('E2E_FOUNDER_TOTP_SECRET: ${{ secrets.E2E_FOUNDER_TOTP_SECRET }}').length - 1, 2);",
    "    assert.equal(patched.split('E2E_FOUNDER_EMAIL: ${{ inputs.founder_email }}').length - 1, 2);\n    assert.equal(patched.split('E2E_FOUNDER_EMAIL: ${{ secrets.E2E_FOUNDER_EMAIL }}').length - 1, 0);\n    assert.equal(patched.split('E2E_FOUNDER_PASSWORD: ${{ secrets.E2E_FOUNDER_PASSWORD }}').length - 1, 2);\n    assert.equal(patched.split('E2E_FOUNDER_TOTP_SECRET: ${{ secrets.E2E_FOUNDER_TOTP_SECRET }}').length - 1, 2);\n    assert.equal(patched.split('E2E_FOUNDER_REAL_MFA_CODE: ${{ secrets.E2E_FOUNDER_REAL_MFA_CODE }}').length - 1, 2);",
    1,
    'Owner workflow test binding assertions',
  );
  return patched;
}

const persistentFiles = [
  ...WORKFLOW_FILES,
  'scripts/verify-production-workflow-env.mjs',
  'tests/launch/production-client-value-preflight.test.mjs',
  'scripts/apply-owner-inspection-first-evidence-workflow.mjs',
  'tests/launch/owner-inspection-first-live-evidence.test.mjs',
];

for (const file of WORKFLOW_FILES) {
  const source = readFileSync(file, 'utf8');
  writeFileSync(file, patchWorkflow(source, file));
}

const transforms = new Map([
  ['scripts/verify-production-workflow-env.mjs', patchProductionVerifier],
  ['tests/launch/production-client-value-preflight.test.mjs', patchProductionVerifierTests],
  ['scripts/apply-owner-inspection-first-evidence-workflow.mjs', patchOwnerWorkflowPatcher],
  ['tests/launch/owner-inspection-first-live-evidence.test.mjs', patchOwnerWorkflowTests],
]);

for (const [file, transform] of transforms) {
  const source = readFileSync(file, 'utf8');
  writeFileSync(file, transform(source));
}

for (const file of persistentFiles) {
  const updated = readFileSync(file, 'utf8');
  if (!updated.trim()) throw new Error(`${file}: repair produced an empty file.`);
}

console.log('[founder-predeploy-repair] patched=' + persistentFiles.join(','));
console.log('[founder-predeploy-repair] public_release_gate=false hard_launch_claim=false payment_policy=phase1-manual');

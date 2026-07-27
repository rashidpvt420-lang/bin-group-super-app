#!/usr/bin/env node
import { gunzipSync } from 'node:zlib';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const envExamplePath = path.join(process.cwd(), '.env.e2e.example');
const envExample = readFileSync(envExamplePath, 'utf8').replace(/\r\n?/g, '\n');
const roleSectionStart = envExample.indexOf('# Five canonical launch roles (required for launch clearance)');
const ownerSectionStart = envExample.indexOf('E2E_OWNER', roleSectionStart);
const optionalSectionStart = envExample.indexOf('# Optional: second technician', ownerSectionStart);
if (roleSectionStart < 0 || ownerSectionStart < 0 || optionalSectionStart < 0) {
  throw new Error('.env.e2e.example canonical role section could not be parsed.');
}
const canonicalMailboxSection = `E2E_OWNER_EMAIL=
E2E_OWNER_PASSWORD=
E2E_OWNER_MAILBOX_EMAIL=
E2E_TENANT_EMAIL=
E2E_TENANT_PASSWORD=
E2E_TECHNICIAN_EMAIL=
E2E_TECHNICIAN_PASSWORD=
E2E_BROKER_EMAIL=
E2E_BROKER_PASSWORD=
E2E_BROKER_MAILBOX_EMAIL=

# Gmail read-only evidence credentials. Keep real values in protected secrets only.
E2E_OWNER_MAILBOX_CLIENT_ID=
E2E_OWNER_MAILBOX_CLIENT_SECRET=
E2E_OWNER_MAILBOX_REFRESH_TOKEN=
E2E_BROKER_MAILBOX_CLIENT_ID=
E2E_BROKER_MAILBOX_CLIENT_SECRET=
E2E_BROKER_MAILBOX_REFRESH_TOKEN=

`;
writeFileSync(
  envExamplePath,
  `${envExample.slice(0, ownerSectionStart)}${canonicalMailboxSection}${envExample.slice(optionalSectionStart)}`,
  'utf8',
);

const mailboxOauthKeys = new Set([
  'E2E_OWNER_MAILBOX_CLIENT_ID',
  'E2E_OWNER_MAILBOX_CLIENT_SECRET',
  'E2E_OWNER_MAILBOX_REFRESH_TOKEN',
  'E2E_BROKER_MAILBOX_CLIENT_ID',
  'E2E_BROKER_MAILBOX_CLIENT_SECRET',
  'E2E_BROKER_MAILBOX_REFRESH_TOKEN',
]);

function currentEnvBlockHas(output, indentation, key) {
  for (let index = output.length - 1; index >= 0; index -= 1) {
    const line = output[index];
    const match = line.match(/^(\s*)([A-Z0-9_]+):/);
    if (match && match[1].length === indentation.length && match[2] === key) return true;
    const leading = line.match(/^\s*/)?.[0].length || 0;
    if (line.trim() && leading < indentation.length) return false;
  }
  return false;
}

function normalizeProtectedWorkflow(relativePath) {
  const workflowPath = path.join(process.cwd(), relativePath);
  const source = readFileSync(workflowPath, 'utf8').replace(/\r\n?/g, '\n');
  const output = [];

  for (const line of source.split('\n')) {
    const assignment = line.match(/^(\s+)([A-Z0-9_]+):(.*)$/);
    if (assignment && mailboxOauthKeys.has(assignment[2])) continue;

    if (assignment && assignment[2] === 'E2E_OWNER_MAILBOX_EMAIL') {
      const indentation = assignment[1];
      if (!currentEnvBlockHas(output, indentation, 'E2E_OWNER_EMAIL')) {
        output.push(indentation + 'E2E_OWNER_EMAIL: ${{ secrets.E2E_OWNER_EMAIL }}');
      }
    }
    if (assignment && assignment[2] === 'E2E_BROKER_MAILBOX_EMAIL') {
      const indentation = assignment[1];
      if (!currentEnvBlockHas(output, indentation, 'E2E_BROKER_EMAIL')) {
        output.push(indentation + 'E2E_BROKER_EMAIL: ${{ secrets.E2E_BROKER_EMAIL }}');
      }
    }

    if ([...mailboxOauthKeys].some((key) => line.includes(`printf '${key}=`) || line.includes(`printf \"${key}=`))) {
      continue;
    }

    const ownerMailboxWrite = line.match(/^(\s*)printf 'E2E_OWNER_MAILBOX_EMAIL=%s\\n' \"\$E2E_OWNER_MAILBOX_EMAIL\" (>>|>) \.env\.e2e$/);
    if (ownerMailboxWrite && !output.some((candidate) => candidate.includes("printf 'E2E_OWNER_EMAIL=%s\\n'"))) {
      output.push(`${ownerMailboxWrite[1]}printf 'E2E_OWNER_EMAIL=%s\\n' \"$E2E_OWNER_EMAIL\" ${ownerMailboxWrite[2]} .env.e2e`);
    }
    const brokerMailboxWrite = line.match(/^(\s*)printf 'E2E_BROKER_MAILBOX_EMAIL=%s\\n' \"\$E2E_BROKER_MAILBOX_EMAIL\" (>>|>) \.env\.e2e$/);
    if (brokerMailboxWrite && !output.some((candidate) => candidate.includes("printf 'E2E_BROKER_EMAIL=%s\\n'"))) {
      output.push(`${brokerMailboxWrite[1]}printf 'E2E_BROKER_EMAIL=%s\\n' \"$E2E_BROKER_EMAIL\" ${brokerMailboxWrite[2]} .env.e2e`);
    }

    output.push(line);
  }

  const result = output.join('\n');
  for (const key of mailboxOauthKeys) {
    if (new RegExp(`^\\s+${key}:`, 'm').test(result)) {
      throw new Error(`${relativePath}: ${key} remains outside a dedicated consuming step before strict patching.`);
    }
    if (result.includes(`printf '${key}=`) || result.includes(`printf \"${key}=`)) {
      throw new Error(`${relativePath}: ${key} remains persisted in .env.e2e.`);
    }
  }
  writeFileSync(workflowPath, result.endsWith('\n') ? result : `${result}\n`, 'utf8');
}

for (const workflow of [
  '.github/workflows/admin-production-evidence.yml',
  '.github/workflows/firebase-production-deploy.yml',
  '.github/workflows/live-role-smoke.yml',
]) normalizeProtectedWorkflow(workflow);

const ownerLoginRunnerPath = path.join(process.cwd(), 'scripts/run-owner-onboarding-production-evidence.mjs');
let ownerLoginRunner = readFileSync(ownerLoginRunnerPath, 'utf8');
for (const [before, after] of [
  [
    'const ownerEmail = text(process.env.E2E_OWNER_MAILBOX_EMAIL).toLowerCase();',
    'const ownerEmail = text(process.env.E2E_OWNER_EMAIL).toLowerCase();',
  ],
  [
    '  E2E_OWNER_MAILBOX_EMAIL: ownerEmail,',
    '  E2E_OWNER_EMAIL: ownerEmail,',
  ],
]) {
  const beforeCount = ownerLoginRunner.split(before).length - 1;
  const afterCount = ownerLoginRunner.split(after).length - 1;
  if (beforeCount === 1) ownerLoginRunner = ownerLoginRunner.replace(before, after);
  else if (!(beforeCount === 0 && afterCount === 1)) {
    throw new Error(`Owner application login identity replacement is ambiguous: legacy=${beforeCount} canonical=${afterCount}.`);
  }
}
if (ownerLoginRunner.includes('E2E_OWNER_MAILBOX_EMAIL')) {
  throw new Error('Normal Owner production evidence runner still depends on the read-only mailbox identity.');
}
writeFileSync(ownerLoginRunnerPath, ownerLoginRunner, 'utf8');

const payloadWrapper = readFileSync(
  path.join(process.cwd(), 'scripts/apply-final-launch-evidence-corrections.payload.mjs'),
  'utf8',
);
const payloadMatch = payloadWrapper.match(/const payload = '([^']+)'/);
if (!payloadMatch) throw new Error('Reviewed launch-evidence payload is missing.');

let runtime = gunzipSync(Buffer.from(payloadMatch[1], 'base64')).toString('utf8');
const strictHelper = [
  'function replaceExact(relativePath, before, after, expectedCount = 1) {',
  '  const source = read(relativePath);',
  '  const count = source.split(before).length - 1;',
  '  if (count !== expectedCount) {',
  '    throw new Error(`${relativePath}: expected ${expectedCount} exact match(es), found ${count}.`);',
  '  }',
  '  write(relativePath, source.replaceAll(before, after));',
  '}',
].join('\n');
const idempotentHelper = [
  'function replaceExact(relativePath, before, after, expectedCount = 1) {',
  '  const source = read(relativePath);',
  '  const beforeCount = source.split(before).length - 1;',
  '  if (beforeCount === expectedCount) {',
  '    write(relativePath, source.replaceAll(before, after));',
  '    return;',
  '  }',
  '  const afterCount = source.split(after).length - 1;',
  '  if (beforeCount === 0 && afterCount === expectedCount) return;',
  '  throw new Error(`${relativePath}: expected ${expectedCount} legacy or canonical exact match(es), found legacy=${beforeCount} canonical=${afterCount}.`);',
  '}',
].join('\n');
const helperCount = runtime.split(strictHelper).length - 1;
if (helperCount !== 1) throw new Error(`Reviewed runtime replaceExact helper count is ${helperCount}, expected 1.`);
runtime = runtime.replace(strictHelper, idempotentHelper);

const temporaryPath = path.join(process.cwd(), '.apply-final-launch-evidence-corrections.runtime.mjs');
writeFileSync(temporaryPath, runtime, { mode: 0o600 });
try {
  await import(pathToFileURL(temporaryPath).href + '?run=' + Date.now());
} finally {
  rmSync(temporaryPath, { force: true });
}

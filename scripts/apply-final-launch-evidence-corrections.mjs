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

function normalizeWorkflowHeader(relativePath) {
  const workflowPath = path.join(process.cwd(), relativePath);
  const source = readFileSync(workflowPath, 'utf8').replace(/\r\n?/g, '\n');
  const jobsMarker = '\njobs:';
  const jobsIndex = source.indexOf(jobsMarker);
  if (jobsIndex < 0) throw new Error(`${relativePath}: jobs section is missing.`);

  const prefix = source.slice(0, jobsIndex);
  const suffix = source.slice(jobsIndex);
  const lines = prefix.split('\n');
  const hasOwnerLogin = lines.some((line) => /^  E2E_OWNER_EMAIL:/.test(line));
  const hasBrokerLogin = lines.some((line) => /^  E2E_BROKER_EMAIL:/.test(line));
  const normalized = [];

  for (const line of lines) {
    const key = line.match(/^  ([A-Z0-9_]+):/)?.[1] || '';
    if (mailboxOauthKeys.has(key)) continue;
    if (key === 'E2E_OWNER_MAILBOX_EMAIL' && !hasOwnerLogin) {
      normalized.push('  E2E_OWNER_EMAIL: ${{ secrets.E2E_OWNER_EMAIL }}');
    }
    if (key === 'E2E_BROKER_MAILBOX_EMAIL' && !hasBrokerLogin) {
      normalized.push('  E2E_BROKER_EMAIL: ${{ secrets.E2E_BROKER_EMAIL }}');
    }
    normalized.push(line);
  }

  const result = `${normalized.join('\n')}${suffix}`;
  const resultPrefix = result.slice(0, result.indexOf(jobsMarker));
  for (const key of mailboxOauthKeys) {
    if (new RegExp(`^  ${key}:`, 'm').test(resultPrefix)) {
      throw new Error(`${relativePath}: ${key} remains workflow-global after normalization.`);
    }
  }
  for (const required of ['E2E_OWNER_EMAIL', 'E2E_OWNER_MAILBOX_EMAIL', 'E2E_BROKER_EMAIL', 'E2E_BROKER_MAILBOX_EMAIL']) {
    if (!new RegExp(`^  ${required}:`, 'm').test(resultPrefix)) {
      throw new Error(`${relativePath}: ${required} is missing from the protected workflow identity header.`);
    }
  }
  writeFileSync(workflowPath, result.endsWith('\n') ? result : `${result}\n`, 'utf8');
}

normalizeWorkflowHeader('.github/workflows/admin-production-evidence.yml');
normalizeWorkflowHeader('.github/workflows/live-role-smoke.yml');

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

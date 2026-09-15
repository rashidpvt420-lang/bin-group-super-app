#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { requiredFirebaseDeploymentSecrets } from './verify-firebase-production-secrets.mjs';

const functionsRuntimeEntry = 'functions/lib/runtimeAll.js';
const secretNamePattern = /^[A-Z][A-Z0-9_]*$/;
const expectedProjectId = 'bin-group-57c60';
const payslipEndpointName = 'generateAndEmailPayslip';
const payslipServiceName = 'generateandemailpayslip';
const payslipRegion = 'europe-west3';
const retiredPayslipSecretBindings = Object.freeze(['SMTP_HOST', 'SMTP_PASS', 'SMTP_USER']);

function normalizeSecretNames(names, label) {
  if (!Array.isArray(names)) {
    throw new Error(`[firebase-function-secret-contract] ${label} must be an array.`);
  }
  const normalized = names.map((name) => String(name || '').trim()).filter(Boolean).sort();
  const invalid = normalized.filter((name) => !secretNamePattern.test(name));
  if (invalid.length || new Set(normalized).size !== normalized.length) {
    throw new Error(
      `[firebase-function-secret-contract] ${label} contains invalid or duplicate secret names: ${invalid.join(', ') || 'duplicate names'}.`,
    );
  }
  return normalized;
}

function runCompiledProbe(probe, {
  runtimeEntry = functionsRuntimeEntry,
  cwd = process.cwd(),
  spawnSyncImpl = spawnSync,
  nodeBinary = process.execPath,
} = {}) {
  if (!existsSync(runtimeEntry)) {
    throw new Error(`[firebase-function-secret-contract] Missing compiled Functions runtime: ${runtimeEntry}.`);
  }
  const absoluteEntry = path.resolve(cwd, runtimeEntry);
  const result = spawnSyncImpl(nodeBinary, ['-e', probe(absoluteEntry)], {
    cwd,
    env: { ...process.env, NODE_ENV: 'production' },
    encoding: 'utf8',
    shell: false,
    maxBuffer: 16 * 1024 * 1024,
  });
  if ((result.status ?? 1) !== 0) {
    throw new Error(
      `[firebase-function-secret-contract] Could not inspect compiled Firebase Function metadata: ${String(result.stderr || result.stdout || 'unknown discovery failure').trim()}`,
    );
  }
  return String(result.stdout || '').trim();
}

export function discoverCompiledFunctionSecretNames(options = {}) {
  const output = runCompiledProbe((absoluteEntry) => `
const mod = require(${JSON.stringify('${ABSOLUTE_ENTRY}')}.replace('${ABSOLUTE_ENTRY}', ${JSON.stringify('PLACEHOLDER')}));
`, options);
  return output;
}

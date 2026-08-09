#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { requiredFirebaseDeploymentSecrets } from './verify-firebase-production-secrets.mjs';

const functionsRuntimeEntry = 'functions/lib/runtimeAll.js';
const secretNamePattern = /^[A-Z][A-Z0-9_]*$/;

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

export function discoverCompiledFunctionSecretNames({
  runtimeEntry = functionsRuntimeEntry,
  cwd = process.cwd(),
  spawnSyncImpl = spawnSync,
  nodeBinary = process.execPath,
} = {}) {
  if (!existsSync(runtimeEntry)) {
    throw new Error(`[firebase-function-secret-contract] Missing compiled Functions runtime: ${runtimeEntry}.`);
  }

  const absoluteEntry = path.resolve(cwd, runtimeEntry);
  const probe = `
const mod = require(${JSON.stringify(absoluteEntry)});
const names = new Set();
for (const value of Object.values(mod || {})) {
  const secrets = value?.__endpoint?.secretEnvironmentVariables || [];
  for (const secret of secrets) {
    const key = String(secret?.key || '').trim();
    if (key) names.add(key);
  }
}
process.stdout.write(JSON.stringify([...names].sort()));
`;
  const result = spawnSyncImpl(nodeBinary, ['-e', probe], {
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

  try {
    return normalizeSecretNames(JSON.parse(String(result.stdout || '').trim()), 'compiled Function metadata');
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('[firebase-function-secret-contract]')) throw error;
    throw new Error('[firebase-function-secret-contract] Compiled Firebase Function metadata returned malformed JSON.');
  }
}

export function verifyFirebaseDeployedFunctionSecretContract({
  expectedSecretNames = requiredFirebaseDeploymentSecrets,
  discoverSecretNames = discoverCompiledFunctionSecretNames,
} = {}) {
  const expected = normalizeSecretNames(expectedSecretNames, 'canonical deployment secret contract');
  const discovered = normalizeSecretNames(discoverSecretNames(), 'compiled Function metadata');
  const missingFromPreflight = discovered.filter((name) => !expected.includes(name));
  const noLongerBound = expected.filter((name) => !discovered.includes(name));

  if (missingFromPreflight.length || noLongerBound.length) {
    const details = [];
    if (missingFromPreflight.length) details.push(`missing from preflight: ${missingFromPreflight.join(', ')}`);
    if (noLongerBound.length) details.push(`no longer bound by compiled Functions: ${noLongerBound.join(', ')}`);
    throw new Error(`[firebase-function-secret-contract] Canonical deployment secret contract drifted (${details.join('; ')}).`);
  }

  return {
    status: 'passed',
    runtimeEntry: functionsRuntimeEntry,
    secretCount: discovered.length,
    secretNames: discovered,
    secretValuesExcluded: true,
    deploymentPerformed: false,
  };
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : '';
if (invokedPath && invokedPath === fileURLToPath(import.meta.url)) {
  try {
    console.log(JSON.stringify(verifyFirebaseDeployedFunctionSecretContract(), null, 2));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Firebase Function secret contract verification failed.';
    console.error(message);
    process.exit(1);
  }
}

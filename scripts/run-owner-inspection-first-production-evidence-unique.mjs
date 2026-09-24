#!/usr/bin/env node

import { createHash, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(__dirname, '..');
const sourcePath = path.resolve(__dirname, 'run-owner-inspection-first-production-evidence.mjs');
const tempPath = path.resolve(
  __dirname,
  `.run-owner-inspection-first-production-evidence-${process.pid}-${Date.now()}.mjs`,
);

const source = readFileSync(sourcePath, 'utf8');
const propertyNameToken = "const propertyName = 'E2E Owner Acquisition Tower';";
const latitudeToken = '24.4958';
const longitudeToken = '54.4074';

const count = (value, token) => value.split(token).length - 1;
const propertyNameCount = count(source, propertyNameToken);
const latitudeCount = count(source, latitudeToken);
const longitudeCount = count(source, longitudeToken);

if (propertyNameCount !== 1 || latitudeCount !== 3 || longitudeCount !== 3) {
  throw new Error(
    `Protected Owner evidence source changed unexpectedly: propertyName=${propertyNameCount} lat=${latitudeCount} lng=${longitudeCount}. Refusing runtime mutation.`,
  );
}

const runId = String(process.env.GITHUB_RUN_ID || 'local').trim();
const seed = createHash('sha256')
  .update(`${runId}:${Date.now()}:${randomUUID()}`)
  .digest('hex');
const coordinateOffset = ((Number.parseInt(seed.slice(0, 4), 16) % 8001) - 4000) / 10_000_000;
const evidenceLat = (24.4958 + coordinateOffset).toFixed(7);
const evidenceLng = (54.4074 + coordinateOffset).toFixed(7);
const syntheticPropertyName = `E2E Owner Acquisition Tower ${seed.slice(0, 10)}`;

const modified = source
  .replace(propertyNameToken, `const propertyName = '${syntheticPropertyName}';`)
  .replaceAll(latitudeToken, evidenceLat)
  .replaceAll(longitudeToken, evidenceLng);

writeFileSync(tempPath, modified, { mode: 0o600 });
console.log(
  `[owner-evidence-identity] isolated synthetic identity seed=${seed.slice(0, 10)} offset=${coordinateOffset.toFixed(7)}`,
);

try {
  execFileSync(process.execPath, [tempPath], {
    cwd: repositoryRoot,
    env: process.env,
    stdio: 'inherit',
    timeout: 18 * 60 * 1000,
  });
} finally {
  try {
    unlinkSync(tempPath);
  } catch {
    // Ephemeral Actions workspace cleanup remains a final fallback.
  }
}

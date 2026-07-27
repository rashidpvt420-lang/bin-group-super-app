#!/usr/bin/env node
import { gunzipSync } from 'node:zlib';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

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

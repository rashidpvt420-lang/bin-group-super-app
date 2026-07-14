import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const tsconfig = JSON.parse(readFileSync('functions/tsconfig.json', 'utf8'));
const compilerOptions = tsconfig.compilerOptions || {};

function targetYear(value) {
  const match = String(value || '').toLowerCase().match(/es(\d{4})/);
  return match ? Number(match[1]) : 0;
}

test('Functions target supports String.replaceAll and current Node 22 runtime', () => {
  assert.ok(
    targetYear(compilerOptions.target) >= 2021,
    `functions TypeScript target must be ES2021 or newer; received ${compilerOptions.target || '(missing)'}`,
  );
});

test('Functions tsconfig does not narrow away default web and Node global libraries', () => {
  const libs = compilerOptions.lib;
  if (!Array.isArray(libs)) return;
  const normalized = libs.map((item) => String(item).toLowerCase());
  assert.ok(
    normalized.some((item) => item === 'dom' || item === 'webworker'),
    'When compilerOptions.lib is explicitly configured it must preserve a web/global library used by existing Functions fetch integrations.',
  );
});

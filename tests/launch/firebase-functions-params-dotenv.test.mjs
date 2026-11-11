import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const FUNCTIONS_DIR = 'functions';
const PRODUCTION_PROJECT = 'bin-group-57c60';
const PRODUCTION_DOTENV = path.join(FUNCTIONS_DIR, `.env.${PRODUCTION_PROJECT}`);
const PARAM_RE = /\bdefine(?:Int|String|Boolean)\(\s*['"]([A-Z][A-Z0-9_]+)['"]/g;

function collectSourceFiles(dir, files = []) {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === 'lib' || entry === 'dist' || entry.startsWith('.')) continue;
    const full = path.join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      collectSourceFiles(full, files);
      continue;
    }
    if (/\.(ts|js|mjs|cjs)$/.test(entry)) files.push(full);
  }
  return files;
}

function parseDotenv(filePath) {
  const values = {};
  if (!existsSync(filePath)) return values;
  for (const rawLine of readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const cut = line.indexOf('=');
    if (cut <= 0) continue;
    const key = line.slice(0, cut).trim();
    let value = line.slice(cut + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    values[key] = value;
  }
  return values;
}

function productionParamValues() {
  return {
    ...parseDotenv(path.join(FUNCTIONS_DIR, '.env')),
    ...parseDotenv(PRODUCTION_DOTENV),
  };
}

function definedDeployParams() {
  const params = new Map();
  for (const file of collectSourceFiles(FUNCTIONS_DIR)) {
    const source = readFileSync(file, 'utf8');
    PARAM_RE.lastIndex = 0;
    let match;
    while ((match = PARAM_RE.exec(source))) {
      const name = match[1];
      const record = params.get(name) || { name, files: [] };
      record.files.push(file);
      params.set(name, record);
    }
  }
  return params;
}

test('every defineInt/String/Boolean param has a non-interactive production dotenv value', () => {
  const params = definedDeployParams();
  const values = productionParamValues();
  assert.ok(params.size > 0, 'expected at least one non-secret Functions param');
  assert.ok(
    params.has('CRITICAL_FN_MIN_INSTANCES'),
    'CRITICAL_FN_MIN_INSTANCES must stay declared as a Functions param',
  );
  const missing = [...params.keys()].filter((name) => !String(values[name] ?? '').length);
  assert.deepEqual(
    missing,
    [],
    `firebase deploy --non-interactive --project ${PRODUCTION_PROJECT} would fail without dotenv values for: ${missing.join(', ')}`,
  );
});

test('CRITICAL_FN_MIN_INSTANCES stays 0 and the production dotenv is committable', () => {
  const values = productionParamValues();
  assert.equal(
    values.CRITICAL_FN_MIN_INSTANCES,
    '0',
    'minInstances must stay 0 until reserved-instance cost is explicitly accepted',
  );
  assert.match(
    readFileSync('functions/functionScaleOptions.ts', 'utf8'),
    /defineInt\(\s*["']CRITICAL_FN_MIN_INSTANCES["']\s*,\s*\{\s*default:\s*0\s*\}\s*\)/,
  );
  assert.ok(existsSync(PRODUCTION_DOTENV), `missing ${PRODUCTION_DOTENV}`);
  const ignored = spawnSync('git', ['check-ignore', '-v', PRODUCTION_DOTENV], { encoding: 'utf8' });
  assert.equal(
    ignored.status,
    1,
    `${PRODUCTION_DOTENV} must not be gitignored; got: ${ignored.stdout || ignored.stderr}`,
  );
});

#!/usr/bin/env node
/**
 * Measure Firebase Functions discovery/load time for lib/runtimeAll.js.
 * Target: cold require under 7000ms (Firebase CLI discovery timeout is 10000ms).
 */
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const entry = path.join(root, 'functions', 'lib', 'runtimeAll.js');
const budgetMs = Number(process.env.FUNCTIONS_LOAD_BUDGET_MS || 7000);

if (!existsSync(entry)) {
  console.error('[functions-load] Missing compiled entry:', entry);
  console.error('[functions-load] Run: npm run build:functions');
  process.exit(1);
}

// Fresh child process so require cache cannot hide cold-load cost.
const probe = `
const entry = ${JSON.stringify(entry)};
const t0 = process.hrtime.bigint();
const mod = require(entry);
const ms = Number(process.hrtime.bigint() - t0) / 1e6;
const exportsCount = Object.keys(mod || {}).length;
console.log(JSON.stringify({ ms, exportsCount, entry }));
`;

const result = spawnSync(process.execPath, ['-e', probe], {
  cwd: path.join(root, 'functions'),
  encoding: 'utf8',
  env: { ...process.env, NODE_ENV: 'production' },
});

if (result.status !== 0) {
  console.error('[functions-load] FAIL');
  console.error(result.stderr || result.stdout || 'unknown load error');
  process.exit(result.status || 1);
}

const line = String(result.stdout || '').trim().split('\n').filter(Boolean).pop();
const payload = JSON.parse(line);
const ms = Number(payload.ms);
const pass = ms < budgetMs;

console.log(`[functions-load] entry=${payload.entry}`);
console.log(`[functions-load] exports=${payload.exportsCount}`);
console.log(`[functions-load] cold_require_ms=${ms.toFixed(1)}`);
console.log(`[functions-load] budget_ms=${budgetMs}`);
console.log(`[functions-load] ${pass ? 'PASS' : 'FAIL'}`);

// Optional per-heavy-package timing from functions/node_modules
const requireFromFunctions = createRequire(path.join(root, 'functions', 'package.json'));
const heavy = ['pdfkit', 'openai', 'stripe', 'nodemailer', '@google-cloud/vertexai'];
for (const name of heavy) {
  try {
    const t0 = process.hrtime.bigint();
    requireFromFunctions(name);
    const pkgMs = Number(process.hrtime.bigint() - t0) / 1e6;
    console.log(`[functions-load] package ${name}=${pkgMs.toFixed(1)}ms (direct require; should be lazy in handlers)`);
  } catch (err) {
    console.log(`[functions-load] package ${name}=unavailable (${err.message})`);
  }
}

process.exit(pass ? 0 : 2);

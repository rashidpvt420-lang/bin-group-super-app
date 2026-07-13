#!/usr/bin/env node
/**
 * Playwright JSON reporter artifacts for launch evidence.
 * Uses PLAYWRIGHT_JSON_OUTPUT_FILE so dotenv/banner stdout cannot contaminate
 * the cryptographic JSON artifact on disk.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { parsePlaywrightJsonReport, sha256File } from './launch-honesty.mjs';

/**
 * Resolve Playwright CLI from node_modules/playwright/package.json bin metadata.
 * Never uses unexported package subpaths (e.g. playwright/cli).
 */
export function resolvePlaywrightCli({ root = process.cwd() } = {}) {
  const packageDir = path.join(root, 'node_modules', 'playwright');
  const packageJsonPath = path.join(packageDir, 'package.json');
  if (!existsSync(packageJsonPath)) {
    return { ok: false, reason: 'playwright package.json missing' };
  }

  let packageJson;
  try {
    packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
  } catch (err) {
    return { ok: false, reason: `unable to read playwright package.json: ${err.message}` };
  }

  const bin = packageJson.bin;
  let binRelative;
  if (typeof bin === 'string') {
    binRelative = bin;
  } else if (bin && typeof bin === 'object' && typeof bin.playwright === 'string') {
    binRelative = bin.playwright;
  } else {
    return { ok: false, reason: 'playwright package.json missing bin.playwright entry' };
  }

  const cliPath = path.resolve(packageDir, binRelative);
  if (!existsSync(cliPath)) {
    return { ok: false, reason: `playwright CLI file missing: ${cliPath}` };
  }

  return { ok: true, cliPath, packageDir };
}

function spawnPlaywrightProcess({ root, args, env, reportPath, stdio }) {
  const resolved = resolvePlaywrightCli({ root });
  if (!resolved.ok) {
    return {
      status: 1,
      stdout: '',
      stderr: `[playwright-json-artifact] ${resolved.reason}\n`,
      error: new Error(resolved.reason),
      spawnCommand: process.execPath,
      spawnArgs: null,
    };
  }

  const mergedEnv = reportPath
    ? { ...env, PLAYWRIGHT_JSON_OUTPUT_FILE: reportPath }
    : { ...env };
  const spawnArgs = [resolved.cliPath, ...args];
  const spawnOptions = {
    env: mergedEnv,
    maxBuffer: 64 * 1024 * 1024,
  };
  if (stdio) {
    spawnOptions.stdio = stdio;
  } else {
    spawnOptions.encoding = 'utf8';
  }
  const result = spawnSync(process.execPath, spawnArgs, spawnOptions);
  return {
    ...result,
    spawnCommand: process.execPath,
    spawnArgs,
  };
}

/**
 * Spawn Playwright CLI (e.g. install) via process.execPath — no shell, no npm.
 */
export function spawnPlaywright({ root = process.cwd(), args, env = process.env, stdio } = {}) {
  return spawnPlaywrightProcess({ root, args, env, stdio });
}

/**
 * Spawn Playwright test with JSON output written directly to reportPath.
 * Uses PLAYWRIGHT_JSON_OUTPUT_FILE so stdout/stderr cannot contaminate the artifact.
 */
export function spawnPlaywrightJson({ root = process.cwd(), args, env, reportPath } = {}) {
  return spawnPlaywrightProcess({ root, args, env, reportPath });
}

/**
 * Read and validate a Playwright JSON report file (fail-closed).
 */
export function readPlaywrightJsonArtifact(reportPath) {
  const abs = path.resolve(reportPath);
  if (!existsSync(abs)) {
    return { ok: false, reason: 'Playwright JSON report file missing' };
  }
  let text;
  try {
    text = readFileSync(abs, 'utf8');
  } catch (err) {
    return { ok: false, reason: `unable to read Playwright JSON report: ${err.message}` };
  }
  if (!String(text).trim()) {
    return { ok: false, reason: 'Playwright JSON report file is empty' };
  }
  try {
    const report = JSON.parse(text);
    return { ok: true, report, absolutePath: abs };
  } catch (err) {
    return { ok: false, reason: `Playwright JSON report malformed: ${err.message}` };
  }
}

/**
 * Optional diagnostic log — stdout/stderr never mixed into the JSON artifact.
 */
export function writePlaywrightDiagnosticLog(diagPath, { exitCode, stdout = '', stderr = '' }) {
  const body = [
    `exitCode=${exitCode}`,
    '--- stdout ---',
    String(stdout),
    '--- stderr ---',
    String(stderr),
  ].join('\n');
  writeFileSync(diagPath, body);
}

/**
 * Fail-closed evaluation after Playwright exits. Evidence may be recorded only when
 * report file is valid JSON, parsePlaywrightJsonReport passes, and exitCode is 0.
 */
export function evaluatePlaywrightJsonRun({ exitCode, reportPath }) {
  const loaded = readPlaywrightJsonArtifact(reportPath);
  if (!loaded.ok) {
    return { ok: false, reason: loaded.reason, exitCode: exitCode ?? 1 };
  }

  const parsed = parsePlaywrightJsonReport(loaded.report);
  if (!parsed.ok) {
    return { ok: false, reason: parsed.reason, exitCode: exitCode ?? 1, parsed };
  }

  if (Number(exitCode) !== 0) {
    return {
      ok: false,
      reason: `Playwright exitCode=${exitCode}`,
      exitCode,
      parsed,
    };
  }

  let artifactHash;
  try {
    artifactHash = sha256File(loaded.absolutePath);
  } catch (err) {
    return { ok: false, reason: `unable to hash Playwright JSON artifact: ${err.message}`, exitCode };
  }

  return {
    ok: true,
    exitCode: 0,
    parsed,
    artifactHash,
    report: loaded.report,
    absolutePath: loaded.absolutePath,
  };
}

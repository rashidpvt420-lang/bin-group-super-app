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
 * Spawn npm Playwright with JSON output written directly to reportPath.
 * Does not enable shell; caller must pass npmCmd as npm or npm.cmd with argv array.
 */
export function spawnNpmPlaywrightJson({ npmCmd, args, env, reportPath }) {
  const mergedEnv = {
    ...env,
    PLAYWRIGHT_JSON_OUTPUT_FILE: reportPath,
  };
  return spawnSync(npmCmd, args, {
    encoding: 'utf8',
    env: mergedEnv,
    maxBuffer: 64 * 1024 * 1024,
  });
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

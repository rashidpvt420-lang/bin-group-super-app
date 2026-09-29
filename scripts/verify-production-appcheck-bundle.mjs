#!/usr/bin/env node
/**
 * Fail the production web build when the bundle embeds an App Check debug token
 * or assigns FIREBASE_APPCHECK_DEBUG_TOKEN. Match text is never printed.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const DEBUG_TOKEN_NAME_RE = /VITE_FIREBASE_APPCHECK_DEBUG_TOKEN/;
const DEBUG_TOKEN_ASSIGNMENT_RE = /FIREBASE_APPCHECK_DEBUG_TOKEN['"]?\s*=(?!=)|\[['"]FIREBASE_APPCHECK_DEBUG_TOKEN['"]\]\s*=(?!=)|\.FIREBASE_APPCHECK_DEBUG_TOKEN\s*=(?!=)/;

export function findAppCheckDebugLeaks(source) {
  const reasons = [];
  const text = String(source || '');
  if (DEBUG_TOKEN_NAME_RE.test(text)) reasons.push('VITE_FIREBASE_APPCHECK_DEBUG_TOKEN');
  if (DEBUG_TOKEN_ASSIGNMENT_RE.test(text)) reasons.push('FIREBASE_APPCHECK_DEBUG_TOKEN assignment');
  return reasons;
}

function walkBuildFiles(directory, files = []) {
  for (const entry of readdirSync(directory)) {
    const fullPath = path.join(directory, entry);
    const stats = statSync(fullPath);
    if (stats.isDirectory()) {
      walkBuildFiles(fullPath, files);
    } else if (/\.(?:js|mjs|html|css|map)$/.test(entry)) {
      files.push(fullPath);
    }
  }
  return files;
}

export function scanProductionAppCheckBundle(directory) {
  const files = walkBuildFiles(directory);
  const leaks = [];
  for (const filePath of files) {
    const reasons = findAppCheckDebugLeaks(readFileSync(filePath, 'utf8'));
    if (reasons.length) {
      leaks.push({ filePath, reasons });
    }
  }
  return leaks;
}

function main() {
  const directory = path.resolve(process.argv[2] || 'dist');
  let leaks;
  try {
    leaks = scanProductionAppCheckBundle(directory);
  } catch (error) {
    const code = error && typeof error === 'object' && 'code' in error ? error.code : '';
    if (code === 'ENOENT') {
      console.error(`[appcheck-bundle] FAIL missing production bundle directory ${directory}`);
      process.exit(1);
    }
    throw error;
  }

  if (!leaks.length) {
    console.log('[appcheck-bundle] production bundle has no App Check debug token');
    return;
  }

  for (const leak of leaks) {
    console.error(
      `[appcheck-bundle] FAIL ${path.relative(process.cwd(), leak.filePath)} contains ${leak.reasons.join(' and ')}`,
    );
  }
  process.exit(1);
}

const isMain = process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url;
if (isMain) main();

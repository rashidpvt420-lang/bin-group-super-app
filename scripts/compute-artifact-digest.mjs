#!/usr/bin/env node
/**
 * Compute a deterministic SHA-256 digest over the production build output
 * (dist/, apps/admin-panel/build/, functions/lib/). Used to bind a founder
 * approval and a post-deploy release to the exact bytes that were built and
 * reviewed, independent of (and in addition to) the commit SHA.
 *
 * Deterministic: files are sorted by relative path before hashing so build
 * order/filesystem enumeration order cannot change the result.
 *
 * Usage: node scripts/compute-artifact-digest.mjs [--print-only]
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const TARGET_DIRS = ['dist', 'apps/admin-panel/build', 'functions/lib'];

function walk(dir, base, files) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(abs, base, files);
    } else if (entry.isFile()) {
      files.push(path.relative(base, abs).replace(/\\/g, '/'));
    }
  }
}

function digestDir(relativeDir) {
  const abs = path.join(root, relativeDir);
  if (!existsSync(abs) || !statSync(abs).isDirectory()) {
    return null;
  }
  const files = [];
  walk(abs, abs, files);
  files.sort();
  const hash = createHash('sha256');
  for (const relFile of files) {
    const fileAbs = path.join(abs, relFile);
    hash.update(relFile);
    hash.update(readFileSync(fileAbs));
  }
  return { relativeDir, fileCount: files.length, hash: hash.digest('hex') };
}

const results = TARGET_DIRS.map(digestDir).filter(Boolean);
if (results.length === 0) {
  console.error(`::error::No build output directories found (checked: ${TARGET_DIRS.join(', ')}). Run the build steps before computing the artifact digest.`);
  process.exit(1);
}

const combined = createHash('sha256');
for (const result of results) {
  combined.update(`${result.relativeDir}:${result.hash}\n`);
}
const digest = combined.digest('hex');

if (!process.argv.includes('--print-only')) {
  for (const result of results) {
    console.error(`[artifact-digest] ${result.relativeDir}: ${result.fileCount} files, ${result.hash.slice(0, 16)}…`);
  }
  console.error(`[artifact-digest] combined: ${digest}`);
}
console.log(digest);

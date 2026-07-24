#!/usr/bin/env node

import { readFileSync, writeFileSync } from 'node:fs';

// Temporary branch-only repair. Remove this file before merging the workflow fix.
const workflowPath = '.github/workflows/privileged-account-review-request.yml';
const source = readFileSync(workflowPath, 'utf8');
const lines = source.split('\n');
let discoveredBlocks = 0;
let repairedLines = 0;
let inBody = false;

for (let index = 0; index < lines.length; index += 1) {
  const line = lines[index];
  if (!inBody && /^\s+body="## /.test(line)) {
    inBody = true;
    discoveredBlocks += 1;
    continue;
  }
  if (!inBody) continue;

  if (line === '' || !/^\s/.test(line)) {
    lines[index] = `          ${line}`;
    repairedLines += 1;
  }

  if (/`false`"\s*$/.test(line)) {
    inBody = false;
  }
}

if (inBody) {
  throw new Error('Protected workflow repair found an unterminated body assignment.');
}
if (discoveredBlocks !== 4) {
  throw new Error(`Expected exactly 4 multiline body assignments; found ${discoveredBlocks}.`);
}

if (repairedLines > 0) {
  writeFileSync(workflowPath, lines.join('\n'));
}
console.log(`[workflow-repair] discovered_blocks=${discoveredBlocks} repaired_lines=${repairedLines} path=${workflowPath}`);

#!/usr/bin/env node

import { readFileSync, writeFileSync } from 'node:fs';

// Temporary branch-only repair. Remove this file before merging the workflow fix.
const workflowPath = '.github/workflows/privileged-account-review-request.yml';
const source = readFileSync(workflowPath, 'utf8');
const lines = source.split('\n');
let repairedBlocks = 0;
let inBody = false;

for (let index = 0; index < lines.length; index += 1) {
  const line = lines[index];
  if (!inBody && /^\s+body="## /.test(line)) {
    inBody = true;
    repairedBlocks += 1;
    continue;
  }
  if (!inBody) continue;

  if (line === '' || !/^\s/.test(line)) {
    lines[index] = `          ${line}`;
  }

  if (/`false`"\s*$/.test(line)) {
    inBody = false;
  }
}

if (inBody) {
  throw new Error('Protected workflow repair found an unterminated body assignment.');
}
if (repairedBlocks !== 4) {
  throw new Error(`Expected exactly 4 multiline body assignments; found ${repairedBlocks}.`);
}

const repaired = lines.join('\n');
if (repaired === source) {
  throw new Error('Protected workflow repair made no change.');
}
writeFileSync(workflowPath, repaired);
console.log(`[workflow-repair] repaired_blocks=${repairedBlocks} path=${workflowPath}`);

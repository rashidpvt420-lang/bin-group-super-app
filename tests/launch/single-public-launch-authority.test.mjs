import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

const roots = ['.github/workflows', 'scripts'];
const forbidden = [
  'AUTHORIZE_PHASE1_PUBLIC_YES_GO',
  'DEPLOY_PHASE1_PUBLIC_BIN_GROUP',
  'phase1-public-yes-go',
  "hardLaunchDecision: 'YES-GO'",
  "decision: 'YES-GO'",
  'PHASE 1 PUBLIC LAUNCH DECISION: YES-GO',
  'noGoBlockersRemaining: []',
  "launchMode: 'phase1-public'",
];

function filesUnder(root) {
  const output = [];
  for (const entry of readdirSync(root)) {
    const absolute = path.join(root, entry);
    const stat = statSync(absolute);
    if (stat.isDirectory()) output.push(...filesUnder(absolute));
    else if (stat.isFile()) output.push(absolute);
  }
  return output;
}

test('only the canonical signed hard-launch pipeline may authorize unrestricted public launch', () => {
  const violations = [];
  for (const file of roots.flatMap(filesUnder)) {
    const source = readFileSync(file, 'utf8');
    for (const marker of forbidden) {
      if (source.includes(marker)) violations.push(`${file}: ${marker}`);
    }
  }
  assert.deepEqual(
    violations,
    [],
    `Alternate or unsigned public-launch authority detected:\n${violations.join('\n')}`,
  );
});

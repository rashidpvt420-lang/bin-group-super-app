#!/usr/bin/env node

import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { gitSha, sha256File } from './lib/launch-honesty.mjs';

const gatePath = 'launch_package/launch-proof-gates.json';
const artifactRoot = path.resolve('launch_package/artifacts');
const MAX_ARTIFACT_BYTES = 50 * 1024 * 1024;
const MAX_CLOCK_SKEW_MS = 5 * 60 * 1000;

function usage() {
  console.error(`Usage:\n  npm run launch:pass -- --gate <gateName> --proof "<what was tested>" --artifact <launch_package/artifacts/file> --tester "<name>" --testedAt <ISO timestamp>\n\nDeployment proof cannot be recorded manually. Use the protected Firebase Production Deploy workflow.`);
  process.exit(1);
}

function argValue(name) {
  const index = process.argv.indexOf(`--${name}`);
  if (index === -1) return '';
  return String(process.argv[index + 1] || '').trim();
}

function resolveArtifact(value) {
  const absolutePath = path.resolve(value);
  const relativePath = path.relative(artifactRoot, absolutePath).replace(/\\/g, '/');
  if (!relativePath || relativePath.startsWith('../') || path.isAbsolute(relativePath)) {
    throw new Error('Manual proof artifacts must be inside launch_package/artifacts/.');
  }
  if (!existsSync(absolutePath)) throw new Error(`Proof artifact does not exist: ${value}`);
  const stat = statSync(absolutePath);
  if (!stat.isFile() || stat.size <= 0) throw new Error('Proof artifact must be a non-empty regular file.');
  if (stat.size > MAX_ARTIFACT_BYTES) throw new Error('Proof artifact exceeds the 50 MB manual-evidence limit.');
  return {
    absolutePath,
    artifactPath: `launch_package/artifacts/${relativePath}`,
    artifactBytes: stat.size,
  };
}

const gateName = argValue('gate');
const proof = argValue('proof');
const artifactArg = argValue('artifact');
const tester = argValue('tester');
const testedAt = argValue('testedAt');

if (!gateName || !proof || !artifactArg || !tester || !testedAt) usage();
if (proof.length < 30) {
  console.error('Proof text is too short. Include what was tested, where, and the observable result.');
  process.exit(1);
}
const testedAtMs = Date.parse(testedAt);
if (!Number.isFinite(testedAtMs) || testedAtMs > Date.now() + MAX_CLOCK_SKEW_MS) {
  console.error('testedAt must be a valid ISO timestamp that is not in the future.');
  process.exit(1);
}
if (!existsSync(gatePath)) {
  console.error(`Missing launch proof gate file: ${gatePath}`);
  process.exit(1);
}

let artifact;
try {
  artifact = resolveArtifact(artifactArg);
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Manual proof artifact is invalid.');
  process.exit(1);
}

const gates = JSON.parse(readFileSync(gatePath, 'utf8'));
const groups = ['requiredProviderGates', 'requiredDeviceGates'];
let found = false;

if (Object.prototype.hasOwnProperty.call(gates.deploymentProof || {}, gateName)) {
  console.error(`${gateName} is deployment proof and cannot be marked passed manually.`);
  console.error('Run the protected Firebase Production Deploy workflow to generate exact-run deployment evidence.');
  process.exit(1);
}

for (const groupName of groups) {
  const group = gates[groupName] || {};
  if (!Object.prototype.hasOwnProperty.call(group, gateName)) continue;
  const gate = group[gateName] || {};

  if (gate.required === false && gate.status === 'waived') {
    console.error(`${gateName} is waived and does not need launch proof. Change scope through reviewed configuration, not this recorder.`);
    process.exit(1);
  }

  const commitSha = gitSha(process.cwd());
  group[gateName] = {
    ...gate,
    status: 'passed',
    proof,
    testedBy: tester,
    testedAt: new Date(testedAtMs).toISOString(),
    commitSha,
    artifactPath: artifact.artifactPath,
    artifactHash: `sha256:${sha256File(artifact.absolutePath)}`,
    artifactBytes: artifact.artifactBytes,
    evidenceType: 'manual-artifact',
    executionGenerated: false,
    hardLaunchClaim: false,
    updatedAt: new Date().toISOString(),
  };
  gates[groupName] = group;
  found = true;
  break;
}

if (!found) {
  console.error(`Unknown manual-evidence gate: ${gateName}`);
  console.error('Available provider/device gates:');
  for (const groupName of groups) {
    for (const name of Object.keys(gates[groupName] || {})) console.error(`- ${name}`);
  }
  process.exit(1);
}

gates.lastAuditUpdate = new Date().toISOString();
writeFileSync(gatePath, `${JSON.stringify(gates, null, 2)}\n`);
console.log(`Recorded artifact-bound manual proof for ${gateName}.`);
console.log('Run: npm run test:launch-clearance');

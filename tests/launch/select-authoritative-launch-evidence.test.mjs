import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { spawnSync } from 'node:child_process';

const providerTruth = readFileSync('packages/shared/src/config/providerLaunchTruth.ts', 'utf8');
const routeGuard = readFileSync('apps/admin-panel/src/pages/admin/PublicLaunchCommandCenterPage.tsx', 'utf8');
const envWriter = readFileSync('scripts/write-production-env.mjs', 'utf8');

test('shared helper prefers protected qualifying evidence over newer manual history', () => {
  assert.match(providerTruth, /export function selectAuthoritativeLaunchEvidence/);
  assert.match(providerTruth, /candidatePass && !currentPass/);
  assert.match(providerTruth, /currentPass && !candidatePass/);
  assert.match(providerTruth, /candidateIsNewerThanCurrent/);
});

test('command center gate uses exact-SHA query and authoritative selection', () => {
  assert.match(routeGuard, /selectAuthoritativeLaunchEvidence/);
  assert.match(routeGuard, /where\('releaseSha', '==', RELEASE_SHA\)/);
  assert.match(routeGuard, /manual only/);
  assert.match(routeGuard, /cannot shadow protected GitHub Actions evidence/);
});

test('production env writer can bind Admin to a frozen public-launch SHA', () => {
  assert.match(envWriter, /PUBLIC_LAUNCH_RELEASE_COMMIT_SHA/);
  assert.match(
    envWriter,
    /PUBLIC_LAUNCH_RELEASE_COMMIT_SHA[\s\S]*RELEASE_COMMIT_SHA[\s\S]*GITHUB_SHA/,
  );
});

test('runtime helper keeps protected smoke when a newer manual row arrives first', () => {
  const build = spawnSync('npm', ['run', 'build', '-w', '@bin/shared'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  assert.equal(build.status, 0, build.stderr || build.stdout);

  return import('../../packages/shared/dist/config/providerLaunchTruth.js').then((mod) => {
    const RELEASE_SHA = 'bb4df313df36e1636423ed90e8a77c990a6c50ff';
    const protectedSmoke = {
      status: 'passed',
      source: 'github-actions',
      executionGenerated: true,
      hardLaunchClaim: false,
      releaseSha: RELEASE_SHA,
      evidenceLayer: 'hosted',
    };
    const manualSmoke = {
      status: 'passed',
      source: 'admin-manual-evidence',
      executionGenerated: false,
      hardLaunchClaim: false,
      releaseSha: RELEASE_SHA,
      evidenceLayer: 'hosted',
    };

    assert.equal(mod.evidenceCountsForPublicLaunch(protectedSmoke, RELEASE_SHA, 'hosted'), true);
    assert.equal(mod.evidenceCountsForPublicLaunch(manualSmoke, RELEASE_SHA, 'hosted'), false);
    assert.equal(
      mod.selectAuthoritativeLaunchEvidence(manualSmoke, protectedSmoke, RELEASE_SHA, 'hosted', false),
      protectedSmoke,
    );
    assert.equal(
      mod.selectAuthoritativeLaunchEvidence(manualSmoke, protectedSmoke, RELEASE_SHA, 'hosted', true),
      protectedSmoke,
    );
  });
});

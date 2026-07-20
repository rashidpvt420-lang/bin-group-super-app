import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const ROOT = new URL('../../', import.meta.url);
const CANONICAL_DOCUMENTS = [
  'docs/RELEASE_BLOCKERS.md',
  'docs/FULL_FIVE_PROFILE_AUDIT.md',
  'docs/PROPERTY_ONBOARDING_AUDIT.md',
  'OPERATIONS_ONLY_CHECKLIST.md',
];

const read = (path) => readFile(new URL(path, ROOT), 'utf8');

test('canonical readiness documents use runtime exact-SHA binding', async () => {
  const entries = await Promise.all(CANONICAL_DOCUMENTS.map(async (path) => [path, await read(path)]));

  for (const [path, source] of entries) {
    assert.doesNotMatch(
      source,
      /\*\*BASE_SHA[^\n]*[0-9a-f]{40}/i,
      `${path} must not embed a commit SHA that becomes stale after merge`,
    );
    assert.doesNotMatch(
      source,
      /cursor\/full-system-audit-fix-v4-30e9/i,
      `${path} must not point operators to the obsolete audit branch`,
    );
    assert.match(source, /Source branch:\*\* `main`/i, `${path} must name main as the source branch`);
    assert.match(source, /exact (?:40-character )?commit|exact-SHA/i, `${path} must require runtime commit binding`);
    assert.match(source, /protected (?:CI|workflow|runtime)/i, `${path} must keep protected runtime evidence authoritative`);
  }
});

test('canonical readiness documents remain honest about production evidence', async () => {
  const release = await read('docs/RELEASE_BLOCKERS.md');
  const onboarding = await read('docs/PROPERTY_ONBOARDING_AUDIT.md');
  const operations = await read('OPERATIONS_ONLY_CHECKLIST.md');

  assert.match(release, /HARD PUBLIC LAUNCH:\*\* `NO-GO`/i);
  assert.match(release, /Production deployment claim:\*\* Not asserted by source documentation/i);
  assert.match(release, /source document is not/i);
  assert.match(onboarding, /Source documentation cannot assert that they have passed/i);
  assert.match(operations, /does not assert production deployment, pilot eligibility, hard clearance, or public launch/i);
  assert.match(operations, /Only the protected GitHub production workflows may deploy/i);
  assert.match(operations, /No local Firebase deployment command is an approved substitute/i);
  assert.doesNotMatch(operations, /^\s*firebase\s+deploy\b/im);
});

test('operator guidance enforces canonical single-founder authority', async () => {
  const [operations, bootstrap] = await Promise.all([
    read('OPERATIONS_ONLY_CHECKLIST.md'),
    read('docs/launch/admin-mfa-bootstrap-runbook.md'),
  ]);

  for (const source of [operations, bootstrap]) {
    assert.match(source, /ceo@bin-groups\.com/i);
    assert.match(source, /single-founder|canonical founder/i);
    assert.match(source, /delete(?:d)? every other privileged|every other privileged.*deleted/i);
    assert.doesNotMatch(source, /preserve at least two|two distinct active CEO|recovery quorum ready/i);
  }
  assert.match(operations, /Owner, Tenant, Technician and Broker accounts.*excluded/i);
  assert.match(operations, /Google Play Console developer identity/i);
});

test('operator guidance never directs users to obsolete feature branches', async () => {
  const testing = await read('TESTING.md');
  const historicalAudit = await read('LAUNCH_READINESS_AUDIT.md');
  const historicalProfileAudit = await read('FIVE_PROFILE_ONBOARDING_AUDIT.md');

  assert.doesNotMatch(testing, /git\s+checkout\s+cursor\//i);
  assert.doesNotMatch(testing, /scripts live on branch\s+`cursor\//i);
  assert.match(testing, /All listed scripts are present on current `main`/i);
  assert.match(testing, /do not switch to a historical feature branch/i);

  assert.match(historicalAudit, /Historical archive/i);
  assert.match(historicalAudit, /not authoritative/i);
  assert.doesNotMatch(historicalAudit, /cursor\//i);
  assert.match(historicalAudit, /HARD PUBLIC LAUNCH remains `NO-GO`/i);

  assert.match(historicalProfileAudit, /Historical Index/i);
  assert.match(historicalProfileAudit, /Superseded report/i);
  assert.match(historicalProfileAudit, /docs\/FULL_FIVE_PROFILE_AUDIT\.md/i);
  assert.doesNotMatch(historicalProfileAudit, /Audit baseline:\s*`main` after PR/i);
  assert.match(historicalProfileAudit, /HARD PUBLIC LAUNCH remains `NO-GO`/i);
});

test('post-deployment monitoring never claims launch or permits bypass deployment', async () => {
  const monitoring = await read('docs/POST_LAUNCH_MONITORING.md');

  assert.match(monitoring, /Status claim:\*\* This document does not assert/i);
  assert.match(monitoring, /protected deployment workflow/i);
  assert.match(monitoring, /exact deployed commit SHA/i);
  assert.match(monitoring, /No local or hosting-only Firebase deployment command/i);
  assert.doesNotMatch(monitoring, /Public launch reported complete/i);
  assert.doesNotMatch(monitoring, /^\s*firebase\s+deploy\b/im);
  assert.match(monitoring, /cannot authorize pilot eligibility, hard-clearance or public launch/i);
});

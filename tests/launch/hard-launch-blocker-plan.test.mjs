#!/usr/bin/env node
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile('scripts/print-hard-launch-blockers.mjs', 'utf8');

test('hard launch blocker printer documents the executable protected workflow chain', () => {
  for (const required of [
    'Firebase Production Deploy',
    'Live Role Smoke Tests',
    'launch_mode: bank-pilot',
    'mode: live-evidence',
    'mode: hard-clearance',
    'launch_mode: public',
    'run_public_release_gate: true',
    'stripe_live_checkout_session_id: cs_live_',
    'stripe_live_webhook_event_id: evt_',
  ]) {
    assert.ok(source.includes(required), `missing launch plan marker: ${required}`);
  }
});

test('hard launch blocker printer warns that JSON/source edits cannot clear launch', () => {
  assert.match(source, /Only scripts\/hard-launch-decision-gate\.mjs may write hardLaunchClaim=true/);
  assert.match(source, /Editing JSON or source files does not clear launch/);
  assert.match(source, /Live workflow evidence is still required/);
});

test('hard launch blocker printer reports runtime artifact bindings', () => {
  for (const file of [
    'launch_package/production-deployment.json',
    'launch_package/launch-evidence-batch.json',
    'launch_package/operational-readiness.json',
    'launch_package/pilot-incident-report.json',
    'launch_package/public-release-status.json',
    'launch_package/stripe-live-proof.json',
    'launch_package/hard-launch-decision.json',
  ]) {
    assert.ok(source.includes(file), `missing artifact matrix file: ${file}`);
  }
});

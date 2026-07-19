import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('dispatcher forwards protected founder and incident inputs', async () => {
  const source = await readFile(new URL('../../.github/workflows/firebase-production-dispatch-current-main.yml', import.meta.url), 'utf8');
  for (const input of ['confirmation', 'hard_launch_confirmation', 'founder_name', 'founder_email', 'launch_mode', 'incident_attestation', 'incident_active_json', 'incident_evidence_refs']) {
    assert.match(source, new RegExp(`${input}:`));
  }
});

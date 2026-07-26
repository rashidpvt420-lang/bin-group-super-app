import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');

test('STOP before first canonical UPDATE is recoverable and truthfully diagnosed', async () => {
  const [server, client] = await Promise.all([
    read('functions/technicianLiveLocation.ts'),
    read('src/utils/liveTracking.ts'),
  ]);
  const missingStart = server.indexOf('if (stopDecision === "REJECT_MISSING")');
  const supersededStart = server.indexOf('if (stopDecision === "REJECT_SUPERSEDED")', missingStart);
  const missingBranch = server.slice(missingStart, supersededStart);
  assert.ok(missingStart >= 0 && supersededStart > missingStart);
  assert.match(missingBranch, /missingSession: true/);
  assert.match(missingBranch, /currentTrackingSessionId: null/);
  assert.doesNotMatch(missingBranch, /throw new HttpsError/);
  assert.doesNotMatch(missingBranch, /tx\.set\(liveRef/);

  assert.match(client, /STOP_MISSING_SESSION_RECONCILED/);
  assert.match(client, /canonicalSessionAbsent: true/);
  assert.match(client, /serverAcknowledged: stopAcknowledged \|\| stopSuperseded/);
});

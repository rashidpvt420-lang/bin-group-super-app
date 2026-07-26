import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');

test('STOP before first canonical UPDATE writes a stopped tombstone and rejects a late callback', async () => {
  const [server, helperSource] = await Promise.all([
    read('functions/technicianLiveLocation.ts'),
    read('functions/technicianLiveLocationCas.ts'),
  ]);
  const transpiled = ts.transpileModule(helperSource, {
    compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2021 },
  }).outputText;
  const cas = await import(`data:text/javascript;base64,${Buffer.from(transpiled).toString('base64')}`);

  const missing = {
    exists: false,
    isTracking: false,
    trackingSessionId: '',
    activeTicketId: '',
    lastStoppedTicketId: '',
    expiresAtMs: null,
  };
  assert.equal(cas.classifyStopRequest(missing, 'ticket-1', 'session-A'), 'APPLY');

  const stopped = {
    exists: true,
    isTracking: false,
    trackingSessionId: 'session-A',
    activeTicketId: '',
    lastStoppedTicketId: 'ticket-1',
    expiresAtMs: 0,
  };
  assert.equal(cas.classifyUpdateRequest(stopped, 'ticket-1', 'session-A', 1_000), 'REJECT_SUPERSEDED');
  assert.equal(cas.classifyUpdateRequest(stopped, 'ticket-1', 'session-B', 1_000), 'APPLY');

  const standardStopStart = server.indexOf('const ticketExists = ticketSnap.exists;');
  const updateStart = server.indexOf('if (!ticketSnap.exists)', standardStopStart);
  const standardStopBranch = server.slice(standardStopStart, updateStart);
  assert.ok(standardStopStart >= 0 && updateStart > standardStopStart);
  assert.match(standardStopBranch, /tx\.set\(liveRef/);
  assert.match(standardStopBranch, /isTracking: false/);
  assert.match(standardStopBranch, /trackingSessionId/);
  assert.match(standardStopBranch, /lastStoppedTicketId: ticketId/);
  assert.match(standardStopBranch, /expiresAt: now/);
});

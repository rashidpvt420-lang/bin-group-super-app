// Audit 2026-11-04 fixes 6/7: rejected callables log a structured reason; App Check stays enforced.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { HttpsError } from 'firebase-functions/v2/https';
import { withRejectionReasonLog, rejectionLogEntry } from '../functions/callableRejectionLog.ts';
import { classifyPublicAssistantError, publicAssistantFallbackNote } from '../src/lib/publicAssistantErrors.ts';

const read = (p) => readFile(new URL(`../${p}`, import.meta.url), 'utf8');

test('wrapper logs fn/code/reason and rethrows the same error unchanged', async () => {
  const logged = [];
  const orig = console.warn; console.warn = (e) => logged.push(e);
  const err = new HttpsError('permission-denied', 'Only the assigned technician can share live location.');
  try {
    const wrapped = withRejectionReasonLog('updateTechnicianLiveLocation', async () => { throw err; });
    await assert.rejects(wrapped({ auth: { uid: 'u1', token: { role: 'owner' } }, app: undefined, data: { lat: 25.2 } }), (e) => e === err);
  } finally { console.warn = orig; }
  assert.equal(logged.length, 1);
  assert.deepEqual(logged[0], {
    event: 'callable_rejected', fn: 'updateTechnicianLiveLocation', code: 'permission-denied',
    reason: 'Only the assigned technician can share live location.', expected: true,
    authenticated: true, role: 'owner', appCheckVerified: false,
  });
  assert.ok(!JSON.stringify(logged[0]).includes('25.2'), 'no payload/coordinates logged');
});

test('success passes through and unexpected errors are logged as internal', async () => {
  const ok = withRejectionReasonLog('x', async (r) => r.data.v + 1);
  assert.equal(await ok({ data: { v: 1 } }), 2);
  assert.equal(rejectionLogEntry('x', new Error('boom'), {}).code, 'internal');
  assert.equal(rejectionLogEntry('x', new Error('boom'), {}).expected, false);
});

test('the warned callables are wrapped and still enforce App Check', async () => {
  const cases = {
    'functions/publicAppAssistant.ts': ['askPublicAppAssistant'],
    'functions/technicianLiveLocation.ts': ['updateTechnicianLiveLocation'],
    'functions/technicianAvailabilityLocation.ts': ['reportTechnicianAvailabilityLocation'],
    'functions/secureBrokerPayoutOperations.ts': ['submitBrokerPayoutRequest'],
    'functions/tenantJobLinks.ts': ['resolveTenantJobLink', 'createTenantJobLink', 'reportViaTenantJobLink'],
  };
  for (const [file, names] of Object.entries(cases)) {
    const src = await read(file);
    for (const n of names) {
      assert.match(src, new RegExp(`withRejectionReasonLog\\("${n}", async \\(request\\)`), `${n} wrapped`);
      const decl = src.slice(src.indexOf(`export const ${n} = onCall(`), src.indexOf(`withRejectionReasonLog("${n}"`));
      assert.match(decl, /enforceAppCheck: true/, `${n} keeps App Check`);
    }
  }
});

test('public assistant client explains App Check failures and logs the reason', async () => {
  assert.equal(classifyPublicAssistantError({ code: 'functions/unauthenticated', message: 'Unauthenticated' }), 'app_check');
  assert.equal(classifyPublicAssistantError({ code: 'functions/resource-exhausted' }), 'rate_limited');
  assert.equal(classifyPublicAssistantError({ code: 'functions/internal', message: 'Failed to fetch' }), 'network');
  assert.equal(classifyPublicAssistantError({ code: 'functions/internal' }), 'unavailable');
  assert.match(publicAssistantFallbackNote('app_check'), /could not verify this browser/);
  const chat = await read('src/components/SovereignAIChat.tsx');
  assert.match(chat, /publicFailureNote = publicAssistantFallbackNote\(publicReason\)/);
  assert.match(chat, /reason: publicReason/);
});

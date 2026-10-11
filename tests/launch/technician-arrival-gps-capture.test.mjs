import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const source = readFileSync('src/technician/pages/TechnicianJobDetailPage.tsx', 'utf8');
const lifecycle = source.slice(source.indexOf('    const updateLifecycle = async'), source.indexOf('\n    if (loading)', source.indexOf('    const updateLifecycle = async')));
const executable = ts.transpileModule(`${lifecycle}\nglobalThis.run = updateLifecycle;`, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText;

function fixture({ online = true, tracking = true, gpsError, serverError, nativeHash = null } = {}) {
  const events = [];
  let watching = tracking;
  let loading = false;
  const context = {
    id: 'test-ticket', user: { uid: 'test-technician' }, online, isTracking: tracking,
    closeBlockers: [], notes: '', materials: '', ticket: { status: 'EN_ROUTE' },
    functions: {},
    setActionLoading(value) { loading = value; events.push(['loading', value]); },
    setIsTracking(value) { events.push(['tracking', value]); },
    setGpsError(value) { events.push(['error', value]); },
    setMessage(value) { events.push(['message', value]); },
    async stopLiveTracking(uid, id, reason) {
      events.push(['stop', uid, id, reason]); watching = false;
    },
    async getVerifiedArrivalPosition() {
      events.push(['gps']);
      assert.equal(watching, false, 'Fresh one-shot acquisition cannot overlap the foreground watch.');
      if (gpsError) throw gpsError;
      return { latitude: 24.2075, longitude: 55.7447, accuracy: 15, heading: null, speed: null, capturedAtMs: 123456, locationSource: 'browser_geolocation' };
    },
    async readNativeTechnicianInstallationHash() { return nativeHash; },
    async ensureTechnicianInstallationRegistered(hash) { events.push(['installation', hash]); },
    httpsCallable(_functions, name) { return async (payload) => {
      events.push(['call', name, payload]); if (serverError) throw serverError;
    }; },
    queueAction(...args) { events.push(['queue', ...args]); },
    tx(_key, fallback) { return fallback; },
    alert() { throw new Error('Unexpected alert'); },
  };
  vm.runInNewContext(executable, context);
  return { run: context.run, events, isLoading: () => loading };
}

test('online arrival stops capture before fresh GPS and still sends the exact fix to server validation', async () => {
  const f = fixture({ nativeHash: 'verified-installation' });
  await f.run('ARRIVED');
  assert.ok(f.events.findIndex(([kind]) => kind === 'stop') < f.events.findIndex(([kind]) => kind === 'gps'));
  assert.equal(f.events.find(([kind]) => kind === 'stop')[3], 'PRESERVE', 'A capture pause must not claim verified arrival.');
  const [, name, payload] = f.events.find(([kind]) => kind === 'call');
  assert.equal(name, 'updateTicketLifecycle');
  assert.equal(payload.status, 'ARRIVED');
  assert.equal(payload.arrivalLocation.accuracy, 15);
  assert.equal(payload.arrivalLocation.capturedAtMs, 123456);
  assert.equal(payload.arrivalLocation.locationSource, 'browser_geolocation');
  assert.equal(payload.installationHash, 'verified-installation');
  assert.equal(f.isLoading(), false);
});

for (const message of ['GPS permission is required', 'GPS timed out', 'GPS signal is too weak']) {
  test(`${message} cannot record arrival and releases the tracking-resume hold`, async () => {
    const f = fixture({ gpsError: new Error(message) });
    await f.run('ARRIVED');
    assert.equal(f.events.some(([kind]) => kind === 'call'), false);
    assert.ok(f.events.some(([kind, value]) => kind === 'error' && value === message));
    assert.ok(f.events.some(([kind, value]) => kind === 'tracking' && value === false));
    assert.equal(f.isLoading(), false);
  });
}

test('server rejection remains visible and releases the tracking-resume hold', async () => {
  const f = fixture({ serverError: new Error('Production rejected arrival') });
  await f.run('ARRIVED');
  assert.ok(f.events.some(([kind, value]) => kind === 'error' && value === 'Production rejected arrival'));
  assert.equal(f.isLoading(), false);
});

test('arrival without an active watcher still requires a verified fresh position', async () => {
  const f = fixture({ tracking: false });
  await f.run('ARRIVED');
  assert.equal(f.events.some(([kind]) => kind === 'stop'), false);
  assert.ok(f.events.some(([kind]) => kind === 'gps'));
  assert.ok(f.events.some(([kind]) => kind === 'call'));
});

test('offline arrival without native installation proof remains blocked', async () => {
  const f = fixture({ online: false, tracking: false });
  await f.run('ARRIVED');
  assert.equal(f.events.some(([kind]) => kind === 'call' || kind === 'queue'), false);
  assert.ok(f.events.some(([kind, value]) => kind === 'error' && /verified Google Play Android installation/.test(value || '')));
});

test('tracking cannot resume while arrival is acquiring GPS or awaiting server validation', () => {
  const effectStart = source.indexOf('// A Technician may refresh/reopen');
  const resumeEffect = source.slice(effectStart, source.indexOf('const resolved', effectStart));
  assert.match(resumeEffect, /isTracking \|\| actionLoading \|\|/);
  assert.match(resumeEffect, /\[id, user\?\.uid, ticket\?\.status, online, isTracking, actionLoading\]/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import ts from 'typescript';

const nodeRequire = createRequire(import.meta.url);
const plain = (value) => JSON.parse(JSON.stringify(value));

function loadTypeScriptModule(path) {
  const source = readFileSync(path, 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
    fileName: path,
  }).outputText;
  const module = { exports: {} };
  const context = vm.createContext({
    module,
    exports: module.exports,
    require: nodeRequire,
    console,
    Date,
    Math,
    JSON,
    Number,
    String,
    Boolean,
    Object,
    Array,
    Set,
    Map,
    RegExp,
    Error,
    Promise,
    crypto: globalThis.crypto,
  });
  new vm.Script(compiled, { filename: path }).runInContext(context);
  return module.exports;
}

class MemoryStorage {
  values = new Map();
  getItem(key) { return this.values.has(key) ? this.values.get(key) : null; }
  setItem(key, value) { this.values.set(key, String(value)); }
  removeItem(key) { this.values.delete(key); }
}

const queue = loadTypeScriptModule('src/utils/gpsRetryQueue.ts');
const pins = loadTypeScriptModule('apps/admin-panel/src/lib/verifiedPropertyPin.ts');

const storage = () => ({ stop: new MemoryStorage(), update: new MemoryStorage() });
const updateInput = (overrides = {}) => ({
  action: 'UPDATE',
  ticketId: 'ticket-1',
  technicianUid: 'tech-1',
  trackingSessionId: 'session-1',
  point: { latitude: 24.22222229, longitude: 55.33333339, accuracy: 12, deviceTimestampMs: 1000 },
  queuedAtMs: 1000,
  ...overrides,
});
const stopInput = (overrides = {}) => ({
  action: 'STOP',
  ticketId: 'ticket-1',
  technicianUid: 'tech-1',
  trackingSessionId: 'session-1',
  queuedAtMs: 1000,
  ...overrides,
});

test('unverified or incomplete property geography never resolves as a verified pin', () => {
  const base = {
    id: 'property-1',
    geo: {
      lat: 24.2,
      lng: 55.3,
      verified: true,
      dispatchReady: true,
      requiresGeoReview: false,
      verifiedBy: 'founder-uid',
      verifiedAt: '2026-07-26T10:00:00.000Z',
      source: 'admin_manual',
    },
  };
  assert.deepEqual(plain(pins.resolveVerifiedPropertyPin(base)), {
    point: { lat: 24.2, lng: 55.3 },
    propertyId: 'property-1',
    verifiedBy: 'founder-uid',
    verifiedAtMs: Date.parse('2026-07-26T10:00:00.000Z'),
    source: 'admin_manual',
  });
  for (const mutation of [
    { verified: false },
    { dispatchReady: false },
    { requiresGeoReview: true },
    { verifiedBy: '' },
    { verifiedAt: null },
    { source: 'legacy_import' },
  ]) {
    assert.equal(pins.resolveVerifiedPropertyPin({ ...base, geo: { ...base.geo, ...mutation } }), null);
  }
  assert.equal(pins.verifiedPinForTicket({ propertyId: 'missing' }, new Map()), null);
});

test('live GPS expires against an advancing UI clock', () => {
  const location = {
    isTracking: true,
    expiresAt: 190_000,
    serverUpdatedAt: 100_000,
    location: { lat: 24.2, lng: 55.3 },
  };
  assert.equal(pins.liveLocationIsFreshAt(location, 180_000), true);
  assert.equal(pins.liveLocationIsFreshAt(location, 190_000), false);
  assert.equal(pins.liveLocationIsFreshAt({ ...location, expiresAt: null }, 220_001), false);
});

test('UPDATE retries retain only the latest short-lived minimum coordinate', () => {
  const stores = storage();
  queue.enqueueGpsRetryAction(updateInput(), stores, 1000);
  queue.enqueueGpsRetryAction(updateInput({ point: { latitude: 24.44444449, longitude: 55.55555559, accuracy: 8 } }), stores, 2000);
  const entries = queue.readGpsRetryQueue(stores, 2000);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].action, 'UPDATE');
  assert.deepEqual(plain(entries[0].point), { latitude: 24.444444, longitude: 55.555556, accuracy: 8 });
  assert.equal(entries[0].expiresAtMs, 2000 + (5 * 60 * 1000));
  assert.equal('heading' in entries[0].point, false);
  assert.equal('speed' in entries[0].point, false);
});

test('STOP retries persist separately, replay before UPDATE, and are not silently dropped', async () => {
  const stores = storage();
  queue.enqueueGpsRetryAction(updateInput(), stores, 1000);
  queue.enqueueGpsRetryAction(stopInput(), stores, 1100);
  queue.enqueueGpsRetryAction(stopInput({ technicianUid: 'tech-2', ticketId: 'ticket-2', trackingSessionId: 'session-2' }), stores, 1200);

  const order = [];
  const result = await queue.replayGpsRetryQueue('tech-1', async (entry) => { order.push(entry.action); }, stores, 2000);
  assert.deepEqual(order, ['STOP', 'UPDATE']);
  assert.equal(result.succeeded, 2);
  assert.equal(result.pendingStops, 0);
  const remaining = queue.readGpsRetryQueue(stores, 2000);
  assert.equal(remaining.length, 1);
  assert.equal(remaining[0].technicianUid, 'tech-2');
  assert.equal(remaining[0].action, 'STOP');
});

test('failed STOP remains pending and blocks newer actions until reconciliation', async () => {
  const stores = storage();
  queue.enqueueGpsRetryAction(stopInput(), stores, 1000);
  queue.enqueueGpsRetryAction(updateInput(), stores, 1100);
  const attempted = [];
  const result = await queue.replayGpsRetryQueue('tech-1', async (entry) => {
    attempted.push(entry.action);
    throw Object.assign(new Error('offline'), { code: 'unavailable' });
  }, stores, 2000);
  assert.deepEqual(attempted, ['STOP']);
  assert.equal(result.pendingStops, 1);
  assert.equal(queue.hasPendingGpsStop('tech-1', stores, 2000), true);
  const remaining = queue.readGpsRetryQueue(stores, 2000);
  assert.equal(remaining.some((entry) => entry.action === 'UPDATE'), true);
  assert.equal(remaining.find((entry) => entry.action === 'STOP').retryCount, 1);
});

test('account change is an explicit queue disposal boundary and expiry removes stale coordinates', () => {
  const stores = storage();
  queue.enqueueGpsRetryAction(updateInput(), stores, 1000);
  queue.enqueueGpsRetryAction(stopInput({ technicianUid: 'tech-2', ticketId: 'ticket-2', trackingSessionId: 'session-2' }), stores, 1000);
  queue.purgeGpsQueuesExceptTechnician('tech-2', stores);
  const scoped = queue.readGpsRetryQueue(stores, 1000);
  assert.equal(scoped.length, 1);
  assert.equal(scoped[0].technicianUid, 'tech-2');

  const expiring = storage();
  queue.enqueueGpsRetryAction(updateInput(), expiring, 1000);
  assert.equal(queue.readGpsRetryQueue(expiring, 1000 + (5 * 60 * 1000) + 1).length, 0);
});

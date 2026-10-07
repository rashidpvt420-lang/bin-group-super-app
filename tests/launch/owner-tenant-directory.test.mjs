import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const root = new URL('../../', import.meta.url);
function compile(path, dependencies = {}) {
  const source = readFileSync(new URL(path, root), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports = {};
  vm.runInNewContext(code, { exports, require: name => { assert.ok(name in dependencies, name); return dependencies[name]; }, Map, encodeURIComponent });
  return exports;
}
const shared = compile('functions/shared/propertyDisplayName.ts');
const { tenantEmailHref, resolveDirectoryRows, filterDirectoryRows, subscribeOwnerDirectory } = compile('src/owner/utils/ownerTenantDirectory.ts', { '../../../functions/shared/propertyDisplayName': shared });
const doc = (id, data) => ({ id, data: () => data });
const props = [doc('p1', { ownerId: 'owner', address: 'Dubai Marina' })];
const tenant = doc('t1', { ownerId: 'owner', role: 'tenant', displayName: 'Aisha', email: 'aisha+home@example.com', propertyId: 'p1', unitNumber: '101' });

test('email links accept a single mailbox and reject header injection and malformed records', () => {
  assert.equal(tenantEmailHref('aisha+home@example.com'), 'mailto:aisha%2Bhome%40example.com');
  for (const value of [undefined, {}, '', 'invalid', 'a@b.com?bcc=x', 'a@b.com\r\nBcc:x', 'a@b.com,b@b.com', 'a%0ab@b.com']) assert.equal(tenantEmailHref(value), undefined);
});
test('rows preserve UID ownership and document identity, normalize malformed fields and avoid fabricated status', () => {
  const rows = resolveDirectoryRows(props, [tenant, doc('foreign', { ownerId: 'other', role: 'tenant' }), doc('admin', { ownerId: 'owner', role: 'admin' }), doc('t2', { id: 'spoof', ownerId: 'owner', role: 'tenant', displayName: {}, email: 42, status: [] })], 'owner');
  assert.equal(rows.length, 2); assert.equal(rows[0].propertyName, 'Dubai Marina'); assert.equal(rows[0].status, '');
  assert.equal(rows[1].id, 't2'); assert.equal(rows[1].emailHref, undefined); assert.equal(rows[1].displayName, ''); assert.equal(rows[1].propertyName, '');
  assert.equal(filterDirectoryRows(rows, '  AISHA ').length, 1); assert.equal(filterDirectoryRows(rows, '101').length, 1); assert.equal(filterDirectoryRows(rows, 'missing').length, 0);
});
function harness() {
  let propNext, propFail, propertyStops = 0, tenantStops = 0;
  const listeners = [], states = [];
  const stop = subscribeOwnerDirectory('owner', (next, fail) => { propNext = next; propFail = fail; return () => propertyStops++; }, (next, fail) => { listeners.push({ next, fail }); return () => tenantStops++; }, (rows, loading, failed) => states.push({ rows, loading, failed }));
  return { next: docs => propNext(docs), fail: () => propFail(), listeners, states, stop, stops: () => [propertyStops, tenantStops] };
}
test('superseded tenant snapshots cannot restore stale rows after property refresh or removal', () => {
  const h = harness(); h.next(props); h.listeners[0].next([tenant]); assert.equal(h.states.at(-1).rows.length, 1);
  h.next(props); assert.equal(h.states.at(-1).loading, true); assert.equal(h.states.at(-1).rows.length, 0);
  const count = h.states.length; h.listeners[0].next([tenant]); h.listeners[0].fail(); assert.equal(h.states.length, count);
  h.next([]); assert.equal(h.states.at(-1).loading, false); h.listeners[1].next([tenant]); assert.equal(h.states.at(-1).rows.length, 0); h.stop();
});
test('property and tenant errors clear sensitive rows and teardown ignores late callbacks', () => {
  for (const propertyError of [true, false]) {
    const h = harness(); h.next(props); h.listeners[0].next([tenant]);
    if (propertyError) h.fail(); else h.listeners[0].fail();
    assert.equal(h.states.at(-1).failed, true); assert.equal(h.states.at(-1).rows.length, 0);
    const count = h.states.length; h.listeners[0].next([tenant]); assert.equal(h.states.length, count);
    h.stop(); h.next(props); h.fail(); assert.equal(h.states.length, count); assert.ok(h.stops().every(value => value >= 1));
  }
});

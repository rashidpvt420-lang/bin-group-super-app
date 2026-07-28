import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const helperSource = readFileSync('apps/admin-panel/src/lib/ticketReferencedPropertyQuery.ts', 'utf8');
const mapSource = readFileSync('apps/admin-panel/src/pages/map/LiveMapPage.tsx', 'utf8');
const transpiled = ts.transpileModule(helperSource, {
  compilerOptions: {
    module: ts.ModuleKind.ES2022,
    target: ts.ScriptTarget.ES2021,
  },
}).outputText;
const helper = await import(`data:text/javascript;base64,${Buffer.from(transpiled).toString('base64')}`);

test('ticket property IDs are unique, trimmed and deterministic', () => {
  assert.deepEqual(helper.ticketReferencedPropertyIds([
    { propertyId: ' property-z ' },
    { propertyId: 'property-a' },
    { propertyId: '' },
    { propertyId: 'property-z' },
    {},
  ]), ['property-a', 'property-z']);
});

test('Firestore document ID batches never exceed the in-query limit', () => {
  const ids = Array.from({ length: 65 }, (_, index) => `property-${String(index).padStart(2, '0')}`);
  const chunks = helper.propertyIdQueryChunks(ids);
  assert.deepEqual(chunks.map((chunk) => chunk.length), [30, 30, 5]);
  assert.equal(chunks.flat().length, 65);
  assert.throws(() => helper.propertyIdQueryChunks(ids, 31), /between 1 and 30/);
});

test('missing canonical property references are reported exactly', () => {
  assert.deepEqual(
    helper.missingReferencedPropertyIds(
      ['property-c', 'property-a', 'property-b', 'property-a'],
      ['property-b'],
    ),
    ['property-a', 'property-c'],
  );
});

test('Admin map queries only ticket-referenced canonical property IDs', () => {
  assert.match(mapSource, /documentId/);
  assert.match(mapSource, /ticketReferencedPropertyIds\(tickets\)/);
  assert.match(mapSource, /propertyIdQueryChunks\(referencedPropertyIds\)/);
  assert.match(mapSource, /where\(documentId\(\), 'in', propertyIds\)/);
  assert.match(mapSource, /snapshots\.size !== chunks\.length/);
  assert.match(mapSource, /missingReferencedPropertyIds/);
  assert.match(mapSource, /Those tickets remain visible but receive no verified marker/);
  assert.match(mapSource, /All ticket\/property markers are hidden until the exact records can be loaded/);
  assert.doesNotMatch(mapSource, /collection\(db, 'properties'\), limit\(500\)/);
  assert.doesNotMatch(mapSource, /outside the returned set/);
});

test('Admin map keeps first-load-only viewport authority and complete unresolved status queries', () => {
  assert.match(mapSource, /TICKET_STATUS_QUERY_CHUNKS = unresolvedMaintenanceTicketStatusQueryChunks\(\)/);
  assert.match(mapSource, /isUnresolvedMaintenanceTicketStatus\(ticket\.status\)/);
  assert.match(mapSource, /viewportInitializedRef/);
  assert.match(mapSource, /if \(!viewportInitializedRef\.current && pointCount > 0\)/);
  assert.match(mapSource, /mapRef\.current\.fitBounds\(bounds, 72\)/);
});

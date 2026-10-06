// Regression: the Owner portal showed the raw property document ID
// (e.g. "d8bcdb8b-…_property_1") instead of a property name/address in the
// ticket list, ticket detail and notifications. Canonical onboarding writes
// property records without name/propertyName, and ownerCreateMaintenanceTicket
// fell back to the document ID when snapshotting propertyName.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';

const read = (rel) => readFileSync(new URL(`../../${rel}`, import.meta.url), 'utf8');
const ts = createRequire(import.meta.url)('typescript');

function loadShared(relative) {
  const compiled = ts.transpileModule(read(relative), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    fileName: relative,
  }).outputText;
  const sandbox = { exports: {}, require: (id) => { throw new Error(`unexpected import ${id}`); } };
  runInNewContext(compiled, sandbox, { filename: relative });
  return sandbox.exports;
}

const {
  isRawPropertyIdentifier,
  resolvePropertyDisplayName,
  resolveTicketPropertyDisplayName,
  ticketNeedsPropertyLabelLookup,
  replaceRawPropertyIds,
} = loadShared('functions/shared/propertyDisplayName.ts');

const PROPERTY_ID = 'd8bcdb8b-41f9-4172-abdc-377d43500c1e_property_1';
// Shape of the canonical-onboarding property record behind ticket 4EtEcbEMu1lUynUKtpMd:
// no name/propertyName, only address/locality/type fields.
const canonicalProperty = {
  id: PROPERTY_ID,
  propertyType: 'Villa',
  area: 'Alain ',
  city: 'Abu Dhabi',
  emirate: 'Abu Dhabi',
  address: 'Abu Dhabi, UAE',
  geo: { address: 'Abu Dhabi, UAE' },
  status: 'ACTIVE',
};
const legacyTicket = {
  propertyId: PROPERTY_ID,
  propertyName: PROPERTY_ID,
  jobLocation: { address: 'Abu Dhabi, UAE' },
};

test('raw property document IDs are recognised and never treated as labels', () => {
  assert.equal(isRawPropertyIdentifier(PROPERTY_ID), true);
  assert.equal(isRawPropertyIdentifier('owner_abc123_property_2'), true);
  assert.equal(isRawPropertyIdentifier('d8bcdb8b-41f9-4172-abdc-377d43500c1e'), true);
  assert.equal(isRawPropertyIdentifier('4EtEcbEMu1lUynUKtpMd'), true);
  assert.equal(isRawPropertyIdentifier('custom-id', ['custom-id']), true);
  assert.equal(isRawPropertyIdentifier('Marina Heights Tower'), false);
  assert.equal(isRawPropertyIdentifier('Villa 12'), false);
  assert.equal(isRawPropertyIdentifier('Abu Dhabi, UAE'), false);
  assert.equal(isRawPropertyIdentifier(''), false);
});

test('canonical property records without a name resolve to a readable address label', () => {
  const label = resolvePropertyDisplayName(canonicalProperty, { propertyId: PROPERTY_ID });
  assert.equal(label, 'Villa · Alain, Abu Dhabi, UAE');
  assert.doesNotMatch(label, /_property_/);
  assert.equal(
    resolvePropertyDisplayName({ propertyName: 'Al Reem Villa', address: 'Abu Dhabi, UAE' }),
    'Al Reem Villa',
  );
  // A name field that itself holds the raw ID is skipped.
  assert.equal(
    resolvePropertyDisplayName({ id: PROPERTY_ID, propertyName: PROPERTY_ID, name: PROPERTY_ID, address: 'Khalifa City, Abu Dhabi' }),
    'Khalifa City, Abu Dhabi',
  );
  assert.equal(resolvePropertyDisplayName({ id: PROPERTY_ID }), 'Property');
  assert.equal(resolvePropertyDisplayName(null, { fallback: 'the property' }), 'the property');
});

test('tickets that stored the raw ID resolve the label from the property record, then the job address', () => {
  assert.equal(resolveTicketPropertyDisplayName(legacyTicket, canonicalProperty), 'Villa · Alain, Abu Dhabi, UAE');
  assert.equal(resolveTicketPropertyDisplayName(legacyTicket, null), 'Abu Dhabi, UAE');
  assert.equal(resolveTicketPropertyDisplayName({ propertyId: PROPERTY_ID, propertyName: PROPERTY_ID }, null), 'Property');
  assert.equal(resolveTicketPropertyDisplayName({ propertyId: 'p1', propertyName: 'Marina Heights' }, null), 'Marina Heights');
  assert.equal(ticketNeedsPropertyLabelLookup(legacyTicket), true);
  assert.equal(ticketNeedsPropertyLabelLookup({ propertyId: 'p1', propertyName: 'Marina Heights' }), false);
});

test('stored notification text never shows a raw property ID', () => {
  const body = `rashid is heading to ${PROPERTY_ID} now. Track live in your app.`;
  assert.equal(
    replaceRawPropertyIds(body, { [PROPERTY_ID]: 'Villa · Alain, Abu Dhabi, UAE' }),
    'rashid is heading to Villa · Alain, Abu Dhabi, UAE now. Track live in your app.',
  );
  assert.equal(replaceRawPropertyIds(body, {}), 'rashid is heading to your property now. Track live in your app.');
  assert.equal(replaceRawPropertyIds('Ticket #4ETECBEM status changed.', {}), 'Ticket #4ETECBEM status changed.');
});

test('owner ticket creation never snapshots the property document ID as propertyName', () => {
  const source = read('functions/ownerMaintenanceOperations.ts');
  assert.doesNotMatch(source, /propertyName:\s*text\([^)]*\|\|\s*propertyId/);
  assert.match(source, /from "\.\/shared\/propertyDisplayName"/);
  assert.equal((source.match(/propertyName: text\(resolvePropertyDisplayName\(property, \{ propertyId \}\), 240\)/g) || []).length, 2);
});

test('owner status notifications resolve the property label instead of echoing ticket.propertyName', () => {
  const source = read('functions/index.ts');
  assert.match(source, /from "\.\/shared\/propertyDisplayName"/);
  assert.match(source, /async function ticketPropertyLabel\(/);
  assert.match(source, /const prop: string = await ticketPropertyLabel\(after, "the property"\);/);
  assert.doesNotMatch(source, /const prop: string = after\.propertyName/);
  assert.doesNotMatch(source, /completedPropertyName = safeString\(ticketData\.propertyName/);
});

test('owner ticket list, detail, approvals and bell use the resolved property label', () => {
  const list = read('src/owner/pages/OwnerTicketsPage.tsx');
  const detail = read('src/owner/pages/OwnerTicketDetailPage.tsx');
  const approvals = read('src/owner/pages/OwnerApprovalCenterPage.tsx');
  const app = read('src/owner/OwnerApp.tsx');
  const bell = read('src/components/NotificationBell.tsx');
  const hook = read('src/owner/hooks/useOwnerPropertyLabels.ts');

  for (const page of [list, detail, approvals]) {
    assert.match(page, /useOwnerPropertyLabels/);
    assert.match(page, /ticketPropertyLabel\(ticket/);
    assert.doesNotMatch(page, /\{ticket\.propertyName( \|\|[^}]*)?\}/);
  }
  assert.doesNotMatch(approvals, /ticket\.propertyId \|\| 'Property'/);
  assert.match(hook, /where\('ownerId', '==', ownerUid\)/);
  assert.match(hook, /functions\/shared\/propertyDisplayName/);
  assert.match(app, /<NotificationBell formatText=\{formatPropertyText\} \/>/);
  assert.match(app, /<OwnerNotificationBell \/>/);
  assert.match(bell, /formatText \? formatText\(String\(notif\.title/);
  assert.match(bell, /formatText \? formatText\(String\(notif\.body/);
});

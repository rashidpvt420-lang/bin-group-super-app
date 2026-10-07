// Regression (tenant P0): unlinking a tenant from a unit (admin reassignment,
// archive, delete) only cleared tenantId/currentTenantId. acceptTenantInvitation
// also binds the unit through tenantUid/tenantEmail/tenantName, and every tenant
// authority check accepts those fields (firestore.rules units get + isUnitTenant,
// createTenantServiceTicket tenantOwnsUnit, submitTenantMoveInspection). The
// former tenant therefore kept reading the unit, its key register, and could
// raise tickets / handover inspections against it; the server unit linker then
// refused to link the vacated unit to anyone else ("already linked").
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const HELPER = 'apps/admin-panel/src/pages/tenants/unitTenantBinding.ts';
const PAGE = 'apps/admin-panel/src/pages/tenants/TenantsManagementPage.tsx';

function loadTypeScriptModule(path) {
  const compiled = ts.transpileModule(readFileSync(path, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    fileName: path,
  }).outputText;
  const module = { exports: {} };
  vm.runInContext(compiled, vm.createContext({ module, exports: module.exports, String, Object }), { filename: path });
  return module.exports;
}

const page = readFileSync(PAGE, 'utf8');
const functionsIndex = readFileSync('functions/index.ts', 'utf8');
const ticketOps = readFileSync('functions/tenantTicketOperations.ts', 'utf8');

function slice(startMarker, endMarker) {
  const start = page.indexOf(startMarker);
  const end = page.indexOf(endMarker, start + startMarker.length);
  assert.notEqual(start, -1, startMarker);
  assert.notEqual(end, -1, endMarker);
  return page.slice(start, end);
}

/** Simulates Firestore update() merge of a patch into a unit doc. */
const apply = (unit, patch) => ({ ...unit, ...patch });

// Unit exactly as acceptTenantInvitation leaves it (functions/index.ts unit update).
const acceptedUnit = {
  propertyId: 'prop-1', unitNumber: '101', tenantId: 'tenant-a', currentTenantId: 'stub-a',
  tenantUid: 'tenant-a', tenantName: 'Tenant A', tenantEmail: 'a@example.com', occupancyStatus: 'occupied',
};

// Mirrors the authority checks that accept any binding field.
const tenantStillBound = (unit, uid, email) =>
  [unit.tenantId, unit.tenantUid, unit.currentTenantId, unit.userId].includes(uid) ||
  (Boolean(unit.tenantEmail) && String(unit.tenantEmail).toLowerCase() === email);

test('acceptance binds units through tenantUid and tenantEmail (the fields unlink must clear)', () => {
  assert.match(functionsIndex, /tenantUid: authUid,/);
  assert.match(functionsIndex, /tenantEmail: currentInvite\.tenantEmail,/);
  assert.match(ticketOps, /\[unit\.tenantId, unit\.tenantUid, unit\.currentTenantId\]/);
  assert.match(ticketOps, /unit\.tenantEmail/);
});

test('vacating a unit removes every tenant binding field', () => {
  const { vacatedUnitTenantBinding, UNIT_TENANT_BINDING_FIELDS } = loadTypeScriptModule(HELPER);
  const patch = vacatedUnitTenantBinding();
  for (const field of ['tenantId', 'tenantUid', 'currentTenantId', 'tenantEmail', 'tenantName']) {
    assert.ok(UNIT_TENANT_BINDING_FIELDS.includes(field), field);
    assert.equal(patch[field], null, `${field} cleared`);
  }
  assert.equal(patch.occupancyStatus, 'VACANT');
  const vacated = apply(acceptedUnit, patch);
  assert.equal(tenantStillBound(vacated, 'tenant-a', 'a@example.com'), false);
});

test('assigning a unit to a new tenant drops the previous occupant uid/email', () => {
  const { occupiedUnitTenantBinding } = loadTypeScriptModule(HELPER);
  const reassigned = apply(acceptedUnit, occupiedUnitTenantBinding({ tenantId: 'stub-b', tenantName: 'Tenant B' }));
  assert.equal(tenantStillBound(reassigned, 'tenant-a', 'a@example.com'), false);
  assert.equal(reassigned.tenantId, 'stub-b');
  assert.equal(reassigned.currentTenantId, 'stub-b');
  assert.equal(reassigned.tenantName, 'Tenant B');
  assert.equal(reassigned.occupancyStatus, 'OCCUPIED');
});

test('every admin unlink path uses the full vacate patch', () => {
  const update = slice('const handleUpdateTenant = async () => {', 'const handleArchiveTenant');
  const archive = slice('const handleArchiveTenant = async', 'const handleDeleteTenant');
  const del = page.slice(page.indexOf('const handleDeleteTenant'));
  for (const [name, body] of [['reassign', update], ['archive', archive], ['delete', del]]) {
    assert.match(body, /\.\.\.vacatedUnitTenantBinding\(\)/, `${name} vacates with the full patch`);
  }
  assert.doesNotMatch(page, /tenantId: null,\s*currentTenantId: null,\s*occupancyStatus/,
    'no partial unlink (tenantId/currentTenantId only) remains');
});

test('every admin link path drops stale bindings from the previous occupant', () => {
  const add = slice('const handleAddTenant = async () => {', 'const handleOpenEdit');
  const update = slice('const handleUpdateTenant = async () => {', 'const handleArchiveTenant');
  assert.match(add, /\.\.\.occupiedUnitTenantBinding\(\{ tenantId, tenantName \}\)/);
  assert.match(update, /\.\.\.occupiedUnitTenantBinding\(\{\s*tenantId: selectedTenant\.uid,/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(
  new URL('../../apps/admin-panel/src/pages/tenants/TenantsManagementPage.tsx', import.meta.url),
  'utf8',
);
const backend = await readFile(
  new URL('../../functions/adminOperationalMutations.ts', import.meta.url),
  'utf8',
);

const addTenantStart = source.indexOf('const handleAddTenant = async () => {');
const addTenantEnd = source.indexOf('const handleOpenEdit = (tenant: any) => {', addTenantStart);
const addTenant = source.slice(addTenantStart, addTenantEnd);

test('tenant relational assignment creates a secure invitation before portal access', () => {
  assert.notEqual(addTenantStart, -1);
  assert.notEqual(addTenantEnd, -1);
  assert.match(addTenant, /runAdminOperationalMutation\('MANAGE_TENANT'/);
  assert.match(backend, /db\.collection\("tenant_invitations"\)\.doc\(\)/);
  assert.match(backend, /status: "pending"/);
  assert.match(backend, /tenantInvitationId: inviteRef\.id/);
  assert.match(backend, /batch\.create\(inviteRef, \{/);
  assert.match(backend, /tenantEmail/);
  assert.match(backend, /tenantName/);
  assert.match(backend, /propertyId/);
  assert.match(backend, /unitId/);
  assert.match(backend, /14 \* 24 \* 60 \* 60 \* 1000/);
});

test('tenant relational assignment sends only its exact invitation and preserves role safety', () => {
  assert.match(addTenant, /existingRole && existingRole !== 'tenant'/);
  assert.match(addTenant, /selectedEmail !== searchedEmail/);
  assert.match(addTenant, /httpsCallable\(functions, 'resendTenantInvitation'\)/);
  assert.match(addTenant, /await resendFn\(\{ invitationId \}\)/);
  assert.doesNotMatch(addTenant, /sendTenantInvitations/);
});

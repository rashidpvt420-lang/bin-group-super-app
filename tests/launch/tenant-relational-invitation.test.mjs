import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(
  new URL('../../apps/admin-panel/src/pages/tenants/TenantsManagementPage.tsx', import.meta.url),
  'utf8',
);

const addTenantStart = source.indexOf('const handleAddTenant = async () => {');
const addTenantEnd = source.indexOf('const handleOpenEdit = (tenant: any) => {', addTenantStart);
const addTenant = source.slice(addTenantStart, addTenantEnd);

test('tenant relational assignment creates a secure invitation before portal access', () => {
  assert.notEqual(addTenantStart, -1);
  assert.notEqual(addTenantEnd, -1);
  assert.match(addTenant, /doc\(collection\(db, 'tenant_invitations'\)\)/);
  assert.match(addTenant, /status: 'pending_invitation'/);
  assert.match(addTenant, /tenantInvitationId: inviteRef\.id/);
  assert.match(addTenant, /batch\.set\(inviteRef, \{/);
  assert.match(addTenant, /tenantEmail,/);
  assert.match(addTenant, /tenantName,/);
  assert.match(addTenant, /propertyId: selectedPropertyId/);
  assert.match(addTenant, /unitId: selectedUnitId/);
  assert.match(addTenant, /expiresAt: new Date\(Date\.now\(\) \+ 14 \* 24 \* 60 \* 60 \* 1000\)/);
});

test('tenant relational assignment sends only its exact invitation and preserves role safety', () => {
  assert.match(addTenant, /existingRole && existingRole !== 'tenant'/);
  assert.match(addTenant, /selectedEmail !== searchedEmail/);
  assert.match(addTenant, /httpsCallable\(functions, 'resendTenantInvitation'\)/);
  assert.match(addTenant, /await resendFn\(\{ invitationId: inviteRef\.id \}\)/);
  assert.doesNotMatch(addTenant, /sendTenantInvitations/);
});

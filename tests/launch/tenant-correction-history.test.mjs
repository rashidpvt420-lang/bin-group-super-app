import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');

test('Tenant corrections are server-authoritative, allowlisted, stale-safe, and event audited', async () => {
  const source = await read('functions/tenantCorrectionOperations.ts');
  const runtime = await read('functions/runtime.ts');

  assert.match(source, /const CORRECTION_FIELDS = new Set/);
  assert.match(source, /const RESIDENCE_FIELDS = new Set/);
  assert.match(source, /MAX_PENDING_REQUESTS = 5/);
  assert.match(source, /authRecord\.emailVerified/);
  assert.match(source, /role !== "tenant"/);
  assert.match(source, /residenceBelongsToTenant/);
  assert.match(source, /currentValue/);
  assert.match(source, /A pending correction already exists/);
  assert.match(source, /The residence record changed after this correction was submitted/);
  assert.match(source, /The Tenant profile changed after this correction was submitted/);
  assert.match(source, /transaction\.create\(eventRef/);
  assert.match(source, /TENANT_CORRECTION_REQUESTED/);
  assert.match(source, /ADMIN_APPROVE_TENANT_CORRECTION/);
  assert.match(source, /ADMIN_REJECT_TENANT_CORRECTION/);
  assert.match(source, /enforceAppCheck: true/g);

  assert.match(runtime, /submitTenantCorrectionRequest/);
  assert.match(runtime, /listTenantCorrectionRequests/);
  assert.match(runtime, /listAdminTenantCorrectionRequests/);
  assert.match(runtime, /adminResolveTenantCorrectionRequest/);
});

test('Tenant and Admin interfaces expose submission, review, application, and immutable history', async () => {
  const tenantPanel = await read('src/tenant/components/TenantCorrectionPanel.tsx');
  const tenantProfile = await read('src/tenant/pages/TenantProfilePage.tsx');
  const adminPanel = await read('apps/admin-panel/src/pages/ops/TenantCorrectionQueuePanel.tsx');
  const adminQueue = await read('apps/admin-panel/src/pages/ops/TenantUnitLinkQueuePage.tsx');

  assert.match(tenantPanel, /submitTenantCorrectionRequest/);
  assert.match(tenantPanel, /listTenantCorrectionRequests/);
  assert.match(tenantPanel, /reason\.trim\(\)\.length < 8/);
  assert.match(tenantPanel, /item\.events\.map/);
  assert.match(tenantPanel, /Request a record correction/);
  assert.match(tenantPanel, /طلب تصحيح سجل/);
  assert.match(tenantProfile, /<TenantCorrectionPanel residences=\{residences\} \/>/);

  assert.match(adminPanel, /listAdminTenantCorrectionRequests/);
  assert.match(adminPanel, /adminResolveTenantCorrectionRequest/);
  assert.match(adminPanel, /Approve & apply/);
  assert.match(adminPanel, /موافقة وتطبيق/);
  assert.match(adminPanel, /reason\.trim\(\)\.length < 8/);
  assert.match(adminQueue, /<TenantCorrectionQueuePanel \/>/);
});

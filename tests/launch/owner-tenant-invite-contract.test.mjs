import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
test('owner invite is wired on the Units page and uses the hashed-token invitation model', async () => {
  assert.match(await readFile('src/owner/pages/OwnerUnitRegistryPage.tsx', 'utf8'), /OwnerTenantInviteDialog/);
  const fn = await readFile('functions/ownerTenantInvites.ts', 'utf8');
  assert.match(fn, /inviteTokenHash: crypto\.createHash\("sha256"\)/);
  assert.match(fn, /enforceAppCheck: true/);
  assert.match(await readFile('functions/runtimeAll.ts', 'utf8'), /ownerInviteTenantToUnit, ownerListTenantInvitations/);
});

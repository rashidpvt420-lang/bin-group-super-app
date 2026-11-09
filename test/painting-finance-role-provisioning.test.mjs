// Nov 9 audit P1-8: Finance Manager / Finance Controller can be provisioned, get no
// admin modules, and painting approval still demands MFA and the live role.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const backend = readFileSync('functions/adminUserProvisioning.ts', 'utf8');
const ui = readFileSync('apps/admin-panel/src/pages/admin/StaffAccessPage.tsx', 'utf8');
const policy = readFileSync('apps/admin-panel/src/security/staffAccessPolicy.ts', 'utf8');
const approver = readFileSync('functions/paintingFinanceApprover.ts', 'utf8');

test('painting finance roles are provisionable with no admin modules', () => {
  for (const role of ['finance_manager', 'finance_controller']) {
    assert.match(backend, new RegExp(`"${role}",`));
    assert.match(backend, new RegExp(`${role}: \\[\\],`));
    assert.match(ui, new RegExp(`value: '${role}'`));
    assert.match(policy, new RegExp(`value: '${role}'`));
  }
});

test('painting approval keeps MFA and live-role checks', () => {
  assert.match(approver, /sign_in_second_factor/);
  assert.match(approver, /liveRole/);
});

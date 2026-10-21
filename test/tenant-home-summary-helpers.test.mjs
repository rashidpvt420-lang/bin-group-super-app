import test from 'node:test';
import assert from 'node:assert/strict';
import { pickLease, pickActiveTicket } from '../src/tenant/tenantHomeSelectors.ts';
test('pickLease takes the latest end date; pickActiveTicket ignores closed tickets', () => {
  assert.equal(pickLease([{ leaseEndDate: '2026-01-01' }, { endDate: '2027-01-01' }, {}]).endDate, '2027-01-01');
  assert.equal(pickActiveTicket([{ id: 'a', status: 'COMPLETED', updatedAt: '2026-10-02' }, { id: 'b', status: 'ASSIGNED', updatedAt: '2026-10-01' }]).id, 'b');
  assert.equal(pickActiveTicket([{ status: 'CLOSED' }]), null);
});

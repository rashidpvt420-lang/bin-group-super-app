import test from 'node:test';
import assert from 'node:assert/strict';
import { pickLease, pickActiveTicket, lastPaidInstallment } from '../src/tenant/tenantHomeSelectors.ts';
test('pickLease takes the latest end date; pickActiveTicket ignores closed tickets', () => {
  assert.equal(pickLease([{ leaseEndDate: '2026-01-01' }, { endDate: '2027-01-01' }, {}]).endDate, '2027-01-01');
  assert.equal(pickActiveTicket([{ id: 'a', status: 'COMPLETED', updatedAt: '2026-10-02' }, { id: 'b', status: 'ASSIGNED', updatedAt: '2026-10-01' }]).id, 'b');
  assert.equal(pickActiveTicket([{ status: 'CLOSED' }]), null);
});
test('lastPaidInstallment returns the most recent paid instalment only', () => {
  assert.equal(lastPaidInstallment([{ id: 'a', status: 'PAID', dueDate: '2026-08-01' }, { id: 'b', status: 'PAID', dueDate: '2026-09-01' }, { id: 'c', status: 'DUE', dueDate: '2026-10-01' }]).id, 'b');
  assert.equal(lastPaidInstallment([{ status: 'DUE', dueDate: '2026-10-01' }]), null);
});

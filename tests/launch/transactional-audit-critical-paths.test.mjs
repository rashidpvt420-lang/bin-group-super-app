import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../../functions/index.ts', import.meta.url), 'utf8');

function exportedBlock(name) {
  const start = source.indexOf(`export const ${name} = onCall`);
  assert.ok(start >= 0, `missing callable ${name}`);
  const next = source.indexOf('\nexport const ', start + 1);
  return source.slice(start, next > start ? next : undefined);
}

test('technician ticket acceptance writes business mutation and audit in one transaction', () => {
  const block = exportedBlock('acceptTechnicianTicket');
  assert.match(block, /await db\.runTransaction/);
  assert.match(block, /transaction\.update\(ticketRef/);
  assert.match(block, /transaction\.set\(db\.collection\("audit_logs"\)\.doc\(\)/);
  assert.doesNotMatch(block, /await logAudit\(/);
});

test('owner ticket completion review writes business mutation and audit in one transaction', () => {
  const block = exportedBlock('ownerReviewTicketCompletion');
  assert.match(block, /await db\.runTransaction/);
  assert.match(block, /transaction\.update\(ticketRef, baseUpdate\)/);
  assert.match(block, /transaction\.set\(db\.collection\("audit_logs"\)\.doc\(\)/);
  assert.doesNotMatch(block, /await logAudit\(/);
});

test('external notification delivery remains after transactional mutation', () => {
  const block = exportedBlock('ownerReviewTicketCompletion');
  const transactionAudit = block.indexOf('transaction.set(db.collection("audit_logs").doc()');
  const notification = block.indexOf('dispatchOmniNotification');
  assert.ok(transactionAudit > 0);
  assert.ok(notification > transactionAudit, 'provider notification dispatch should remain outside the Firestore transaction');
});

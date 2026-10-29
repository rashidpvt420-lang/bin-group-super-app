import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');

test('rent reminder query has its composite index (status IN + dueDate range)', () => {
  const source = read('functions/rentSchedule.ts');
  assert.match(source, /collection\("rent_installments"\)\.where\("status", "in", \[[^\]]+\]\)\.where\("dueDate", "<="/);
  const { indexes } = JSON.parse(read('firestore.indexes.json'));
  assert.ok(indexes.some((index) => index.collectionGroup === 'rent_installments' && index.queryScope === 'COLLECTION'
    && JSON.stringify(index.fields.map((f) => f.fieldPath)) === JSON.stringify(['status', 'dueDate'])));
});

test('owner and tenant ticket callables enforce the paid-contract service entitlement before writing', () => {
  for (const file of ['functions/ownerMaintenanceOperations.ts', 'functions/tenantTicketOperations.ts']) {
    const source = read(file);
    const gate = source.indexOf('await assertPropertyServiceEntitlement(');
    assert.ok(gate > 0, `${file} must call assertPropertyServiceEntitlement`);
    const write = Math.max(source.indexOf('transaction.set(ticketRef'), source.indexOf('ticketRef.set('), source.indexOf('batch.set(ticketRef'));
    if (write > 0) assert.ok(gate < write, `${file} must gate before creating the ticket`);
  }
  const helper = read('functions/propertyServiceEntitlement.ts');
  assert.match(helper, /contract\.paymentVerified !== true/);
  assert.match(helper, /SERVICE_CONTRACT_INACTIVE/);
});

test('failed Design Studio renders are recorded in an admin-only ledger and refund quota', () => {
  const source = read('functions/aiDesignStudio.ts');
  assert.match(source, /settleAiUsageQuota\(quota, false\)[\s\S]*collection\("design_request_failures"\)/);
  assert.doesNotMatch(read('firestore.rules'), /design_request_failures/, 'no client rule may expose the failure ledger');
});

test('missing design media answers found:false instead of a logged 404', () => {
  const source = read('functions/aiDesignStudio.ts');
  const start = source.indexOf('export const getAIDesignRequestMedia');
  const body = source.slice(start);
  assert.doesNotMatch(body, /HttpsError\("not-found"/);
  assert.match(body, /found: false/);
  assert.match(body, /enforceAppCheck: true/);
  assert.match(body, /canReadRequest\(request\.auth, data\)/);
});

test('owner AI tickets are gated and public WhatsApp intake is never auto-dispatched', () => {
  const index = read('functions/index.ts');
  const ai = index.slice(index.indexOf('export const createAiMaintenanceTicket'));
  assert.ok(ai.indexOf('assertPropertyServiceEntitlement(') > 0);
  assert.ok(ai.indexOf('assertPropertyServiceEntitlement(') < ai.indexOf('ticketRef.set('));
  assert.match(index, /source === "WHATSAPP"\) \{[\s\S]{0,400}reasonCode: "SERVICE_CONTRACT_UNVERIFIED"/);
});

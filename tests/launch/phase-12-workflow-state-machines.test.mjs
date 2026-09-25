import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');

const extractMachineNames = (source) => {
  const block = source.match(/export const CANONICAL_STATE_MACHINES = Object\.freeze\(\{([\s\S]*?)\}\);/)?.[1] || '';
  return [...block.matchAll(/^\s*([A-Za-z][A-Za-z0-9]*):/gm)].map((match) => match[1]);
};

test('Phase 12 exposes one mirrored canonical contract for every required workflow', async () => {
  const [server, client] = await Promise.all([
    read('functions/canonicalStateMachines.ts'),
    read('src/lib/canonicalStateMachines.ts'),
  ]);

  assert.equal(client, server, 'server and frontend lifecycle contracts must be byte-identical');
  assert.deepEqual(
    extractMachineNames(server),
    ['property', 'ticket', 'inspection', 'payment', 'quote', 'contract', 'tenantLink', 'brokerKyc', 'technicianJob', 'onboarding'],
  );

  for (const symbol of [
    'PROPERTY_STATE_MACHINE',
    'TICKET_STATE_MACHINE',
    'INSPECTION_STATE_MACHINE',
    'PAYMENT_STATE_MACHINE',
    'QUOTE_STATE_MACHINE',
    'CONTRACT_STATE_MACHINE',
    'TENANT_LINK_STATE_MACHINE',
    'BROKER_KYC_STATE_MACHINE',
    'TECHNICIAN_JOB_STATE_MACHINE',
    'ONBOARDING_STATE_MACHINE',
  ]) {
    assert.ok(server.includes(`export const ${symbol} = machine(`));
  }
});

test('Phase 12 property lifecycle preserves review, inspection, financial prerequisites and activation order', async () => {
  const source = await read('functions/canonicalStateMachines.ts');
  assert.match(source, /DRAFT:[\s\S]*?'UNDER_REVIEW'/);
  assert.match(source, /UNDER_REVIEW:[\s\S]*?'CHANGES_REQUESTED'[\s\S]*?'PENDING_PROPERTY_INSPECTION'/);
  assert.match(source, /CHANGES_REQUESTED:\s*\['UNDER_REVIEW'\]/);
  assert.match(source, /INSPECTION_COMPLETED:\s*\['QUOTE_READY'\]/);
  assert.match(source, /QUOTE_READY:\s*\['CONTRACT_PENDING'\]/);
  assert.match(source, /CONTRACT_PENDING:\s*\['PAYMENT_PENDING'\]/);
  assert.match(source, /PAYMENT_PENDING:\s*\['ACTIVATION_PENDING'\]/);
  assert.match(source, /ACTIVATION_PENDING:\s*\['ACTIVE'\]/);
  assert.match(source, /SUBMITTED_FOR_PROPERTY_INSPECTION:\s*'PENDING_PROPERTY_INSPECTION'/);
  assert.match(source, /AWAITING_ACTIVATION_PAYMENT:\s*'PAYMENT_PENDING'/);
});

test('Phase 12 ticket aliases are read compatibility and authoritative writes use canonical states', async () => {
  const [contract, lifecycle, functions, ownerPage, tenantPage] = await Promise.all([
    read('functions/canonicalStateMachines.ts'),
    read('functions/shared/maintenanceTicketLifecycle.js'),
    read('functions/index.ts'),
    read('src/owner/pages/OwnerTicketsPage.tsx'),
    read('src/tenant/pages/TenantTicketsPage.tsx'),
  ]);

  assert.match(contract, /AUTO_ASSIGNED:\s*'ASSIGNED'/);
  assert.match(contract, /ON_THE_WAY:\s*'EN_ROUTE'/);
  assert.match(contract, /WORK_STARTED:\s*'IN_PROGRESS'/);
  assert.doesNotMatch(lifecycle.match(/UNRESOLVED_MAINTENANCE_TICKET_STATUSES[\s\S]*?\]\);/)?.[0] || '', /AUTO_ASSIGNED|ON_THE_WAY|WORK_STARTED|UNASSIGNED|PENDING_ASSIGNMENT/);
  assert.match(lifecycle, /AUTO_ASSIGNED:\s*"ASSIGNED"/);
  assert.match(lifecycle, /ON_THE_WAY:\s*"EN_ROUTE"/);
  assert.match(lifecycle, /WORK_STARTED:\s*"IN_PROGRESS"/);

  assert.doesNotMatch(functions, /status:\s*["']AUTO_ASSIGNED["']/);
  assert.doesNotMatch(functions, /status:\s*["']on_hold["']/);
  assert.match(functions, /status:\s*"ASSIGNED"[\s\S]*?dispatchStatus:\s*"AUTO_ASSIGNED"/);
  assert.match(functions, /status:\s*"ON_HOLD"/);
  assert.doesNotMatch(ownerPage, /const ACTIVE_STATUSES = \[[^\]]*on_the_way/);
  assert.doesNotMatch(tenantPage, /const ACTIVE_STATUSES = \[[^\]]*on_the_way/);
  assert.match(ownerPage, /normalizeCanonicalState\('ticket', ticket\.status\)/);
  assert.match(tenantPage, /normalizeCanonicalState\('ticket', ticket\.status\)/);
});

test('Phase 12 Broker KYC and inspection new writes are canonical while legacy reads stay normalized', async () => {
  const [brokerPage, brokerReview, tenantInspection, rules] = await Promise.all([
    read('src/broker/pages/BrokerDocumentsPage.tsx'),
    read('functions/secureBrokerKycReview.ts'),
    read('functions/tenantHandoverInspections.ts'),
    read('firestore.rules'),
  ]);

  assert.match(brokerPage, /status:\s*'PENDING_REVIEW'/);
  assert.doesNotMatch(brokerPage, /status:\s*'pending_review'/);
  assert.match(brokerReview, /lower\(document\.data\(\)\?\.status\) !== "pending_review"/);
  assert.match(brokerReview, /status:\s*approved \? "VERIFIED" : "REJECTED"/);
  assert.match(rules, /get\('status', ''\) == 'PENDING_REVIEW'/);
  assert.doesNotMatch(rules, /get\('status', ''\) == 'pending_review'/);
  assert.match(tenantInspection, /status:\s*"SUBMITTED"/);
  assert.doesNotMatch(tenantInspection, /status:\s*"submitted"/);
});

test('Phase 12 inspection-first writes keep prerequisites out of primary financial lifecycle states', async () => {
  const [submission, completion] = await Promise.all([
    read('functions/inspectionFirstOwnerOnboarding.ts'),
    read('functions/ownerInspectionCompletion.ts'),
  ]);

  for (const source of [submission, completion]) {
    assert.doesNotMatch(source, /status:\s*"SIGNED_AWAITING_15_PERCENT_PAYMENT"/);
    assert.doesNotMatch(source, /contractStatus:\s*"signed_awaiting_payment"/);
    assert.doesNotMatch(source, /status:\s*"AWAITING_15_PERCENT_PAYMENT"/);
  }
  assert.doesNotMatch(submission, /status:\s*"AWAITING_SITE_INSPECTION"/);
  assert.match(submission, /status:\s*"NOT_DUE_UNTIL_INSPECTION_COMPLETE"[\s\S]*?paymentStatus:\s*"NOT_DUE_UNTIL_INSPECTION_COMPLETE"/);
  assert.match(submission, /status:\s*"SIGNED"[\s\S]*?paymentStatus:\s*"NOT_DUE_UNTIL_INSPECTION_COMPLETE"/);
  assert.match(completion, /status:\s*"PENDING_OWNER_SIGNATURE"[\s\S]*?paymentStatus:\s*"NOT_DUE_UNTIL_OWNER_FINAL_SIGNATURE"/);
  assert.match(completion, /status:\s*"CONTRACT_PENDING"[\s\S]*?inspectionStatus:\s*"COMPLETED"/);
});

test('Phase 12 payment, quote, contract, tenant-link and technician-job transitions are explicit', async () => {
  const source = await read('functions/canonicalStateMachines.ts');

  assert.match(source, /PENDING_ADMIN_PAYMENT_VERIFICATION:[\s\S]*?'PENDING_ADMIN_APPROVAL'/);
  assert.match(source, /PENDING_ADMIN_APPROVAL:[\s\S]*?'APPROVED'/);
  assert.match(source, /PENDING_OWNER_APPROVAL:[\s\S]*?'APPROVED'[\s\S]*?'REJECTED'/);
  assert.match(source, /PENDING_OWNER_SIGNATURE:[\s\S]*?'SIGNED'/);
  assert.match(source, /SIGNED:[\s\S]*?'PENDING_ACTIVATION'/);
  assert.match(source, /PENDING_ADMIN_REVIEW:[\s\S]*?'APPROVED'[\s\S]*?'REJECTED'/);
  assert.match(source, /INCOMPLETE:[\s\S]*?'PENDING_REVIEW'/);
  assert.match(source, /PENDING_REVIEW:[\s\S]*?'VERIFIED'[\s\S]*?'REJECTED'/);
  assert.match(source, /ASSIGNED:[\s\S]*?'ACCEPTED'/);
  assert.match(source, /ARRIVED:[\s\S]*?'IN_PROGRESS'/);
  assert.match(source, /COMPLETED_PENDING_APPROVAL:[\s\S]*?'COMPLETED'/);
});

test('Phase 12 preserves the existing onboarding canonical machine and removes obsolete Stripe policy copy', async () => {
  const [server, client, umbrella] = await Promise.all([
    read('functions/onboardingStateMachine.ts'),
    read('src/lib/onboardingStateMachine.ts'),
    read('functions/canonicalStateMachines.ts'),
  ]);

  for (const state of ['draft', 'admin_review', 'changes_requested', 'approved', 'active']) {
    const singleQuoted = `'${state}'`;
    const doubleQuoted = `"${state}"`;
    assert.ok(server.includes(singleQuoted) || server.includes(doubleQuoted));
    assert.ok(client.includes(singleQuoted) || client.includes(doubleQuoted));
    assert.ok(umbrella.includes(singleQuoted) || umbrella.includes(doubleQuoted));
  }
  assert.match(server, /changes_requested:\s*\[[^\]]*'admin_review'/);
  assert.match(client, /changes_requested:\s*\[[^\]]*'admin_review'/);
  assert.doesNotMatch(server, /Awaiting Stripe\/admin payment confirmation/);
  assert.doesNotMatch(client, /Awaiting Stripe\/admin payment confirmation/);
  assert.match(server, /Awaiting Admin Cash\/Cheque payment confirmation/);
});

test('Phase 12 reporting canonicalizes payment and ticket states before aggregation', async () => {
  const reports = await read('functions/adminReports.ts');
  assert.match(reports, /normalizeCanonicalState\("payment"/);
  assert.match(reports, /normalizeCanonicalState\("ticket"/);
  assert.match(reports, /status === "APPROVED"/);
  assert.match(reports, /\["COMPLETED", "CLOSED"\]\.includes\(status\)/);
  assert.doesNotMatch(reports, /\["completed", "complete", "resolved", "closed", "done"\]/);
});

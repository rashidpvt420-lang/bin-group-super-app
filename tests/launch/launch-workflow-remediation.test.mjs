import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as crypto from 'node:crypto';
import vm from 'node:vm';
import { build } from 'esbuild';
import React from 'react';

const compile = async (entry, format = 'esm', external = []) => (await build({
  entryPoints: [entry], bundle: true, write: false, platform: 'node', target: 'node22',
  format, external, logLevel: 'silent',
})).outputFiles[0].text;
const loadPure = async (entry) => import(`data:text/javascript;base64,${Buffer.from(await compile(entry)).toString('base64')}`);
const policy = await loadPure('functions/designPaymentPolicy.ts');
const guidance = await loadPure('src/utils/propertyTruthIntelligence.ts');
const sms = await loadPure('functions/smsDelivery.ts');
const handlerCode = await compile('functions/designPayments.ts', 'cjs', ['firebase-admin', 'firebase-functions/v2/https']);
const clone = (value) => structuredClone(value);
const hash = 'a'.repeat(64);
const quote = { finalTotal: 101, mobilizationAmount: 15.15, quoteHash: hash, currency: 'AED' };

test('design detail state is isolated across request, account, and role changes', async () => {
  const pageCode = (await build({ entryPoints: ['src/pages/DesignRequestDetailPage.tsx'],
    bundle: false, write: false, platform: 'node', target: 'node22', format: 'cjs',
    jsx: 'transform', logLevel: 'silent' })).outputFiles[0].text;
  let identity = { id: 'd1', uid: 'owner1', role: 'owner' };
  const module = { exports: {} };
  vm.runInNewContext(pageCode, {
    module, exports: module.exports, window: { location: { pathname: '/owner/design-studio/d1' } },
    require: (name) => {
      if (name === 'react') return { ...React, useState: (initial) => [initial, () => {}], useEffect: () => {} };
      if (name === 'react-router-dom') return { useParams: () => ({ id: identity.id }), useNavigate: () => () => {} };
      if (name === '../context/RoleContext') return { useRole: () => ({ user: identity.uid ? { uid: identity.uid } : null, role: identity.role }) };
      if (name === '@bin/shared') return { useLanguage: () => ({ tx: (value) => value }) };
      if (name === '@mui/material') return { Box: 'div', CircularProgress: 'span' };
      if (name === '../theme/binGroupTheme') return { binThemeTokens: { gold: '#DAA520' } };
      return {};
    },
  });
  const renderBoundary = () => module.exports.default();
  const initial = renderBoundary();
  assert.equal(typeof initial.type, 'function', 'Use a keyed child boundary so old asynchronous responses cannot update a different design/account.');
  assert.equal(initial.key, JSON.stringify(['d1', 'owner1', 'owner']));
  assert.equal(renderBoundary().key, initial.key, 'Ordinary rerenders must retain state.');
  for (const next of [
    { id: 'd2', uid: 'owner1', role: 'owner' },
    { id: 'd1', uid: 'owner2', role: 'owner' },
    { id: 'd1', uid: 'owner1', role: 'admin' },
    { id: 'd1', uid: null, role: null },
  ]) {
    identity = next;
    const boundary = renderBoundary();
    assert.equal(boundary.type, initial.type);
    assert.notEqual(boundary.key, initial.key, 'Changed request/account authority must remount all local payment and media state.');
  }
});

function fixture({ tenant = false } = {}) {
  const records = new Map([
    ['design_requests/d1', { ownerId: 'owner1', userId: tenant ? 'tenant1' : 'owner1', tenantId: tenant ? 'tenant1' : null, role: tenant ? 'tenant' : 'owner', status: tenant ? 'AWAITING_OWNER_APPROVAL' : 'AI_CONCEPT_READY', quote: clone(quote) }],
    ['design_quotes/d1', { quote: clone(quote), quoteHash: hash }],
    ['design_approvals/d1_owner', { ownerId: 'owner1' }],
    ['system_payment_config/current', { status: 'ACTIVE', version: 'phase1-v1', effectiveAt: '2026-09-04T00:00:00Z', legalBeneficiary: 'BIN GROUP L.L.C - S.P.C', currency: 'AED', approvedMethods: ['CASH', 'CHEQUE'], officeLocation: 'TEST OFFICE - FIXTURE ONLY', stripeEnabled: false, bankTransferEnabled: false }],
  ]);
  const accounts = new Map();
  const files = new Map();
  let counter = 0;
  let queue = Promise.resolve();
  const ref = (path) => ({ path, id: path.split('/').at(-1) });
  const db = {
    collection: (name) => ({ doc: (key = `auto${++counter}`) => ref(`${name}/${key}`) }),
    runTransaction: (operation) => {
      const run = queue.then(async () => {
        const pending = [];
        const tx = {
          get: async (reference) => {
            assert.equal(pending.length, 0, 'Transactions must read before writing.');
            const data = records.get(reference.path);
            return { exists: data !== undefined, data: () => data === undefined ? undefined : clone(data) };
          },
          create: (reference, data) => pending.push({ kind: 'create', reference, data }),
          update: (reference, data) => pending.push({ kind: 'update', reference, data }),
        };
        const result = await operation(tx);
        for (const { kind, reference } of pending) {
          assert.equal(records.has(reference.path), kind === 'update', `Invalid ${kind}: ${reference.path}`);
        }
        for (const { kind, reference, data } of pending) records.set(reference.path, clone(kind === 'update' ? { ...records.get(reference.path), ...data } : data));
        return result;
      });
      queue = run.catch(() => {});
      return run;
    },
  };
  const firestore = Object.assign(() => db, { Timestamp: class Timestamp {}, FieldValue: { serverTimestamp: () => 'SERVER_TIMESTAMP' } });
  const admin = { apps: [{}], firestore, auth: () => ({ getUser: async (uid) => {
    const role = uid.startsWith('owner') ? 'owner' : uid.startsWith('tenant') ? 'tenant' : 'admin';
    return accounts.get(uid) || { disabled: false, emailVerified: true, customClaims: { role } };
  } }), storage: () => ({ bucket: () => ({ file: (path) => ({
    save: async (bytes, options) => {
      assert.equal(options.preconditionOpts.ifGenerationMatch, 0, 'Receipt cannot overwrite evidence.');
      if (files.has(path)) throw Object.assign(new Error('exists'), { code: 412 });
      files.set(path, { ...options.metadata, size: bytes.length, generation: String(++counter) });
    },
    getMetadata: async () => [clone(files.get(path))],
  }) }) }) };
  class HttpsError extends Error { constructor(code, message) { super(message); this.code = code; } }
  const module = { exports: {} };
  const context = vm.createContext({ module, exports: module.exports, Buffer, console,
    require: (name) => {
      if (name === 'firebase-admin') return admin;
      if (name === 'crypto') return crypto;
      if (name === 'firebase-functions/v2/https') return { HttpsError, onCall: (options, handler) => Object.assign(handler, { options }) };
      throw new Error(`Unexpected dependency: ${name}`);
    },
  });
  vm.runInContext(handlerCode, context);
  const api = module.exports;
  const call = (name, uid, data = {}, tokenPatch = {}) => {
    const role = uid?.startsWith('owner') ? 'owner' : uid?.startsWith('tenant') ? 'tenant' : 'admin';
    return api[name]({ data, auth: uid ? { uid, token: { role, email_verified: true, firebase: { sign_in_second_factor: 'totp' }, ...tokenPatch } } : null });
  };
  const create = async (uid = 'owner1', method = 'CASH', designRequestId = 'd1') => {
    const instructions = await call('getDesignPaymentInstructions', uid, { designRequestId });
    return call('createDesignPaymentRequest', uid, { designRequestId, method, paymentConfigVersion: instructions.paymentConfigVersion, paymentConfigHash: instructions.paymentConfigHash });
  };
  const reviewData = { designRequestId: 'd1', decision: 'APPROVE', method: 'CASH', amountReceived: 15.15, paymentReferenceId: 'RECEIPT-1', contentType: 'application/pdf', encodedDocument: Buffer.from('%PDF-1.7 TEST RECEIPT').toString('base64'), internalNotes: 'Fixture review only.' };
  return { records, files, accounts, api, call, create, reviewData };
}

test('public overview is product guidance, not an invented property score', () => {
  const result = guidance.generateSovereignAIResponse({ role: 'unknown', text: 'Tell me about BIN GROUP Property Truth Infrastructure.' });
  assert.match(result, /Owners, Tenants, Technicians, Brokers, and Admin/);
  assert.match(result, /local product guidance/);
  assert.doesNotMatch(result, /0\/100|CRITICAL|cannot certify this property/);
  const ledger = guidance.generateSovereignAIResponse({ role: 'owner', text: 'Show my Property Truth Ledger' });
  assert.match(ledger, /INSUFFICIENT DATA/);
});

test('SMS absence, rejection, and errors are truthful and never claim delivery', async () => {
  let calls = 0;
  const env = { TWILIO_ACCOUNT_SID: 'TEST-SID', TWILIO_AUTH_TOKEN: 'TEST-ONLY-NOT-A-KEY', TWILIO_FROM_NUMBER: '+971500000000' };
  const noFetch = async () => { calls++; throw new Error('must not send'); };
  assert.equal((await sms.sendTwilioSMS('+971500000001', 'test', {}, noFetch)).state, 'NOT_CONFIGURED');
  assert.equal((await sms.sendTwilioSMS('invalid', 'test', env, noFetch)).state, 'INVALID_RECIPIENT');
  assert.equal(calls, 0);
  assert.equal((await sms.sendTwilioSMS('+971500000001', 'test', env, async () => ({ ok: false, status: 401 }))).state, 'PROVIDER_REJECTED');
  assert.equal((await sms.sendTwilioSMS('+971500000001', 'test', env, noFetch)).state, 'PROVIDER_ERROR');
  const accepted = await sms.sendTwilioSMS('+971500000001', 'test', env, async () => ({ ok: true, status: 201, json: async () => ({ sid: 'TEST-MESSAGE-ID', status: 'queued' }) }));
  assert.equal(accepted.state, 'PROVIDER_ACCEPTED');
  assert.equal(accepted.deliveryConfirmed, false);
  const source = readFileSync('functions/index.ts', 'utf8');
  assert.doesNotMatch(source, /SMS MOCK|Twilio SMS Success|userData\?\.fcmTokens/);
  assert.match(source, /server:dispatchOmniNotification/);
  assert.match(source, /Promise\.allSettled\(channels/);
});

test('deposit policy preserves fils and rejects stale or forged quotes', () => {
  assert.equal(policy.designDeposit(101), 15.15);
  for (const amount of [0, 0.01, -1, NaN, Infinity]) assert.throws(() => policy.designDeposit(amount));
  const design = { ownerId: 'owner1', userId: 'owner1', role: 'owner', quote };
  assert.equal(policy.designPaymentTerms(design, { quote, quoteHash: hash }).amount, 15.15);
  assert.throws(() => policy.designPaymentTerms({ ...design, quote: { ...quote, mobilizationAmount: 15 } }, { quote, quoteHash: hash }), /cent-precise/);
  assert.throws(() => policy.designPaymentTerms(design, { quote, quoteHash: 'b'.repeat(64) }), /canonical/);
});

test('all design entry points retain App Check; revoked, unauthenticated and non-MFA accounts fail', async () => {
  const f = fixture();
  for (const handler of Object.values(f.api)) assert.equal(handler.options.enforceAppCheck, true);
  await assert.rejects(f.call('createDesignPaymentRequest', null, { designRequestId: 'd1', method: 'CASH' }), { code: 'unauthenticated' });
  await assert.rejects(f.call('getDesignPaymentInstructions', 'owner2', { designRequestId: 'd1' }), { code: 'permission-denied' });
  await assert.rejects(f.call('adminReviewDesignPayment', 'admin1', f.reviewData, { firebase: {} }), { code: 'permission-denied' });
  f.accounts.set('admin1', { emailVerified: true, disabled: false, customClaims: { role: 'tenant' } });
  await assert.rejects(f.call('adminReviewDesignPayment', 'admin1', f.reviewData), { code: 'permission-denied' });
});

test('Finance Admin payment verification still requires a current verified role and MFA after queue access', async () => {
  const f = fixture();
  const claims = { role: 'finance_admin', modules: ['dashboard', 'financials', 'transactions', 'reports'] };
  f.accounts.set('finance1', { emailVerified: true, disabled: false, customClaims: claims });
  await f.create();
  await assert.rejects(f.call('adminReviewDesignPayment', 'finance1', f.reviewData, { ...claims, firebase: {} }), { code: 'permission-denied' });
  await assert.rejects(f.call('adminReviewDesignPayment', 'finance1', f.reviewData, { ...claims, email_verified: false }), { code: 'permission-denied' });
  await assert.rejects(f.call('adminReviewDesignPayment', 'finance1', f.reviewData, { ...claims, suspended: true }), { code: 'permission-denied' });
  f.accounts.set('finance1', { emailVerified: true, disabled: false, customClaims: { role: 'finance_staff' } });
  await assert.rejects(f.call('adminReviewDesignPayment', 'finance1', f.reviewData, claims), { code: 'permission-denied' });
  f.accounts.set('finance1', { emailVerified: true, disabled: false, customClaims: claims });
  await f.call('adminReviewDesignPayment', 'finance1', f.reviewData, claims);
  assert.equal(f.records.get('payment_transactions/design_d1').paymentVerified, true);
  assert.equal(f.records.get('design_requests/d1').status, 'PAID');
  assert.equal([...f.records.keys()].some((key) => key.startsWith('contracts/') || key.startsWith('users/')), false);
});

test('Cash/Cheque requests bind the displayed policy and never grant payment or execution authority', async () => {
  for (const method of ['CASH', 'CHEQUE']) {
    const f = fixture();
    await f.create('owner1', method);
    const payment = f.records.get('payment_transactions/design_d1');
    assert.equal(payment.method, method);
    assert.equal(payment.adminApprovalRequired, true);
    assert.equal(payment.paymentVerified, false);
    assert.equal(payment.amount, 15.15);
    assert.equal((await f.create('owner1', method)).idempotent, true);
    await assert.rejects(f.call('adminHandoffDesignRequest', 'admin1', { designRequestId: 'd1' }), /Verified immutable/);
  }
  const f = fixture();
  for (const method of ['STRIPE', 'BANK_TRANSFER']) await assert.rejects(f.create('owner1', method), /Cash or Cheque/);
  await assert.rejects(f.call('createDesignPaymentRequest', 'owner1', { designRequestId: 'd1', method: 'CASH', paymentConfigVersion: 'stale', paymentConfigHash: hash }), /instructions changed/);
});

test('Tenant approval is bound to the actual Owner and exact payer', async () => {
  for (const action of ['APPROVE', 'TAKEOVER']) {
    const f = fixture({ tenant: true });
    await assert.rejects(f.create('tenant1'), /owner must approve/i);
    await assert.rejects(f.call('submitDesignOwnerDecision', 'owner2', { designRequestId: 'd1', action }), { code: 'permission-denied' });
    await f.call('submitDesignOwnerDecision', 'owner1', { designRequestId: 'd1', action });
    assert.equal((await f.call('submitDesignOwnerDecision', 'owner1', { designRequestId: 'd1', action })).idempotent, true);
    const payer = action === 'TAKEOVER' ? 'owner1' : 'tenant1';
    await f.create(payer);
    await assert.rejects(f.create(payer === 'owner1' ? 'tenant1' : 'owner1'), { code: 'permission-denied' });
    assert.equal(f.records.get('design_approvals/d1_owner').decidedBy, 'owner1');
  }
});

test('receipt-backed approval and engineer handoff are atomic and replay-safe', async () => {
  const f = fixture();
  await f.create();
  await assert.rejects(f.call('adminReviewDesignPayment', 'admin1', { ...f.reviewData, amountReceived: 15 }), /exactly match/);
  await assert.rejects(f.call('adminReviewDesignPayment', 'admin1', { ...f.reviewData, encodedDocument: Buffer.from('not a PDF').toString('base64') }), /valid PDF/);
  assert.equal(f.files.size, 0);
  const results = await Promise.all([f.call('adminReviewDesignPayment', 'admin1', f.reviewData), f.call('adminReviewDesignPayment', 'admin1', f.reviewData)]);
  assert.equal(results.filter((r) => !r.idempotent).length, 1);
  assert.equal(f.files.size, 1);
  const payment = f.records.get('payment_transactions/design_d1');
  assert.equal(payment.paymentVerified, true);
  assert.equal(payment.adminNotes, '');
  assert.equal(f.records.get('design_requests/d1').paymentReviewNote, '');
  assert.equal(f.records.get('audit_logs/design_payment_approved_d1').notes, f.reviewData.internalNotes);
  assert.ok(payment.receiptGeneration);
  assert.equal(f.records.get('design_requests/d1').status, 'PAID');
  assert.equal(f.records.has('audit_logs/design_payment_approved_d1'), true);
  assert.equal(f.records.has('notifications/design_payment_approved_d1'), true);
  assert.equal([...f.records.keys()].some((key) => key.startsWith('contracts/') || key.startsWith('users/')), false);
  await assert.rejects(f.call('adminReviewDesignPayment', 'admin1', { ...f.reviewData, paymentReferenceId: 'CHANGED' }), /different evidence/);
  await assert.rejects(f.call('adminReviewDesignPayment', 'admin1', { designRequestId: 'd1', decision: 'RETURN', internalNotes: 'Cannot undo approval' }), /cannot be returned/);
  await f.call('adminHandoffDesignRequest', 'admin1', { designRequestId: 'd1' });
  assert.equal((await f.call('adminHandoffDesignRequest', 'admin1', { designRequestId: 'd1' })).idempotent, true);
  assert.equal(f.records.get('design_requests/d1').status, 'ENGINEER_REVIEW');
});

test('returned evidence stays unpaid and a changed policy blocks approval', async () => {
  const f = fixture();
  await f.create();
  await f.call('adminReviewDesignPayment', 'admin1', { designRequestId: 'd1', decision: 'RETURN', internalNotes: 'Receipt reference is unreadable' });
  assert.equal(f.records.get('payment_transactions/design_d1').verificationState, 'EVIDENCE_RETURNED');
  assert.equal(f.records.get('design_requests/d1').paymentVerified, false);
  f.records.get('system_payment_config/current').version = 'changed';
  await assert.rejects(f.call('adminReviewDesignPayment', 'admin1', f.reviewData), /current approved quote/);
  assert.equal(f.files.size, 0);
});

test('the same receipt file or reference cannot fund two design requests', async () => {
  for (const duplicate of ['file', 'reference']) {
    const f = fixture();
    f.records.set('design_requests/d2', clone(f.records.get('design_requests/d1')));
    f.records.set('design_quotes/d2', clone(f.records.get('design_quotes/d1')));
    await f.create();
    await f.create('owner1', 'CASH', 'd2');
    await f.call('adminReviewDesignPayment', 'admin1', f.reviewData);
    const second = { ...f.reviewData, designRequestId: 'd2',
      ...(duplicate === 'file' ? { paymentReferenceId: 'RECEIPT-2' } : { encodedDocument: Buffer.from('%PDF-1.7 DIFFERENT RECEIPT').toString('base64') }),
    };
    await assert.rejects(f.call('adminReviewDesignPayment', 'admin1', second), /already been allocated/);
    assert.equal(f.records.get('design_requests/d2').paymentVerified, false);
    assert.equal(f.records.has('audit_logs/design_payment_approved_d2'), false);
  }
});

test('browser payment flow cannot invoke Stripe, mutate decisions, or unlock execution', () => {
  const ui = readFileSync('src/pages/DesignRequestDetailPage.tsx', 'utf8');
  assert.doesNotMatch(ui, /createStripeCheckoutSession|updateDoc|writeBatch|window\.location\.assign/);
  for (const name of ['submitDesignOwnerDecision', 'createDesignPaymentRequest', 'getDesignPaymentInstructions', 'adminHandoffDesignRequest']) assert.ok(ui.includes(name));
  const stripe = readFileSync('functions/stripePayment.ts', 'utf8');
  assert.ok(stripe.indexOf('loadActivePaymentConfiguration();') < stripe.indexOf('let chargeAmount'));
  assert.match(stripe, /!paymentConfiguration\.approvedMethods\.includes\("STRIPE"\)/);
  const rules = readFileSync('firestore.rules', 'utf8');
  for (const name of ['design_requests', 'design_quotes', 'design_approvals']) {
    const block = rules.slice(rules.indexOf(`match /${name}/`)).split('\n    }')[0];
    assert.match(block, /allow update, delete: if false/);
    assert.equal(rules.split(`'${name}'`).length - 1, 2, `${name} must be excluded from both Admin write catch-alls`);
  }
  const storage = readFileSync('storage.rules', 'utf8');
  assert.match(storage, /collection != 'design-payment-receipts'/);
  assert.match(storage, /match \/design-payment-receipts\/[^]*?allow write: if false;/);
  assert.equal(rules.split("'design_receipt_registry'").length - 1, 2);
  assert.match(rules, /match \/design_receipt_registry\/[^]*?allow create, update, delete: if false;/);
  const adminQueue = readFileSync('apps/admin-panel/src/components/DesignHandoffQueue.tsx', 'utf8');
  assert.match(adminQueue, /adminHandoffDesignRequest/);
  assert.doesNotMatch(adminQueue, /updateDoc|writeBatch/);
});

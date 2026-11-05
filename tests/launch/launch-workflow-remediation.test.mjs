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
const choiceBrief = await loadPure('functions/designExecutionBrief.ts');
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

const primaryPath = 'ai_design_renders/owner1/d1/primary.jpg';
const airyPath = 'ai_design_renders/owner1/d1/option_2.jpg';
const roleFor = (uid = '') => uid.startsWith('owner') ? 'owner' : uid.startsWith('tenant') ? 'tenant' : uid.startsWith('tech') ? 'technician' : 'admin';

function designRecord(tenant) {
  return {
    ownerId: 'owner1', userId: tenant ? 'tenant1' : 'owner1', tenantId: tenant ? 'tenant1' : null,
    role: tenant ? 'tenant' : 'owner', status: tenant ? 'AWAITING_OWNER_APPROVAL' : 'AI_CONCEPT_READY',
    quote: clone(quote), propertyName: 'Abu Dhabi residence', designStyle: 'Modern', designObjective: 'refresh',
    scope: { zoneType: 'bedroom', dimensions: 35, finishTier: 'Premium', unitNumber: '', floorLevel: '', existingCondition: '', requiredWork: '', emirate: 'Abu Dhabi', hasMEP: false },
    referenceImagePaths: ['design_requests/owner1/d1/reference.jpg'],
    generatedImagePaths: [primaryPath, airyPath],
    concepts: [
      { id: 'primary', optionKey: 'option_1', optionLabel: 'Option 1 - Balanced', afterImageStoragePath: primaryPath, generatedImageSha256: 'b'.repeat(64), finishTier: 'Premium', title: 'Bedroom balanced', scopeSummary: 'Balanced bedroom.', prompt: 'SECRET PROVIDER PROMPT balanced' },
      { id: 'option_2', optionKey: 'option_2', optionLabel: 'Option 2 - Light and airy', afterImageStoragePath: airyPath, generatedImageSha256: 'c'.repeat(64), finishTier: 'Premium', title: 'Bedroom airy', scopeSummary: 'Light bedroom.', prompt: 'SECRET PROVIDER PROMPT airy' },
    ],
    conceptPrompt: 'SECRET PROVIDER PROMPT',
    lockedChoice: {
      optionIndex: 0, optionId: 'primary', optionKey: 'option_1', optionLabel: 'Option 1 - Balanced',
      imageStoragePath: primaryPath, imageSha256: 'b'.repeat(64), style: 'Modern', finishTier: 'Premium',
      zoneType: 'bedroom', designObjective: 'refresh',
      lightingNotes: 'Warm, layered lighting with dimmable ambient light and one focal-wall feature light, matching the balanced option.',
      scopeSummary: 'Balanced bedroom.', title: 'Bedroom balanced', quoteHash: hash, lockVersion: 1,
      lockedBy: 'owner1', lockedByRole: 'owner',
    },
  };
}

function fixture({ tenant = false } = {}) {
  const records = new Map([
    ['design_requests/d1', designRecord(tenant)],
    ['design_concepts/d1_primary', { requestId: 'd1', id: 'primary' }],
    ['design_concepts/d1_option_2', { requestId: 'd1', id: 'option_2' }],
    ['design_quotes/d1', { quote: clone(quote), quoteHash: hash }],
    ['design_approvals/d1_owner', { ownerId: 'owner1' }],
    ['system_payment_config/current', { status: 'ACTIVE', version: 'phase1-v1', effectiveAt: '2026-09-04T00:00:00Z', legalBeneficiary: 'BIN GROUP L.L.C - S.P.C', currency: 'AED', approvedMethods: ['CASH', 'CHEQUE'], officeLocation: 'TEST OFFICE - FIXTURE ONLY', stripeEnabled: false, bankTransferEnabled: false }],
  ]);
  const accounts = new Map();
  const files = new Map();
  let counter = 0;
  let queue = Promise.resolve();
  const ref = (path) => ({
    path,
    id: path.split('/').at(-1),
    get: async () => {
      const data = records.get(path);
      return { exists: data !== undefined, id: path.split('/').at(-1), data: () => data === undefined ? undefined : clone(data) };
    },
  });
  const db = {
    collection: (name) => ({
      doc: (key = `auto${++counter}`) => ref(`${name}/${key}`),
      where: (field, op, value) => ({
        limit: (count) => ({
          get: async () => {
            const docs = [...records.entries()].filter(([path, data]) => {
              if (!path.startsWith(`${name}/`)) return false;
              const fieldValue = field.split('.').reduce((current, part) => current?.[part], data);
              if (op === '==') return fieldValue === value;
              return op === 'in' && Array.isArray(value) && value.includes(fieldValue);
            }).slice(0, count).map(([path, data]) => ({ id: path.split('/').at(-1), data: () => clone(data) }));
            return { docs, empty: docs.length === 0 };
          },
        }),
      }),
    }),
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
    const role = roleFor(uid);
    return accounts.get(uid) || { disabled: false, emailVerified: true, customClaims: { role } };
  } }), storage: () => ({ bucket: () => ({ file: (path) => ({
    save: async (bytes, options) => {
      assert.equal(options.preconditionOpts.ifGenerationMatch, 0, 'Receipt cannot overwrite evidence.');
      if (files.has(path)) throw Object.assign(new Error('exists'), { code: 412 });
      files.set(path, { ...options.metadata, size: bytes.length, generation: String(++counter) });
    },
    getMetadata: async () => [clone(files.get(path))],
    getSignedUrl: async () => [`https://signed.example/${path}`],
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
    const role = roleFor(uid || '');
    const request = { data, auth: uid ? { uid, token: { role, email_verified: true, firebase: { sign_in_second_factor: 'totp' }, ...tokenPatch } } : null };
    // Keep fixture dispatch explicit so arbitrary or inherited methods cannot run.
    switch (name) {
      case 'getDesignPaymentInstructions': return api.getDesignPaymentInstructions(request);
      case 'createDesignPaymentRequest': return api.createDesignPaymentRequest(request);
      case 'submitDesignOwnerDecision': return api.submitDesignOwnerDecision(request);
      case 'adminReviewDesignPayment': return api.adminReviewDesignPayment(request);
      case 'adminHandoffDesignRequest': return api.adminHandoffDesignRequest(request);
      case 'lockChosenDesignOption': return api.lockChosenDesignOption(request);
      case 'authorizeDesignChoiceRevision': return api.authorizeDesignChoiceRevision(request);
      case 'getDesignExecutionBrief': return api.getDesignExecutionBrief(request);
      case 'listDesignsAwaitingExecution': return api.listDesignsAwaitingExecution(request);
      case 'markDesignExecutionReady': return api.markDesignExecutionReady(request);
      default: throw new Error('Unsupported design callable in test fixture.');
    }
  };
  const create = async (uid = 'owner1', method = 'CASH', designRequestId = 'd1') => {
    const instructions = await call('getDesignPaymentInstructions', uid, { designRequestId });
    return call('createDesignPaymentRequest', uid, { designRequestId, method, paymentConfigVersion: instructions.paymentConfigVersion, paymentConfigHash: instructions.paymentConfigHash });
  };
  const reviewData = { designRequestId: 'd1', decision: 'APPROVE', method: 'CASH', amountReceived: 15.15, paymentReferenceId: 'RECEIPT-1', contentType: 'application/pdf', encodedDocument: Buffer.from('%PDF-1.7 TEST RECEIPT').toString('base64'), internalNotes: 'Fixture review only.' };
  return { records, files, accounts, api, call, create, reviewData };
}

test('design fixture dispatch rejects unknown, inherited and non-string method names without side effects', () => {
  const f = fixture();
  const initialRecords = clone(f.records);
  let unexpectedCalls = 0;
  f.api.unexpectedCallable = () => { unexpectedCalls += 1; };
  const methodNames = ['unexpectedCallable', 'constructor', '__proto__', 'toString', 'hasOwnProperty', '', null, undefined,
    { toString: () => 'adminReviewDesignPayment' }];
  for (const methodName of methodNames) {
    assert.throws(() => f.call(methodName, 'admin1', f.reviewData), {
      message: 'Unsupported design callable in test fixture.',
    });
  }
  assert.equal(unexpectedCalls, 0);
  assert.deepEqual(f.records, initialRecords);
  assert.equal(f.files.size, 0);
});

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

test('execution brief follows the locked option and leaves blank site facts blank', () => {
  const design = designRecord(false);
  design.concepts[1].prompt = 'SECRET PROVIDER PROMPT airy';
  const airy = choiceBrief.buildLockedChoice(design, choiceBrief.matchDesignOption(design, { optionId: 'option_2' }), { uid: 'tenant1', role: 'tenant' }, 2);
  const brief = choiceBrief.buildExecutionBrief({ ...design, lockedChoice: airy });
  assert.equal(airy.imageStoragePath, airyPath);
  assert.equal(brief.imageStoragePath, airyPath);
  assert.match(brief.lightingNotes, /light and airy/i);
  assert.equal(brief.sections.find((section) => section.category === 'Lighting').items[0], brief.lightingNotes);
  const labels = brief.incompleteScope.map((gap) => gap.label);
  for (const sentence of ['Unit number is not declared.', 'Floor is not declared.', 'Current condition is not declared.', 'Required work is not declared.']) {
    assert.ok(labels.includes(sentence), sentence);
  }
  assert.equal(labels.includes('Area is not declared.'), false);
  const serialized = JSON.stringify({ airy, brief });
  assert.equal(serialized.includes('SECRET PROVIDER PROMPT'), false);
  assert.equal(serialized.includes('Unit 12'), false);
  const balanced = choiceBrief.buildExecutionBrief(design);
  assert.match(balanced.lightingNotes, /balanced/i);
  assert.equal(balanced.lightingNotes.includes('light and airy'), false);
});

test('chosen design lock is server-authoritative, idempotent, and audited', async () => {
  const f = fixture({ tenant: true });
  await assert.rejects(f.call('lockChosenDesignOption', 'owner2', { designRequestId: 'd1', optionId: 'option_2' }), { code: 'permission-denied' });
  const first = await f.call('lockChosenDesignOption', 'tenant1', { designRequestId: 'd1', optionIndex: 0, optionId: 'primary' });
  assert.equal(first.idempotent, false);
  assert.equal((await f.call('lockChosenDesignOption', 'tenant1', { designRequestId: 'd1', optionIndex: 0, optionId: 'primary' })).idempotent, true);
  const changed = await f.call('lockChosenDesignOption', 'owner1', { designRequestId: 'd1', optionId: 'option_2' });
  assert.equal(changed.idempotent, false);
  const design = f.records.get('design_requests/d1');
  assert.equal(design.lockedChoice.optionId, 'option_2');
  assert.equal(design.lockedChoice.imageStoragePath, airyPath);
  assert.equal(design.lockedChoice.optionLabel, 'Option 2 - Light and airy');
  assert.equal(design.executionBrief.imageStoragePath, airyPath);
  assert.match(design.executionBrief.lightingNotes, /light and airy/i);
  assert.equal(JSON.stringify(design.lockedChoice).includes('SECRET'), false);
  assert.equal(JSON.stringify(design.executionBrief).includes('SECRET'), false);
  assert.equal(f.records.get('design_quotes/d1').lockedChoice.imageStoragePath, airyPath);
  assert.equal(f.records.get('design_approvals/d1_owner').lockedChoice.optionId, 'option_2');
  assert.equal(f.records.get('design_concepts/d1_option_2').selected, true);
  assert.equal(f.records.get('design_concepts/d1_primary').selected, false);
  assert.equal(f.records.get('audit_logs/design_choice_lock_d1_v2').action, 'DESIGN_CHOICE_LOCKED');
  assert.equal(f.records.get('audit_logs/design_choice_lock_d1_v2').imageStoragePath, airyPath);
  assert.equal(String(design.lockedChoice.imageStoragePath).includes('://'), false);
});

test('engineer handoff requires the locked choice and the brief reads that picture', async () => {
  const missing = fixture();
  await missing.create();
  await missing.call('adminReviewDesignPayment', 'admin1', missing.reviewData);
  delete missing.records.get('design_requests/d1').lockedChoice;
  await assert.rejects(missing.call('adminHandoffDesignRequest', 'admin1', { designRequestId: 'd1' }), /Lock a chosen design/);
  assert.equal(missing.records.get('design_requests/d1').status, 'PAID');

  const f = fixture();
  await f.create();
  await f.call('adminReviewDesignPayment', 'admin1', f.reviewData);
  f.records.get('design_requests/d1').lockedChoice.quoteHash = 'b'.repeat(64);
  await assert.rejects(f.call('adminHandoffDesignRequest', 'admin1', { designRequestId: 'd1' }), /does not match the approved quote/);
  f.records.get('design_requests/d1').lockedChoice.quoteHash = hash;
  await assert.rejects(f.call('getDesignExecutionBrief', 'tech1', { designRequestId: 'd1' }), /engineer review/);
  await f.call('adminHandoffDesignRequest', 'admin1', { designRequestId: 'd1' });
  const design = f.records.get('design_requests/d1');
  assert.equal(design.status, 'ENGINEER_REVIEW');
  assert.equal(design.executionBrief.lockedOptionId, 'primary');
  assert.equal(design.executionBrief.imageStoragePath, primaryPath);
  assert.equal(f.records.get('audit_logs/design_handoff_d1').lockedImageStoragePath, primaryPath);
  const viewed = await f.call('getDesignExecutionBrief', 'tech1', { designRequestId: 'd1' });
  assert.equal(viewed.lockedChoice.imageStoragePath, primaryPath);
  assert.equal(viewed.executionBrief.sections.some((section) => section.category === 'Lighting' && /balanced/i.test(section.items.join(' '))), true);
  assert.match(viewed.chosenImageUrl, /primary\.jpg/);
  assert.equal(JSON.stringify(viewed).includes('SECRET'), false);
  const listed = await f.call('listDesignsAwaitingExecution', 'tech1', {});
  assert.equal(listed.designs[0].optionLabel, 'Option 1 - Balanced');
  assert.equal(JSON.stringify(listed).includes('SECRET'), false);
  await assert.rejects(f.call('listDesignsAwaitingExecution', 'owner1', {}), { code: 'permission-denied' });
});

test('a locked design can change only through an audited revision, then completion notifies tenant and owner', async () => {
  const f = fixture({ tenant: true });
  await f.call('submitDesignOwnerDecision', 'owner1', { designRequestId: 'd1', action: 'APPROVE' });
  await f.create('tenant1');
  await f.call('adminReviewDesignPayment', 'admin1', f.reviewData);
  await f.call('adminHandoffDesignRequest', 'admin1', { designRequestId: 'd1' });
  await assert.rejects(f.call('lockChosenDesignOption', 'tenant1', { designRequestId: 'd1', optionId: 'option_2' }), /design-choice revision/);
  await assert.rejects(f.call('authorizeDesignChoiceRevision', 'admin1', { designRequestId: 'd1', reason: 'short' }), /short reason/);
  await f.call('authorizeDesignChoiceRevision', 'admin1', { designRequestId: 'd1', reason: 'Tenant asked for the lighter option before work starts.' });
  assert.equal((await f.call('authorizeDesignChoiceRevision', 'admin1', { designRequestId: 'd1', reason: 'Tenant asked for the lighter option before work starts.' })).idempotent, true);
  assert.equal(f.records.get('design_requests/d1').status, 'CHOICE_REVISION_PENDING');
  assert.match(f.records.get('notifications/design_choice_revision_d1_tenant').body, /d1/);
  assert.match(f.records.get('notifications/design_choice_revision_d1_owner').body, /deposit is unchanged/);
  await f.call('lockChosenDesignOption', 'tenant1', { designRequestId: 'd1', optionId: 'option_2' });
  assert.equal(f.records.get('design_requests/d1').status, 'PAID');
  assert.equal(f.records.get('design_requests/d1').choiceRevisionAuthorized, false);
  assert.equal(f.records.get('design_requests/d1').lockedChoice.imageStoragePath, airyPath);
  await f.call('adminHandoffDesignRequest', 'admin1', { designRequestId: 'd1' });
  assert.equal(f.records.get('design_requests/d1').executionBrief.imageStoragePath, airyPath);
  const payment = clone(f.records.get('payment_transactions/design_d1'));
  await assert.rejects(f.call('markDesignExecutionReady', 'owner1', { designRequestId: 'd1', completionNote: 'Should not close.' }), { code: 'permission-denied' });
  await assert.rejects(f.call('markDesignExecutionReady', 'admin1', { designRequestId: 'd1', completionNote: 'Lighting is in.' }, { firebase: {} }), { code: 'permission-denied' });
  const note = 'Lighting, paint, and furniture match the locked light and airy picture.';
  await f.call('markDesignExecutionReady', 'tech1', { designRequestId: 'd1', completionNote: note });
  assert.equal((await f.call('markDesignExecutionReady', 'tech1', { designRequestId: 'd1' })).idempotent, true);
  await assert.rejects(f.call('markDesignExecutionReady', 'tech1', { designRequestId: 'd1', completionNote: 'Different note' }), /cannot be changed/);
  const done = f.records.get('design_requests/d1');
  assert.equal(done.status, 'EXECUTION_READY');
  assert.equal(done.executionStatus, 'READY_FOR_HANDOVER');
  assert.deepEqual(f.records.get('payment_transactions/design_d1'), payment);
  for (const role of ['tenant', 'owner']) {
    const notification = f.records.get(`notifications/design_execution_ready_d1_${role}`);
    assert.match(notification.body, /d1/);
    assert.match(notification.body, /Option 2 - Light and airy/);
    assert.match(notification.body, /light and airy picture/);
    assert.match(notification.link, new RegExp(`/${role}/design-studio/request/d1`));
  }
  assert.equal(f.records.get('audit_logs/design_execution_ready_d1').action, 'DESIGN_EXECUTION_MARKED_READY');
  assert.equal([...f.records.keys()].some((key) => key.startsWith('contracts/')), false);

  const ownerOnly = fixture();
  await ownerOnly.create();
  await ownerOnly.call('adminReviewDesignPayment', 'admin1', ownerOnly.reviewData);
  await ownerOnly.call('adminHandoffDesignRequest', 'admin1', { designRequestId: 'd1' });
  await ownerOnly.call('markDesignExecutionReady', 'admin1', { designRequestId: 'd1', completionNote: 'Ready for the owner walkthrough.' });
  assert.ok(ownerOnly.records.has('notifications/design_execution_ready_d1_owner'));
  assert.equal(ownerOnly.records.has('notifications/design_execution_ready_d1_tenant'), false);
});

test('design choice UI keeps the lock explicit and the engineer route reachable', () => {
  const page = readFileSync('src/pages/DesignRequestDetailPage.tsx', 'utf8');
  const queue = readFileSync('apps/admin-panel/src/components/DesignHandoffQueue.tsx', 'utf8');
  const tech = readFileSync('src/technician/TechnicianApp.tsx', 'utf8');
  assert.match(page, /lockChosenDesignOption/);
  assert.match(page, /Choose this design/);
  assert.match(page, /design-choice-locked/);
  assert.match(page, /markDesignExecutionReady/);
  assert.doesNotMatch(page, /conceptPrompt/);
  assert.match(queue, /getDesignExecutionBrief/);
  assert.match(queue, /authorizeDesignChoiceRevision/);
  assert.match(tech, /TechnicianDesignBriefPage/);
  assert.match(readFileSync('functions/paymentEvidence.ts', 'utf8'), /markDesignExecutionReady/);
  assert.match(readFileSync('src/lib/designStatusLabels.ts', 'utf8'), /Work is done and ready for handover/);
});

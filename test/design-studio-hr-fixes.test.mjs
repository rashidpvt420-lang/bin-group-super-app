import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { protectedMediaUrl, INLINE_MEDIA_MAX_BYTES } from '../functions/aiDesignMedia.ts';
import { stableCaseId } from '../functions/hrCaseId.ts';
import { designErrorMessage, DESIGN_SUBMIT_TIMEOUT_MS } from '../src/lib/designStudioErrors.ts';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

const fakeBucket = ({ signing, bytes }) => ({
  file: () => ({
    getSignedUrl: async () => {
      if (signing === 'denied') throw new Error('Permission iam.serviceAccounts.signBlob denied');
      return ['https://signed.example/img?sig=1'];
    },
    download: async () => [Buffer.alloc(bytes ?? 10, 7)],
  }),
});

test('private media uses a signed URL when IAM signing works', async () => {
  const url = await protectedMediaUrl(fakeBucket({ signing: 'ok' }), 'ai_design_renders/u/r/primary.jpg', 'generated', 1000);
  assert.equal(url, 'https://signed.example/img?sig=1');
});

test('private media falls back to inline data when signBlob is denied, so the paid render is not lost', async () => {
  const logs = [];
  const url = await protectedMediaUrl(
    fakeBucket({ signing: 'denied', bytes: 10 }),
    'ai_design_renders/u/r/primary.jpg',
    'generated',
    1000,
    (message) => logs.push(message),
  );
  assert.match(url, /^data:image\/jpeg;base64,/);
  assert.equal(Buffer.from(url.split(',')[1], 'base64').length, 10);
  assert.equal(logs.length, 1);
  const png = await protectedMediaUrl(fakeBucket({ signing: 'denied' }), 'design_requests/u/r/reference.png', 'reference', 1000);
  assert.match(png, /^data:image\/png;base64,/);
});

test('inline fallback refuses images that would blow the callable response limit', async () => {
  const url = await protectedMediaUrl(
    fakeBucket({ signing: 'denied', bytes: INLINE_MEDIA_MAX_BYTES.reference + 1 }),
    'design_requests/u/r/reference.jpg',
    'reference',
    1000,
  );
  assert.equal(url, '');
  assert.ok((INLINE_MEDIA_MAX_BYTES.reference + INLINE_MEDIA_MAX_BYTES.generated) * 1.34 < 9 * 1024 * 1024);
});

test('HR case id no longer collapses repeat uploads of the same document type', () => {
  const uid = 'tech-uid-1234567890';
  const keyFor = (filePath) =>
    `${uid}:Document update uploaded for HR review: Emirates ID:${JSON.stringify({ uid, technicianId: uid, userId: uid, email: 'a@b.c', displayName: 'Tech', role: 'technician', documentType: 'emirates_id', filePath })}`;
  const first = stableCaseId(uid, 'm', keyFor(`staffDocuments/${uid}/emirates_id/1-a.pdf`));
  const second = stableCaseId(uid, 'm', keyFor(`staffDocuments/${uid}/emirates_id/2-b.pdf`));
  assert.notEqual(first, second);
  // Same submission retried stays idempotent.
  assert.equal(first, stableCaseId(uid, 'm', keyFor(`staffDocuments/${uid}/emirates_id/1-a.pdf`)));
  // Different staff never share a case id even with an identical key.
  assert.notEqual(stableCaseId('u1', 'm', 'same-key'), stableCaseId('u2', 'm', 'same-key'));
  // No key supplied: derive from the message.
  assert.equal(stableCaseId(uid, 'hello', ''), stableCaseId(uid, 'hello', undefined));
  assert.match(first, /^hrcase_[0-9a-f]{40}$/);
});

test('design errors map deadline, config and role problems to actionable messages', () => {
  assert.ok(DESIGN_SUBMIT_TIMEOUT_MS > 180_000, 'client timeout must exceed the 180s server limit');
  assert.match(designErrorMessage({ code: 'functions/deadline-exceeded', message: 'deadline-exceeded' }), /took too long/);
  assert.match(designErrorMessage({ code: 'functions/failed-precondition', message: 'AI image generation is not configured in Firebase Functions secrets.' }), /not configured yet/);
  assert.match(designErrorMessage({ code: 'functions/failed-precondition', message: 'A verified tenant unit link is required before submitting a design request.' }), /tenant unit link/);
  assert.equal(
    designErrorMessage({ code: 'functions/permission-denied', message: 'An active, server-approved profile is required for AI services.' }),
    'An active, server-approved profile is required for AI services.',
  );
  assert.match(designErrorMessage({ code: 'functions/permission-denied', message: 'nope' }), /server authority checks/);
  assert.match(designErrorMessage({ code: 'functions/not-found', message: 'NOT_FOUND' }), /could not be reached/);
  assert.match(designErrorMessage(new Error('weird')), /could not be submitted/);
});

test('wiring: callable timeout, inline media fallback, broker approved status, hashed HR id', async () => {
  const [page, studio, quota, hr] = await Promise.all([
    read('src/pages/DesignStudioPage.tsx'),
    read('functions/aiDesignStudio.ts'),
    read('functions/aiUsageQuota.ts'),
    read('functions/hrAutomation.ts'),
  ]);
  assert.match(page, /httpsCallable\(functions, 'submitAIDesignRequest', \{ timeout: DESIGN_SUBMIT_TIMEOUT_MS \}\)/);
  assert.match(studio, /protectedMediaUrl\(bucket,/);
  assert.match(quota, /APPROVED_PROFILE_STATUSES = new Set\(\["active", "approved"\]\)/);
  assert.doesNotMatch(quota, /profileStatus !== "active"/);
  assert.match(quota, /\["suspended", "rejected", "disabled", "inactive"\]/);
  assert.match(hr, /import \{ stableCaseId \} from "\.\/hrCaseId"/);
  assert.doesNotMatch(hr, /suppliedKey\)\.slice\(0, 120\)/);
});

// ---- Dashboard audit follow-ups: indexes, owner documents count, light-theme text, visible errors ----

const indexKey = (i) => `${i.collectionGroup}|${i.queryScope}|${i.fields.map((f) => `${f.fieldPath}:${f.order || f.arrayConfig}`).join(',')}`;

test('firestore.indexes.json has every composite index the dashboards query', async () => {
  const data = JSON.parse(await read('firestore.indexes.json'));
  const have = new Set(data.indexes.map(indexKey));
  const required = [
    'owner_approval_requests|COLLECTION|ownerId:ASCENDING,createdAt:DESCENDING',
    'payment_transactions|COLLECTION|tenantId:ASCENDING,createdAt:DESCENDING',
    'payment_transactions|COLLECTION|tenantEmail:ASCENDING,createdAt:DESCENDING',
    'contract_renewal_watch|COLLECTION|tenantId:ASCENDING,daysRemaining:ASCENDING',
    'contract_renewal_watch|COLLECTION|tenantEmail:ASCENDING,daysRemaining:ASCENDING',
    'maintenanceTickets|COLLECTION|assignedTechnicianId:ASCENDING,status:ASCENDING,updatedAt:DESCENDING',
    'ownerBankAccounts|COLLECTION|ownerId:ASCENDING,createdAt:DESCENDING',
    'transactions|COLLECTION|ownerId:ASCENDING,createdAt:DESCENDING',
    'properties|COLLECTION|ownerId:ASCENDING,createdAt:DESCENDING',
    'maintenanceTickets|COLLECTION|propertyId:ASCENDING,createdAt:DESCENDING',
  ];
  for (const key of required) assert.ok(have.has(key), `missing index ${key}`);
  assert.equal(have.size, data.indexes.length, 'duplicate composite index definitions');
  // Pre-existing indexes must not have been removed.
  assert.ok(have.has('maintenanceTickets|COLLECTION|ownerId:ASCENDING,createdAt:DESCENDING'));
  assert.ok(have.has('maintenanceTickets|COLLECTION|assignedTechnicianId:ASCENDING,status:ASCENDING,createdAt:DESCENDING'));
});

test('owner command counts no longer read the rule-less owner_documents collection', async () => {
  const hook = await read('src/owner/hooks/useOwnerCommandCounts.ts');
  assert.doesNotMatch(hook, /collection\(db, 'owner_documents'\)/);
  assert.doesNotMatch(hook, /failed\.add\('documents'\)/);
  const rules = await read('firestore.rules');
  assert.doesNotMatch(rules, /match \/owner_documents\//, 'no rule was added for owner_documents');
});

test('owner pages put dark text on the white owner canvas', async () => {
  const docs = await read('src/owner/pages/OwnerDocumentsPage.tsx');
  assert.doesNotMatch(docs, /#FFF|#fff|rgba\(255,\s*255,\s*255/);
  assert.match(docs, /binThemeTokens\.textPrimary/);
  for (const [file, snippet] of [
    ['src/owner/pages/OwnerIbanPage.tsx', /IBAN \/ Payout Accounts/],
    ['src/owner/pages/OwnerPaymentProofPage.tsx', /Proof Review Center/],
    ['src/owner/pages/OwnerPropertyPassportResolvedPage.tsx', /Property Passports/],
    ['src/owner/pages/OwnerTicketsPage.tsx', /maintTickets/],
  ]) {
    const src = await read(file);
    const line = src.split('\n').find((l) => snippet.test(l) && /Typography/.test(l)) || src.split('\n').find((l) => snippet.test(l));
    assert.ok(line, `${file} heading not found`);
    assert.doesNotMatch(line, /#FFF|#fff/i, `${file} heading is white on white`);
  }
});

test('tenant payments, owner approvals and technician history surface load errors', async () => {
  const pay = await read('src/tenant/pages/TenantPaymentsPage.tsx');
  assert.doesNotMatch(pay, /\(\) => \{\}\s*\)\);/, 'email listener error handler must not be empty');
  assert.match(pay, /tenant-payments-load-error/);
  assert.match(pay, /setLoadError\(/);
  const appr = await read('src/owner/pages/OwnerApprovalCenterPage.tsx');
  assert.match(appr, /owner-approvals-load-error/);
  assert.match(appr, /owner-signoffs-load-error/);
  assert.match(appr, /items\.length === 0 && !requestsError/);
  const hist = await read('src/technician/pages/TechnicianHistoryPage.tsx');
  assert.match(hist, /setLoadError\(/);
  assert.match(hist, /if \(loadError\) return <Alert severity="error">/);
});

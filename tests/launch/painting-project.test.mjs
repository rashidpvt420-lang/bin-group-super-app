import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';

let dir; let p;
test.before(async () => {
  dir = mkdtempSync(join(tmpdir(), 'bin-paintproj-'));
  const outfile = join(dir, 'p.mjs');
  await build({ entryPoints: ['functions/projects/paintingProject.ts'], outfile, bundle: true, platform: 'node', format: 'esm', target: 'node22', logLevel: 'silent' });
  p = await import(pathToFileURL(outfile).href);
});
test.after(() => rmSync(dir, { recursive: true, force: true }));

const permitsNone = { dmBasicMaintenanceContractorRequired: true, ddaMaintenancePermitRequired: false, communityNocRequired: false };
const sheet = { materialsAed: 2000, labourAed: 3000, prepAed: 500, accessScaffoldAed: 0, permitsNocAed: 0, contingencyPct: 10, warrantyReservePct: 3 };

test('painting is not a recurring add-on in any pricing matrix or onboarding add-on step', () => {
  for (const f of ['src/utils/uaePricingMatrix2026.ts', 'functions/pricing/uaePricingMatrix2026.ts', 'packages/shared/src/pricing/uaePricingMatrix2026.ts', 'src/components/onboarding/SystemsDataStep.tsx']) {
    assert.doesNotMatch(readFileSync(f, 'utf8'), /painting_/i, f);
  }
  const src = readFileSync('functions/projects/paintingProject.ts', 'utf8');
  assert.doesNotMatch(src, /designPriceList|selectedAddOns\s*[:=]/);
});

test('five scopes (incl. full building), default 35% margin, hard 20% floor', () => {
  assert.deepEqual([...p.PAINTING_SCOPES], ['ROOM', 'FULL_UNIT', 'BUILDING_COMMON_AREAS', 'EXTERIOR_FACADE', 'FULL_BUILDING']);
  assert.equal(p.DEFAULT_MIN_GROSS_MARGIN_PCT, 35);
  assert.equal(p.HARD_MIN_GROSS_MARGIN_PCT, 20);
  assert.equal(p.normalisePermits({}, 'FULL_BUILDING').communityNocRequired, true);
});

test('reserves (10% contingency, 3% warranty) are separate from direct cost and never added to it', () => {
  const t = p.costSheetTotals(sheet);
  assert.deepEqual(t, { directCostAed: 5500, contingencyReserveAed: 550, warrantyReserveAed: 165 });
  assert.equal('totalCostAed' in t, false);
  // Reserve rates are policy: per-quote inputs cannot change them.
  const s2 = p.normaliseCostSheet({ ...sheet, contingencyPct: 0, warrantyReservePct: 0 });
  assert.equal(s2.contingencyPct, 10); assert.equal(s2.warrantyReservePct, 3);
  assert.equal(p.CONTINGENCY_RESERVE_PCT, 10); assert.equal(p.WARRANTY_RESERVE_PCT, 3);
});

test('margin formula: (price - (labour+materials+prep+access+permit)) / price; reserves not double-counted', () => {
  const q = p.buildPaintingQuote({ costSheet: sheet, priceAed: 10000, permits: permitsNone });
  assert.equal(q.directCostAed, 5500);
  assert.equal(q.grossMarginPct, 45); // (10000 - 5500) / 10000, reserves excluded
  assert.equal(q.marginAfterReservesAed, 10000 - 5500 - 550 - 165);
  assert.equal(q.belowTarget, false); assert.equal(q.targetMarginPct, 35); assert.equal(q.minMarginPct, 20);
  assert.match(q.marginFormula, /reserves held separately/);
});

test('hard 20% floor blocks with no override; 20-35% needs a written reason', () => {
  const floor = p.minimumPriceFor(5500, 20);
  assert.equal(floor, 6875);
  assert.throws(() => p.buildPaintingQuote({ costSheet: sheet, priceAed: 6874, belowTargetReason: 'long enough reason', permits: permitsNone }), /below the minimum 20%.*no override/);
  // A caller cannot lower the floor below 20% (no override path).
  assert.throws(() => p.buildPaintingQuote({ costSheet: sheet, priceAed: 6000, minMarginPct: 0, belowTargetReason: 'long enough reason', permits: permitsNone }), /below the minimum 20%/);
  assert.throws(() => p.buildPaintingQuote({ costSheet: sheet, priceAed: 8000, permits: permitsNone }), /below the 35% target/);
  const q = p.buildPaintingQuote({ costSheet: sheet, priceAed: floor, belowTargetReason: 'Repeat client, bulk works', permits: permitsNone });
  assert.equal(q.belowTarget, true); assert.equal(q.grossMarginPct, 20); assert.equal(q.belowTargetReason, 'Repeat client, bulk works');
  // Floor can be raised.
  assert.throws(() => p.buildPaintingQuote({ costSheet: sheet, priceAed: 9000, minMarginPct: 40, permits: permitsNone }), /below the minimum 40%/);
});

test('reserve position: overrun draws contingency only; warranty reserve untouched', () => {
  const held = { contingencyReserveAed: 550, warrantyReserveAed: 165 };
  assert.deepEqual(p.reservePosition(held, 5500, 5000), { contingencyHeldAed: 550, contingencyUsedAed: 0, contingencyRemainingAed: 550, overrunBeyondContingencyAed: 0, warrantyHeldAed: 165 });
  assert.deepEqual(p.reservePosition(held, 5500, 5800), { contingencyHeldAed: 550, contingencyUsedAed: 300, contingencyRemainingAed: 250, overrunBeyondContingencyAed: 0, warrantyHeldAed: 165 });
  assert.deepEqual(p.reservePosition(held, 5500, 6200), { contingencyHeldAed: 550, contingencyUsedAed: 550, contingencyRemainingAed: 0, overrunBeyondContingencyAed: 150, warrantyHeldAed: 165 });
});

test('rates and cost lines: AED only, non-negative, required categories, rate book match', () => {
  assert.throws(() => p.normaliseRate({ category: 'LABOUR', unit: 'day', rateAed: 300, currency: 'USD', label: 'Painter' }), /AED/);
  assert.throws(() => p.normaliseRate({ category: 'LABOUR', unit: 'day', rateAed: -1, currency: 'AED', label: 'Painter' }));
  assert.equal(p.normaliseRate({ category: 'LABOUR', unit: 'day', rateAed: 300, currency: 'AED', label: 'Painter' }).rateAed, 300);
  const L = (o) => ({ description: 'x line', qty: 1, unit: 'lot', currency: 'AED', ...o });
  assert.throws(() => p.normaliseCostLines([{ ...L({ category: 'LABOUR', unitCostAed: 1 }), currency: undefined }]), /AED/);
  assert.throws(() => p.normaliseCostLines([L({ category: 'LABOUR', unitCostAed: -5 })]));
  const rates = { painter: { rateId: 'painter', category: 'LABOUR', unit: 'day', rateAed: 300, currency: 'AED', version: 2 } };
  const lines = p.normaliseCostLines([L({ category: 'LABOUR', qty: 10, rateId: 'painter' }), L({ category: 'MATERIALS', unitCostAed: 2000 }), L({ category: 'PREP', unitCostAed: 500 })], rates);
  assert.equal(lines[0].amountAed, 3000); assert.equal(lines[0].rateVersion, 2);
  assert.throws(() => p.normaliseCostLines([L({ category: 'LABOUR', qty: 1, unitCostAed: 250, rateId: 'painter' })], rates), /differs from rate/);
  assert.throws(() => p.normaliseCostLines([L({ category: 'PREP', qty: 1, rateId: 'painter' })], rates), /LABOUR rate/);
  assert.throws(() => p.normaliseCostLines([L({ category: 'LABOUR', qty: 1, rateId: 'missing' })], rates), /not a recorded rate/);
  p.assertRequiredCostLines(lines, 'ROOM', permitsNone);
  assert.throws(() => p.assertRequiredCostLines(lines, 'EXTERIOR_FACADE', permitsNone), /ACCESS/);
  assert.throws(() => p.assertRequiredCostLines(lines.slice(0, 2), 'ROOM', permitsNone), /PREP/);
  assert.throws(() => p.assertRequiredCostLines(lines, 'ROOM', { ...permitsNone, communityNocRequired: true }), /PERMIT/);
});

test('stage gates: deposit on acceptance, progress needs milestone, final needs completion + owner acceptance', () => {
  const base = { status: 'OWNER_APPROVED', quoteVersion: 1, approvedQuoteVersion: 1, payments: {} };
  assert.ok(p.assertStageGate('DEPOSIT', base));
  assert.throws(() => p.assertStageGate('DEPOSIT', { ...base, approvedQuoteVersion: null }), /accepts/);
  const wo = { ...base, status: 'WORK_ORDER_OPEN', payments: { DEPOSIT: { status: 'PAID' } } };
  assert.throws(() => p.assertStageGate('PROGRESS', wo), /progress milestone/);
  assert.ok(p.assertStageGate('PROGRESS', { ...wo, milestones: { PROGRESS: { recordedBy: 'a', photoPaths: ['x'] } } }));
  const done = { ...wo, status: 'COMPLETED', completedAt: 1, payments: { DEPOSIT: { status: 'PAID' }, PROGRESS: { status: 'PAID' } } };
  assert.throws(() => p.assertStageGate('FINAL', done), /owner must accept/);
  assert.throws(() => p.assertStageGate('FINAL', { ...done, completionAcceptance: { acceptedBy: 'o' }, payments: { DEPOSIT: { status: 'PAID' } } }), /PROGRESS payment/);
  assert.ok(p.assertStageGate('FINAL', { ...done, completionAcceptance: { acceptedBy: 'o' } }));
  assert.equal(p.WARRANTY_MONTHS, 12);
});

test('permits are per job; exterior defaults to community NOC and requires its cost', () => {
  assert.equal(p.normalisePermits({}, 'ROOM').communityNocRequired, false);
  const ext = p.normalisePermits({}, 'EXTERIOR_FACADE');
  assert.equal(ext.communityNocRequired, true);
  assert.equal(p.normalisePermits({ communityNocRequired: false }, 'EXTERIOR_FACADE').communityNocRequired, false);
  assert.throws(() => p.buildPaintingQuote({ costSheet: sheet, priceAed: 20000, permits: ext }), /permit\/NOC/);
});

test('measurements validated; download URLs rejected', () => {
  const m = { wallAreaSqm: 120, ceilingAreaSqm: 40, doorsCount: 5, woodworkLinearM: 10, condition: 'fair', coats: 2, paintGrade: 'premium', photoPaths: ['painting/x/1.jpg'] };
  assert.equal(p.normaliseMeasurements(m).paintGrade, 'PREMIUM');
  assert.throws(() => p.normaliseMeasurements({ ...m, photoPaths: ['https://firebasestorage.googleapis.com/x?token=a'] }), /Storage object paths/);
  assert.throws(() => p.normaliseMeasurements({ ...m, wallAreaSqm: 0, ceilingAreaSqm: 0 }), /area/);
});

test('state machine: AI blocked, owner OTP approval, photos, variations re-quote', () => {
  const admin = { kind: 'ADMIN', uid: 'a' }, owner = { kind: 'OWNER', uid: 'o' }, ai = { kind: 'AI', uid: 'x' };
  assert.throws(() => p.assertPaintingTransition('QUOTED', 'OWNER_APPROVED', ai, { otpVerified: true }), /AI/);
  assert.throws(() => p.assertPaintingTransition('QUOTED', 'OWNER_APPROVED', owner, {}), /OTP/);
  assert.throws(() => p.assertPaintingTransition('QUOTED', 'OWNER_APPROVED', admin, { otpVerified: true }), /Only the owner/);
  assert.ok(p.assertPaintingTransition('QUOTED', 'OWNER_APPROVED', owner, { otpVerified: true }));
  assert.throws(() => p.assertPaintingTransition('OWNER_APPROVED', 'WORK_ORDER_OPEN', admin, {}), /Before photos/);
  assert.throws(() => p.assertPaintingTransition('WORK_ORDER_OPEN', 'COMPLETED', admin, {}), /After photos/);
  assert.ok(p.assertPaintingTransition('WORK_ORDER_OPEN', 'QUOTED', admin));
  assert.throws(() => p.assertPaintingTransition('WORK_ORDER_OPEN', 'COMPLETED', owner, { afterPhotos: 1 }), /Owners/);
  assert.ok(p.assertPaintingTransition('COMPLETED', 'WARRANTY_ACTIVE', admin));
});

test('callables enforce App Check, admin MFA, server margin, audit, and are exported', () => {
  const src = readFileSync('functions/paintingProjects.ts', 'utf8');
  const callables = (src.match(/= onCall\(/g) || []).length;
  assert.ok(callables >= 10);
  assert.equal((src.match(/enforceAppCheck: true/g) || []).length, callables, 'every painting callable enforces App Check');
  assert.match(src, /HMAC_SHA256_PAINTING_APPROVAL_V1/);
  assert.match(src, /timingSafeEqual/);
  assert.doesNotMatch(src, /getDownloadURL/);
  assert.match(src, /requirePrivilegedMfaSession/);
  assert.match(src, /buildPaintingQuote\(/);
  assert.match(src, /PAINTING_QUOTE_ISSUED/);
  assert.match(readFileSync('functions/runtime.ts', 'utf8'), /paintingProjects/);
});

test('painting rules lock is generated by prepare:rules and denies browser writes', () => {
  const hardener = readFileSync('scripts/harden-painting-projects-rules.mjs', 'utf8');
  assert.match(hardener, /match \/painting_projects\/\{projectId\}/);
  assert.match(hardener, /allow create, update, delete: if false/);
  assert.match(readFileSync('functions/paintingProjects.ts', 'utf8'), /collection\("system_secrets"\)\.doc\("painting_approval_otps"\)/);
  assert.match(readFileSync('package.json', 'utf8'), /harden:painting-projects && npm run write:production-rules/);
  assert.match(readFileSync('scripts/write-production-firestore-rules.mjs', 'utf8'), /'painting_projects',\n\];/);
});

test('areas: own Storage paths only, summary totals and worst condition', () => {
  const a = p.normaliseAreas([
    { kind: 'UNIT', label: 'Apt 101', floor: '1', unitRef: '101', wallAreaSqm: 90, ceilingAreaSqm: 30, condition: 'FAIR', photoPaths: ['painting-owner-uploads/u1/a.jpg'] },
    { kind: 'FLOOR', label: 'Corridor 1', floor: '1', wallAreaSqm: 60, condition: 'POOR' },
  ], 'painting-owner-uploads/u1/');
  assert.ok(a[0].surfaces.includes('CEILING'));
  assert.deepEqual(p.summariseAreas(a), { areaCount: 2, wallAreaSqm: 150, ceilingAreaSqm: 30, floors: 1, units: 1, worstCondition: 'POOR' });
  for (const bad of ['https://x/y.jpg', 'painting-owner-uploads/u2/a.jpg', 'painting-owner-uploads/u1/../u2/a.jpg', 'painting-owner-uploads/u1/a.jpg?token=1']) {
    assert.throws(() => p.normaliseAreas([{ label: 'x', wallAreaSqm: 1, photoPaths: [bad] }], 'painting-owner-uploads/u1/'));
  }
  assert.throws(() => p.normaliseAreas([{ label: 'x' }], null), /wall or ceiling/);
});

test('itemised lines roll up to cost sheet; owner lines sum exactly to price with no cost data', () => {
  const lines = p.normaliseCostLines([
    { category: 'LABOUR', description: 'Painters', qty: 10, unit: 'day', unitCostAed: 300, currency: 'AED' },
    { category: 'MATERIALS', description: 'Paint', qty: 1, unit: 'lot', unitCostAed: 2000, currency: 'AED' },
    { category: 'PREP', description: 'Filling', qty: 1, unit: 'lot', unitCostAed: 500, currency: 'AED' },
  ]);
  const sheet2 = p.costSheetFromLines(lines);
  assert.equal(sheet2.labourAed, 3000); assert.equal(sheet2.materialsAed, 2000);
  const owner = p.ownerQuoteLines(sheet2, 9999.99);
  assert.equal(Math.round(owner.reduce((s, l) => s + l.amountAed, 0) * 100) / 100, 9999.99);
  assert.ok(owner.every((l) => Object.keys(l).join() === 'category,amountAed'));
  assert.throws(() => p.normaliseCostLines([]), /At least one/);
});

test('billing: fixed 40/30/30, stages sum to price, card refused', () => {
  const plan = p.normaliseBillingPlan({});
  assert.deepEqual(plan, { depositPct: 40, progressPct: 30, finalPct: 30 });
  const s = p.billingSchedule(10000.01, plan);
  assert.equal(Math.round((s.DEPOSIT + s.PROGRESS + s.FINAL) * 100) / 100, 10000.01);
  assert.throws(() => p.normaliseBillingPlan({ depositPct: 80, progressPct: 15 }), /fixed at 40%/);
  assert.throws(() => p.normaliseBillingPlan({ depositPct: 50, progressPct: 20 }), /fixed at 40%/);
  assert.throws(() => p.normaliseBillingPlan({ depositPct: 5 }));
  assert.equal(p.normalisePaymentMethod('cheque'), 'CHEQUE');
  assert.throws(() => p.normalisePaymentMethod('CARD'), /Card payments are off/);
  assert.deepEqual(p.STAGE_GATES.FINAL.requiresPaid, ['DEPOSIT', 'PROGRESS']);
  assert.equal(p.STAGE_GATES.FINAL.milestone, 'COMPLETION_ACCEPTED');
  assert.deepEqual(p.costTracking(10000, 6000, 7000), { approvedPriceAed: 10000, quotedCostAed: 6000, actualCostAed: 7000, varianceAed: 1000, actualMarginPct: 30 });
  assert.throws(() => p.requireIdempotencyKey('short'));
  assert.equal(p.requireIdempotencyKey('abc-12345'), 'abc-12345');
});

test('rules hardener covers invoices, internal quotes, costs and idempotency; storage has owner uploads', () => {
  const h = readFileSync('scripts/harden-painting-projects-rules.mjs', 'utf8');
  for (const m of ['match /invoices/{stage}', 'match /internal_quotes/{quoteId}', 'match /costs/{costId}', 'match /idempotency/{key}', 'match /reserve_ledger/{entryId}', 'match /painting_rates/{rateId}', 'match /history/{entryId}']) assert.ok(h.includes(m), m);
  const fa = readFileSync('functions/paintingFinanceApprover.ts', 'utf8');
  assert.match(fa, /new Set\(\["finance_manager", "finance_controller"\]\)/);
  assert.doesNotMatch(fa, /token\.(admin|isAdmin|superAdmin|super_admin|ceo)\b/);
  assert.match(readFileSync('functions/paintingProjects.ts', 'utf8'), /issuedBy"\) === actor\.uid/);
  const st = readFileSync('storage.rules', 'utf8');
  assert.match(st, /match \/painting-owner-uploads\/\{ownerId\}\/\{allPaths=\*\*\}/);
  assert.match(st, /painting-owner-uploads[\s\S]*?allow update, delete: if false;/);
});

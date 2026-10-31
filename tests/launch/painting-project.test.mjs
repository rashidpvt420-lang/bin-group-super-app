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

test('four scopes and default 35% margin', () => {
  assert.deepEqual([...p.PAINTING_SCOPES], ['ROOM', 'FULL_UNIT', 'BUILDING_COMMON_AREAS', 'EXTERIOR_FACADE']);
  assert.equal(p.DEFAULT_MIN_GROSS_MARGIN_PCT, 35);
});

test('cost sheet totals include contingency and warranty reserve', () => {
  const t = p.costSheetTotals(sheet);
  assert.equal(t.directCostAed, 5500); assert.equal(t.contingencyAed, 550); assert.equal(t.warrantyReserveAed, 165); assert.equal(t.totalCostAed, 6215);
});

test('quote below minimum gross margin is refused; at floor it passes', () => {
  assert.throws(() => p.buildPaintingQuote({ costSheet: sheet, priceAed: 8000, permits: permitsNone }), /below the minimum 35%/);
  const floor = p.minimumPriceFor(6215, 35);
  const q = p.buildPaintingQuote({ costSheet: sheet, priceAed: floor, permits: permitsNone });
  assert.equal(q.billing, 'ONE_TIME'); assert.ok(q.grossMarginPct >= 35 - 0.01);
  assert.throws(() => p.buildPaintingQuote({ costSheet: sheet, priceAed: 9000, minMarginPct: 40, permits: permitsNone }), /below the minimum 40%/);
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

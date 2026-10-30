import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';

let dir; const m = {};
async function load(entry, name) {
  const outfile = join(dir, `${name}.mjs`);
  await build({ entryPoints: [entry], outfile, bundle: true, platform: 'node', format: 'esm', target: 'node22', logLevel: 'silent' });
  return import(pathToFileURL(outfile).href);
}
test.before(async () => {
  dir = mkdtempSync(join(tmpdir(), 'bin-paint-'));
  m.p = await load('src/utils/paintingAddon.ts', 'p');
  m.engine = await load('src/utils/calculateUaeQuote2026.ts', 'engine');
  m.fnEngine = await load('functions/pricing/calculateUaeQuote2026.ts', 'fnengine');
});
test.after(() => rmSync(dir, { recursive: true, force: true }));

const IDS = ['painting_room_refresh', 'painting_full_home', 'painting_building_exterior'];

test('painting tiers are separate-scope-after-visit in every matrix copy and never auto-priced', () => {
  for (const path of ['src/utils/uaePricingMatrix2026.ts', 'functions/pricing/uaePricingMatrix2026.ts', 'packages/shared/src/pricing/uaePricingMatrix2026.ts']) {
    const src = readFileSync(path, 'utf8');
    for (const id of IDS) assert.match(src, new RegExp(`id: '${id}'.*price: 0, unit: 'separate scope after visit'`), `${path} ${id}`);
  }
  for (const id of IDS) {
    assert.equal(m.engine.resolveAddOnAnnualPrice(id), 0);
    assert.equal(m.fnEngine.resolveAddOnAnnualPrice(id), 0);
  }
});

test('onboarding shows EN/AR painting cards with "price after site visit"', () => {
  const src = readFileSync('src/components/onboarding/SystemsDataStep.tsx', 'utf8');
  for (const id of IDS) assert.match(src, new RegExp(`id: '${id}', afterVisit: true`));
  assert.match(src, /Price after site visit/);
  assert.match(src, /السعر بعد زيارة الموقع/);
  assert.match(src, /شهادة عدم ممانعة/);
});

test('room refresh range follows the agreed rates', () => {
  const { estimateRoomRefreshRange } = m.p;
  // 20 m² × 2.7 × 12 = 648 → ±15%
  assert.deepEqual(estimateRoomRefreshRange({ floorAreaSqm: 20 }), { min: 550, max: 750, indicative: true });
  // premium + high ceilings + poor walls: 20 × 2.7 × 20 × 1.25 × 1.15 = 1552.5
  assert.deepEqual(estimateRoomRefreshRange({ floorAreaSqm: 20, finish: 'premium', highCeilings: true, poorWalls: true }), { min: 1300, max: 1800, indicative: true });
  // minimum AED 600 per room
  assert.deepEqual(estimateRoomRefreshRange({ floorAreaSqm: 5, rooms: 2 }), { min: 1000, max: 1400, indicative: true });
  assert.equal(estimateRoomRefreshRange({ floorAreaSqm: 0 }), null);
});

test('workflow: AI never approves; quote, OTP, NOC, photos and warranty are enforced', () => {
  const { paintingTransitionError: e } = m.p;
  const ext = { addonId: 'painting_building_exterior' };
  assert.equal(e('QUOTE_ISSUED', 'OWNER_APPROVED', 'ai', { ...ext, ownerOtpVerified: true }), 'AI_CANNOT_APPROVE');
  assert.equal(e('SITE_VISIT_DONE', 'QUOTE_ISSUED', 'ai', { ...ext, fixedQuoteAed: 9000 }), 'AI_CANNOT_APPROVE');
  assert.equal(e('REQUESTED', 'QUOTE_ISSUED', 'admin', ext), 'INVALID_TRANSITION');
  assert.equal(e('SITE_VISIT_DONE', 'QUOTE_ISSUED', 'admin', ext), 'FIXED_QUOTE_REQUIRED');
  assert.equal(e('SITE_VISIT_DONE', 'QUOTE_ISSUED', 'admin', { ...ext, fixedQuoteAed: 85000 }), null);
  assert.equal(e('QUOTE_ISSUED', 'OWNER_APPROVED', 'admin', { ...ext, ownerOtpVerified: true }), 'ACTOR_NOT_ALLOWED');
  assert.equal(e('QUOTE_ISSUED', 'OWNER_APPROVED', 'owner', ext), 'OWNER_OTP_REQUIRED');
  assert.equal(e('QUOTE_ISSUED', 'OWNER_APPROVED', 'owner', { ...ext, ownerOtpVerified: true }), null);
  assert.equal(e('OWNER_APPROVED', 'SCHEDULED', 'admin', ext), 'NOC_REQUIRED');
  assert.equal(e('OWNER_APPROVED', 'SCHEDULED', 'admin', { addonId: 'painting_full_home' }), null);
  assert.equal(e('NOC_PENDING', 'SCHEDULED', 'admin', ext), 'NOC_REQUIRED');
  assert.equal(e('NOC_PENDING', 'SCHEDULED', 'admin', { ...ext, nocFileId: 'f1' }), null);
  assert.equal(e('SCHEDULED', 'IN_PROGRESS', 'technician', ext), 'BEFORE_PHOTOS_REQUIRED');
  assert.equal(e('IN_PROGRESS', 'COMPLETED', 'technician', { ...ext, afterPhotoIds: [] }), 'AFTER_PHOTOS_REQUIRED');
  assert.equal(e('COMPLETED', 'WARRANTY_ACTIVE', 'admin', ext), 'WARRANTY_REQUIRED');
  assert.equal(e('COMPLETED', 'WARRANTY_ACTIVE', 'admin', { ...ext, warrantyMonths: 24 }), null);
});

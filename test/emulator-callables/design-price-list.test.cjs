'use strict';
// Feature 10: AI redesign quotes are estimates from BIN's configurable price list.
const assert = require('node:assert/strict');
const test = require('node:test');
const { db, lib, createUser, clearFirestore, call, expectHttpsError } = require('./_setup.cjs');
const { adminSetDesignPriceList } = lib('runtimeAll.js');
const pl = lib('designPriceList.js');
const ds = lib('aiDesignStudio.js');
const admin = { uid: 'a1', token: { role: 'admin', email: 'a@example.invalid', email_verified: true, firebase: { sign_in_second_factor: 'totp' } } };
const owner = { uid: 'o1', token: { role: 'owner', email: 'o@example.invalid', email_verified: true } };
const scope = { dimensions: 100, isMetric: false, finishTier: 'Premium', zoneType: 'Living', hasMEP: false, hasStructural: false, isMallEnvironment: false, isNightWork: false, furnitureBudget: 0 };

test.beforeEach(async () => { await clearFirestore(); await createUser('a1', { role: 'admin' }, { email: 'a@example.invalid', emailVerified: true }).catch(() => {}); });

test('defaults reproduce the previous formula and the quote is labelled as an estimate', async () => {
  const q = ds.calculateServerQuote(scope, await pl.loadDesignPriceList());
  // 100 sqft * (180 + 95) + 1800 logistics = 29300; +8% +12%
  assert.equal(q.finalTotal, 29300 + Math.round(29300 * 0.08) + Math.round(29300 * 0.12));
  assert.equal(q.isEstimate, true);
  assert.equal(q.priceListSource, 'BIN_DEFAULT');
  assert.match(q.estimateLabel, /BIN's price list/);
});

test('admin-configured rates drive the quote; invalid config falls back; only admins may set', async () => {
  const rates = { ...pl.DEFAULT_DESIGN_RATES, materialsPerSqft: 200, mobilizationPercent: 20 };
  await expectHttpsError(call(adminSetDesignPriceList, owner, { rates }), 'permission-denied');
  await expectHttpsError(call(adminSetDesignPriceList, admin, { rates: { ...rates, binMarginRate: 5 } }), 'invalid-argument');
  const r = await call(adminSetDesignPriceList, admin, { rates });
  const list = await pl.loadDesignPriceList();
  assert.equal(list.source, 'BIN_CONFIGURED'); assert.equal(list.version, r.version);
  const q = ds.calculateServerQuote(scope, list);
  assert.equal(q.materialsEstimate, 20000); assert.equal(q.mobilizationPercent, 20);
  await db.doc('system_config/design_price_list').set({ rates: { materialsPerSqft: 'x' } });
  assert.equal((await pl.loadDesignPriceList()).source, 'BIN_DEFAULT');
});

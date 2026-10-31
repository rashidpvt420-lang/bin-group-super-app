'use strict';
// AI answers carry sources, cited ids and estimate labels (EN/AR); fallback cites rule guidance; still advisory only.
const assert = require('node:assert/strict');
const test = require('node:test');
const { db, lib, createUser, clearFirestore, call } = require('./_setup.cjs');

const { annotateAiAnswer, buildAiSources, citationPromptBlock } = lib('aiCitations.js');
const { runSovereignAI } = lib('runtimeAll.js');

const data = { pageContext: { rent: { annualRent: 120000, chequesPaid: 3 }, ticket: { status: 'OPEN' } }, fallbackSummary: 'Owner dashboard' };

test('sources are built from page context and always marked not authoritative', () => {
  const sources = buildAiSources(data);
  assert.deepEqual(sources.map((s) => s.id), ['S1', 'S2', 'S3']);
  assert.ok(sources.every((s) => s.authoritative === false));
  const block = citationPromptBlock(sources);
  assert.match(block, /\[S1\]/);
  assert.match(block, /Estimate:/);
});

test('cited figures pass; figures not in a cited source are flagged as estimates', () => {
  const sources = buildAiSources(data);
  const ok = annotateAiAnswer('Annual rent is AED 120,000 [S1].', sources);
  assert.deepEqual(ok.citedSourceIds, ['S1']);
  assert.equal(ok.containsEstimate, false);
  assert.equal(ok.uncited, false);
  const est = annotateAiAnswer('Annual rent is AED 120,000 [S1] and repairs may cost AED 4,500.', sources);
  assert.equal(est.containsEstimate, true);
  assert.deepEqual(est.unsupportedFigures, ['AED 4,500']);
  assert.match(est.labels.en, /estimates/);
  assert.match(est.labels.ar, /تقديرات/);
  const none = annotateAiAnswer('Rent looks fine [S9].', sources);
  assert.equal(none.uncited, true);
  assert.match(none.labels.en, /No source cited/);
  assert.ok(none.labels.ar.length > 0);
});

test('callable fallback returns a rule-guidance citation and stays advisory', async () => {
  await clearFirestore();
  const owner = await createUser('aic_owner', { role: 'owner' });
  await db.doc('users/aic_owner').set({ role: 'owner', status: 'active' }, { merge: true });
  const res = await call(runSovereignAI, owner, { text: 'what is my score', ...data });
  assert.equal(res.advisoryOnly, true);
  assert.equal(res.clientContextAuthoritative, false);
  assert.ok(res.citations);
  assert.ok(res.citations.labels.en && res.citations.labels.ar);
  assert.ok(res.citations.sources.every((s) => s.authoritative === false));
});

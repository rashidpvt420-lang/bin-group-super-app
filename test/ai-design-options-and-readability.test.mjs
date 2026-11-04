// AI Design: owner gets several options to choose from, never sees the raw prompt or raw
// status codes, and labels are readable on dark cards (audit 2026-11-04, Rashid screenshots).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { designStatusLabel, honestDesignStatus, DESIGN_STATUS_LABELS } from '../src/lib/designStatusLabels.ts';

const read = (p) => readFile(new URL(`../${p}`, import.meta.url), 'utf8');

function contrast(hexA, hexB) {
  const lum = (hex) => {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const [x, y] = [lum(hexA), lum(hexB)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
}

test('server renders multiple options in parallel and keeps only real successes', async () => {
  const src = await read('functions/aiDesignStudio.ts');
  const m = src.match(/DESIGN_OPTION_DIRECTIONS = \[([\s\S]*?)\] as const/);
  assert.ok(m, 'option directions missing');
  const count = (m[1].match(/id: "option_/g) || []).length;
  assert.ok(count >= 2 && count <= 4, `expected 2-4 options, got ${count}`);
  assert.match(src, /Promise\.allSettled\(DESIGN_OPTION_DIRECTIONS\.map/);
  assert.match(src, /if \(renders\.length === 0\)[\s\S]{0,200}throw/);
  assert.match(src, /generatedImagePaths: generatedPaths/);
  assert.match(src, /concepts,\n\s+conceptCount: concepts\.length/);
});

test('internal provider prompt never goes back to the client', async () => {
  const src = await read('functions/aiDesignStudio.ts');
  assert.match(src, /\.\.\.publicConcept\(option\)/);
  assert.match(src, /\.\.\.publicConcept\(concept\)/);
  const page = await read('src/pages/DesignRequestDetailPage.tsx');
  assert.ok(!page.includes('conceptPrompt'), 'raw prompt must not render on the owner page');
});

test('owner page shows an option picker and honest not-ready state', async () => {
  const page = await read('src/pages/DesignRequestDetailPage.tsx');
  assert.match(page, /design-option-picker/);
  assert.match(page, /generatedImages\.map\(\(url, index\)/);
  assert.match(page, /Before \(your photo\)/);
  assert.ok(!page.includes("generatedImages[0] || referenceImages[0]"), 'must not pass the reference photo off as the design');
  assert.match(page, /honestDesignStatus\(request\.status, generatedImages\.length\)/);
  assert.ok(!page.includes(".replace(/_/g, ' ')"), 'raw enum status must not render');
  assert.ok(!page.includes('color="textSecondary"'), 'dark-card labels must use explicit high-contrast colour');
  assert.ok(!page.includes('Owner request can proceed directly to payment and admin execution.'));
});

test('labels meet WCAG AA on the dark cards', async () => {
  const page = await read('src/pages/DesignRequestDetailPage.tsx');
  const label = page.match(/const LABEL_TEXT = '(#[0-9A-Fa-f]{6})'/)[1];
  const body = page.match(/const BODY_TEXT = '(#[0-9A-Fa-f]{6})'/)[1];
  for (const bg of ['#161618', '#0F172A', '#000000']) {
    assert.ok(contrast(label, bg) >= 4.5, `${label} on ${bg}`);
    assert.ok(contrast(body, bg) >= 4.5, `${body} on ${bg}`);
  }
});

test('status labels are plain English and Arabic, never raw codes', () => {
  assert.equal(designStatusLabel('AI_CONCEPT_READY'), 'Design options ready - pick one');
  assert.match(designStatusLabel('AI_CONCEPT_READY', 'ar'), /[\u0600-\u06FF]/);
  assert.equal(designStatusLabel('WAITING_PAYMENT'), 'Waiting for deposit');
  assert.equal(designStatusLabel('SOMETHING_NEW'), 'Something new');
  for (const [code, l] of Object.entries(DESIGN_STATUS_LABELS)) {
    assert.ok(!l.en.includes('_') && l.en !== code, code);
    assert.match(l.ar, /[\u0600-\u06FF]/, code);
  }
  assert.equal(honestDesignStatus('AI_CONCEPT_READY', 0), 'IMAGES_NOT_READY');
  assert.equal(honestDesignStatus('AI_CONCEPT_READY', 3), 'AI_CONCEPT_READY');
  assert.equal(designStatusLabel(honestDesignStatus('AI_CONCEPT_READY', 0)), 'Design images not ready');
});

// Technician Proof Readiness: the per-job "Open job" button had no onClick (it only worked by event
// bubbling to the Paper) and gold #C9A646 / #059669 / #DC2626 text was below 4.5:1 on white.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const page = readFileSync(new URL('../../src/technician/pages/TechnicianProofReadinessPage.tsx', import.meta.url), 'utf8');

function contrast(fgHex, bgHex = '#FFFFFF') {
  const lum = (hex) => {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
      .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const [a, b] = [lum(fgHex), lum(bgHex)].sort((x, y) => y - x);
  return (a + 0.05) / (b + 0.05);
}

function paletteOf(source, name) {
  const start = source.indexOf(`const ${name} = {`);
  assert.ok(start >= 0, `${name} palette defined`);
  const body = source.slice(start, source.indexOf('}', start));
  return Object.fromEntries([...body.matchAll(/(\w+): '(#[0-9A-Fa-f]{6})'/g)].map((m) => [m[1], m[2]]));
}

test('proof readiness text tones are >= 4.5:1 on white', () => {
  const line = page.slice(page.indexOf('const ui = {'), page.indexOf('};', page.indexOf('const ui = {')));
  const tones = Object.fromEntries([...line.matchAll(/(\w+): '(#[0-9A-Fa-f]{6})'/g)].map((m) => [m[1], m[2]]));
  for (const key of ['ink', 'muted', 'goldText', 'green', 'red', 'blue']) {
    assert.ok(tones[key], `${key} defined`);
    assert.ok(contrast(tones[key]) >= 4.5, `${key} ${tones[key]} = ${contrast(tones[key]).toFixed(2)}:1`);
  }
});

test('gold is used only for bars/borders, never as text colour', () => {
  assert.ok(!/color: (?:[^,}]*\? )?ui\.gold[,\s}]/.test(page.replace(/bgcolor: [^,}]+/g, '')), 'no ui.gold text');
  assert.ok(page.includes("color: missingBefore ? ui.goldText : ui.green"));
});

test('Open job button is explicitly wired to the job and does not double-fire the card click', () => {
  const btn = page.slice(page.indexOf('data-testid="technician-proof-open-job"'));
  assert.ok(btn.length > 0, 'button has a test id');
  const tag = btn.slice(0, btn.indexOf('>Open job<'));
  assert.ok(tag.includes('onClick={(event) => { event.stopPropagation(); navigate(`/technician/job/${job.id}`); }}'));
});

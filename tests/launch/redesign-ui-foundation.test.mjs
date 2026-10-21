// R1 of the 2026-10-21 dashboard redesign: shared tokens and components.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const tokens = await readFile('src/theme/uiTokens.ts', 'utf8');
const hex = (name) => { const m = tokens.match(new RegExp(`\\b${name}: '(#[0-9A-Fa-f]{6})'`)); assert.ok(m, `token ${name}`); return m[1]; };
const lum = (h) => { const c = h.slice(1).match(/../g).map((x) => parseInt(x, 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };

test('text tokens pass WCAG AA on their backgrounds', () => {
  const pairs = [['ink', 'cream'], ['ink', 'card'], ['muted', 'cream'], ['muted', 'card'], ['goldText', 'cream'], ['goldText', 'card'], ['goldOnInk', 'ink'], ['okText', 'okBg'], ['warnText', 'warnBg'], ['badText', 'badBg'], ['infoText', 'infoBg'], ['ink', 'gold']];
  for (const [fg, bg] of pairs) assert.ok(ratio(hex(fg), hex(bg)) >= 4.5, `${fg} on ${bg} = ${ratio(hex(fg), hex(bg)).toFixed(2)}`);
});

test('touch target is at least 48px and type uses only 500/700/800', () => {
  assert.match(tokens, /touchTarget: 48/);
  for (const w of tokens.matchAll(/fontWeight: (\d+)/g)) assert.ok(['500', '700', '800'].includes(w[1]), `weight ${w[1]}`);
});

test('shared components exist and avoid fake zeros, overflow and 950 weight', async () => {
  for (const f of ['AppHeader', 'UiCard', 'StatTile', 'StatusChip', 'ListRow', 'UiButton', 'StateViews']) {
    const src = await readFile(`src/components/ui/${f}.tsx`, 'utf8');
    assert.doesNotMatch(src, /fontWeight: ?(900|950)/, `${f} uses heavy weight`);
    assert.doesNotMatch(src, /#667085/, `${f} uses low-contrast grey`);
  }
  const stat = await readFile('src/components/ui/StatTile.tsx', 'utf8');
  assert.match(stat, /value === null/);
  const row = await readFile('src/components/ui/ListRow.tsx', 'utf8');
  assert.match(row, /minWidth: 0/);
  assert.match(row, /isRTL \? ChevronLeft : ChevronRight/);
});

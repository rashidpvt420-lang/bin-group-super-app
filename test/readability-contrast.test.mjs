// Guards the 2026-10-14 readability audit fixes: gold text and the shared header must stay AA-readable on white shells.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const lum = (hex) => {
  const c = hex.replace('#', '').match(/../g).map((x) => parseInt(x, 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };
const token = (name) => read('src/theme/binGroupTheme.ts').match(new RegExp(`\\b${name}: '(#[0-9A-Fa-f]{6})'`))[1];

test('goldText token passes WCAG AA on canvas, softCanvas and cream', () => {
  for (const bg of [token('canvas'), token('softCanvas'), '#FAF5E7', '#F7F7F4']) assert.ok(ratio(token('goldText'), bg) >= 4.5, `${token('goldText')} on ${bg} = ${ratio(token('goldText'), bg).toFixed(2)}`);
});

test('shared BIN GROUP header uses no white or sub-12px text on the white shell', () => {
  const src = read('src/components/SovereignHeader.tsx').split('const BinGroupHeader')[1].split('export default')[0];
  assert.doesNotMatch(src, /color: '#fff'/i);
  assert.doesNotMatch(src, /fontSize: (?:[0-9]|1[01])\b,/);
});

test('notification bell is visible on white headers and has an accessible name', () => {
  const src = read('src/components/NotificationBell.tsx');
  assert.doesNotMatch(src, /color="rgba\(255,255,255,0\.5\)"/);
  assert.match(src, /<IconButton onClick=\{handleOpen\} aria-label=/);
});

test('owner, broker and technician pages do not set text in raw gold on light surfaces without a dark fill', () => {
  const offenders = [];
  for (const dir of ['src/owner', 'src/broker', 'src/technician']) {
    for (const f of fs.readdirSync(new URL(`../${dir}`, import.meta.url), { recursive: true })) {
      if (!String(f).endsWith('.tsx')) continue;
      const lines = read(`${dir}/${f}`).split('\n');
      lines.forEach((l, i) => {
        if (!/(^|[^a-zA-Z])color: ?binThemeTokens\.(goldHover|gold)\b/.test(l)) return;
        const ctx = lines.slice(Math.max(0, i - 3), i + 4).join('\n');
        if (/bgcolor: ?(binThemeTokens\.(black|darkBlue|graphite|gold|goldHover)|'#[0-3]|'rgba\(0|'#111|'#0)|contained|linear-gradient\(135deg, ?\$\{binThemeTokens\.(black|gold)/i.test(ctx)) return;
        offenders.push(`${dir}/${f}:${i + 1}`);
      });
    }
  }
  assert.deepEqual(offenders, []);
});

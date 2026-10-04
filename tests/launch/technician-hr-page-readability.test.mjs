// Technician HR (/technician/hr): the page used a dark-theme palette inside the white shell (white
// "Document Type" label, white-alpha captions), and the scoped ESS stylesheet forced every caption
// and overline to #B8932F (2.9:1 on white).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const page = readFileSync(new URL('../../src/technician/pages/TechnicianHRPageV2.tsx', import.meta.url), 'utf8');
const css = readFileSync(new URL('../../src/ess-white-platinum.css', import.meta.url), 'utf8');

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

test('HR palette is >= 4.5:1 on white and on the soft surface', () => {
  const palette = paletteOf(page, 'HR_READABLE');
  for (const key of ['ink', 'muted', 'gold', 'amber', 'green', 'red']) {
    assert.ok(palette[key], `${key} defined`);
    assert.ok(contrast(palette[key]) >= 4.5, `${key} on white ${contrast(palette[key]).toFixed(2)}:1`);
    assert.ok(contrast(palette[key], palette.soft) >= 4.5, `${key} on soft ${contrast(palette[key], palette.soft).toFixed(2)}:1`);
  }
});

test('HR page has no dark-theme text', () => {
  assert.ok(!/[^a-zA-Z]color: '#(?:fff|FFF|ffffff|FFFFFF)'/.test(page), 'no white text (white backgrounds are fine)');
  assert.ok(!/[^a-zA-Z]color: 'rgba\(255,\s*255,\s*255/.test(page), 'no white-alpha text');
  assert.ok(!page.includes('rgba(15,23,42') && !page.includes('rgba(15, 23, 42'), 'no navy panels');
  assert.ok(!/[^a-zA-Z]color: binThemeTokens\.gold(?:Hover)?[,\s}]/.test(page), 'no low-contrast gold text');
});

test('ESS stylesheet captions/overlines use the readable gold', () => {
  const rule = css.slice(css.indexOf('.MuiTypography-overline'), css.indexOf('}', css.indexOf('.MuiTypography-overline')));
  assert.ok(rule.includes('color: #7A5C12 !important'));
  assert.ok(!/color: #B8932F/i.test(css), 'no 2.9:1 caption colour');
  assert.ok(contrast('#7A5C12') >= 4.5 && contrast('#7A5C12', '#F8F9FB') >= 4.5);
});

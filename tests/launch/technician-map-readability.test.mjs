// Technician white shell: the navigation page was written for the dark theme - white headings,
// rgba(255,255,255,.3-.6) secondary text, a #0f172a preview panel whose heading the shell forced to
// dark ink (1.01:1) and a white-on-white JOB DETAILS button.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const page = readFileSync(new URL('../../src/technician/pages/TechnicianMapPage.tsx', import.meta.url), 'utf8');

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

test('map text palette is >= 4.5:1 on white and on the light preview backing', () => {
  const palette = paletteOf(page, 'MAP_READABLE');
  for (const key of ['ink', 'muted', 'gold', 'green', 'red']) {
    assert.ok(palette[key], `${key} defined`);
    assert.ok(contrast(palette[key]) >= 4.5, `${key} on white ${contrast(palette[key]).toFixed(2)}:1`);
    assert.ok(contrast(palette[key], '#EEF2F6') >= 4.5, `${key} on preview ${contrast(palette[key], '#EEF2F6').toFixed(2)}:1`);
  }
});

test('map page has no dark-theme text or panels', () => {
  assert.ok(!page.includes('color="#FFF"'), 'no white Typography');
  assert.ok(!/[^a-zA-Z]color: 'rgba\(255,\s*255,\s*255/.test(page), 'no white-alpha text');
  assert.ok(!page.includes("bgcolor: '#0f172a'"), 'no navy preview panel');
  assert.ok(!page.includes("bgcolor: 'rgba(22,22,24"), 'no dark job cards');
  assert.ok(!page.includes("color: '#4ade80'") && !page.includes("color: locationStale ? '#f87171' : '#4ade80'"), 'GPS chips readable');
  const textOnly = page.split('\n').filter((line) => !line.includes('<CircularProgress')).join('\n');
  assert.ok(!/[^a-zA-Z]color: binThemeTokens\.gold[,\s}]/.test(textOnly), 'no 2.3:1 gold text (spinner and gold backgrounds are fine)');
});

test('preview panel and JOB DETAILS button are readable and wired', () => {
  assert.ok(page.includes('data-testid="technician-map-preview"'));
  assert.ok(page.includes("bgcolor: 'rgba(255,255,255,0.94)'"), 'text sits on a white backing over the map image');
  assert.ok(page.includes("onClick={() => navigate(`/technician/job/${job.id}`)} startIcon={<Info size={18} />} sx={{ borderColor: '#D0D5DD', color: MAP_READABLE.ink"));
  assert.ok(page.includes('onClick={() => openMap(job)}'), 'Google Maps buttons stay wired');
  assert.ok(page.indexOf('const MAP_READABLE') > page.lastIndexOf('\nimport '), 'palette declared after imports');
});

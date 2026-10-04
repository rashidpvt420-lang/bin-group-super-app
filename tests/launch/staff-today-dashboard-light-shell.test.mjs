// Technician advanced dashboard (/technician/dashboard/full): the embedded StaffTodayDashboard was
// written for a dark page (#0f172a root, #1e293b cards, white text). Inside the white technician
// shell the text was forced dark on the navy root (1.01:1) and #94a3b8 secondary text was 2.6:1.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const card = readFileSync(new URL('../../src/components/staff/StaffTodayDashboard.tsx', import.meta.url), 'utf8');

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

test('staff today palette is >= 4.5:1 on white and on the soft panel', () => {
  const palette = paletteOf(card.replaceAll('"', "'"), 'STAFF_TODAY_READABLE');
  for (const key of ['ink', 'muted']) {
    assert.ok(contrast(palette[key]) >= 4.5, `${key} on white ${contrast(palette[key]).toFixed(2)}:1`);
    assert.ok(contrast(palette[key], palette.soft) >= 4.5, `${key} on soft ${contrast(palette[key], palette.soft).toFixed(2)}:1`);
  }
});

test('no dark-page surfaces or slate-400 text remain', () => {
  for (const old of ['bgcolor: "#0f172a"', 'bgcolor: "#1e293b"', 'color: "#94a3b8"', 'color: "#f8fafc"', '#1e293b 0%', 'minHeight: "100vh"']) {
    assert.ok(!card.includes(old), `removed ${old}`);
  }
  assert.ok(card.includes('data-testid="staff-today-dashboard"'));
  assert.ok(contrast('#FFFFFF', '#1D4ED8') >= 4.5, 'voice button and avatar: white on #1D4ED8');
  assert.ok(card.includes('sx={{ bgcolor: "#1D4ED8", color: "#FFFFFF" }}'));
});

// Guards the 2026-10-14 readability audit fixes: gold text and the shared header must stay AA-readable on white shells.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';

// Load every tracked source line in one literal git call (no dynamic fs paths).
const FILES = new Map();
for (const row of execFileSync('git', ['grep', '-I', '-n', '--no-color', '-e', '', '--', 'src', 'apps/admin-panel/src/App.tsx'], { cwd: new URL('..', import.meta.url), encoding: 'utf8', maxBuffer: 512 * 1024 * 1024 }).split('\n')) {
  const m = row.match(/^([^:]+):(\d+):(.*)$/);
  if (!m) continue;
  if (!FILES.has(m[1])) FILES.set(m[1], []);
  FILES.get(m[1])[Number(m[2]) - 1] = m[3];
}
const read = (p) => { assert.ok(FILES.has(p), `missing ${p}`); return Array.from(FILES.get(p), (l) => l ?? '').join('\n'); };
const filesUnder = (dir) => [...FILES.keys()].filter((f) => f.startsWith(`${dir}/`) && f.endsWith('.tsx'));
const lum = (hex) => {
  const c = hex.replace('#', '').match(/../g).map((x) => parseInt(x, 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };
const TOKENS = Object.fromEntries([...read('src/theme/binGroupTheme.ts').matchAll(/\b(\w+): '(#[0-9A-Fa-f]{6})'/g)].map((m) => [m[1], m[2]]).reverse());
const token = (name) => { assert.ok(TOKENS[name], `token ${name}`); return TOKENS[name]; };

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
    for (const file of filesUnder(dir)) {
      const f = file.slice(dir.length + 1);
      const lines = read(file).split('\n');
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

test('status tone map: every text colour passes AA on white and on its fill', () => {
  const src = read('src/theme/statusColors.ts');
  const tones = [...src.matchAll(/(\w+): \{ text: '(#[0-9A-F]{6})', fill: '(#[0-9A-F]{6})'/g)];
  assert.equal(tones.length, 6);
  for (const [, name, text, fill] of tones) {
    assert.ok(ratio(text, '#FFFFFF') >= 4.5, `${name} on white`);
    assert.ok(ratio(text, fill) >= 4.5, `${name} on fill ${ratio(text, fill).toFixed(2)}`);
  }
});

test('status labels: raw codes become readable words', async () => {
  const ts = read('src/theme/statusColors.ts');
  const { transform } = await import('esbuild').catch(() => ({}));
  if (!transform) return; // esbuild ships with vite; skip if absent
  const { code } = await transform(ts, { loader: 'ts', format: 'esm' });
  const mod = await import(`data:text/javascript,${encodeURIComponent(code)}`);
  assert.equal(mod.formatStatusLabel('REFERENCE_IMAGE_REQUIRED'), 'Reference image required');
  assert.equal(mod.formatStatusLabel('PENDING_TRIGGER'), 'Waiting to send');
  assert.equal(mod.formatStatusLabel('CALL_FIRST'), 'Call before visiting');
  assert.equal(mod.formatStatusLabel('maintenance_evidence_standard'), 'Maintenance evidence standard');
  assert.equal(mod.formatStatusLabel('In Review'), 'In review');
  assert.equal(mod.statusTone('PENDING_UPLOAD'), 'danger');
  assert.equal(mod.statusTone('Done'), 'success');
  assert.equal(mod.statusTone('In Review'), 'warning');
  assert.equal(mod.chipTextColor('#4ade80'), '#166534');
});

test('admin command center shows no developer field names and no light-on-white gold', () => {
  const src = read('src/admin/AdminTerminal.tsx');
  for (const raw of ["'users.role=", "'maintenanceTickets.status'", "'payment_transactions.verificationState'", "verify-route-consolidation.mjs", "'#E5C86B'", "'#FDE68A'", "label=\"single command center\""]) assert.ok(!src.includes(raw), raw);
  const shell = read('apps/admin-panel/src/App.tsx');
  assert.doesNotMatch(shell, /fontSize: '0\.6rem', fontWeight: 700, textTransform: 'uppercase' \}\}>\{\(?user\?\.role/);
});

test('textOnDarkMuted passes AA on the dark tenant canvases', () => {
  for (const bg of ['#101729', '#0E121A', '#15171C', '#161B24', '#181F2D', '#1F2937', '#111827']) assert.ok(ratio(token('textOnDarkMuted'), bg) >= 4.5, `${token('textOnDarkMuted')} on ${bg}`);
});

test('dark tenant pages use no sub-AA grey or low-alpha white text', () => {
  const light = new Set(['TenantSimpleDashboardPage.tsx', 'TenantDashboardLightPage.tsx', 'TenantScheduledServicePage.tsx', 'TenantMarketplacePage.tsx', 'TenantHomeDiscoveryWave2Page.tsx']);
  const off = [];
  for (const file of filesUnder('src/tenant/pages')) {
    const f = file.slice('src/tenant/pages/'.length);
    if (f.includes('/') || light.has(f)) continue;
    read(`src/tenant/pages/${f}`).split('\n').forEach((l, i) => {
      for (const m of l.matchAll(/(?<![a-zA-Z])color: ?'rgba\(255, ?255, ?255, ?0?\.(\d+)\)'/g)) if (Number(`0.${m[1]}`) < 0.7) off.push(`${f}:${i + 1}`);
      if (/(?<![a-zA-Z])color: ?(binThemeTokens\.textSecondary|'#6[bB]7280')/.test(l)) off.push(`${f}:${i + 1} textSecondary`);
      if (l.includes('<Chip') && /(?<![a-zA-Z])color: ?'#(fff|FFF|ffffff|FFFFFF)'/.test(l)) off.push(`${f}:${i + 1} white chip text`);
      if (/bgcolor: ?(binThemeTokens\.textOnDarkMuted|'#A3A9B5')/.test(l)) off.push(`${f}:${i + 1} text token used as a fill`);
    });
  }
  assert.deepEqual(off, []);
});

test('phone header overflow menu: accessible trigger, 480px breakpoint, RTL-aware, used by every portal header', () => {
  const menu = read('src/components/PortalHeaderMenu.tsx');
  assert.match(menu, /\(max-width:480px\)/);
  for (const a of ['aria-haspopup="menu"', 'aria-expanded=', 'aria-controls=', "aria-label={isRTL ?"]) assert.ok(menu.includes(a), a);
  assert.match(menu, /const side = isRTL \? 'left' : 'right'/);
  assert.match(menu, /<Menu\b/); // MUI Menu = arrow keys, Escape, focus return
  for (const app of ['src/tenant/TenantApp.tsx', 'src/owner/OwnerApp.tsx', 'src/broker/BrokerApp.tsx', 'src/technician/TechnicianApp.tsx']) {
    const src = read(app);
    assert.match(src, /usePhoneHeader\(\)/, app);
    assert.match(src, /isPhoneHeader \? \(/, app);
    assert.match(src, /<PortalSessionControls role=/, `${app} keeps desktop controls`);
  }
});

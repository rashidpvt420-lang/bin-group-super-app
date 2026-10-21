/**
 * signed-in-visual-audit.spec.ts  (audit 2026-10-21 P1-9)
 * Read-only visual pass of the signed-in portals at phone widths.
 * For each role route it saves a full-page screenshot and checks:
 *  - no text whose computed colour is near-white on a near-white background
 *    (the white-on-white class of bug, P0-3), measured as WCAG contrast < 3:1;
 *  - the floating Back control does not intersect the portal header (P0-1).
 * Findings are attached as JSON; the test fails only on contrast < 1.5:1
 * (invisible text) or a header overlap, so it is a gate on unreadable UI, not
 * on every design nit.
 */
import { expect, test, type Page } from '@playwright/test';
import { attachAuthenticatedAppCheckMonitor } from './helpers/appCheckDebug';
import { loginMainRole } from './helpers/profileReadiness';

type Role = 'owner' | 'tenant' | 'technician' | 'broker';

const ROLES: Array<{ role: Role; email?: string; password?: string; routes: string[] }> = [
  { role: 'owner', email: process.env.E2E_OWNER_MAILBOX_EMAIL || process.env.E2E_OWNER_EMAIL, password: process.env.E2E_OWNER_PASSWORD,
    routes: ['/owner/dashboard', '/owner/dashboard/full', '/owner/tickets', '/owner/complaint', '/owner/activation', '/owner/units', '/owner/find-room-rent', '/owner/design-studio'] },
  { role: 'tenant', email: process.env.E2E_TENANT_EMAIL, password: process.env.E2E_TENANT_PASSWORD,
    routes: ['/tenant/dashboard', '/tenant/dashboard/full', '/tenant/unit', '/tenant/payments', '/tenant/renewals', '/tenant/design-studio'] },
  { role: 'technician', email: process.env.E2E_TECHNICIAN_EMAIL, password: process.env.E2E_TECHNICIAN_PASSWORD,
    routes: ['/technician/dashboard', '/technician/map', '/technician/hr', '/technician/profile'] },
  { role: 'broker', email: process.env.E2E_BROKER_EMAIL, password: process.env.E2E_BROKER_PASSWORD,
    routes: ['/broker/dashboard', '/broker/listings'] },
];

const WIDTHS = [375, 390];

async function scan(page: Page) {
  return page.evaluate(() => {
    const parse = (c: string) => { const m = c.match(/rgba?\(([^)]+)\)/); if (!m) return null; const p = m[1].split(',').map((x) => parseFloat(x)); return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 }; };
    const lum = (c: { r: number; g: number; b: number }) => { const f = (v: number) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b); };
    const bgOf = (el: Element | null) => { while (el) { const c = parse(getComputedStyle(el).backgroundColor); if (c && c.a > 0.5) return c; if (getComputedStyle(el).backgroundImage !== 'none') return null; el = el.parentElement; } return { r: 255, g: 255, b: 255, a: 1 }; };
    const out: Array<{ text: string; ratio: number; fg: string; tag: string }> = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let n: Node | null;
    while ((n = walker.nextNode())) {
      const text = (n.textContent || '').trim(); if (!text) continue;
      const el = n.parentElement; if (!el) continue;
      const cs = getComputedStyle(el); const rect = el.getBoundingClientRect();
      if (cs.visibility === 'hidden' || cs.display === 'none' || Number(cs.opacity) < 0.1 || rect.width === 0 || rect.height === 0) continue;
      const fg = parse(cs.color); const bg = bgOf(el); if (!fg || !bg) continue;
      const [a, b] = [lum(fg), lum(bg)].sort((x, y) => y - x); const ratio = (a + 0.05) / (b + 0.05);
      if (ratio < 3) out.push({ text: text.slice(0, 60), ratio: Math.round(ratio * 100) / 100, fg: cs.color, tag: el.tagName });
    }
    const header = document.querySelector('header, .MuiAppBar-root');
    const back = Array.from(document.querySelectorAll('button')).find((b) => getComputedStyle(b).position === 'fixed' && /back|رجوع/i.test(b.textContent || ''));
    let overlap = false;
    if (header && back) { const h = header.getBoundingClientRect(); const r = back.getBoundingClientRect(); overlap = !(r.right < h.left || r.left > h.right || r.bottom < h.top || r.top > h.bottom); }
    return { lowContrast: out, overlap };
  });
}

for (const cfg of ROLES) {
  test.describe(`${cfg.role} signed-in visual audit`, () => {
    test.describe.configure({ mode: 'serial' });
    test(`${cfg.role}: screenshots, contrast and header overlap at 375/390px`, async ({ browser }, testInfo) => {
      test.skip(!cfg.email || !cfg.password, `missing E2E ${cfg.role} credentials`);
      test.setTimeout(240_000);
      const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
      const page = await context.newPage();
      await attachAuthenticatedAppCheckMonitor(page);
      await loginMainRole(page, cfg.role, cfg.email!, cfg.password!);
      const findings: Record<string, unknown> = {};
      const hard: string[] = [];
      for (const width of WIDTHS) {
        await page.setViewportSize({ width, height: 844 });
        for (const route of cfg.routes) {
          await page.goto(route, { waitUntil: 'domcontentloaded' });
          await page.waitForTimeout(2500);
          const key = `${route}@${width}`;
          await page.screenshot({ path: testInfo.outputPath(`${cfg.role}${route.replace(/\//g, '_')}-${width}.png`), fullPage: true });
          const r = await scan(page);
          findings[key] = r;
          for (const f of r.lowContrast) if (f.ratio < 1.5) hard.push(`${key}: invisible text "${f.text}" (${f.ratio}:1)`);
          if (r.overlap) hard.push(`${key}: floating Back overlaps the header`);
        }
      }
      await testInfo.attach(`${cfg.role}-visual-findings.json`, { body: JSON.stringify(findings, null, 2), contentType: 'application/json' });
      await context.close();
      expect(hard, hard.join('\n')).toEqual([]);
    });
  });
}

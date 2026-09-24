import { expect, test } from '@playwright/test';
import {
  assertNoPageLevelHorizontalOverflow,
  auditInteractiveControls,
} from './helpers/interactiveControlAudit';

const PUBLIC_CONTROL_ROUTES = [
  '/',
  '/login',
  '/onboarding',
  '/request-demo',
  '/support',
] as const;

test.describe('Phase 3 cross-platform public control shell', () => {
  for (const route of PUBLIC_CONTROL_ROUTES) {
    test(`${route} controls are usable on the configured desktop/mobile browser surface`, async ({ page }, testInfo) => {
      await page.goto(route, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(300);

      const project = testInfo.project.name;
      await auditInteractiveControls(page, `${project} ${route} English`);
      await assertNoPageLevelHorizontalOverflow(page, `${project} ${route} English`);

      await page.evaluate(() => localStorage.setItem('bin_language', 'ar'));
      await page.reload({ waitUntil: 'domcontentloaded' });

      await expect.poll(async () => page.evaluate(() => ({
        dir: document.documentElement.dir,
        lang: document.documentElement.lang,
      })), {
        message: `${project} ${route}: Arabic mode must expose RTL document semantics`,
      }).toEqual({ dir: 'rtl', lang: 'ar' });

      await auditInteractiveControls(page, `${project} ${route} Arabic RTL`);
      await assertNoPageLevelHorizontalOverflow(page, `${project} ${route} Arabic RTL`);
    });
  }
});

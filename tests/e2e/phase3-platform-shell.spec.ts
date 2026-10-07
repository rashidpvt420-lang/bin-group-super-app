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


test.describe('Phase 1 Sovereign AI launcher interaction regression', () => {
  test('tap/click, keyboard, drag and responsive drawer behavior stay stable', async ({ page }, testInfo) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });

    const launcher = page.getByTestId('sovereign-ai-open');
    await expect(launcher).toBeVisible();

    const isMobile = testInfo.project.name !== 'chromium-desktop';
    const drawer = page.getByTestId(isMobile ? 'sovereign-ai-mobile-drawer' : 'sovereign-ai-desktop-drawer');

    const openWithTouch = async () => {
      const box = await launcher.boundingBox();
      expect(box).not.toBeNull();
      const x = (box?.x || 0) + (box?.width || 56) / 2;
      const y = (box?.y || 0) + (box?.height || 56) / 2;
      await launcher.dispatchEvent('pointerdown', { pointerId: 31, pointerType: 'touch', isPrimary: true, clientX: x, clientY: y });
      await launcher.dispatchEvent('pointerup', { pointerId: 31, pointerType: 'touch', isPrimary: true, clientX: x, clientY: y });
      // A real touch activation synthesizes click after pointerup. Dispatch it
      // explicitly so WebKit actionability heuristics cannot hide the app contract.
      await launcher.dispatchEvent('click');
    };

    if (isMobile) await openWithTouch();
    else await launcher.click();
    await expect(drawer).toBeVisible();

    const message = `phase-1-send-${testInfo.project.name}`;
    const input = page.getByTestId('sovereign-ai-input');
    await input.fill(message);
    const send = page.getByTestId('sovereign-ai-send');
    if (isMobile) await send.tap({ force: true });
    else await send.click();
    await expect(drawer).toBeVisible();
    await expect(drawer.getByText(message, { exact: true })).toBeVisible();
    await expect(drawer.getByText(/LOCAL GUIDANCE — NOT LIVE AI OR AUTHORITATIVE/)).toBeVisible();

    const close = page.getByTestId('sovereign-ai-close');
    if (isMobile) await close.tap({ force: true });
    else await close.click();
    await expect(drawer).toBeHidden();

    if (!isMobile) {
      await launcher.focus();
      await page.keyboard.press('Enter');
      await expect(drawer).toBeVisible();
      await close.click();
      await expect(drawer).toBeHidden();

      await launcher.focus();
      await page.keyboard.press('Space');
      await expect(drawer).toBeVisible();
      await close.click();
      await expect(drawer).toBeHidden();
    }

    const before = await launcher.boundingBox();
    expect(before).not.toBeNull();

    if (isMobile) {
      const startX = (before?.x || 0) + (before?.width || 56) / 2;
      const startY = (before?.y || 0) + (before?.height || 56) / 2;
      await launcher.dispatchEvent('pointerdown', { pointerId: 41, pointerType: 'touch', isPrimary: true, clientX: startX, clientY: startY });
      await launcher.dispatchEvent('pointermove', { pointerId: 41, pointerType: 'touch', isPrimary: true, clientX: startX - 36, clientY: startY - 48 });
      await launcher.dispatchEvent('pointerup', { pointerId: 41, pointerType: 'touch', isPrimary: true, clientX: startX - 36, clientY: startY - 48 });
    } else {
      const startX = (before?.x || 0) + (before?.width || 56) / 2;
      const startY = (before?.y || 0) + (before?.height || 56) / 2;
      await page.mouse.move(startX, startY);
      await page.mouse.down();
      await page.mouse.move(startX - 36, startY - 48, { steps: 5 });
      await page.mouse.up();
    }

    await expect(drawer).toBeHidden();
    const after = await launcher.boundingBox();
    expect(after).not.toBeNull();
    expect(Math.abs((after?.x || 0) - (before?.x || 0)) + Math.abs((after?.y || 0) - (before?.y || 0))).toBeGreaterThan(10);
  });
});

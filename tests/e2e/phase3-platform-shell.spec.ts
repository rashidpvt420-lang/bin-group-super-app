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
  '/property-management',
  '/maintenance',
  '/phase-1-shell-missing-route',
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

    if (isMobile) await launcher.tap();
    else await launcher.click();
    await expect(drawer).toBeVisible();
    const panel = drawer.locator('.MuiDrawer-paper');
    await expect(panel).toHaveCSS('width', isMobile ? `${page.viewportSize()?.width}px` : '400px');
    await expect(drawer.getByText('SOVEREIGN AI', { exact: true })).toBeVisible();

    const message = `phase-1-send-${testInfo.project.name}`;
    const input = page.getByTestId('sovereign-ai-input');
    await input.fill(message);
    const send = page.getByTestId('sovereign-ai-send');
    if (isMobile) await send.tap();
    else await send.click();
    await expect(drawer).toBeVisible();
    await expect(input).toHaveValue('');
    await expect(drawer.getByText(message, { exact: true })).toHaveCount(1);
    await expect(drawer.getByText(/LOCAL GUIDANCE — NOT LIVE AI OR AUTHORITATIVE/)).toHaveCount(1);

    const close = page.getByTestId('sovereign-ai-close');
    if (isMobile) await close.tap();
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

    // A cancelled gesture has no synthesized click. It must not consume the
    // next keyboard activation (native buttons emit a zero-detail click).
    await launcher.dispatchEvent('pointerdown', { pointerId: 51, pointerType: 'touch', isPrimary: true, clientX: 100, clientY: 100 });
    await launcher.dispatchEvent('pointercancel', { pointerId: 51, pointerType: 'touch', isPrimary: true });
    await expect(drawer).toBeHidden();
    await launcher.focus();
    await page.keyboard.press('Enter');
    await expect(drawer).toBeVisible();
    await close.click();
    await expect(drawer).toBeHidden();
  });
});


test.describe('Phase 1 marketing and global-shell behavioral regression', () => {
  test('root role CTAs navigate to the correct entry flows', async ({ page }, testInfo) => {
    const cases: Array<[string, RegExp]> = [
      ['I Already Rent With BIN', /\/login\?intendedRole=tenant$/],
      ['I’m Looking for a Home', /\/homes$/],
      ['Open Owner Portal', /\/login\?intendedRole=owner$/],
      ['Add New Property & Start Contract', /\/onboarding(?:[/?#]|$)/],
      ['Open Broker Portal', /\/login\?intendedRole=broker$/],
      ['Open Technician Portal', /\/login\?intendedRole=technician$/],
    ];

    for (const [label, destination] of cases) {
      await page.goto('/', { waitUntil: 'domcontentloaded' });
      const cta = page.getByRole('button', { name: label, exact: true });
      await expect(cta).toBeVisible();
      if (testInfo.project.name === 'chromium-desktop') await cta.click();
      else await cta.tap();
      await expect(page).toHaveURL(destination);
    }
  });

  test('marketing header, onboarding, quote, WhatsApp and back navigation stay operational', async ({ page }, testInfo) => {
    await page.goto('/property-management', { waitUntil: 'domcontentloaded' });

    await expect(page.locator('a[href="/"]').first()).toBeVisible();
    await expect(page.locator('a[href="/security"]').first()).toBeVisible();
    await expect(page.locator('a[href="/login"]').first()).toBeVisible();
    await expect(page.getByTestId('language-toggle')).toBeVisible();
    await assertNoPageLevelHorizontalOverflow(page, testInfo.project.name + ' property-management header');

    await page.locator('a[href="/login"]').first().click();
    await expect(page).toHaveURL(/\/login$/);

    await page.goto('/property-management', { waitUntil: 'domcontentloaded' });
    await page.locator('a[href="/onboarding"]').first().click();
    await expect(page).toHaveURL(/\/onboarding(?:[/?#]|$)/);

    await page.goto('/property-management', { waitUntil: 'domcontentloaded' });
    await page.locator('a[href="/onboarding?intent=quote"]').first().click();
    await expect(page).toHaveURL(/\/onboarding\?intent=quote$/);

    await page.goto('/property-management', { waitUntil: 'domcontentloaded' });
    await page.route('https://wa.me/**', (route) => route.abort());
    const requestPromise = page.waitForRequest((request) => request.url() === 'https://wa.me/971552423233');
    await page.locator('a[href="https://wa.me/971552423233"]').first().click();
    const request = await requestPromise;
    expect(request.url()).toBe('https://wa.me/971552423233');

    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.goto('/property-management', { waitUntil: 'domcontentloaded' });
    const back = page.getByRole('button', { name: /^Back$/ });
    await expect(back).toBeVisible();
    await back.click();
    await expect(page).toHaveURL(/\/$/);
  });

  test('marketing language toggle produces real RTL semantics without breaking the mobile header', async ({ page }, testInfo) => {
    await page.goto('/maintenance', { waitUntil: 'domcontentloaded' });
    await page.getByTestId('language-toggle').click();

    await expect.poll(async () => page.evaluate(() => ({
      dir: document.documentElement.dir,
      lang: document.documentElement.lang,
    }))).toEqual({ dir: 'rtl', lang: 'ar' });

    await expect(page.locator('a[href="/"]').first()).toBeVisible();
    await expect(page.locator('a[href="/login"]').first()).toBeVisible();
    await expect(page.getByTestId('language-toggle')).toBeVisible();
    await assertNoPageLevelHorizontalOverflow(page, testInfo.project.name + ' maintenance Arabic RTL header');
  });

  test('unknown public routes render a real 404 recovery state', async ({ page }, testInfo) => {
    await page.goto('/phase-1-shell-missing-route', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: /Page not found|الصفحة غير موجودة/ })).toBeVisible();
    await expect(page.getByRole('link', { name: /Back to home|العودة للرئيسية/ })).toBeVisible();
    await expect(page.getByRole('link', { name: /Find a home|البحث عن منزل/ })).toBeVisible();

    const homeLink = page.getByRole('link', { name: /Back to home|العودة للرئيسية/ });
    if (testInfo.project.name === 'chromium-desktop') await homeLink.click();
    else await homeLink.tap();
    await expect(page).toHaveURL(/\/$/);
  });
});

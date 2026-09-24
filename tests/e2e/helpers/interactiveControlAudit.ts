import { expect, type Page } from '@playwright/test';

export const INTERACTIVE_CONTROL_SELECTOR = [
  'button',
  'a[href]',
  'input:not([type="hidden"])',
  'select',
  'textarea',
  'summary',
  '[contenteditable="true"]',
  '[role="button"]',
  '[role="link"]',
  '[role="menuitem"]',
  '[role="menuitemcheckbox"]',
  '[role="menuitemradio"]',
  '[role="tab"]',
  '[role="switch"]',
  '[role="checkbox"]',
  '[role="radio"]',
  '[role="combobox"]',
  '[role="textbox"]',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

type ControlSnapshot = {
  index: number;
  tag: string;
  role: string;
  type: string;
  id: string;
  testId: string;
  label: string;
  visible: boolean;
  nativeDisabled: boolean;
  ariaDisabled: string;
  ariaBusy: string;
  tabIndex: number;
};

export type InteractiveControlAuditSummary = {
  context: string;
  total: number;
  visible: number;
  enabled: number;
  disabled: number;
};

const RAW_I18N_KEY = /^[a-z][a-z0-9_-]*(?:\.[a-z0-9_-]+){1,}$/i;

function controlDescription(control: ControlSnapshot) {
  const identity = control.testId || control.id || control.label || `#${control.index}`;
  return `${control.tag}${control.role ? `[role=${control.role}]` : ''} ${identity}`;
}

export async function auditInteractiveControls(
  page: Page,
  context: string,
): Promise<InteractiveControlAuditSummary> {
  const controls = await page.locator(INTERACTIVE_CONTROL_SELECTOR).evaluateAll((nodes) => {
    const normalize = (value: unknown) => String(value ?? '').replace(/\s+/g, ' ').trim();
    const labelFor = (node: Element) => {
      const labelledBy = normalize(node.getAttribute('aria-labelledby'))
        .split(' ')
        .filter(Boolean)
        .map((id) => document.getElementById(id)?.textContent || '')
        .join(' ');

      const associatedLabels =
        'labels' in node
          ? Array.from(((node as HTMLInputElement).labels || []) as NodeListOf<HTMLLabelElement>)
              .map((label) => label.textContent || '')
              .join(' ')
          : '';

      const nestedImageAlt = Array.from(node.querySelectorAll('img[alt]'))
        .map((image) => image.getAttribute('alt') || '')
        .join(' ');

      const nestedTitle = Array.from(node.querySelectorAll('svg title'))
        .map((title) => title.textContent || '')
        .join(' ');

      const candidate = [
        node.getAttribute('aria-label'),
        labelledBy,
        associatedLabels,
        node.getAttribute('title'),
        node.getAttribute('placeholder'),
        node.getAttribute('alt'),
        node.getAttribute('value'),
        nestedImageAlt,
        nestedTitle,
        (node as HTMLElement).innerText,
        node.textContent,
      ]
        .map(normalize)
        .find(Boolean);

      return candidate || '';
    };

    return nodes.map((node, index) => {
      const element = node as HTMLElement;
      const style = window.getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      const visible =
        style.display !== 'none' &&
        style.visibility !== 'hidden' &&
        Number(style.opacity || '1') !== 0 &&
        rect.width > 0 &&
        rect.height > 0 &&
        element.getClientRects().length > 0;

      const disabledProperty =
        'disabled' in node && Boolean((node as HTMLButtonElement | HTMLInputElement).disabled);

      return {
        index,
        tag: node.tagName.toLowerCase(),
        role: normalize(node.getAttribute('role')),
        type: normalize(node.getAttribute('type')),
        id: normalize(node.id),
        testId: normalize(node.getAttribute('data-testid')),
        label: labelFor(node),
        visible,
        nativeDisabled: disabledProperty,
        ariaDisabled: normalize(node.getAttribute('aria-disabled')).toLowerCase(),
        ariaBusy: normalize(node.getAttribute('aria-busy')).toLowerCase(),
        tabIndex: element.tabIndex,
      };
    });
  });

  const visible = controls.filter((control) => control.visible);
  expect(
    visible.length,
    `${context}: the rendered screen must expose at least one visible interactive control`,
  ).toBeGreaterThan(0);

  const unlabeled = visible.filter((control) => !control.label);
  expect(
    unlabeled.map(controlDescription),
    `${context}: every visible interactive control must have an accessible/testable label`,
  ).toEqual([]);

  const rawI18nLabels = visible.filter((control) => RAW_I18N_KEY.test(control.label));
  expect(
    rawI18nLabels.map((control) => `${controlDescription(control)} => ${control.label}`),
    `${context}: controls must render translated labels rather than raw i18n keys`,
  ).toEqual([]);

  const contradictoryDisabledState = visible.filter(
    (control) => control.nativeDisabled && control.ariaDisabled === 'false',
  );
  expect(
    contradictoryDisabledState.map(controlDescription),
    `${context}: native disabled controls cannot advertise aria-disabled=false`,
  ).toEqual([]);

  const impossibleBusyState = visible.filter(
    (control) => control.ariaBusy && !['true', 'false'].includes(control.ariaBusy),
  );
  expect(
    impossibleBusyState.map(controlDescription),
    `${context}: aria-busy must be true or false when present`,
  ).toEqual([]);

  const disabled = visible.filter(
    (control) => control.nativeDisabled || control.ariaDisabled === 'true',
  ).length;

  return {
    context,
    total: controls.length,
    visible: visible.length,
    enabled: visible.length - disabled,
    disabled,
  };
}

export async function assertNoPageLevelHorizontalOverflow(page: Page, context: string) {
  const metrics = await page.evaluate(() => ({
    viewport: window.innerWidth,
    documentWidth: document.documentElement.scrollWidth,
  }));
  expect(
    metrics.documentWidth,
    `${context}: interactive layout must not create page-level horizontal overflow`,
  ).toBeLessThanOrEqual(metrics.viewport + 8);
}

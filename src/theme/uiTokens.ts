/**
 * Shared design tokens for the 2026-10 dashboard redesign (REDESIGN.md R1).
 * Brand: gold, cream and dark ink. Gold is a FILL colour; use goldText for text.
 * Every text/background pair below is WCAG AA (>= 4.5:1) and guarded by
 * tests/launch/redesign-ui-foundation.test.mjs.
 */
export const ui = {
  ink: '#111827',
  cream: '#F8F6F0',
  card: '#FFFFFF',
  line: '#EEE8D8',
  gold: '#C9A646',
  goldHover: '#B8932F',
  goldText: '#7A5C12',
  goldOnInk: '#E5C86B',
  muted: '#4B5563',
  okBg: '#DCFCE7',
  okText: '#166534',
  warnBg: '#FEF3C7',
  warnText: '#92400E',
  badBg: '#FEE2E2',
  badText: '#991B1B',
  infoBg: '#E0E7FF',
  infoText: '#3730A3',
  radiusCard: 18,
  radiusButton: 12,
  touchTarget: 48,
  bottomNavHeight: 64,
  shadow: '0 6px 20px rgba(17, 24, 39, 0.07)',
} as const;

/** Type scale in px. Only weights 500 / 700 / 800 are used. */
export const uiType = {
  caption: { fontSize: 12, fontWeight: 700, lineHeight: 1.4 },
  small: { fontSize: 14, fontWeight: 500, lineHeight: 1.45 },
  body: { fontSize: 15, fontWeight: 500, lineHeight: 1.5 },
  title: { fontSize: 18, fontWeight: 800, lineHeight: 1.3 },
  heading: { fontSize: 22, fontWeight: 800, lineHeight: 1.25 },
  stat: { fontSize: 24, fontWeight: 800, lineHeight: 1.15 },
} as const;

export type UiTone = 'ok' | 'warn' | 'bad' | 'info' | 'neutral';

export const toneColors: Record<UiTone, { bg: string; fg: string }> = {
  ok: { bg: ui.okBg, fg: ui.okText },
  warn: { bg: ui.warnBg, fg: ui.warnText },
  bad: { bg: ui.badBg, fg: ui.badText },
  info: { bg: ui.infoBg, fg: ui.infoText },
  neutral: { bg: '#F1EDE2', fg: ui.ink },
};

/** Bottom padding a tab-root page needs so content clears BottomNav + one FAB. */
export const tabRootBottomPadding = `calc(${ui.bottomNavHeight + 88}px + env(safe-area-inset-bottom))`;

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// src/admin-mobile-hardening.css is imported globally (src/main.tsx). It used to force
// background-color:#FFFFFF !important on every .MuiChip-root, [role="status"] and [data-status],
// so filled chips with white/pale text rendered as blank white pills.
const css = readFileSync(new URL('../../src/admin-mobile-hardening.css', import.meta.url), 'utf8');

test('no global rule forces a white background onto every chip or status element', () => {
  const rules = css.replace(/\/\*[\s\S]*?\*\//g, '').split('}');
  for (const rule of rules) {
    const [selector = '', body = ''] = rule.split('{');
    if (!/background(-color)?:\s*#FFFFFF\s*!important/i.test(body)) continue;
    const selectors = selector.split(',').map((s) => s.trim());
    for (const banned of ['.MuiChip-root', '[role="status"]', '[data-status]']) {
      assert.ok(!selectors.includes(banned), `${banned} still forced to white`);
    }
  }
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');

test('broker shell draws a route-aware Back control on non-home routes', () => {
  const src = read('src/broker/BrokerApp.tsx');
  assert.match(src, /isBrokerHome = location\.pathname === '\/broker' \|\| location\.pathname === '\/broker\/dashboard'/);
  assert.match(src, /\{!isBrokerHome && <Button[^>]*aria-label=\{label\('nav\.back', 'Back', 'رجوع'\)\}/);
});

test('technician shell keeps its header Back control on non-dashboard routes', () => {
  assert.match(read('src/technician/TechnicianApp.tsx'), /\{!isDashboard && <Button aria-label=\{label\('nav\.back', 'Back', 'رجوع'\)\}/);
});

test('no stylesheet hides the portal header Back button (technician HR route)', () => {
  const css = read('src/ess-white-platinum.css');
  assert.doesNotMatch(css, /header \.MuiButton-root:first-of-type\s*\{\s*display:\s*none/);
});

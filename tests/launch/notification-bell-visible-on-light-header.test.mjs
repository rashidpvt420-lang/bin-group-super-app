import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Every portal header (owner, tenant, broker, technician) is white, and
// src/admin-mobile-hardening.css forces IconButtons to a white background.
// The bell icon was rgba(255,255,255,0.5) / #C6A75E, so the button rendered as an empty white box.
const src = readFileSync(new URL('../../src/components/NotificationBell.tsx', import.meta.url), 'utf8');

test('bell trigger does not use white or pale gold icon colours', () => {
  const trigger = src.slice(src.indexOf('<IconButton onClick={handleOpen}'), src.indexOf('</IconButton>'));
  assert.doesNotMatch(trigger, /rgba\(255,\s*255,\s*255|#FFF['"]|#C6A75E/i);
  assert.match(trigger, /width: 44, height: 44/);
});

// Nov 9 audit P2-11: the document already sets dir="rtl" in Arabic, so flex rows follow
// it. A manual `isRTL ? 'row-reverse' : 'row'` flips them back to left-to-right.
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import test from 'node:test';

test('no manual row-reverse double flip in src', () => {
  let out = '';
  try { out = execSync(`grep -rlE "isRTL \\? 'row-reverse' : 'row'" src`, { encoding: 'utf8' }); } catch { out = ''; }
  assert.equal(out.trim(), '', `double flips remain in:\n${out}`);
});

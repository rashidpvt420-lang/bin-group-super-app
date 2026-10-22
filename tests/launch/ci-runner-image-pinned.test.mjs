import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import test from 'node:test';

// ubuntu-latest began resolving to ubuntu-26.04, where the pinned Playwright cannot install
// chromium ("Playwright does not support chromium on ubuntu26.04-x64"). Deploy, smoke and PR gates
// must run on an explicit, Playwright-supported image so they cannot break on a silent image rollover.
test('every Linux workflow job pins a Playwright-supported Ubuntu image instead of ubuntu-latest', () => {
  const dir = '.github/workflows';
  const files = readdirSync(dir).filter((f) => /\.ya?ml$/.test(f));
  const floating = files.filter((f) => /runs-on:\s*ubuntu-latest/.test(readFileSync(`${dir}/${f}`, 'utf8')));
  assert.deepEqual(floating, []);
  for (const f of files) {
    for (const m of readFileSync(`${dir}/${f}`, 'utf8').matchAll(/runs-on:\s*(ubuntu-\S+)/g)) {
      assert.equal(m[1], 'ubuntu-24.04', `${f} uses ${m[1]}`);
    }
  }
});

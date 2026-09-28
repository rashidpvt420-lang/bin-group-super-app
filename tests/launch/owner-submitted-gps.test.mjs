import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { transform } from 'esbuild';

test('Owner submission and Admin visit reject missing, zero and reversed UAE GPS', async () => {
  const source = await readFile(new URL('../../functions/ownerSubmittedGps.ts', import.meta.url), 'utf8');
  const { code } = await transform(source, { loader: 'ts', format: 'esm' });
  const { isValidOwnerSubmittedGps } = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);

  for (const [lat, lng] of [[null, 55.27], ['', 55.27], [25.2, undefined], [0, 0], [55.27, 25.2], [91, 55]]) {
    assert.equal(isValidOwnerSubmittedGps(lat, lng), false, `Accepted invalid GPS ${lat}, ${lng}`);
  }
  assert.equal(isValidOwnerSubmittedGps(25.2048, 55.2708), true);
});

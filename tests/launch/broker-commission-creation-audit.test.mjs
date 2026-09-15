import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');

test('broker commission creation remains deterministic and create-only', async () => {
  const commission = await read('functions/brokerCommissions.ts');
  assert.match(commission, /\.doc\(`commission_\$\{contractId\}`\)/);
  assert.match(commission, /transaction\.create\(commissionRef/);
});

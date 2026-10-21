import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
test('broker vacancy alert trigger is exported and does not hard-code commission rates', async () => {
  assert.match(await readFile('functions/runtimeAll.ts', 'utf8'), /notifyBrokersOfNewVacancy/);
  const s = await readFile('functions/brokerVacancyAlerts.ts', 'utf8');
  assert.match(s, /system_config"\)\.doc\("broker_commission"\)/);
  assert.doesNotMatch(s, /\d+(\.\d+)?\s*%/);
});

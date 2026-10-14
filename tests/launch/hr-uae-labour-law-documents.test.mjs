import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(path, 'utf8');

test('EOSB estimate never applies the repealed 1980-law resignation reductions (Decree-Law 33/2021 Art. 51)', async () => {
  const source = await read('src/lib/uaeWorkforceComplianceEngine.ts');
  assert.ok(!source.includes('1 / 3'), 'one-third resignation reduction must not be applied');
  assert.ok(!source.includes('2 / 3'), 'two-thirds resignation reduction must not be applied');
  assert.ok(source.includes('const resignationMultiplier = 1;'));
  assert.ok(source.includes('basicMonthlySalaryAed * 24'), 'two-year wage cap must remain');
});

test('HR letters follow Art. 13(11) and carry a no-liability clause', async () => {
  const source = await read('src/utils/hrLetterPdf.ts');
  assert.ok(!source.includes('شهادة عدم انتساب'), 'NOC Arabic title must not read "certificate of non-affiliation"');
  assert.ok(source.includes('شهادة عدم ممانعة'));
  assert.ok(!source.includes("conduct and performance were satisfactory"), 'experience letter must not auto-certify conduct');
  assert.ok(source.includes('issued free of charge'));
  assert.ok(source.includes('HR_LETTER_NO_LIABILITY'));
  assert.ok(source.includes('[TRADE LICENCE NO.]'), 'company registration placeholders must stay visible until Rashid supplies real data');
});

test('Browser contract PDF does not assert OTP verification it cannot prove', async () => {
  const source = await read('src/utils/bilingualContractPdf.ts');
  assert.ok(!source.includes("'Mobile OTP Verified: YES'"));
  assert.ok(source.includes('otpVerified === true'));
  assert.ok(source.includes('the Arabic text prevails'));
});

test('Owner Service Agreement keeps lawful liability carve-outs, PDPL and severability', async () => {
  const source = await read('functions/pdfEngine.ts');
  for (const token of ['gross negligence, death or personal injury', 'Federal Decree-Law No. 45 of 2021', 'remaining provisions remain in full force', 'الخطأ الجسيم', 'كامل الاتفاق']) {
    assert.ok(source.includes(token), `Owner agreement missing ${token}`);
  }
});

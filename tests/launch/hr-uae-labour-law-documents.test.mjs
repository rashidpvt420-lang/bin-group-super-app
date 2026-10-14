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
  assert.ok(source.includes('COMPANY_REGISTRATION_LINE_EN'), 'HR letters must print the licence identification line');
});

test('Browser contract PDF does not assert OTP verification it cannot prove', async () => {
  const source = await read('src/utils/bilingualContractPdf.ts');
  assert.ok(!source.includes("'Mobile OTP Verified: YES'"));
  assert.ok(source.includes('otpVerified === true'));
  assert.ok(source.includes('the Arabic text prevails'));
});

test('Owner Service Agreement keeps lawful liability carve-outs, PDPL and severability', async () => {
  const source = await read('functions/pdfEngine.ts');
  for (const token of ['gross negligence, death or personal injury', 'Federal Decree-Law No. 45 of 2021', 'remaining provisions remain in full force', 'الخطأ الجسيم', 'كامل الاتفاق', 'GOVERNING_LAW_EN', 'GOVERNING_LAW_AR', 'COMPANY_TRADING_AS_EN']) {
    assert.ok(source.includes(token), `Owner agreement missing ${token}`);
  }
});

const identityValues = (src) => src.slice(src.indexOf('export const COMPANY_IDENTITY'));

test('one company identity constant, identical in browser and Functions copies', async () => {
  const [web, fn] = await Promise.all([read('src/lib/companyIdentity.ts'), read('functions/companyIdentity.ts')]);
  assert.equal(identityValues(web), identityValues(fn));
  for (const token of ["brandName: 'BIN-GROUPS'", 'CN-5914744', '101-2025-200047929', '501-2025-200031050', '8800106968', '903215', '1267058 ALL KIND BUILDING PROJECTS CONTRACTING - L.L.C - S.P.C', "mohreEstablishmentNo: '[MOHRE EST. NO.]'", "registeredAddressEn: 'Al Ain, Abu Dhabi, United Arab Emirates'", 'competent onshore courts of the United Arab Emirates']) {
    assert.ok(web.includes(token), `identity missing ${token}`);
  }
  assert.ok(!web.includes('Abu Dhabi Courts'));
});

test('old entity names are gone from document generators', async () => {
  for (const f of ['functions/pdfEngine.ts', 'functions/staffPdfReporting.ts', 'src/utils/hrLetterPdf.ts', 'src/utils/bilingualContractPdf.ts', 'src/components/ContractDigitalSignature.tsx']) {
    const src = await read(f);
    assert.ok(!src.includes('BIN GROUP PROPERTY MANAGEMENT LLC'), f);
    assert.ok(!src.includes("'BIN GROUP L.L.C - S.P.C'"), f);
    assert.ok(!src.includes('Abu Dhabi Courts shall have jurisdiction'), f);
  }
});

test('Arabic PDF font is TrueType (jsPDF cannot embed WOFF)', async () => {
  const [font, data] = await Promise.all([read('src/utils/arabicPdfFont.ts'), read('src/utils/arabicPdfFontData.ts')]);
  assert.ok(!font.includes('.woff'));
  assert.ok(font.includes('NotoNaskhArabic-Regular.ttf'));
  const b64 = data.match(/ARABIC_PDF_FONT_TTF_BASE64 = '([^']+)'/)[1];
  const head = Buffer.from(b64.slice(0, 8), 'base64');
  assert.equal(head.readUInt32BE(0), 0x00010000, 'font must be a TrueType (sfnt 1.0) file');
});

test('employment addendum supplements MOHRE contract with verified limits', async () => {
  const src = await read('src/utils/employmentAddendumPdf.ts');
  assert.ok(src.includes('NON_COMPETE_MAX_MONTHS = 24'));
  assert.ok(src.includes("NON_COMPETE_DEFAULT_PLACE = 'the United Arab Emirates'"));
  assert.ok(src.includes('nonCompete: NonCompeteTerms | null;'), 'non-compete included by default, months required per employee');
  for (const token of ['the MOHRE contract and the law prevail', 'shall not withhold', 'recruitment or employment fees', 'Federal Decree-Law No. 45 of 2021', 'the Arabic text prevails', 'Article 54', 'UAE-licensed lawyer']) {
    assert.ok(src.includes(token), `addendum missing ${token}`);
  }
});

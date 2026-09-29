// N-04 regression: bilingual PDFs must render Arabic (full font, fontkit shaping) and must never
// reverse digits or Latin runs ("13" rendered as "31" before the fix).
import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'esbuild';
import path from 'node:path';
import fs from 'node:fs';
import { createRequire } from 'node:module';

const outDir = path.resolve('node_modules/.cache/arabic-pdf-text-test');
fs.mkdirSync(outDir, { recursive: true });
const outfile = path.join(outDir, `arabic-${process.pid}.cjs`);
await build({ entryPoints: ['functions/arabicPdfText.ts'], bundle: true, platform: 'node', format: 'cjs', outfile, logLevel: 'silent' });
const { logicalToVisualRtl, displayWords, layoutBidiText, toVisualArabic } = createRequire(import.meta.url)(outfile);
const functionsRequire = createRequire(path.resolve('functions/package.json'));

test('RTL line: word order is reversed for display but digits keep their order', () => {
  assert.equal(logicalToVisualRtl('اتفاقية خدمات المالك لمدة 13 شهراً'), 'شهراً 13 لمدة المالك خدمات اتفاقية');
  for (const sample of ['13', '2026-09-29', '1,500.00', 'BIN-GROUP-OWNER-AGREEMENT-v1.0']) {
    assert.ok(toVisualArabic(`المبلغ ${sample} درهم`).includes(sample), `${sample} must not be reversed`);
  }
  assert.equal(toVisualArabic('فاتورة دفعة التفعيل - مدفوعة'), 'مدفوعة - التفعيل دفعة فاتورة');
  // Characters inside Arabic words stay in logical order (fontkit shapes and orders each word).
  assert.ok(toVisualArabic('برج الاختبار 12').split(' ').includes('الاختبار'));
  assert.equal(toVisualArabic('Private Owner'), 'Private Owner');
});

test('LTR-based bilingual lines keep the English run and reorder only the Arabic run', () => {
  assert.deepEqual(displayWords('Owner / المالك'), ['Owner', '/', 'المالك']);
  assert.deepEqual(displayWords('OWNER: راشد بن عبد الغني'), ['OWNER:', 'الغني', 'عبد', 'بن', 'راشد']);
  assert.deepEqual(
    displayWords('13 Months: 29/09/2026 to 29/10/2027 / مستمر لمدة 13 شهراً'),
    ['13', 'Months:', '29/09/2026', 'to', '29/10/2027', '/', 'شهراً', '13', 'لمدة', 'مستمر'],
  );
});

test('wrapped RTL paragraphs start with the first logical words and are right aligned', () => {
  const text = 'يلتزم المالك بتوفير الوصول الآمن إلى العقار خلال ساعات العمل المتفق عليها';
  const lines = layoutBidiText(text, { maxWidth: 30, measure: (w) => w.length, spaceWidth: 1 });
  assert.ok(lines.length > 1);
  const firstLineWords = lines[0].tokens.map((t) => t.text);
  assert.ok(firstLineWords.includes('يلتزم'), 'first logical word must be on the first line');
  assert.equal(firstLineWords[firstLineWords.length - 1], 'يلتزم', 'first logical word is the right-most token');
  for (const line of lines) {
    const last = line.tokens[line.tokens.length - 1];
    assert.equal(last.x + last.width, 30, 'right aligned');
  }
  const words = lines.flatMap((l) => l.tokens.map((t) => t.text));
  assert.deepEqual([...words].sort(), text.split(' ').sort(), 'no word lost or duplicated');
});

test('bundled Cairo-Regular.ttf is a static font with Arabic coverage for every PDF string', () => {
  const fontkit = functionsRequire('fontkit');
  const font = fontkit.openSync(path.resolve('functions/assets/Cairo-Regular.ttf'));
  assert.equal(font.variationAxes && Object.keys(font.variationAxes).length, 0, 'static instance expected');
  assert.ok(font.hasGlyphForCodePoint(0x0627), 'Arabic alef must be present');
  const engine = fs.readFileSync('functions/pdfEngine.ts', 'utf8');
  const arabicChars = new Set([...engine].filter((ch) => /[\u0600-\u06FF]/.test(ch)));
  assert.ok(arabicChars.size > 30);
  const missing = [...arabicChars].filter((ch) => !font.hasGlyphForCodePoint(ch.codePointAt(0)));
  assert.deepEqual(missing, [], `font lacks glyphs for ${missing.join(' ')}`);
});

test('fontkit shapes Arabic words with the bundled font without .notdef glyphs', () => {
  const fontkit = functionsRequire('fontkit');
  const font = fontkit.openSync(path.resolve('functions/assets/Cairo-Regular.ttf'));
  for (const word of ['اتفاقية', 'شهراً', 'المالك', 'مدفوعة', 'الإمارة', 'لا']) {
    const run = font.layout(word);
    assert.ok(run.glyphs.length > 0);
    assert.ok(run.glyphs.every((g) => g.id !== 0), `${word} produced .notdef`);
  }
  // Joined (contextual) forms differ from isolated forms: shaping is active.
  const joined = font.layout('بب').glyphs.map((g) => g.id);
  const isolated = font.layout('ب').glyphs[0].id;
  assert.ok(joined.some((id) => id !== isolated), 'contextual forms must be applied');
});

import { readFileSync, writeFileSync, unlinkSync, existsSync } from 'fs';
import { join } from 'path';

const fontPath = join('node_modules', '@fontsource', 'cairo', 'files', 'cairo-arabic-400-normal.woff');
const b64 = readFileSync(fontPath).toString('base64');

const content = `// src/utils/arabicPdfFont.ts
// Cairo Arabic font (weight 400) embedded as base64 WOFF.
// License: Open Font License (OFL) - https://openfontlicense.org
// Source: @fontsource/cairo (Google Fonts - Cairo by Mohamed Gaber & Khaled Hosny)
//
// Usage: call registerArabicFont(doc) once after creating a new jsPDF instance.
// Then use doc.setFont('Cairo', 'normal') before writing Arabic text.

import type { jsPDF } from 'jspdf';

// eslint-disable-next-line max-len
const CAIRO_ARABIC_400_BASE64 = '${b64}';

/**
 * Registers the Cairo Arabic font into a jsPDF document instance.
 * Call this once per PDF document immediately after new jsPDF().
 * After calling this, use doc.setFont('Cairo', 'normal') to switch to Arabic.
 */
export function registerArabicFont(doc: jsPDF): void {
  try {
    doc.addFileToVFS('Cairo-Arabic-400.woff', CAIRO_ARABIC_400_BASE64);
    doc.addFont('Cairo-Arabic-400.woff', 'Cairo', 'normal');
  } catch (err) {
    console.warn('[PDF] Arabic font registration failed - Arabic text may render as boxes:', err);
  }
}

/**
 * Returns 'Cairo' if the font has been registered, falls back to 'helvetica'.
 * Use after registerArabicFont() to safely set the font.
 */
export function getArabicFontName(doc: jsPDF): string {
  try {
    const fonts = (doc as unknown as { getFontList(): Record<string, string[]> }).getFontList();
    return fonts['Cairo'] ? 'Cairo' : 'helvetica';
  } catch {
    return 'helvetica';
  }
}
`;

writeFileSync(join('src', 'utils', 'arabicPdfFont.ts'), content, 'utf8');
const { size } = (await import('fs')).statSync(join('src', 'utils', 'arabicPdfFont.ts'));
console.log(`arabicPdfFont.ts written — ${size} bytes, base64 length: ${b64.length}`);

// src/utils/arabicPdfFont.ts
// Arabic-capable TrueType font for jsPDF (was a WOFF Cairo font, which jsPDF cannot parse:
// it threw "No unicode cmap for font" and crashed every generator that wrote Arabic).
// License: Open Font License (OFL) - https://openfontlicense.org
// Font: Noto Naskh Arabic (Google Noto project), see arabicPdfFontData.ts
//
// Usage: call registerArabicFont(doc) once after creating a new jsPDF instance.
// Then use doc.setFont(getArabicFontName(doc), 'normal') before writing Arabic text.

import type { jsPDF } from 'jspdf';

import { ARABIC_PDF_FONT_TTF_BASE64 } from './arabicPdfFontData';

export const ARABIC_PDF_FONT_NAME = 'NotoNaskhArabic';

/**
 * Registers the Arabic TrueType font into a jsPDF document instance.
 * Call this once per PDF document immediately after new jsPDF().
 * After calling this, use doc.setFont(getArabicFontName(doc), 'normal') to switch to Arabic.
 */
export function registerArabicFont(doc: jsPDF): void {
  try {
    if ((doc as unknown as { getFontList(): Record<string, string[]> }).getFontList()[ARABIC_PDF_FONT_NAME]) return;
    doc.addFileToVFS('NotoNaskhArabic-Regular.ttf', ARABIC_PDF_FONT_TTF_BASE64);
    doc.addFont('NotoNaskhArabic-Regular.ttf', ARABIC_PDF_FONT_NAME, 'normal');
  } catch (err) {
    console.warn('[PDF] Arabic font registration failed - Arabic text may render as boxes:', err);
  }
}

/**
 * Returns the Arabic font name if the font has been registered, falls back to 'helvetica'.
 * Use after registerArabicFont() to safely set the font.
 */
export function getArabicFontName(doc: jsPDF): string {
  try {
    const fonts = (doc as unknown as { getFontList(): Record<string, string[]> }).getFontList();
    return fonts[ARABIC_PDF_FONT_NAME] ? ARABIC_PDF_FONT_NAME : 'helvetica';
  } catch {
    return 'helvetica';
  }
}

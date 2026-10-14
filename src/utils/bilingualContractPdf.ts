import { jsPDF } from 'jspdf';
import { registerArabicFont, getArabicFontName } from './arabicPdfFont';
import { COMPANY_DISPLAY_NAME, COMPANY_TRADING_AS_AR, COMPANY_TRADING_AS_EN } from '../lib/companyIdentity';

type ContractPdfInput = {
  artifact: {
    version: string;
    institutionalHash: string;
    timestamp: string;
    signature: string;
    acceptanceLog?: { platform?: string; otpVerified?: boolean };
  };
  propertyName: string;
  ownerName: string;
  providerName?: string;
  contractTitle: string;
  contractBody: string;
  annualFeeText: string;
};

const hasArabic = (value: string) => /[\u0600-\u06FF]/.test(value || '');

function normalizeArabic(doc: jsPDF, value: string) {
  const processor = (doc as unknown as { processArabic?: (text: string) => string }).processArabic;
  if (!hasArabic(value) || !processor) return value;
  // jsPDF's processArabic() does not apply the bidi bracket-pairing rules, so parentheses in
  // mixed Arabic text come out reversed or mismatched. Render parenthetical asides with dashes.
  const safe = value.replace(/\s*\(([^()]*)\)/g, ' - $1 -').replace(/\s+-\s*([.،,:])/g, '$1').replace(/-\s*$/, '').trim();
  return processor(safe);
}

export function writeLTR(doc: jsPDF, value: string, x: number, y: number, options: Record<string, unknown> = {}) {
  doc.text(value || '-', x, y, options as any);
}

export function writeRTL(doc: jsPDF, value: string, x: number, y: number, options: Record<string, unknown> = {}) {
  doc.setFont(getArabicFontName(doc), 'normal');
  doc.text(normalizeArabic(doc, value || '-'), x, y, { align: 'right', ...options } as any);
  doc.setFont('helvetica', 'normal');
}

export function wrappedLTR(doc: jsPDF, value: string, x: number, y: number, width: number, lineHeight = 6) {
  const lines = doc.splitTextToSize(value || '-', width);
  doc.text(lines, x, y);
  return y + lines.length * lineHeight;
}

export function wrappedRTL(doc: jsPDF, value: string, x: number, y: number, width: number, lineHeight = 6) {
  // Measure with the Arabic font so wrapping widths match the glyphs actually drawn.
  const previousFont = doc.getFont().fontName;
  doc.setFont(getArabicFontName(doc), 'normal');
  const lines = doc.splitTextToSize(normalizeArabic(doc, value || '-'), width);
  doc.setFont(previousFont, 'normal');
  lines.forEach((line: string, index: number) => writeRTL(doc, line, x, y + index * lineHeight));
  return y + lines.length * lineHeight;
}

export function savePdfMobileSafe(doc: jsPDF, filename: string) {
  try {
    doc.save(filename);
    return { ok: true, mode: 'download' };
  } catch (err) {
    console.warn('[PDF] Native save failed, opening blob fallback:', err);
  }

  try {
    const blob = doc.output('blob');
    const url = URL.createObjectURL(blob);
    const opened = window.open(url, '_blank', 'noopener,noreferrer');

    if (!opened) {
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = filename;
      anchor.rel = 'noopener noreferrer';
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
    }

    window.setTimeout(() => URL.revokeObjectURL(url), 30000);
    return { ok: true, mode: opened ? 'blob_window' : 'anchor_fallback' };
  } catch (fallbackErr) {
    console.error('[PDF] Mobile PDF fallback failed:', fallbackErr);
    return { ok: false, mode: 'failed', error: String(fallbackErr) };
  }
}

export function generateBilingualContractPdf(input: ContractPdfInput) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  // Register Arabic font immediately so all RTL text renders with Noto Naskh Arabic glyphs
  registerArabicFont(doc);
  const provider = input.providerName || COMPANY_DISPLAY_NAME;
  const timestamp = `${new Date(input.artifact.timestamp).toLocaleString('en-GB', { timeZone: 'Asia/Dubai' })} GST`;
  // Only state OTP verification when the acceptance record actually carries it; never assert it blindly.
  const otpVerified = input.artifact.acceptanceLog?.otpVerified === true;

  doc.setProperties({
    title: `BIN-GROUPS Contract ${input.artifact.institutionalHash}`,
    subject: 'Bilingual UAE maintenance and property management contract',
    author: COMPANY_DISPLAY_NAME,
    creator: 'BIN-GROUPS Super App',
  });

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  writeLTR(doc, `${COMPANY_DISPLAY_NAME} - SERVICE AGREEMENT`, 105, 18, { align: 'center' });
  writeRTL(doc, `اتفاقية خدمات - ${COMPANY_DISPLAY_NAME}`, 195, 28);

  doc.setDrawColor(40);
  doc.line(15, 34, 195, 34);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  writeLTR(doc, `Version: ${input.artifact.version}`, 15, 44);
  writeLTR(doc, `Hash: ${input.artifact.institutionalHash}`, 15, 51);
  writeLTR(doc, `Timestamp: ${timestamp}`, 15, 58);
  writeRTL(doc, `رقم التوثيق: ${input.artifact.institutionalHash}`, 195, 44);
  writeRTL(doc, `تاريخ التوقيع: ${timestamp}`, 195, 51);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  writeLTR(doc, '1. PARTIES', 15, 74);
  writeRTL(doc, '١. الأطراف', 195, 74);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  writeLTR(doc, `Property: ${input.propertyName}`, 15, 84);
  writeLTR(doc, `Owner / Entity: ${input.ownerName}`, 15, 91);
  writeLTR(doc, `Provider: ${provider}`, 15, 98);
  writeRTL(doc, `العقار: ${input.propertyName}`, 195, 84);
  writeRTL(doc, `المالك / الجهة: ${input.ownerName}`, 195, 91);
  writeRTL(doc, `مزود الخدمة: ${provider}`, 195, 98);
  doc.setFontSize(7);
  wrappedLTR(doc, COMPANY_TRADING_AS_EN, 15, 104, 180, 3);
  wrappedRTL(doc, COMPANY_TRADING_AS_AR, 195, 111, 180, 3);
  doc.setFontSize(10);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  writeLTR(doc, '2. SCOPE OF SERVICES', 15, 122);
  writeRTL(doc, '٢. نطاق الخدمات', 195, 122);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  let y = wrappedLTR(doc, input.contractBody, 15, 131, 82);
  const arabicScope = 'يشمل هذا العقد خدمات الصيانة وإدارة العقار وفق الخطة المختارة، مع الالتزام بمستويات الخدمة، التوثيق بالصور، وسجلات المتابعة داخل المنصة.';
  wrappedRTL(doc, arabicScope, 195, 131, 82);

  const pricingY = Math.max(y + 10, 172);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  writeLTR(doc, '3. PRICING & PAYMENT', 15, pricingY);
  writeRTL(doc, '٣. الأسعار والدفع', 195, pricingY);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  writeLTR(doc, `Annual Management Fee: ${input.annualFeeText}`, 15, pricingY + 10);
  writeLTR(doc, 'Payment Schedule: As selected in the digital onboarding flow.', 15, pricingY + 17);
  writeRTL(doc, `الرسوم السنوية: ${input.annualFeeText}`, 195, pricingY + 10);
  writeRTL(doc, 'جدول الدفع: حسب الاختيار في إجراءات التعاقد الرقمية.', 195, pricingY + 17);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  writeLTR(doc, '4. DIGITAL SIGNATURE', 15, 222);
  writeRTL(doc, '٤. التوقيع الرقمي', 195, 222);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  writeLTR(doc, `Digitally Signed By: ${input.artifact.signature}`, 20, 232);
  writeLTR(doc, `Mobile OTP Verified: ${otpVerified ? 'YES' : 'NOT RECORDED'}`, 20, 239);
  writeLTR(doc, `Platform Origin: ${input.artifact.acceptanceLog?.platform || 'BIN-GROUPS SUPER APP'}`, 20, 246);
  writeRTL(doc, `تم التوقيع رقمياً بواسطة: ${input.artifact.signature}`, 190, 232);
  writeRTL(doc, `تم التحقق بواسطة رمز الهاتف: ${otpVerified ? 'نعم' : 'غير مسجل'}`, 190, 239);
  writeRTL(doc, 'مصدر المنصة: تطبيق مجموعة بن', 190, 246);
  doc.rect(15, 214, 180, 40);

  doc.setFontSize(8);
  writeLTR(doc, 'Working copy only. The server-generated, hashed Owner Service Agreement is the binding executed copy. In case of conflict, the Arabic text prevails.', 105, 281, { align: 'center' });
  writeRTL(doc, 'نسخة عمل فقط. النسخة الملزمة هي اتفاقية خدمات المالك الصادرة من الخادم والموثقة برمز التحقق. وفي حال التعارض يسود النص العربي.', 195, 287);

  return savePdfMobileSafe(doc, `BIN_GROUP_Contract_${input.artifact.institutionalHash}.pdf`);
}

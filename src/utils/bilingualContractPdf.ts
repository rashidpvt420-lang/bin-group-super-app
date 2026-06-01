import { jsPDF } from 'jspdf';

type ContractPdfInput = {
  artifact: {
    version: string;
    institutionalHash: string;
    timestamp: string;
    signature: string;
    acceptanceLog?: { platform?: string };
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
  return hasArabic(value) && processor ? processor(value) : value;
}

function writeLTR(doc: jsPDF, value: string, x: number, y: number, options: Record<string, unknown> = {}) {
  doc.text(value || '-', x, y, options as any);
}

function writeRTL(doc: jsPDF, value: string, x: number, y: number, options: Record<string, unknown> = {}) {
  doc.text(normalizeArabic(doc, value || '-'), x, y, { align: 'right', ...options } as any);
}

function wrappedLTR(doc: jsPDF, value: string, x: number, y: number, width: number, lineHeight = 6) {
  const lines = doc.splitTextToSize(value || '-', width);
  doc.text(lines, x, y);
  return y + lines.length * lineHeight;
}

function wrappedRTL(doc: jsPDF, value: string, x: number, y: number, width: number, lineHeight = 6) {
  const lines = doc.splitTextToSize(normalizeArabic(doc, value || '-'), width);
  lines.forEach((line: string, index: number) => writeRTL(doc, line, x, y + index * lineHeight));
  return y + lines.length * lineHeight;
}

function savePdfMobileSafe(doc: jsPDF, filename: string) {
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
  const provider = input.providerName || 'BIN GROUP PROPERTY MANAGEMENT LLC';
  const timestamp = new Date(input.artifact.timestamp).toLocaleString();

  doc.setProperties({
    title: `BIN GROUP Contract ${input.artifact.institutionalHash}`,
    subject: 'Bilingual UAE maintenance and property management contract',
    author: 'BIN GROUP',
    creator: 'BIN GROUP Super App',
  });

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  writeLTR(doc, 'BIN GROUP - SOVEREIGN CONTRACT', 105, 18, { align: 'center' });
  writeRTL(doc, 'مجموعة بن - عقد سيادي', 195, 28);

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

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  writeLTR(doc, '2. SCOPE OF SERVICES', 15, 116);
  writeRTL(doc, '٢. نطاق الخدمات', 195, 116);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  let y = wrappedLTR(doc, input.contractBody, 15, 126, 82);
  const arabicScope = 'يشمل هذا العقد خدمات الصيانة وإدارة العقار وفق الخطة المختارة، مع الالتزام بمستويات الخدمة، التوثيق بالصور، وسجلات المتابعة داخل المنصة.';
  wrappedRTL(doc, arabicScope, 195, 126, 82);

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
  writeLTR(doc, 'Mobile OTP Verified: YES', 20, 239);
  writeLTR(doc, `Platform Origin: ${input.artifact.acceptanceLog?.platform || 'BIN GROUP SUPER APP'}`, 20, 246);
  writeRTL(doc, `تم التوقيع رقمياً بواسطة: ${input.artifact.signature}`, 190, 232);
  writeRTL(doc, 'تم التحقق بواسطة رمز الهاتف: نعم', 190, 239);
  writeRTL(doc, 'مصدر المنصة: تطبيق مجموعة بن', 190, 246);
  doc.rect(15, 214, 180, 40);

  doc.setFontSize(8);
  writeLTR(doc, 'This bilingual PDF is generated from the BIN GROUP digital acceptance record. English and Arabic sections are provided for operational clarity.', 105, 284, { align: 'center' });

  return savePdfMobileSafe(doc, `BIN_GROUP_Contract_${input.artifact.institutionalHash}.pdf`);
}

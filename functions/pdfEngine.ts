import PDFDocument from 'pdfkit';
import { getStorage } from 'firebase-admin/storage';

const GOLD = '#C6A75E';
const INK = '#111827';
const MUTED = '#6B7280';

function money(value: any) {
    const amount = Number(value || 0);
    return `AED ${amount.toLocaleString('en-AE', { maximumFractionDigits: 0 })}`;
}

function textValue(value: any, fallback = '---') {
    const text = String(value ?? '').trim();
    return text || fallback;
}

function section(doc: PDFKit.PDFDocument, titleEn: string, titleAr: string) {
    doc.moveDown(0.8);
    doc.fillColor(GOLD).fontSize(12).text(titleEn.toUpperCase(), { continued: false });
    doc.fillColor(MUTED).fontSize(9).text(titleAr, { align: 'right' });
    doc.moveDown(0.35);
    doc.strokeColor('#E5E7EB').lineWidth(1).moveTo(50, doc.y).lineTo(545, doc.y).stroke();
    doc.moveDown(0.5);
}

function row(doc: PDFKit.PDFDocument, label: string, value: string, y?: number) {
    const startY = y ?? doc.y;
    doc.fillColor(MUTED).fontSize(8).text(label, 55, startY, { width: 165 });
    doc.fillColor(INK).fontSize(10).text(value, 220, startY, { width: 320 });
    doc.moveDown(0.55);
}

async function savePdf(buffer: Buffer, path: string, metadata: Record<string, any>) {
    const storage = getStorage();
    const bucket = storage.bucket();
    const file = bucket.file(path);
    await file.save(buffer, {
        contentType: 'application/pdf',
        metadata: { metadata }
    });
    const url = await file.getSignedUrl({ action: 'read', expires: '03-09-2491' });
    return url[0];
}

/**
 * Bilingual hard-launch contract PDF generator.
 * Generates a concise English/Arabic contract summary suitable for owner review.
 */
export async function generateContractPDF(data: any) {
    return new Promise<string>((resolve, reject) => {
        const doc = new PDFDocument({ margin: 50, size: 'A4', info: { Title: 'BIN GROUP Contract Summary' } });
        const chunks: Buffer[] = [];

        doc.on('data', (chunk: Buffer) => chunks.push(chunk));
        doc.on('error', reject);
        doc.on('end', async () => {
            try {
                const buffer = Buffer.concat(chunks);
                const contractId = textValue(data.contractId || data.id || Date.now());
                const url = await savePdf(buffer, `contracts/${contractId}.pdf`, {
                    ownerId: textValue(data.ownerId, ''),
                    contractId,
                    contractType: textValue(data.contractType || data.planName, ''),
                    language: 'en-ar',
                    documentType: 'contract_summary'
                });
                resolve(url);
            } catch (err) {
                reject(err);
            }
        });

        doc.fillColor(GOLD).fontSize(24).text('BIN GROUP L.L.C', { align: 'center' });
        doc.fillColor(INK).fontSize(10).text('PROPERTY MANAGEMENT • FACILITY MANAGEMENT • MAINTENANCE', { align: 'center' });
        doc.fillColor(MUTED).fontSize(9).text('إدارة العقارات • إدارة المرافق • الصيانة', { align: 'center' });
        doc.moveDown(1.2);
        doc.rect(50, doc.y, 495, 2).fill(GOLD);
        doc.moveDown(1.2);

        doc.fillColor(INK).fontSize(18).text('BILINGUAL SERVICE CONTRACT SUMMARY', { align: 'center' });
        doc.fillColor(MUTED).fontSize(11).text('ملخص عقد الخدمات ثنائي اللغة', { align: 'center' });
        doc.moveDown(1);

        row(doc, 'Contract ID / رقم العقد', textValue(data.contractId || data.id || 'DRAFT'));
        row(doc, 'Generated Date / تاريخ الإصدار', new Date().toLocaleDateString('en-AE'));

        section(doc, '1. Parties', 'الأطراف');
        row(doc, 'Owner / المالك', textValue(data.ownerName || data.fullName));
        row(doc, 'Company / الشركة', textValue(data.companyName || data.entityName));
        row(doc, 'Email / البريد الإلكتروني', textValue(data.ownerEmail || data.email));
        row(doc, 'BIN GROUP / بن جروب', 'BIN GROUP L.L.C - S.P.C');

        section(doc, '2. Property Scope', 'نطاق العقار');
        row(doc, 'Property / العقار', textValue(data.propertyName || data.propertyTitle));
        row(doc, 'Type / النوع', textValue(data.propertyType || data.assetClass));
        row(doc, 'Address / العنوان', textValue(data.address || data.location || data.emirate));
        row(doc, 'Units / الوحدات', textValue(data.units || data.totalUnits));

        section(doc, '3. Commercial Terms', 'الشروط التجارية');
        row(doc, 'Plan / الباقة', textValue(data.planName || data.contractType || 'Institutional Hybrid'));
        row(doc, 'Annual Value / القيمة السنوية', money(data.annualValue || data.totalAnnualValue || data.estimatedAnnualValue));
        row(doc, 'Mobilization 15% / دفعة البدء', money(data.mobilizationAmount || data.upfrontAmount));
        row(doc, 'Currency / العملة', textValue(data.currency || 'AED'));

        section(doc, '4. Service Promise', 'وعد الخدمة');
        doc.fillColor(INK).fontSize(9).text('BIN GROUP provides planned maintenance, ticket handling, owner visibility, tenant support, technician evidence, and service tracking according to the selected service plan and SLA tier.', { align: 'justify' });
        doc.moveDown(0.35);
        doc.fillColor(MUTED).fontSize(9).text('تقدم بن جروب خدمات الصيانة المخططة، إدارة البلاغات، متابعة المالك، دعم المستأجرين، توثيق أعمال الفنيين، وتتبع الخدمة حسب الباقة ومستوى الخدمة المختار.', { align: 'right' });

        section(doc, '5. Approval & Evidence', 'الاعتماد والتوثيق');
        doc.fillColor(INK).fontSize(9).text('Owner approval is required for chargeable works outside the agreed scope. Technician before/after evidence, tenant approval or dispute, and audit logs remain part of the service record.', { align: 'justify' });
        doc.moveDown(0.35);
        doc.fillColor(MUTED).fontSize(9).text('تتطلب الأعمال الإضافية خارج النطاق موافقة المالك. وتبقى صور ما قبل وما بعد العمل وموافقة أو اعتراض المستأجر وسجلات التدقيق جزءاً من سجل الخدمة.', { align: 'right' });

        section(doc, '6. Legal Note', 'ملاحظة قانونية');
        doc.fillColor(INK).fontSize(8).text('This summary is governed by the final signed service agreement and applicable UAE laws. In case of conflict, the signed agreement and approved service schedule prevail.', { align: 'justify' });
        doc.moveDown(0.35);
        doc.fillColor(MUTED).fontSize(8).text('يخضع هذا الملخص للعقد النهائي الموقع وجدول الخدمات المعتمد والقوانين المعمول بها في دولة الإمارات العربية المتحدة.', { align: 'right' });

        const signatureY = 705;
        doc.strokeColor('#9CA3AF').lineWidth(1).moveTo(55, signatureY).lineTo(240, signatureY).stroke();
        doc.strokeColor('#9CA3AF').moveTo(350, signatureY).lineTo(535, signatureY).stroke();
        doc.fillColor(INK).fontSize(8).text('OWNER SIGNATURE / توقيع المالك', 55, signatureY + 8, { width: 190 });
        doc.text('BIN GROUP AUTHORIZED / توقيع بن جروب', 350, signatureY + 8, { width: 190 });

        doc.end();
    });
}

export async function generatePayslipPDF(data: any) {
    return new Promise<string>((resolve, reject) => {
        const doc = new PDFDocument({ margin: 50, size: 'A4' });
        const chunks: Buffer[] = [];

        doc.on('data', (chunk: Buffer) => chunks.push(chunk));
        doc.on('error', reject);
        doc.on('end', async () => {
            try {
                const buffer = Buffer.concat(chunks);
                const url = await savePdf(buffer, `payslips/${data.staffId}/${data.payPeriod}.pdf`, {
                    staffId: textValue(data.staffId, ''),
                    payPeriod: textValue(data.payPeriod, '')
                });
                resolve(url);
            } catch (err) {
                reject(err);
            }
        });

        doc.fillColor(GOLD).fontSize(20).text('BIN GROUP - PAY ADVICE', { align: 'center' }).moveDown(2);
        doc.fillColor(INK).fontSize(12).text(`Staff Name: ${textValue(data.staffName)}`);
        doc.text(`Employee ID: ${textValue(data.staffId)}`);
        doc.text(`Position: ${textValue(data.position)}`).moveDown(1);
        doc.text(`Pay Period: ${textValue(data.payPeriod)}`);
        doc.text(`Payment Date: ${textValue(data.paymentDate)}`).moveDown(2);
        doc.rect(50, 220, 500, 1).fill('#EEE');
        doc.moveDown(1);
        doc.fontSize(11).text('DESCRIPTION', 50, 240);
        doc.text('AMOUNT (AED)', 400, 240, { align: 'right' }).moveDown(1);
        doc.fontSize(10).text('Basic Salary', 50, 270);
        doc.text(Number(data.basicSalary || 0).toLocaleString(), 400, 270, { align: 'right' });
        doc.text('Allowances', 50, 290);
        doc.text(Number(data.allowances || 0).toLocaleString(), 400, 290, { align: 'right' });
        doc.text('Overtime', 50, 310);
        doc.text(Number(data.overtime || 0).toLocaleString(), 400, 310, { align: 'right' });
        doc.fillColor('#ff4d4d').text('Deductions', 50, 330);
        doc.text(`(${Number(data.deductions || 0).toLocaleString()})`, 400, 330, { align: 'right' });
        doc.rect(50, 360, 500, 2).fill(GOLD);
        doc.fillColor(INK).fontSize(14).text('NET SALARY', 50, 380);
        doc.text(money(data.netSalary), 400, 380, { align: 'right' });
        doc.end();
    });
}

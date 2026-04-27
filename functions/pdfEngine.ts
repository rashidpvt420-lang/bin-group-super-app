import PDFDocument from 'pdfkit';
import { getStorage } from 'firebase-admin/storage';

/**
 * Sovereign PDF Generation Engine
 * Generates institutional contracts and payslips.
 */
export async function generateContractPDF(data: any) {
    return new Promise<string>(async (resolve, reject) => {
        const doc = new PDFDocument({ margin: 50, size: 'A4' });
        const chunks: any[] = [];
        
        doc.on('data', chunk => chunks.push(chunk));
        doc.on('end', async () => {
            const buffer = Buffer.concat(chunks);
            const storage = getStorage();
            const bucket = storage.bucket();
            const file = bucket.file(`contracts/${data.contractId || Date.now()}.pdf`);
            
            await file.save(buffer, {
                contentType: 'application/pdf',
                metadata: {
                    metadata: {
                        ownerId: data.ownerId,
                        contractType: data.contractType
                    }
                }
            });

            const url = await file.getSignedUrl({
                action: 'read',
                expires: '03-09-2491'
            });
            resolve(url[0]);
        });

        // 1. Header
        doc.fillColor('#C6A75E').fontSize(24).text('BIN GROUP L.L.C', { align: 'center' });
        doc.fillColor('#000').fontSize(10).text('SOVEREIGN INSTITUTIONAL MANAGEMENT', { align: 'center' }).moveDown(2);
        
        doc.rect(50, 100, 500, 2).fill('#C6A75E');
        doc.moveDown(4);

        // 2. Title
        doc.fillColor('#000').fontSize(18).text('MASTER SERVICE AGREEMENT', { align: 'center' }).moveDown(1);
        doc.fontSize(10).text(`Contract ID: ${data.contractId || 'DRAFT'}`, { align: 'right' }).moveDown(2);

        // 3. Content
        doc.fontSize(12).text('1. PARTIES', { underline: true }).moveDown(0.5);
        doc.fontSize(10).text(`Owner: ${data.ownerName || '---'}`);
        doc.text(`Entity: ${data.companyName || '---'}`).moveDown(1);

        doc.fontSize(12).text('2. PROPERTY SCOPE', { underline: true }).moveDown(0.5);
        doc.fontSize(10).text(`Type: ${data.propertyType || '---'}`);
        doc.text(`Location: ${data.address || '---'}`).moveDown(1);

        doc.fontSize(12).text('3. SERVICE PLAN', { underline: true }).moveDown(0.5);
        doc.fontSize(10).text(`Plan: ${data.planName || 'Institutional Hybrid'}`);
        doc.text(`Annual Value: AED ${data.annualValue?.toLocaleString() || '---'}`);
        doc.text(`Mobilization (15%): AED ${data.mobilizationAmount?.toLocaleString() || '---'}`).moveDown(1);

        doc.fontSize(12).text('4. TERMS & CONDITIONS', { underline: true }).moveDown(0.5);
        doc.fontSize(8).text('This contract is governed by the laws of the United Arab Emirates. BIN GROUP provides 24/7 technical monitoring and maintenance services as per the selected SLA tier. All repairs above 1000 AED require explicit owner approval via the Sovereign Dashboard.', { align: 'justify' }).moveDown(4);

        // 4. Signatures
        doc.fontSize(10).text('_________________________', 50, 600);
        doc.text('OWNER SIGNATURE', 50, 615);

        doc.text('_________________________', 350, 600);
        doc.text('BIN GROUP L.L.C AUTHORIZED', 350, 615);

        doc.end();
    });
}

export async function generatePayslipPDF(data: any) {
    return new Promise<string>(async (resolve, reject) => {
        const doc = new PDFDocument({ margin: 50, size: 'A4' });
        const chunks: any[] = [];
        
        doc.on('data', chunk => chunks.push(chunk));
        doc.on('end', async () => {
            const buffer = Buffer.concat(chunks);
            const storage = getStorage();
            const bucket = storage.bucket();
            const file = bucket.file(`payslips/${data.staffId}/${data.payPeriod}.pdf`);
            
            await file.save(buffer, {
                contentType: 'application/pdf',
                metadata: {
                    metadata: {
                        staffId: data.staffId,
                        payPeriod: data.payPeriod
                    }
                }
            });

            const url = await file.getSignedUrl({
                action: 'read',
                expires: '03-09-2491'
            });
            resolve(url[0]);
        });

        doc.fillColor('#C6A75E').fontSize(20).text('BIN GROUP - PAY ADVICE', { align: 'center' }).moveDown(2);
        
        doc.fillColor('#000').fontSize(12).text(`Staff Name: ${data.staffName}`);
        doc.text(`Employee ID: ${data.staffId}`);
        doc.text(`Position: ${data.position}`).moveDown(1);
        
        doc.text(`Pay Period: ${data.payPeriod}`);
        doc.text(`Payment Date: ${data.paymentDate}`).moveDown(2);

        doc.rect(50, 220, 500, 1).fill('#EEE');
        doc.moveDown(1);

        doc.fontSize(11).text('DESCRIPTION', 50, 240);
        doc.text('AMOUNT (AED)', 400, 240, { align: 'right' }).moveDown(1);

        doc.fontSize(10).text('Basic Salary', 50, 270);
        doc.text(data.basicSalary?.toLocaleString(), 400, 270, { align: 'right' });

        doc.text('Allowances', 50, 290);
        doc.text(data.allowances?.toLocaleString(), 400, 290, { align: 'right' });

        doc.text('Overtime', 50, 310);
        doc.text(data.overtime?.toLocaleString(), 400, 310, { align: 'right' });

        doc.fillColor('#ff4d4d').text('Deductions', 50, 330);
        doc.text(`(${data.deductions?.toLocaleString()})`, 400, 330, { align: 'right' });

        doc.rect(50, 360, 500, 2).fill('#C6A75E');
        doc.fillColor('#000').fontSize(14).text('NET SALARY', 50, 380);
        doc.text(`AED ${data.netSalary?.toLocaleString()}`, 400, 380, { align: 'right' });

        doc.end();
    });
}

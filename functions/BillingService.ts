import { FieldValue } from "firebase-admin/firestore";
import * as admin from 'firebase-admin';

export const generateAndEmailInvoice = async (contractId: string, ownerId: string, amount: number) => {
    const db = admin.firestore();
    const invoiceId = `INV-${Date.now()}`;
    
    // 1. Create Invoice Document in Firestore
    const invoiceData = {
        invoiceId,
        contractId,
        ownerId,
        amount,
        feeType: 'Property Management Fee',
        status: 'UNPAID',
        currency: 'AED',
        issuedAt: FieldValue.serverTimestamp(),
        dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days from now
    };

    await db.collection('invoices').doc(invoiceId).set(invoiceData);

    // 2. Fetch Owner Data for Email
    const ownerSnap = await db.collection('users').doc(ownerId).get();
    const ownerData = ownerSnap.data();
    if (!ownerData?.email) return;

    // 3. Trigger Email via 'mail' collection (Firestore Email Extension)
    await db.collection('mail').add({
        to: ownerData.email,
        message: {
            subject: `Invoice Generated: ${invoiceId} - BIN GROUP Management`,
            html: `
                <div style="font-family: sans-serif; padding: 40px; color: #000; border: 1px solid #EEE; border-radius: 8px; max-width: 600px; margin: 0 auto;">
                    <h1 style="color: #C6A75E; font-size: 24px; margin-bottom: 20px;">Digital Invoice</h1>
                    <p style="font-size: 16px; line-height: 1.6;">An institutional invoice has been generated for your property management services.</p>
                    <div style="background: #F8FAFC; padding: 30px; border-radius: 8px; margin: 24px 0; border: 1px solid #C6A75E;">
                        <p style="margin: 0; font-size: 14px; color: #64748B;"><b>Invoice ID:</b> ${invoiceId}</p>
                        <p style="margin: 8px 0; font-size: 14px; color: #64748B;"><b>Fee Type:</b> Property Management Fee</p>
                        <h2 style="margin: 20px 0 0; color: #000;">AED ${amount.toLocaleString()}</h2>
                        <p style="margin: 4px 0 0; font-size: 12px; color: #94A3B8;">DUE DATE: ${invoiceData.dueDate.toLocaleDateString()}</p>
                    </div>
                    <p style="font-size: 14px; line-height: 1.6; color: #64748B;">Please settle this invoice via your Sovereign Dashboard to maintain protocol compliance.</p>
                    <a href="https://bin-groups.com/login" style="display: inline-block; background: #C6A75E; color: #000; padding: 14px 32px; text-decoration: none; font-weight: 900; border-radius: 100px; margin-top: 20px;">View Dashboard</a>
                    <hr style="border: 0; border-top: 1px solid #EEE; margin: 32px 0;">
                    <p style="font-size: 10px; color: #94A3B8; text-transform: uppercase; letter-spacing: 1px;">Sovereign Financial Communication · BIN GROUP Dubai</p>
                </div>
            `
        },
        createdAt: FieldValue.serverTimestamp()
    });

    console.log(`[Billing] Invoice ${invoiceId} generated and queued for ${ownerData.email}`);
};

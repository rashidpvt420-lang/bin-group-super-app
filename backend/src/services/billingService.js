const { db } = require('../config/firebase');
const GovernanceService = require('./governanceService');
const crypto = require('crypto');

/**
 * BIN-BILLING™ & SUBSCRIPTION SYSTEM
 * Automates invoicing, payment tracking, and contract lifecycle management.
 * 🌍 Upgraded to 2026 Arabic VAT Engine (FTA Compliant).
 */

const VAT_RATE = 0.05; // standard FTA 5%

const generateInvoice = async (contractId, amount, dueDateOffset = 7) => {
  try {
    const contractRef = db.collection('contracts').doc(contractId);
    const contractSnap = await contractRef.get();
    
    if (!contractSnap.exists) throw new Error("Contract not found");
    const contractData = contractSnap.data();

    const invoiceRef = db.collection('invoices').doc();
    const today = Date.now();

    // 🧾 VAT Calculations
    const vatAmount = amount * VAT_RATE;
    const grandTotal = amount + vatAmount;

    // 🧬 Generate Forensic Invoice Hash
    const forensicInvoiceHash = calculateInvoiceHash({ 
        contractId, 
        netAmount: amount, 
        vatAmount,
        grandTotal,
        date: today,
        custTRN: contractData.taxId || 'N/A'
    });

    const invoice = {
      invoiceId: invoiceRef.id,
      contractId: contractId,
      ownerId: contractData.ownerId,
      portfolioId: contractData.portfolioId || null,
      
      // Financials (FTA Format)
      netAmount: amount,
      vatAmount: vatAmount,
      grandTotal: grandTotal,
      currency: 'AED',
      vatRate: 5,
      
      status: 'PENDING',
      issuedDate: today,
      dueDate: today + dueDateOffset * 24 * 60 * 60 * 1000,
      propertyReference: contractData.propertyName,
      slaTier: contractData.slaLevel,
      billingDescription: `Maintenance Fee for ${new Date(today).toLocaleString('default', { month: 'long', year: 'numeric' })}`,
      
      // Bilingual Identity (Legal Requirement)
      labels: {
          invoice_en: "Tax Invoice",
          invoice_ar: "فاتورة ضريبية",
          trn_en: "TRN",
          trn_ar: "الرقم الضريبي"
      },
      supplierTRN: process.env.SUPPLIER_TRN || '100XXXXXXXXXXXX',
      customerTRN: contractData.taxId || 'N/A',
      
      forensicInvoiceHash
    };

    await invoiceRef.set(invoice);

    // 🛡️ Log to Governance: Invoice Issuance
    await GovernanceService.logInstitutionalAction({
        actorId: 'SYSTEM_BILLING',
        actorRole: 'FINANCE',
        actionType: 'INVOICE_CREATE',
        entityType: 'INVOICE',
        entityId: invoiceRef.id,
        payload: { amount, grandTotal, forensicInvoiceHash }
    });

    return invoice;
  } catch (error) {
    console.error("Error generating invoice:", error);
    throw error;
  }
};

const processDailyBilling = async () => {
    const today = Date.now();
    
    // 1. Process Active Contracts for Invoicing
    const activeContracts = await db.collection('contracts')
        .where('status', '==', 'ACTIVE')
        .get();

    for (const doc of activeContracts.docs) {
        const contract = doc.data();
        if (today >= contract.nextBillingDate) {
            console.log(`Generating invoice for Contract: ${contract.contractId}`);
            
            // Generate Invoice
            const monthlyAmount = contract.paymentTerms?.amount || (contract.contractValue / 12);
            await generateInvoice(contract.contractId, monthlyAmount);

            // Update Next Billing Date (e.g., +30 days)
            const nextCycle = contract.nextBillingDate + 30 * 24 * 60 * 60 * 1000;
            await doc.ref.update({ nextBillingDate: nextCycle });
        }

        // 2. Renewal Trigger (30 days before contract ends)
        const daysToExpiry = (contract.endDate - today) / (24 * 60 * 60 * 1000);
        if (daysToExpiry <= 30 && contract.status !== 'RENEWAL_PENDING') {
            console.log(`Triggering Renewal Flow for Contract: ${contract.contractId}`);
            await doc.ref.update({ status: 'RENEWAL_PENDING' });
            
            // Create a Renewal Task / Notification for the Owner
            await db.collection('notifications').add({
                userId: contract.ownerId,
                title: "Contract Renewal Required",
                message: `Your maintenance contract for ${contract.propertyName} expires in ${Math.round(daysToExpiry)} days. Review the renewal offer now.`,
                type: "RENEWAL",
                createdAt: today
            });
        }
    }

    // 3. Mark Overdue Invoices
    const pendingInvoices = await db.collection('invoices')
        .where('status', '==', 'PENDING')
        .get();

    for (const doc of pendingInvoices.docs) {
        if (today > doc.data().dueDate) {
            console.log(`Marking Invoice ${doc.id} as OVERDUE`);
            await doc.ref.update({ status: 'OVERDUE' });
        }
    }
};

const markInvoiceAsPaid = async (invoiceId, paymentReference) => {
    try {
        const invoiceRef = db.collection('invoices').doc(invoiceId);
        const invoiceData = (await invoiceRef.get()).data();

        await invoiceRef.update({
            status: 'PAID',
            paymentReference: paymentReference,
            paidAt: Date.now()
        });
        
        // 🔒 Log to Governance: Audit the Revenue Stream
        await GovernanceService.logInstitutionalAction({
            actorId: invoiceData.ownerId,
            actorRole: 'OWNER',
            actionType: 'INVOICE_SETTLEMENT',
            entityType: 'INVOICE',
            entityId: invoiceId,
            payload: { 
                amount: invoiceData.amount,
                paymentReference, 
                originalInvoiceHash: invoiceData.forensicInvoiceHash 
            },
            metadata: { description: `Invoice ${invoiceId} fully settled.` }
        });

        return true;
    } catch (error) {
        console.error("Error marking invoice as paid:", error);
        throw error;
    }
};

const calculateInvoiceHash = (data) => {
    const secret = process.env.AUDIT_SECRET || 'BIN-GOVERNANCE-2026';
    return crypto.createHmac('sha256', secret)
        .update(JSON.stringify(data))
        .digest('hex');
};

module.exports = {
  generateInvoice,
  processDailyBilling,
  markInvoiceAsPaid,
  calculateInvoiceHash
};

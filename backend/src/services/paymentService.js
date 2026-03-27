const { db } = require('../config/firebase');

/**
 * BIN-PAY™ Financial Orchestration Service
 * Agnostic gateway wrapper for Stripe, Telr, and PayTabs
 */

class PaymentService {
  /**
   * Create a Payment Intent for an invoice
   */
  async createPaymentIntent(invoiceId) {
    console.log(`💳 [BIN-PAY] Generating Payment Intent for Invoice: ${invoiceId}`);
    
    const invoiceDoc = await db.collection('invoices').doc(invoiceId).get();
    if (!invoiceDoc.exists) throw new Error('Invoice not found');
    
    const invoiceData = invoiceDoc.data();
    const amount = invoiceData.amount;

    // Simulate Gateway Intent (Stripe/Telr)
    const clientSecret = `pi_sim_${Math.random().toString(36).substring(7)}`;
    
    // Update invoice with intent ID
    await db.collection('invoices').doc(invoiceId).update({
      paymentIntentId: clientSecret,
      status: 'PENDING'
    });

    return {
      clientSecret,
      amount,
      currency: 'AED'
    };
  }

  /**
   * Handle Payment Success Webhook
   */
  async handlePaymentWebhook(event) {
    const { invoiceId, transactionId, status, amount, gateway } = event;

    if (status === 'SUCCESS') {
      console.log(`✅ [BIN-PAY] Payment Success: ${transactionId} for Invoice: ${invoiceId}`);

      // 1. Update Invoice status
      await db.collection('invoices').doc(invoiceId).update({
        status: 'PAID',
        paymentReference: transactionId,
        paidAt: Date.now()
      });

      // 2. Record Payment Transaction
      await db.collection('payments').add({
        paymentId: `PAY-${Date.now()}`,
        invoiceId,
        amount,
        currency: 'AED',
        status: 'SUCCESS',
        gateway,
        transactionRef: transactionId,
        createdAt: Date.now()
      });

      // 3. Check if this activates a contract
      const invoiceDoc = await db.collection('invoices').doc(invoiceId).get();
      const contractId = invoiceDoc.data().contractId;
      
      if (contractId) {
        await db.collection('contracts').doc(contractId).update({
          paymentStatus: 'PAID',
          activatedAt: Date.now()
        });
      }

      return { success: true };
    }

    return { success: false, reason: 'Payment failed or pending' };
  }

  /**
   * Automated Subscription Auto-Billing Trigger
   */
  async triggerAutoBilling(ownerId) {
    console.log(`🔁 [BIN-PAY] Triggering Auto-Billing for Owner: ${ownerId}`);
    // Logic to select payment method and auto-charge via gateway
  }
}

module.exports = new PaymentService();

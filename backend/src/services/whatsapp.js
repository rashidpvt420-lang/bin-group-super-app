// backend/src/services/whatsapp.js
// Phase 3: WhatsApp Cloud Bot (Meta Developer API)

/**
 * Simulates sending a WhatsApp notification via the Meta API.
 * @param {string} phone - Target phone number (e.g. +971501234567)
 * @param {string} templateId - The approved predefined WhatsApp template ID.
 * @param {Object} payload - Dynamic data for the template.
 */
async function sendWhatsAppNotification(phone, templateId, payload) {
    console.log(`[WhatsApp API] Dispatching message to ${phone} using template [${templateId}]...`);

    // Simulate network delay
    await new Promise(resolve => setTimeout(resolve, 500));

    let messageBody = "";

    if (templateId === "tech_arrival_5min") {
        messageBody = `BIN Group OS: Technician ${payload.technicianName} is 5 minutes away. Click here for live GPS map: https://bingroup.ae/live/${payload.ticketId}`;
    } else if (templateId === "payment_success_split") {
        messageBody = `BIN Group OS: Your rent payment of AED ${payload.amount} has been successfully collected and split routed to the owner's IBAN.`;
    } else {
        messageBody = `BIN Group OS: Notification regarding ticket ${payload.ticketId}.`;
    }

    // Record that the message was sent
    console.log(`[WhatsApp API] SUCCESS: Message delivered. Body: "${messageBody}"`);

    return {
        success: true,
        messageId: "wamid.HBgMOTE5NXXXXXXXXXX",
        deliveredAt: new Date().toISOString()
    };
}

module.exports = {
    sendWhatsAppNotification
};

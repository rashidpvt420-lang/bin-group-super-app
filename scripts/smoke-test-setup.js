// scripts/smoke-test-setup.js
const admin = require('firebase-admin');

// Authenticate using GOOGLE_APPLICATION_CREDENTIALS env var or local file fallback
if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    admin.initializeApp({
        credential: admin.credential.applicationDefault()
    });
    console.log("[SMOKE] Authenticated via Application Default Credentials.");
} else {
    try {
        const serviceAccount = require('../serviceAccountKey.json');
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount)
        });
        console.log("[SMOKE] Authenticated via local serviceAccountKey.json.");
    } catch (e) {
        console.error("CRITICAL: No authentication method found. Please set GOOGLE_APPLICATION_CREDENTIALS.");
        process.exit(1);
    }
}

const db = admin.firestore();

const setupSmokeTest = async () => {
    const techEmail = 'tech-test@bingroup.ae';
    const tenantEmail = 'tenant-test@bingroup.ae';
    const techUid = 'tech_smoke_test_001';
    const tenantUid = 'tenant_smoke_test_001';

    try {
        console.log("--- 1. SETTING UP TEST PROFILES ---");
        
        // 1. Technician
        await db.collection('users').doc(techUid).set({
            uid: techUid,
            displayName: "Tech Lead (Smoke Test)",
            email: techEmail,
            role: "technician",
            status: "active",
            isAdmin: false,
            godMode: false,
            phoneNumber: "+971500000001",
            specialization: "HVAC",
            createdAt: admin.firestore.FieldValue.serverTimestamp()
        });

        await db.collection('technicians').doc(techUid).set({
            uid: techUid,
            name: "Tech Lead (Smoke Test)",
            email: techEmail,
            phone: "+971500000001",
            trade: "HVAC",
            status: "active",
            available: true,
            assignedTickets: [],
            activeTicketCount: 0,
            createdAt: admin.firestore.FieldValue.serverTimestamp()
        });

        // 2. Tenant
        await db.collection('users').doc(tenantUid).set({
            uid: tenantUid,
            displayName: "Tenant (Smoke Test)",
            email: tenantEmail,
            role: "tenant",
            status: "active",
            isAdmin: false,
            godMode: false,
            phoneNumber: "+971500000002",
            unitId: "UNIT-SMOKE-01",
            propertyId: "PROP-SMOKE-01",
            createdAt: admin.firestore.FieldValue.serverTimestamp()
        });

        console.log("--- 2. SIMULATING MAINTENANCE CYCLE ---");
        
        // 3. Create Ticket (Raised by Tenant)
        const ticketId = 'ticket_smoke_test_999';
        await db.collection('maintenanceTickets').doc(ticketId).set({
            ticketId: ticketId,
            tenantId: tenantUid,
            unitId: "UNIT-SMOKE-01",
            issueType: "AC Leak",
            description: "Water dripping from the main HVAC unit in the living room.",
            status: "OPEN",
            priority: "HIGH",
            assignedTo: techUid,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            source: "SMOKE_TEST"
        });

        console.log(`[SUCCESS] Smoke test cycle initialized.`);
        console.log(`Technician: ${techEmail} (UID: ${techUid})`);
        console.log(`Tenant: ${tenantEmail} (UID: ${tenantUid})`);
        console.log(`Ticket: ${ticketId}`);
        
        process.exit(0);
    } catch (error) {
        console.error("Smoke Test Setup Failed:", error);
        process.exit(1);
    }
};

setupSmokeTest();

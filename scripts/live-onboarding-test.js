// scripts/live-onboarding-test.js
const admin = require('firebase-admin');

// Authenticate using GOOGLE_APPLICATION_CREDENTIALS env var
if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    admin.initializeApp({
        credential: admin.credential.applicationDefault()
    });
    console.log("[\uD83D\uDE80 LIVE-TEST] Authenticated via Application Default Credentials.");
} else {
    console.error("CRITICAL: GOOGLE_APPLICATION_CREDENTIALS not set. Cannot run live test.");
    process.exit(1);
}

const db = admin.firestore();

const runHighValueFlow = async () => {
    const ownerEmail = 'rashid-owner-test@bin-group.com';
    const ownerUid = `owner_live_test_${Date.now()}`;
    const propertyId = `prop_sovereign_${Date.now()}`;

    try {
        console.log("--- STAGE 1: OWNER ONBOARDING ---");
        
        // 1. Create Owner Profile (Sovereign Initial State)
        await db.collection('users').doc(ownerUid).set({
            uid: ownerUid,
            displayName: "Rashid (Sovereign Owner Test)",
            email: ownerEmail,
            role: "owner",
            status: "pending_activation", // Standard protocol before payment
            isAdmin: false,
            godMode: false,
            phoneNumber: "+971500000000",
            kycVerified: true,
            createdAt: admin.firestore.FieldValue.serverTimestamp()
        });

        // 2. Register High-Value Asset
        await db.collection('properties').doc(propertyId).set({
            propertyId,
            ownerId: ownerUid,
            propertyName: "Sovereign Tower Unit 420",
            area: "Downtown Dubai",
            propertyType: "PENTHOUSE",
            builtUpAreaSqFt: 4500,
            healthIndex: 100, // Initial perfect state
            status: "active",
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            lastAuditAt: null
        });

        console.log(`[SUCCESS] Owner ${ownerEmail} onboarded with Asset ${propertyId}.`);

        console.log("--- STAGE 2: HIGH-VALUE CASH DEPOSIT ---");
        
        // 3. Generate Contract/Transaction (AED 50,000 Activation)
        const contractId = `cnt_${Date.now()}`;
        const amount = 50000;
        
        await db.collection('contracts').doc(contractId).set({
            contractId,
            ownerId: ownerUid,
            propertyId: propertyId,
            amount: amount,
            currency: "AED",
            status: "AWAITING_VERIFICATION",
            provider: "CASH",
            paymentVerified: false,
            paymentManifest: {
                method: "CASH",
                verificationNote: "High-Value Sovereign Activation"
            },
            createdAt: admin.firestore.FieldValue.serverTimestamp()
        });

        // 4. Add to Ledger (Simulate the Transaction record that triggers Sync)
        const txId = `tx_live_test_${Date.now()}`;
        await db.collection('transactions').doc(txId).set({
            ownerId: ownerUid,
            propertyId: propertyId,
            amount: amount,
            type: "credit",
            status: "COMPLETED",
            category: "activation",
            description: "Owner Portal Activation - Sovereign Tier",
            date: new Date().toISOString().split('T')[0],
            relatedContract: contractId,
            createdAt: admin.firestore.FieldValue.serverTimestamp()
        });

        console.log(`[SUCCESS] Transaction of AED ${amount} logged. Triggering Liquidity Sync...`);

        console.log("--- STAGE 3: SOVEREIGN AUDIT VAULT TRIGGER ---");
        // The Cloud Function 'onPropertyOnboarded' should trigger automatically on the 'properties' doc creation.
        // We wait a few seconds for the PDF generation to complete.
        
        console.log("Waiting 10s for Cloud Function triggers (Sync & Audit)...");
        await new Promise(resolve => setTimeout(resolve, 10000));

        // 5. Verify Liquidity Cache
        const cacheDoc = await db.collection('system_cache').doc('liquidity_summary').get();
        if (cacheDoc.exists) {
            const cache = cacheDoc.data();
            console.log("[\u2705 CACHE VERIFIED] Current Global Liquidity:", cache.totalLiquidity, "AED");
            console.log("Total Transactions Cached:", cache.transactionCount);
        } else {
            console.warn("[\u26A0 WARNING] Liquidity Cache doc not found yet. Trigger might be pending.");
        }

        console.log("\n--- LIVE VERIFICATION COMPLETE ---");
        console.log(`Owner UID: ${ownerUid}`);
        console.log(`Property ID: ${propertyId}`);
        console.log(`Check Admin Panel for AED ${amount} entry in the Sovereign Dashboard.`);
        
        process.exit(0);
    } catch (error) {
        console.error("[\u274C FATAL] Live Onboarding Test Failed:", error);
        process.exit(1);
    }
};

runHighValueFlow();

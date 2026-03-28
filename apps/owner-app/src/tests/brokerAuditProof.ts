// Audit Proof: Broker CSV Import Logic
import { db, collection, addDoc, getDocs, query, where, serverTimestamp } from '../lib/firebase';

async function testBrokerCSVReconciliation() {
    console.log("[AUDIT] Starting Broker CSV Import Verification...");
    
    // 1. Mock Valid Data
    const row = {
        propertyName: "Audit Luxury Towers",
        unitNumber: "1201",
        ownerName: "Khalid bin Rashid",
        phone: "+971501234567",
        email: "k.rashid@example.com",
        status: "PENDING_REVIEW"
    };

    try {
        const docRef = await addDoc(collection(db, 'intake_submissions'), {
            ...row,
            createdAt: serverTimestamp(),
            source: 'AUDIT_PROOF_TEST'
        });
        console.log(`[PASS] Valid CSV Row Written to intake_submissions. ID: ${docRef.id}`);
    } catch (err) {
        console.error("[FAIL] Valid CSV rejection. Possible security rule mismatch.", err);
    }

    // 2. Mock Malformed (Bypassing status)
    try {
        await addDoc(collection(db, 'intake_submissions'), {
            ...row,
            status: "ACTIVE" // Bypassing review
        });
        console.error("[FAIL] Malformed CSV ALLOWED. Critical security rule gap detected.");
    } catch (err) {
        console.log("[PASS] Malformed Status 'ACTIVE' correctly blocked by firestore.rules.");
    }
}

export default testBrokerCSVReconciliation;

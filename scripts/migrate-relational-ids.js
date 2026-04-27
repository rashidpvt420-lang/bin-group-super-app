/**
 * BIN GROUP: RELATIONAL MODEL MIGRATION SCRIPT (V7.2)
 * 
 * Objective: 
 * Ensure all users (tenants) and tickets store real document IDs for unitId.
 * Map descriptive strings like "Villa 14" to actual document IDs.
 */

const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function runMigration() {
    console.log("🚀 [MIGRATION] Starting relational ID synchronization...");

    // 1. Map all units for fast lookup
    const unitsSnap = await db.collection('units').get();
    const unitMap = new Map(); // unitNumber -> docId
    unitsSnap.forEach(doc => {
        const data = doc.data();
        if (data.unitNumber) {
            unitMap.set(data.unitNumber, doc.id);
        }
    });
    console.log(`- Indexed ${unitMap.size} units.`);

    // 2. Fix Users (Tenants)
    const usersSnap = await db.collection('users').where('role', '==', 'tenant').get();
    let userFixes = 0;
    const userBatch = db.batch();

    usersSnap.forEach(docSnap => {
        const data = docSnap.data();
        // If unitId is a string like "Villa 14" and we have a mapping
        if (data.unitId && unitMap.has(data.unitId)) {
            const realId = unitMap.get(data.unitId);
            console.log(`[FIX] User ${docSnap.id}: ${data.unitId} -> ${realId}`);
            userBatch.update(docSnap.ref, {
                unitId: realId,
                unitNumber: data.unitId, // Move label to dedicated field
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            });
            userFixes++;
        }
    });

    if (userFixes > 0) {
        await userBatch.commit();
        console.log(`✅ [SUCCESS] Fixed ${userFixes} tenant relational anchors.`);
    }

    // 3. Fix Tickets
    const ticketsSnap = await db.collection('maintenanceTickets').get();
    let ticketFixes = 0;
    const ticketBatch = db.batch();

    ticketsSnap.forEach(docSnap => {
        const data = docSnap.data();
        if (data.unitId && unitMap.has(data.unitId)) {
            const realId = unitMap.get(data.unitId);
            console.log(`[FIX] Ticket ${docSnap.id}: ${data.unitId} -> ${realId}`);
            ticketBatch.update(docSnap.ref, {
                unitId: realId,
                unitNumber: data.unitId,
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            });
            ticketFixes++;
        }
    });

    if (ticketFixes > 0) {
        await ticketBatch.commit();
        console.log(`✅ [SUCCESS] Fixed ${ticketFixes} ticket relational anchors.`);
    }

    console.log("🏁 [MIGRATION COMPLETE] Institutional data model is now hardened.");
}

runMigration().catch(console.error);

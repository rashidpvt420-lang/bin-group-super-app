/**
 * BIN GROUP: RELATIONAL INTEGRITY REPAIR SCRIPT (MIGRATION V7)
 * 
 * Objective: 
 * Identify 'orphan' tickets/tenants missing propertyId or unitId.
 * Flag them for Admin review in the War Room.
 */

const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function runStructuralRepair() {
    console.log("🚀 [MIGRATION] Initializing structural integrity check...");

    const collections = ['maintenanceTickets', 'users'];
    let totalOrphans = 0;

    for (const colName of collections) {
        console.log(`Checking ${colName}...`);
        const snap = await db.collection(colName).get();
        const batch = db.batch();
        let colOrphans = 0;

        snap.forEach(docSnap => {
            const data = docSnap.data();
            const isTenant = colName === 'users' && data.role === 'tenant';
            const isTicket = colName === 'maintenanceTickets';

            if (isTenant || isTicket) {
                if (!data.propertyId || !data.unitId) {
                    console.log(`[FAULT] Orphan detected: ${colName}/${docSnap.id}`);
                    batch.update(docSnap.ref, {
                        propertyId: 'UNASSOCIATED',
                        unitId: 'UNASSOCIATED',
                        integrityStatus: 'FAULT',
                        updatedAt: admin.firestore.FieldValue.serverTimestamp()
                    });
                    colOrphans++;
                }
            }
        });

        if (colOrphans > 0) {
            await batch.commit();
            console.log(`✅ [REPAIR] Anchored ${colOrphans} orphans in ${colName} as UNASSOCIATED.`);
            totalOrphans += colOrphans;
        }
    }

    console.log(`🏁 [MIGRATION COMPLETE] Sector scans finished. Total Orphans flagged: ${totalOrphans}`);
}

runStructuralRepair().catch(console.error);

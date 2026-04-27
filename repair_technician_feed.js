const admin = require('firebase-admin');

if (admin.apps.length === 0) {
    admin.initializeApp({
        projectId: 'bin-group-57c60',
    });
}

const db = admin.firestore();

async function repairTechnicianFeed() {
    console.log("🛠️ [REPAIR] Starting technician feed integrity repair...");
    
    const ticketsRef = db.collection('maintenanceTickets');
    const snapshot = await ticketsRef.get();
    
    const approvedStatuses = ['OPEN', 'ASSIGNED', 'EN_ROUTE', 'ARRIVED', 'IN_PROGRESS', 'COMPLETED'];
    const statusMap = {
        'pending': 'OPEN',
        'assigned': 'ASSIGNED',
        'CLAIMED': 'ASSIGNED',
        'taken': 'ASSIGNED',
        'finished': 'COMPLETED',
        'done': 'COMPLETED',
        'in-progress': 'IN_PROGRESS',
        'enroute': 'EN_ROUTE',
        'arrived': 'ARRIVED'
    };

    let repairedCount = 0;
    let orphanRepairedCount = 0;
    let statusRepairedCount = 0;

    const batch = db.batch();

    for (const doc of snapshot.docs) {
        const t = doc.data();
        let needsFix = false;
        const update = { updatedAt: admin.firestore.FieldValue.serverTimestamp() };

        // 1. Status Normalization
        if (statusMap[t.status]) {
            update.status = statusMap[t.status];
            needsFix = true;
            statusRepairedCount++;
        } else if (!approvedStatuses.includes(t.status) && t.status) {
            // Fallback for unknown statuses - if it has a tech, it's ASSIGNED, else OPEN
            update.status = t.assignedTechnicianId ? 'ASSIGNED' : 'OPEN';
            needsFix = true;
            statusRepairedCount++;
        }

        // 2. Relational Orphan Repair
        if (!t.propertyId || t.propertyId === 'UNASSOCIATED' || !t.unitId) {
            if (t.tenantId) {
                const tenantDoc = await db.collection('users').doc(t.tenantId).get();
                if (tenantDoc.exists) {
                    const tenantData = tenantDoc.data();
                    if (tenantData.propertyId && tenantData.propertyId !== 'UNASSOCIATED') {
                        update.propertyId = tenantData.propertyId;
                        update.unitId = tenantData.unitId || t.unitId;
                        update.propertyName = tenantData.propertyName || t.propertyName || 'Institutional Asset';
                        update.unitNumber = tenantData.unitNumber || t.unitNumber || 'N/A';
                        update.ownerId = tenantData.ownerId || t.ownerId || 'SYSTEM';
                        needsFix = true;
                        orphanRepairedCount++;
                    }
                }
            }
        }

        // 3. Assigned Technician Mismatch
        if (t.status === 'ASSIGNED' && !t.assignedTechnicianId) {
            update.status = 'OPEN'; // Revert to pool if no tech
            needsFix = true;
        }

        if (needsFix) {
            batch.update(doc.ref, update);
            repairedCount++;
            console.log(`✅ [FIXED] Ticket ${doc.id}: Status(${t.status}->${update.status || t.status}) Orphan(${!!update.propertyId})`);
        }
    }

    if (repairedCount > 0) {
        await batch.commit();
        console.log(`🏁 [COMPLETE] Repaired ${repairedCount} tickets (${statusRepairedCount} statuses, ${orphanRepairedCount} orphans).`);
    } else {
        console.log("🏁 [COMPLETE] No repairs needed.");
    }
    
    return {
        repairedCount,
        statusRepairedCount,
        orphanRepairedCount
    };
}

repairTechnicianFeed().catch(console.error);

const admin = require('firebase-admin');

if (admin.apps.length === 0) {
    admin.initializeApp({
        projectId: 'bin-group-57c60',
    });
}

const db = admin.firestore();

async function runRepair(isCommit) {
    console.log(`🚀 [REPAIR] Starting mode: ${isCommit ? 'COMMIT' : 'DRY_RUN'}`);
    
    const tickets = await db.collection("maintenanceTickets").get();
    const approvedStatuses = ['OPEN', 'ASSIGNED', 'EN_ROUTE', 'ARRIVED', 'IN_PROGRESS', 'COMPLETED'];
    const statusMap = {
        'assigned': 'ASSIGNED',
        'pending': 'OPEN',
        'CLAIMED': 'ASSIGNED',
        'taken': 'ASSIGNED',
        'finished': 'COMPLETED',
        'done': 'COMPLETED'
    };

    let docsMatched = 0;
    let docsUpdated = 0;
    let docsSkipped = 0;
    const repairedIds = [];
    const report = [];

    const batch = db.batch();

    for (const doc of tickets.docs) {
        const t = doc.data();
        let needsFix = false;
        const update = { 
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            repairSource: 'CLI_PRODUCTION_REPAIR'
        };
        const changes = { before: {}, after: {} };

        // 1. Status
        if (statusMap[t.status]) {
            changes.before.status = t.status;
            update.status = statusMap[t.status];
            changes.after.status = update.status;
            needsFix = true;
        } else if (t.status === 'ASSIGNED' && !t.assignedTechnicianId) {
            changes.before.status = t.status;
            update.status = 'OPEN';
            changes.after.status = update.status;
            needsFix = true;
        }

        // 2. Relational
        if (!t.propertyId || t.propertyId === 'UNASSOCIATED' || !t.unitId) {
            if (t.tenantId) {
                const tenantDoc = await db.collection("users").doc(t.tenantId).get();
                if (tenantDoc.exists) {
                    const tenantData = tenantDoc.data();
                    if (tenantData.propertyId && tenantData.propertyId !== 'UNASSOCIATED') {
                        changes.before.propertyId = t.propertyId;
                        update.propertyId = tenantData.propertyId;
                        update.unitId = tenantData.unitId || t.unitId;
                        changes.after.propertyId = update.propertyId;
                        needsFix = true;
                    } else {
                        docsSkipped++;
                        continue;
                    }
                } else {
                    docsSkipped++;
                    continue;
                }
            } else {
                docsSkipped++;
                continue;
            }
        }

        if (needsFix) {
            docsMatched++;
            if (isCommit) {
                batch.update(doc.ref, update);
                docsUpdated++;
                repairedIds.push(doc.id);
            }
            report.push({ id: doc.id, changes });
        }
    }

    if (isCommit && docsUpdated > 0) {
        await batch.commit();
        await db.collection("repair_audit_logs").add({
            timestamp: admin.firestore.FieldValue.serverTimestamp(),
            summary: { docsMatched, docsUpdated, docsSkipped, repairedIds }
        });
    }

    console.log(`--- RESULTS ---`);
    console.log(`Docs Matched: ${docsMatched}`);
    console.log(`Docs Updated: ${docsUpdated}`);
    console.log(`Docs Skipped: ${docsSkipped}`);
    console.log(`Repaired IDs: ${repairedIds.join(', ')}`);
    report.forEach(r => {
        console.log(`ID: ${r.id} | Changes: ${JSON.stringify(r.changes)}`);
    });
}

const mode = process.argv[2] === 'commit';
runRepair(mode).catch(console.error);

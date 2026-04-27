const { Firestore } = require('@google-cloud/firestore');

const db = new Firestore({
  projectId: 'bin-group-57c60',
});

async function repair() {
  console.log("🛠️ [REPAIR] Starting institutional mission repair...");
  
  const ticketsRef = db.collection('maintenanceTickets');
  const snapshot = await ticketsRef.get();
  
  const repairLog = [];
  let count = 0;

  for (const doc of snapshot.docs) {
    const t = doc.data();
    let needsFix = false;
    const update = { updatedAt: new Date().toISOString() };

    // 1. Status Normalization
    const statusMap = {
      'assigned': 'ASSIGNED',
      'pending': 'OPEN',
      'CLAIMED': 'ASSIGNED',
      'taken': 'ASSIGNED',
      'finished': 'COMPLETED',
      'done': 'COMPLETED'
    };

    if (statusMap[t.status]) {
      update.status = statusMap[t.status];
      needsFix = true;
    }

    // 2. Relational Orphan Repair
    if (!t.propertyId || t.propertyId === 'UNASSOCIATED' || !t.unitId || t.unitId === 'UNASSOCIATED') {
      if (t.tenantId) {
        const tenantDoc = await db.collection('users').doc(t.tenantId).get();
        const tenantData = tenantDoc.data();
        
        if (tenantData && tenantData.propertyId && tenantData.unitId && tenantData.propertyId !== 'UNASSOCIATED') {
          update.propertyId = tenantData.propertyId;
          update.unitId = tenantData.unitId;
          update.propertyName = tenantData.propertyName || t.propertyName;
          update.unitNumber = tenantData.unitNumber || t.unitNumber;
          update.ownerId = tenantData.ownerId || t.ownerId;
          needsFix = true;
        }
      }
    }

    if (needsFix) {
      await doc.ref.update(update);
      console.log(`✅ [FIXED] Ticket ${doc.id}: ${t.status} -> ${update.status || t.status} | Relational: ${!!update.propertyId}`);
      repairLog.push({ id: doc.id, status: update.status || t.status });
      count++;
    }
  }

  console.log(`🏁 [COMPLETE] Repaired ${count} missions.`);
}

repair().catch(console.error);

const admin = require('firebase-admin');

// Check if already initialized to avoid errors in some environments
if (admin.apps.length === 0) {
    admin.initializeApp({
        projectId: 'bin-group-57c60',
    });
}

const db = admin.firestore();

async function audit() {
  console.log("🔍 [AUDIT] Starting ticket integrity audit...");
  
  const ticketsRef = db.collection('maintenanceTickets');
  const snapshot = await ticketsRef.get();
  
  const approvedStatuses = ['OPEN', 'ASSIGNED', 'EN_ROUTE', 'ARRIVED', 'IN_PROGRESS', 'COMPLETED'];
  
  const results = {
    missingPropertyId: [],
    missingUnitId: [],
    unassociatedProperty: [],
    invalidStatus: {},
    assignedMismatches: [],
    totalTickets: snapshot.size
  };

  snapshot.forEach(doc => {
    const t = doc.data();
    const id = doc.id;

    if (!t.propertyId) results.missingPropertyId.push(id);
    if (!t.unitId) results.missingUnitId.push(id);
    if (t.propertyId === 'UNASSOCIATED') results.unassociatedProperty.push(id);
    
    if (!approvedStatuses.includes(t.status)) {
      if (!results.invalidStatus[t.status]) results.invalidStatus[t.status] = [];
      results.invalidStatus[t.status].push(id);
    }

    if (t.status === 'ASSIGNED' && !t.assignedTechnicianId) {
        results.assignedMismatches.push(id);
    }
    if (t.assignedTechnicianId && t.status === 'OPEN') {
        results.assignedMismatches.push(id + " (Has tech but status OPEN)");
    }
  });

  console.log("--- AUDIT RESULTS ---");
  console.log(`Total Tickets: ${results.totalTickets}`);
  console.log(`Missing PropertyId: ${results.missingPropertyId.length} [${results.missingPropertyId.join(', ')}]`);
  console.log(`Missing UnitId: ${results.missingUnitId.length} [${results.missingUnitId.join(', ')}]`);
  console.log(`UNASSOCIATED Property: ${results.unassociatedProperty.length} [${results.unassociatedProperty.join(', ')}]`);
  
  console.log("Invalid Statuses:");
  for (const [status, ids] of Object.entries(results.invalidStatus)) {
    console.log(`  - ${status}: ${ids.length} [${ids.join(', ')}]`);
  }
  
  console.log(`Assigned Mismatches: ${results.assignedMismatches.length} [${results.assignedMismatches.join(', ')}]`);
}

audit().catch(console.error);

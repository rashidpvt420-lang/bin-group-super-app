const admin = require('firebase-admin');

// Using the project ID found in firebase.json
const projectId = 'bin-group-57c60';

if (admin.apps.length === 0) {
    admin.initializeApp({
        projectId: projectId,
    });
}

const db = admin.firestore();

async function verifyLive() {
  console.log(`🔍 [AUDIT] Checking live project: ${projectId}`);
  
  const ticketsRef = db.collection('maintenanceTickets');
  let snapshot;
  try {
      snapshot = await ticketsRef.get();
  } catch (err) {
      console.error("FAILED TO FETCH TICKETS:", err.message);
      process.exit(1);
  }
  
  const techUid = 'tech-test-uid'; // Placeholder, though script should check all
  const approvedStatuses = ['OPEN', 'ASSIGNED', 'EN_ROUTE', 'ARRIVED', 'IN_PROGRESS', 'COMPLETED'];
  
  const results = {
    missingPropertyId: [],
    missingUnitId: [],
    unassociatedProperty: [],
    invalidStatus: {},
    assignedToSpecificTech: [],
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

    // We don't have the specific tech UID from the UI report here, 
    // but we can list all tickets that have ANY tech assigned.
    if (t.assignedTechnicianId) {
        results.assignedToSpecificTech.push({id, techId: t.assignedTechnicianId, status: t.status});
    }
  });

  console.log("\n--- LIVE AUDIT RESULTS ---");
  console.log(`Project: ${projectId}`);
  console.log(`Collection: maintenanceTickets`);
  console.log(`Total Tickets: ${results.totalTickets}`);
  console.log(`Missing propertyId: ${results.missingPropertyId.length} IDs: ${results.missingPropertyId.join(',')}`);
  console.log(`Missing unitId: ${results.missingUnitId.length} IDs: ${results.missingUnitId.join(',')}`);
  console.log(`propertyId == 'UNASSOCIATED': ${results.unassociatedProperty.length} IDs: ${results.unassociatedProperty.join(',')}`);
  
  console.log("Legacy/Bad Statuses Found:");
  for (const [status, ids] of Object.entries(results.invalidStatus)) {
    console.log(`  - "${status}": ${ids.length} IDs: ${ids.join(',')}`);
  }
  
  console.log(`Tickets with assignedTechnicianId: ${results.assignedToSpecificTech.length}`);
  // If we had the specific tech UID, we'd filter here.
  
  const orphans = results.missingPropertyId.length + results.unassociatedProperty.length; // Simplified
  console.log(`\nCalculated Orphans: ${orphans}`);
}

verifyLive().catch(console.error);

import admin from 'firebase-admin';
import chalk from 'chalk';

admin.initializeApp({
    projectId: 'bin-group-57c60'
});

const db = admin.firestore();

async function runStage3Pilot() {
    console.log(chalk.bold.blue("🚀 Starting Stage 3 Production Pilot: Property Passport & Ledger..."));

    const propertyId = `prop_stage3_${Date.now()}`;
    const ownerId = "pilot_owner_123";

    // 1. Create Approved Property
    await db.collection('properties').doc(propertyId).set({
        name: "Stage 3 Pilot Complex",
        ownerId,
        status: "approved",
        emirate: "Dubai",
        type: "Mixed Use",
        address: "Pilot Sector 7, DXB",
        createdAt: admin.firestore.FieldValue.serverTimestamp()
    });
    console.log(chalk.green(`✅ Property Created: ${propertyId}`));

    // 2. Mock 10 Tenants with mixed statuses
    const tenants = [
        { name: "Paid Tenant 1", email: "p1@test.com", rent: 100000, paid: 100000, status: 'paid' },
        { name: "Paid Tenant 2", email: "p2@test.com", rent: 50000, paid: 50000, status: 'paid' },
        { name: "Paid Tenant 3", email: "p3@test.com", rent: 120000, paid: 120000, status: 'paid' },
        { name: "Partial Tenant 1", email: "pr1@test.com", rent: 100000, paid: 60000, status: 'partial' },
        { name: "Partial Tenant 2", email: "pr2@test.com", rent: 80000, paid: 20000, status: 'partial' },
        { name: "Partial Tenant 3", email: "pr3@test.com", rent: 150000, paid: 75000, status: 'partial' },
        { name: "Overdue Tenant 1", email: "o1@test.com", rent: 90000, paid: 0, status: 'overdue' },
        { name: "Overdue Tenant 2", email: "o2@test.com", rent: 110000, paid: 0, status: 'overdue' },
        { name: "Unpaid Tenant 1", email: "u1@test.com", rent: 60000, paid: 0, status: 'unpaid' },
        { name: "Unpaid Tenant 2", email: "u2@test.com", rent: 70000, paid: 0, status: 'unpaid' },
    ];

    const batch = db.batch();
    const importBatchId = `batch_pilot3_${Date.now()}`;

    for (const [i, t] of tenants.entries()) {
        const unitNumber = `P-${100 + i}`;
        const unitId = `unit_${propertyId}_${unitNumber}`;
        const tenantId = `tenant_pilot3_${i}`;
        const leaseId = `lease_pilot3_${i}`;
        const ledgerId = `ledger_pilot3_${i}`;

        // Create Unit
        batch.set(db.collection('units').doc(unitId), {
            propertyId,
            unitNumber,
            tenantId,
            tenantName: t.name,
            occupancyStatus: "occupied",
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });

        // Create User Stub
        batch.set(db.collection('users').doc(tenantId), {
            displayName: t.name,
            email: t.email,
            role: 'tenant',
            status: 'invited',
            propertyId,
            unitId,
            importBatchId
        });

        // Create Lease
        batch.set(db.collection('leases').doc(leaseId), {
            propertyId,
            unitId,
            tenantId,
            ownerId,
            leaseStartDate: "2024-01-01",
            leaseEndDate: "2024-12-31",
            annualRent: t.rent,
            leaseStatus: "active",
            importBatchId
        });

        // Create Ledger
        batch.set(db.collection('tenant_ledger').doc(ledgerId), {
            tenantId,
            propertyId,
            unitId,
            leaseId,
            ownerId,
            annualRent: t.rent,
            paidBalance: t.paid,
            outstandingBalance: t.rent - t.paid,
            paymentStatus: t.status,
            ledgerStatus: 'active',
            importBatchId,
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });
    }

    await batch.commit();
    console.log(chalk.green(`✅ 10 Units/Leases/Ledgers Created.`));

    console.log(chalk.yellow("⏳ Waiting for Cloud Function aggregation (5s)..."));
    await new Promise(r => setTimeout(r, 5000));

    // 3. Verify Property Passport
    const passportSnap = await db.collection('property_passports').doc(`passport_${propertyId}`).get();
    if (!passportSnap.exists) {
        console.log(chalk.red("❌ Property Passport NOT found. CF Trigger might have failed."));
    } else {
        const data = passportSnap.data();
        console.log(chalk.bold.magenta("\n📊 PROPERTY PASSPORT VERIFICATION:"));
        console.log(`Property: ${data.propertyName}`);
        console.log(`Total Units: ${data.totalUnits} (Expected: 10)`);
        console.log(`Occupied: ${data.occupiedUnits} (Expected: 10)`);
        console.log(`Rent Collected: AED ${data.rentCollectedTotal}`);
        console.log(`Rent Outstanding: AED ${data.rentOutstandingTotal}`);
        
        const expectedCollected = tenants.reduce((s, t) => s + t.paid, 0);
        const expectedOutstanding = tenants.reduce((s, t) => s + (t.rent - t.paid), 0);

        if (data.rentCollectedTotal === expectedCollected && data.rentOutstandingTotal === expectedOutstanding) {
            console.log(chalk.bold.green("🏆 PILOT DATA INTEGRITY: 100% MATCH"));
        } else {
            console.log(chalk.red(`⚠️ DATA MISMATCH! Collected: ${data.rentCollectedTotal} vs ${expectedCollected}`));
        }
    }

    console.log(chalk.bold.blue("\n🏁 STAGE 3 PILOT COMPLETE."));
}

runStage3Pilot().catch(console.error);

import admin from 'firebase-admin';
import chalk from 'chalk';
import fs from 'fs';
import Papa from 'papaparse';

admin.initializeApp({
    projectId: 'bin-group-57c60'
});

const db = admin.firestore();

async function runStage4Pilot() {
    console.log(chalk.bold.blue("🚀 Starting Stage 4: 100+ Tenant Tower Pilot..."));

    const csvData = fs.readFileSync('REAL_TOWER_PILOT_100.csv', 'utf8');
    const results = Papa.parse(csvData, { header: true, skipEmptyLines: true });
    const rawRows = results.data;

    const propertyId = `prop_tower_pilot_${Date.now()}`;
    const ownerId = "tower_owner_dxb";

    // 1. Setup Pilot Property
    await db.collection('properties').doc(propertyId).set({
        name: "BIN TOWER OMNI - Pilot Node",
        ownerId,
        status: "approved",
        emirate: "Dubai",
        type: "High-Rise Residential",
        address: "Plot 101, Sheikh Zayed Road",
        totalUnits: 105,
        createdAt: admin.firestore.FieldValue.serverTimestamp()
    });
    console.log(chalk.green(`✅ Property Node Created: ${propertyId}`));

    // 2. Validation Stage (Simulate Frontend)
    console.log(chalk.yellow("📋 Running Validation Protocol..."));
    const validRows = [];
    const errorRows = [];
    const emailSet = new Set();
    const unitSet = new Set();

    rawRows.forEach((row, i) => {
        let hasError = false;
        const errors = [];

        if (!row.tenantName) errors.push("Missing name");
        if (!row.tenantEmail || !row.tenantEmail.includes('@')) errors.push("Invalid email");
        if (!row.unitNumber) errors.push("Missing unit");
        if (!row.annualRent || isNaN(Number(row.annualRent))) errors.push("Invalid rent");

        if (emailSet.has(row.tenantEmail)) errors.push("Duplicate email");
        if (unitSet.has(row.unitNumber)) errors.push("Duplicate unit");

        if (errors.length > 0) {
            errorRows.push({ index: i, row, errors });
        } else {
            emailSet.add(row.tenantEmail);
            unitSet.add(row.unitNumber);
            validRows.push(row);
        }
    });

    console.log(chalk.cyan(`   - Total Rows: ${rawRows.length}`));
    console.log(chalk.green(`   - Valid: ${validRows.length}`));
    console.log(chalk.red(`   - Errors Caught: ${errorRows.length}`));
    
    errorRows.slice(0, 5).forEach(e => {
        console.log(chalk.gray(`     [Line ${e.index + 1}] Errors: ${e.errors.join(', ')}`));
    });

    // 3. Batch Ingestion
    console.log(chalk.yellow("\n💉 Injecting Data Batches..."));
    const importBatchId = `batch_tower_${Date.now()}`;
    
    // Split into chunks of 100 (Firestore batch limit is 500, but we do multiple ops per row)
    // 1 row = unit + user + lease + ledger + invitation = 5 ops
    // So 100 rows = 500 ops.
    const CHUNK_SIZE = 100;
    for (let i = 0; i < validRows.length; i += CHUNK_SIZE) {
        const chunk = validRows.slice(i, i + CHUNK_SIZE);
        const batch = db.batch();

        for (const row of chunk) {
            const tenantEmail = row.tenantEmail.toLowerCase().trim();
            const unitId = `unit_${propertyId}_${row.unitNumber}`;
            const tenantId = `user_${importBatchId}_${row.unitNumber}`;
            const leaseId = `lease_${importBatchId}_${row.unitNumber}`;
            const ledgerId = `ledger_${importBatchId}_${row.unitNumber}`;
            const inviteId = `invite_${importBatchId}_${row.unitNumber}`;

            const annualRent = Number(row.annualRent);
            const paidBalance = Number(row.paidBalance) || 0;
            const outstanding = Math.max(0, annualRent - paidBalance);

            // Unit
            batch.set(db.collection('units').doc(unitId), {
                propertyId,
                unitNumber: row.unitNumber,
                tenantId,
                tenantName: row.tenantName,
                occupancyStatus: "occupied",
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            });

            // User Stub
            batch.set(db.collection('users').doc(tenantId), {
                role: "tenant",
                status: "invited",
                displayName: row.tenantName,
                email: tenantEmail,
                propertyId,
                unitId,
                importBatchId,
                createdAt: admin.firestore.FieldValue.serverTimestamp()
            });

            // Lease
            batch.set(db.collection('leases').doc(leaseId), {
                propertyId,
                unitId,
                tenantId,
                ownerId,
                leaseStartDate: row.leaseStartDate,
                leaseEndDate: row.leaseEndDate,
                annualRent,
                leaseStatus: "active",
                importBatchId,
                createdAt: admin.firestore.FieldValue.serverTimestamp()
            });

            // Ledger
            batch.set(db.collection('tenant_ledger').doc(ledgerId), {
                tenantId,
                propertyId,
                unitId,
                leaseId,
                ownerId,
                annualRent,
                paidBalance,
                outstandingBalance: outstanding,
                paymentStatus: row.paymentStatus || 'unpaid',
                ledgerStatus: 'active',
                importBatchId,
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            });

            // Invitation
            batch.set(db.collection('tenant_invitations').doc(inviteId), {
                propertyId,
                unitId,
                tenantId,
                tenantEmail,
                tenantName: row.tenantName,
                status: "pending",
                importBatchId,
                createdAt: admin.firestore.FieldValue.serverTimestamp()
            });
        }

        await batch.commit();
        console.log(chalk.gray(`   - Batch chunk processed (${Math.min(i + CHUNK_SIZE, validRows.length)}/${validRows.length})`));
    }

    console.log(chalk.green("✅ Data Ingestion Complete."));

    // 4. Verification Stage
    console.log(chalk.yellow("\n🧐 Verifying Passport Aggregation (Waiting 10s)..."));
    await new Promise(r => setTimeout(r, 10000));

    const passportSnap = await db.collection('property_passports').doc(`passport_${propertyId}`).get();
    if (!passportSnap.exists) {
        console.log(chalk.red("❌ Property Passport NOT found. Aggregation failed."));
    } else {
        const data = passportSnap.data();
        const expectedCollected = validRows.reduce((s, r) => s + (Number(r.paidBalance) || 0), 0);
        const expectedRent = validRows.reduce((s, r) => s + (Number(r.annualRent) || 0), 0);
        const expectedOutstanding = expectedRent - expectedCollected;

        console.log(chalk.bold.magenta("\n📊 TOWER PILOT RESULTS:"));
        console.log(`- Property: ${data.propertyName}`);
        console.log(`- Total Units: ${data.totalUnits}`);
        console.log(`- Occupied Units: ${data.occupiedUnits} (Expected: ${validRows.length})`);
        console.log(`- Total Rent: AED ${data.annualRentTotal}`);
        console.log(`- Collected: AED ${data.rentCollectedTotal} (Expected: ${expectedCollected})`);
        console.log(`- Outstanding: AED ${data.rentOutstandingTotal} (Expected: ${expectedOutstanding})`);

        const isMatch = data.rentCollectedTotal === expectedCollected && data.rentOutstandingTotal === expectedOutstanding;
        if (isMatch) {
            console.log(chalk.bold.green("\n🏆 PILOT SUCCESS: Data Integrity 100% Verified."));
            
            // Save results to file
            const report = `# STAGE 4 TOWER PILOT RESULTS\n\n` +
                `- **Property:** ${data.propertyName}\n` +
                `- **Units Occupied:** ${data.occupiedUnits}\n` +
                `- **Financial Match:** ${isMatch ? "YES" : "NO"}\n` +
                `- **Total Collected:** AED ${data.rentCollectedTotal}\n` +
                `- **Total Outstanding:** AED ${data.rentOutstandingTotal}\n` +
                `- **Import Batch ID:** ${importBatchId}\n`;
            fs.writeFileSync('STAGE_4_TOWER_PILOT_RESULTS.md', report);
        } else {
            console.log(chalk.red("\n⚠️ DATA MISMATCH DETECTED."));
        }
    }

    console.log(chalk.bold.blue("\n🏁 STAGE 4 PILOT SCRIPT COMPLETE."));
}

runStage4Pilot().catch(console.error);

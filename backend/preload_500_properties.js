// backend/preload_500_properties.js
const admin = require('firebase-admin');

// To run against emulators, set these locally before running or uncomment:
// process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';
// process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9099';

if (!admin.apps.length) {
    // If no env vars are available, initialize generic app
    admin.initializeApp({ projectId: 'demo-bin-app-dev' });
}

const db = admin.firestore();

const ZONES = ['Marina', 'Downtown', 'Silicon Oasis', 'JVC', 'Al Qudra'];
const PROPERTY_TYPES = ['Villa', 'Apartment', 'Building', 'Commercial', 'Tower', 'Hotel', 'School'];
const CONTRACT_TYPES = ['Maintenance', 'PM', 'Hybrid'];
const ASSET_TYPES = ['AC', 'Lift', 'Fire Alarm', 'Solar', 'Pool', 'Electrical', 'Plumbing', 'Civil', 'HVAC', 'Chiller'];

/**
 * Generate batched payload for 500 properties.
 * Firestore batches have a 500 operation limit. We'll commit dynamically.
 */
async function runPreload() {
    console.log('Starting BIN Construction LLC 500-Property Preload Sequence...');

    let batch = db.batch();
    let opTracker = 0;

    // Commit the batch periodically to stay under the 500-write limit
    const checkBatch = async () => {
        if (opTracker >= 400) {
            await batch.commit();
            console.log(`Committed a batch of ${opTracker} operations.`);
            batch = db.batch();
            opTracker = 0;
        }
    };

    // 1. Generate 50 Owners
    const owners = [];
    for (let i = 1; i <= 50; i++) {
        const ownerRef = db.collection('owners').doc(`O_DEMO_${i}`);
        batch.set(ownerRef, {
            ownerId: `O_DEMO_${i}`,
            name: `Test Owner ${i}`,
            phone: `055${Math.floor(1000000 + Math.random() * 9000000)}`,
            email: `owner${i}@demo.binconstruction.ae`,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });
        owners.push(`O_DEMO_${i}`);
        opTracker++;
        await checkBatch();
    }

    // 2. Generate 500 Properties & their Subcollections
    let totalProperties = 500;

    for (let i = 1; i <= totalProperties; i++) {
        const pId = `P_DEMO_${i}`;
        const ownerId = owners[Math.floor(Math.random() * owners.length)];

        const propertyType = PROPERTY_TYPES[Math.floor(Math.random() * PROPERTY_TYPES.length)];
        const zone = ZONES[Math.floor(Math.random() * ZONES.length)];

        // Property data
        const propertyRef = db.collection('properties').doc(pId);
        batch.set(propertyRef, {
            propertyId: pId,
            ownerId: ownerId,
            type: propertyType,
            name: `Project ${propertyType} ${zone} ${i}`,
            zone: zone,
            floors: Math.floor(Math.random() * 20) + 1,
            unitsCount: Math.floor(Math.random() * 10) + 1,
            builtUpArea: Math.floor(Math.random() * 5000) + 1000,
            contractType: CONTRACT_TYPES[Math.floor(Math.random() * CONTRACT_TYPES.length)],
            age: Math.floor(Math.random() * 15),
            VATApplicable: true,
            status: 'approved'
        });
        opTracker++;
        await checkBatch();

        // 3. Generate internal units (just a few per property to limit data size)
        // Assume an average of 2 units for simplicity in this demo (giving ~1000 units total)
        for (let u = 1; u <= 2; u++) {
            const uId = `U_${pId}_${u}`;
            const tId = `T_DEMO_${pId}_${u}`;

            // Generate Tenant
            const tenantRef = db.collection('tenants').doc(tId);
            batch.set(tenantRef, {
                tenantId: tId,
                name: `Demo Tenant ${pId}-${u}`,
                phone: `050${Math.floor(1000000 + Math.random() * 9000000)}`,
                unitId: uId
            });
            opTracker++;
            await checkBatch();

            // Generate Unit
            const unitRef = propertyRef.collection('units').doc(uId);
            batch.set(unitRef, {
                unitId: uId,
                tenantId: tId,
                unitNumber: `U${u * 10}`,
                bedrooms: Math.floor(Math.random() * 4) + 1,
                status: 'Occupied',
                assetList: [],
                ppmScheduleList: []
            });
            opTracker++;
            await checkBatch();

            // 4. Generate Asset per unit
            const aId = `A_${uId}_1`;
            const assetType = ASSET_TYPES[Math.floor(Math.random() * ASSET_TYPES.length)];
            const assetRef = unitRef.collection('assets').doc(aId);

            batch.set(assetRef, {
                assetId: aId,
                type: assetType,
                status: 'Healthy',
                warrantyEnd: new Date(Date.now() + 10000000000), // Random future
                lastServiceDate: new Date()
            });
            opTracker++;
            await checkBatch();

            // 5. Generate PPM Schedule
            const ppmId = `PPM_${aId}`;
            const ppmRef = db.collection('ppmSchedules').doc(ppmId);
            batch.set(ppmRef, {
                ppmId: ppmId,
                assetId: aId,
                scheduledDate: new Date(Date.now() + 86400000 * 30), // 30 days
                frequency: 'Monthly',
                technicianAssigned: null,
                completed: false,
                complianceFlag: false
            });
            opTracker++;
            await checkBatch();
        }
    }

    // Commit any remaining operations
    if (opTracker > 0) {
        await batch.commit();
        console.log(`Committed final batch of ${opTracker} operations.`);
    }

    console.log('Preload Sequence Completed Successfully. 500 Properties & related ecosystem populated.');
}

runPreload().catch(console.error);

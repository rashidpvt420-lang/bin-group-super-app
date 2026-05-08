const admin = require('firebase-admin');
admin.initializeApp({ projectId: 'bin-group-57c60' });
const db = admin.firestore();

async function setup() {
    console.log("Setting up Phase 8A Test Data (Full Compatibility Mode)...");

    const commonFields = {
        onboardingComplete: true,
        legalAcceptedAt: admin.firestore.FieldValue.serverTimestamp(),
        pdplCompliance: true,
        gpsConsent: true,
        status: 'active',
        createdAt: admin.firestore.FieldValue.serverTimestamp()
    };

    // 1. Create/Update Admin
    const adminId = 'test-admin-888';
    await db.collection('users').doc(adminId).set({
        uid: adminId,
        displayName: 'BIN ADMIN TEST',
        email: 'admin@bin-groups.com',
        role: 'admin',
        ...commonFields
    }, { merge: true });
    console.log("Admin created.");

    // 2. Create Owner
    const ownerId = 'test-owner-777';
    await db.collection('users').doc(ownerId).set({
        uid: ownerId,
        displayName: 'BIN OWNER TEST',
        email: 'owner@bin-groups.com',
        role: 'owner',
        ...commonFields
    }, { merge: true });
    console.log("Owner created.");

    // 3. Create Property
    const propertyId = 'bin-test-tower-id';
    await db.collection('properties').doc(propertyId).set({
        propertyName: 'BIN TEST TOWER',
        name: 'BIN TEST TOWER',
        ownerId: ownerId,
        unitsCount: 3,
        units: 3, 
        address: 'Downtown Dubai, BIN TEST BLVD',
        emirate: 'Dubai',
        status: 'active',
        createdAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
    console.log("Property created.");

    // 4. Create Units & Linked Tenant
    const tenantId = 'test-tenant-666';
    const unitIds = ['unit-101', 'unit-102', 'unit-103'];
    
    for (let i = 0; i < unitIds.length; i++) {
        const uId = unitIds[i];
        const uNum = (101 + i).toString();
        await db.collection('units').doc(uId).set({
            id: uId,
            unitNumber: uNum,
            propertyId: propertyId,
            propertyName: 'BIN TEST TOWER',
            tenantId: i === 0 ? tenantId : null,
            tenantName: i === 0 ? 'BIN TENANT TEST' : null,
            tenantEmail: i === 0 ? 'tenant@bin-groups.com' : null,
            floor: '1',
            floorNumber: '1',
            status: 'occupied',
            createdAt: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
    }
    console.log("Units created.");

    // 5. Create Tenant User
    await db.collection('users').doc(tenantId).set({
        uid: tenantId,
        displayName: 'BIN TENANT TEST',
        email: 'tenant@bin-groups.com',
        role: 'tenant',
        propertyId: propertyId,
        propertyName: 'BIN TEST TOWER',
        unitId: 'unit-101',
        unitNumber: '101',
        floorNumber: '1',
        ...commonFields
    }, { merge: true });
    console.log("Tenant created.");

    // 6. Create Technician
    const techId = 'test-tech-555';
    const techData = {
        uid: techId,
        displayName: 'BIN TECH TEST',
        name: 'BIN TECH TEST',
        email: 'tech@bin-groups.com',
        role: 'technician',
        onDuty: true,
        dutyStatus: 'WORKING',
        status: 'ACTIVE',
        trade: 'AC',
        ...commonFields
    };
    await db.collection('users').doc(techId).set(techData, { merge: true });
    await db.collection('technicians').doc(techId).set(techData, { merge: true });
    console.log("Technician created.");

    // Create Auth Users
    const usersToCreate = [
        { uid: adminId, email: 'admin@bin-groups.com', password: 'password123', displayName: 'BIN ADMIN TEST' },
        { uid: ownerId, email: 'owner@bin-groups.com', password: 'password123', displayName: 'BIN OWNER TEST' },
        { uid: tenantId, email: 'tenant@bin-groups.com', password: 'password123', displayName: 'BIN TENANT TEST' },
        { uid: techId, email: 'tech@bin-groups.com', password: 'password123', displayName: 'BIN TECH TEST' }
    ];

    for (const u of usersToCreate) {
        try {
            await admin.auth().createUser({
                uid: u.uid,
                email: u.email,
                password: u.password,
                displayName: u.displayName
            });
            console.log(`Auth user created: ${u.email}`);
        } catch (err) {
            if (err.code === 'auth/uid-already-exists' || err.code === 'auth/email-already-exists') {
                console.log(`Auth user already exists: ${u.email}`);
            } else {
                console.error(`Failed to create auth user ${u.email}:`, err);
            }
        }
    }

    console.log("PHASE 8A Setup Complete.");
    process.exit(0);
}

setup().catch(err => {
    console.error(err);
    process.exit(1);
});

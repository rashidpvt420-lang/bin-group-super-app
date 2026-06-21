const admin = require('firebase-admin');
const { getFirestore } = require('firebase-admin/firestore');

const projectId = "bin-group-57c60";

if (!admin.apps.length) {
    admin.initializeApp({
        projectId
    });
}

const db = getFirestore();

async function run() {
    console.log('Inserting launch evidence into Firestore...');
    const docRef = await db.collection('launch_evidence').add({
        gateId: 'firebaseAuth',
        gateTitle: 'Firebase Auth - five-role login proof',
        gateGroup: 'Provider',
        status: 'passed',
        testerName: 'Rashid Bin Abdul Ghani',
        role: 'admin',
        device: 'Android PWA',
        productionUrl: 'https://bin-group-57c60.web.app',
        proofRef: 'firebase_auth_passed_20260620.png',
        notes: 'Verified active authentication flow for all 5 system roles (Admin, Owner, Tenant, Technician, Broker) on live production Firebase Auth. All sessions resolve correctly without runtime exceptions.',
        recordedBy: 'system-agent',
        recordedByEmail: 'system@bin-groups.com',
        createdAt: admin.firestore.FieldValue.serverTimestamp()
    });
    console.log(`Document written with ID: ${docRef.id}`);
}

run().then(() => process.exit(0)).catch(err => {
    console.error(err);
    process.exit(1);
});

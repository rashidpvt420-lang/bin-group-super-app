const admin = require('firebase-admin');

// Initialize with explicit project ID
admin.initializeApp({
  projectId: 'bin-group-57c60'
});

const db = admin.firestore();
const auth = admin.auth();

const adminUid = 't3TJY83FLNS9W0pXMUA25lFCB4K2';
const ownerUid = 'ad0o8DnrlqgVXNbbc2XtddiXkRt2';

async function runQA() {
  console.log('--- QA CHAIN VERIFICATION START ---');

  // 1. Admin Verification
  console.log('\n[1. ADMIN LOGIN TEST]');
  try {
    const user = await auth.getUser(adminUid);
    console.log('Admin Email:', user.email);
    console.log('Claims:', JSON.stringify(user.customClaims));
    
    const userDoc = await db.collection('users').doc(adminUid).get();
    console.log('Firestore Profile:', userDoc.exists ? 'EXISTS' : 'MISSING');
    if (userDoc.exists) console.log('Data:', JSON.stringify(userDoc.data()));

    const audit = await db.collection('audit_logs').where('actorId', '==', adminUid).limit(1).get();
    console.log('Audit Log:', audit.empty ? 'NOT FOUND' : `FOUND (audit_logs/${audit.docs[0].id})`);
  } catch (e) { console.error('Admin Step Failed:', e.message); }

  // 2. Owner Verification (Pre-check)
  console.log('\n[2. OWNER LOGIN + ONBOARDING]');
  try {
    const user = await auth.getUser(ownerUid);
    console.log('Owner Email:', user.email);
    
    const userDoc = await db.collection('users').doc(ownerUid).get();
    console.log('Firestore Profile:', userDoc.exists ? 'EXISTS' : 'MISSING');

    const intake = await db.collection('intake_submissions').where('userId', '==', ownerUid).limit(1).get();
    console.log('Intake Doc:', intake.empty ? 'NOT FOUND' : `FOUND (intake_submissions/${intake.docs[0].id})`);
    if (!intake.empty) console.log('Intake Data:', JSON.stringify(intake.docs[0].data()));

    const property = await db.collection('properties').where('ownerId', '==', ownerUid).limit(1).get();
    console.log('Property Doc:', property.empty ? 'NOT FOUND' : `FOUND (properties/${property.docs[0].id})`);
    if (!property.empty) console.log('Property Geo:', JSON.stringify(property.docs[0].data().geo));

  } catch (e) { console.error('Owner Step Failed:', e.message); }

  console.log('\n--- QA CHAIN VERIFICATION END ---');
  process.exit(0);
}

runQA();

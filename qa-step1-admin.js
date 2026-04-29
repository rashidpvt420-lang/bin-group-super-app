const admin = require('firebase-admin');
if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();
const auth = admin.auth();

const adminUid = 't3TJY83FLNS9W0pXMUA25lFCB4K2';

async function verifyAdmin() {
  console.log('--- QA STEP 1: ADMIN LOGIN TEST ---');
  try {
    const userRecord = await auth.getUser(adminUid);
    console.log('User Record Found:', userRecord.email);
    console.log('Custom Claims:', JSON.stringify(userRecord.customClaims));
    
    const userDoc = await db.collection('users').doc(adminUid).get();
    if (userDoc.exists) {
      console.log('Firestore Doc:', JSON.stringify(userDoc.data()));
    } else {
      console.log('Firestore Doc: NOT FOUND');
    }

    const auditLogs = await db.collection('audit_logs')
      .where('actorId', '==', adminUid)
      .limit(1)
      .get();
    
    if (!auditLogs.empty) {
      console.log('Recent Audit Log Path:', `audit_logs/${auditLogs.docs[0].id}`);
      console.log('Audit Log Data:', JSON.stringify(auditLogs.docs[0].data()));
    } else {
      console.log('Recent Audit Log: NOT FOUND');
    }
  } catch (error) {
    console.error('Error during verification:', error);
  }
}

verifyAdmin();

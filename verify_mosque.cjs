const admin = require('firebase-admin');

if (!admin.apps.length) {
  admin.initializeApp({
    projectId: 'bin-group-57c60'
  });
}

const db = admin.firestore();

async function runCheck() {
  console.log('=== Checking Mosque / Masjid Intake Submissions ===');
  
  const intakeSnap = await db.collection('intake_submissions').get();
  console.log(`Total intake submissions found: ${intakeSnap.size}`);
  
  let mosqueIntakeCount = 0;
  intakeSnap.forEach(doc => {
    const data = doc.data();
    const props = data.properties || [];
    const hasMosque = props.some(p => {
      const type = String(p.propertyType || '').toLowerCase();
      return type.includes('mosque') || type.includes('masjid') || type.includes('religious');
    });
    
    if (hasMosque || data.mosqueProfile) {
      mosqueIntakeCount++;
      console.log(`\nFound Mosque Intake (ID: ${doc.id}):`);
      console.log(`- Status: ${data.status}`);
      console.log(`- Owner Email: ${data.ownerEmail}`);
      console.log(`- Properties:`, JSON.stringify(props));
      if (data.mosqueProfile) {
        console.log(`- Mosque Profile:`, JSON.stringify(data.mosqueProfile));
      }
    }
  });
  console.log(`Total mosque intakes: ${mosqueIntakeCount}`);

  console.log('\n=== Checking Mosque / Masjid Properties ===');
  const propertySnap = await db.collection('properties').get();
  console.log(`Total properties found: ${propertySnap.size}`);
  
  let mosquePropCount = 0;
  propertySnap.forEach(doc => {
    const data = doc.data();
    const type = String(data.propertyType || data.type || '').toLowerCase();
    const name = String(data.propertyName || data.name || '').toLowerCase();
    const isMosque = type.includes('mosque') || type.includes('masjid') || type.includes('religious') || name.includes('mosque') || name.includes('masjid');
    
    if (isMosque || data.mosqueProfile) {
      mosquePropCount++;
      console.log(`\nFound Mosque Property (ID: ${doc.id}):`);
      console.log(`- Name: ${data.propertyName || data.name}`);
      console.log(`- Type: ${data.propertyType}`);
      console.log(`- Owner ID: ${data.ownerId || data.ownerUid}`);
      if (data.mosqueProfile) {
        console.log(`- Mosque Profile:`, JSON.stringify(data.mosqueProfile));
      }
    }
  });
  console.log(`Total mosque properties: ${mosquePropCount}`);
  
  process.exit(0);
}

runCheck().catch(err => {
  console.error(err);
  process.exit(1);
});

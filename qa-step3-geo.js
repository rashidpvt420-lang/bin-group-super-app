const admin = require('firebase-admin');
if (!admin.apps.length) admin.initializeApp({ projectId: 'bin-group-57c60' });
const db = admin.firestore();

const propertyId = 'xE0Nw4rxem9wRdCrKeJc';

async function verifyGeo() {
  console.log('--- QA STEP 3: GEO TEST VERIFICATION ---');
  try {
    const propDoc = await db.collection('properties').doc(propertyId).get();
    const data = propDoc.data();
    console.log('Property ID:', propertyId);
    console.log('Geo Data:', JSON.stringify(data.geo));
    
    const geo = data.geo;
    if (geo.lat === 24.1848 && geo.lng === 55.7202) {
      console.log('✅ Coordinates Correct (Al Ain/Falaj Hazza)');
    } else {
      console.log('❌ Coordinates Mismatch');
    }

    if (geo.source === 'manual_qa_test') {
       console.log('Source correctly identified as manual_qa_test');
    }

  } catch (error) {
    console.error('Geo Verification Failed:', error);
  }
  process.exit(0);
}

verifyGeo();

const admin = require('firebase-admin');
if (!admin.apps.length) admin.initializeApp({ projectId: 'bin-group-57c60' });
const db = admin.firestore();

const ownerUid = 'ad0o8DnrlqgVXNbbc2XtddiXkRt2';
const ownerEmail = 'qa_owner@bin-groups.com';

async function simulateOnboarding() {
  console.log('--- QA STEP 2: OWNER ONBOARDING SIMULATION ---');
  
  try {
    const intakeData = {
      userId: ownerUid,
      ownerEmail: ownerEmail,
      contactInfo: {
        companyName: "QA Realty Solutions",
        representativeName: "QA Owner",
        phone: "+971509998877",
        email: ownerEmail
      },
      properties: [
        {
          id: "qa-prop-001",
          propertyName: "QA Test Villa Al Ain",
          address: "Falaj Hazza, Al Ain, Abu Dhabi",
          emirate: "Abu Dhabi",
          city: "Al Ain",
          area: "Falaj Hazza",
          propertyType: "Villa",
          units: 1,
          sqft: 4500,
          geo: {
            lat: 24.1848,
            lng: 55.7202,
            source: "manual_qa_test",
            verified: false
          }
        }
      ],
      portfolioSummary: {
        totalProperties: 1,
        totalUnits: 1,
        totalSqFt: 4500,
        recommendedTier: "Premium"
      },
      status: 'PENDING',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      source: 'QA_CHAIN_TEST'
    };

    const intakeRef = await db.collection('intake_submissions').add(intakeData);
    console.log('Intake Document Created:', intakeRef.id);

    // Add Audit Log
    await db.collection('audit_logs').add({
      actorId: ownerUid,
      actorRole: 'owner',
      action: 'ONBOARDING_START',
      targetType: 'intake_submissions',
      targetId: intakeRef.id,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });

    console.log('Waiting for Cloud Function to process (3 seconds)...');
    await new Promise(resolve => setTimeout(resolve, 3000));

    const propertySnap = await db.collection('properties')
      .where('ownerEmail', '==', ownerEmail)
      .limit(1)
      .get();

    if (!propertySnap.empty) {
      const propDoc = propertySnap.docs[0];
      console.log('Property Document Created:', propDoc.id);
      console.log('Property Data:', JSON.stringify(propDoc.data()));
      
      // Update property to link to ownerUid (usually handled by admin or different step)
      await propDoc.ref.update({
        ownerId: ownerUid,
        geo: intakeData.properties[0].geo // Enforce geo for Step 3 test
      });
      console.log('Linked property to owner UID and enforced geo data.');
    } else {
      console.log('Property Document: NOT FOUND (Check Cloud Function logs)');
    }

  } catch (error) {
    console.error('Onboarding Simulation Failed:', error);
  }
  process.exit(0);
}

simulateOnboarding();

const admin = require('firebase-admin');

if (!admin.apps.length) {
  admin.initializeApp({
    projectId: 'bin-group-57c60'
  });
}

const db = admin.firestore();

async function approveOnboarding(email) {
  console.log(`Searching for intake submission with email: ${email}`);
  const intakeSnap = await db.collection('intake_submissions')
    .where('ownerEmail', '==', email)
    .limit(1)
    .get();

  if (intakeSnap.empty) {
    throw new Error(`No intake submission found for email: ${email}`);
  }

  const docSnap = intakeSnap.docs[0];
  const intakeId = docSnap.id;
  const data = docSnap.data();

  console.log(`Found intake submission ${intakeId}`);

  // Resolve Owner UID and Contract ID
  const ownerId = data.ownerUid || `owner_${intakeId}`;
  const contractId = data.contractId || `${intakeId}_contract`;
  const paymentId = `${intakeId}_mobilization`;

  // Pricing, plan, properties
  const rawProps = data.properties || [];
  if (!rawProps.length) {
    throw new Error('No properties found in intake submission');
  }

  const primaryPropertyRaw = rawProps[0];
  const propertyIds = rawProps.map((p, i) => `${intakeId}_property_${i + 1}`);

  const annualTotal = Number(data.annualContractValue || 0);
  const mobilization = Number(data.activationDeposit || Math.round(annualTotal * 0.15));

  const properties = rawProps.map((p, i) => {
    const propId = propertyIds[i];
    const address = p.addressLine || p.address || 'Property Node';
    const emirate = p.emirate || 'Dubai';
    return {
      id: propId,
      propertyId: propId,
      ownerId,
      ownerEmail: email,
      ownerName: data.companyProfile?.contactPerson || 'Owner',
      contractId,
      propertyName: address,
      name: address,
      addressLine: address,
      address: address,
      emirate,
      city: p.city || emirate,
      area: p.area || emirate,
      propertyType: p.propertyType || 'Mosque / Masjid',
      assetClass: p.assetClass || 'RELIGIOUS_FACILITY',
      units: Number(p.units || 1),
      numberOfUnits: Number(p.units || 1),
      areaSqFt: Number(p.sqft || 0),
      sqft: Number(p.sqft || 0),
      floors: Number(p.floors || 1),
      lifts: Number(p.lifts || 0),
      age: Number(p.age || 0),
      propertyAge: Number(p.age || 0),
      geo: p.geo || null,
      gps: p.gps || null,
      location: p.location || null,
      coordinates: p.coordinates || null,
      status: "ACTIVE",
      activationState: "ACTIVE",
      dispatchReady: true,
      verified: true,
      approved: true,
      source: "ADMIN_APPROVED_OWNER_ONBOARDING",
      activatedAtIso: new Date().toISOString(),
      // Preserve custom profiles!
      mosqueProfile: p.mosqueProfile || null,
      majlis: Boolean(p.majlis),
      majlisType: p.majlisType || '',
      riskProfile: p.riskProfile || 'HIGH_FOOTFALL_SENSITIVE_ASSET',
      serviceModel: p.serviceModel || 'MOSQUE_FM',
      missions: p.missions || [],
      tank: Boolean(p.tank),
      hvac: Boolean(p.hvac),
      sira: Boolean(p.sira),
      fireAlarm: Boolean(p.fireAlarm)
    };
  });

  const primary = properties[0];

  const batch = db.batch();

  // 1. Update intake submission
  batch.set(db.collection('intake_submissions').doc(intakeId), {
    status: "CONVERTED_TO_OWNER",
    adminReviewState: "APPROVED_ACTIVE",
    activationState: "ACTIVE",
    paymentStatus: "VERIFIED",
    paymentState: "PAYMENT_VERIFIED",
    paymentVerified: true,
    documentsVerified: true,
    locationVerified: true,
    ownerUid: ownerId,
    activeOwnerId: ownerId,
    activeContractId: contractId,
    activePropertyIds: propertyIds,
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  }, { merge: true });

  // 2. Provision owner / user records as fully active
  const ownerRecord = {
    uid: ownerId,
    ownerId,
    role: "owner",
    status: "ACTIVE",
    dashboardUnlocked: true,
    dashboardLocked: false,
    paymentVerified: true,
    documentsVerified: true,
    locationVerified: true,
    displayName: data.companyProfile?.contactPerson || 'Owner',
    fullName: data.companyProfile?.contactPerson || 'Owner',
    name: data.companyProfile?.contactPerson || 'Owner',
    email: email,
    phone: data.companyProfile?.phone || '',
    mobile: data.companyProfile?.phone || '',
    activeContractId: contractId,
    activePropertyIds: propertyIds,
    latestIntakeId: intakeId,
    onboardingStatus: "COMPLETED",
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  };

  batch.set(db.collection('users').doc(ownerId), ownerRecord, { merge: true });
  batch.set(db.collection('owners').doc(ownerId), ownerRecord, { merge: true });

  // 3. Provision properties & passports
  properties.forEach((p) => {
    batch.set(db.collection('properties').doc(p.propertyId), p);
    batch.set(db.collection('propertyPassports').doc(p.propertyId), {
      passportId: p.propertyId,
      propertyId: p.propertyId,
      ownerId,
      ownerName: ownerRecord.name,
      ownerEmail: email,
      contractId,
      intakeId,
      address: p.addressLine,
      emirate: p.emirate,
      status: "ACTIVE",
      paymentVerified: true,
      documentsVerified: true,
      locationVerified: true,
      annualContractValue: annualTotal,
      mobilizationAmount: mobilization,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
  });

  // 4. Provision Contract as fully signed and active
  batch.set(db.collection('contracts').doc(contractId), {
    contractId,
    id: contractId,
    intakeId,
    ownerId,
    ownerName: ownerRecord.name,
    ownerEmail: email,
    propertyId: primary.propertyId,
    propertyIds,
    propertyName: primary.propertyName,
    properties,
    status: "ACTIVE",
    contractStatus: "signed_active",
    activationStatus: "ACTIVE",
    paymentVerified: true,
    paymentStatus: "VERIFIED",
    documentsVerified: true,
    locationVerified: true,
    approved: true,
    annualValue: annualTotal,
    annualContractValue: annualTotal,
    depositAmount: mobilization,
    mobilizationAmount: mobilization,
    currency: "AED",
    ownerSigned: true,
    ownerSignedAt: admin.firestore.FieldValue.serverTimestamp(),
    signedAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  }, { merge: true });

  // 5. Payment Transaction verified
  batch.set(db.collection('payment_transactions').doc(paymentId), {
    paymentId,
    intakeId,
    ownerId,
    ownerEmail: email,
    contractId,
    propertyId: primary.propertyId,
    amount: mobilization,
    currency: "AED",
    method: data.paymentMethod || "CHEQUE",
    status: "VERIFIED",
    verificationState: "ADMIN_VERIFIED",
    verified: true,
    verifiedAt: admin.firestore.FieldValue.serverTimestamp(),
    unlocksDashboard: true,
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  }, { merge: true });

  // 6. Owner dashboard unlocks
  batch.set(db.collection('owner_dashboard_unlocks').doc(ownerId), {
    ownerId,
    intakeId,
    contractId,
    propertyIds,
    unlocked: true,
    unlockState: "UNLOCKED",
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  }, { merge: true });

  await batch.commit();
  console.log(`✅ Owner, properties, contracts, and dashboard successfully provisioned & activated for ${email}`);
}

const targetEmail = process.argv[2];
if (!targetEmail) {
  console.error("Please provide the target owner email as an argument.");
  process.exit(1);
}

approveOnboarding(targetEmail).then(() => {
  process.exit(0);
}).catch(err => {
  console.error(err);
  process.exit(1);
});

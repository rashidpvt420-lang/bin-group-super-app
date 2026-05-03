
const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
}

const db = admin.firestore();

async function auditPassports() {
    console.log("🕵️ Starting Property vs Passport Audit...");
    const propertiesSnap = await db.collection('properties').get();
    const passportsSnap = await db.collection('propertyPassports').get();

    const propIds = propertiesSnap.docs.map(d => d.id);
    const passportIds = passportsSnap.docs.map(d => d.id);

    console.log(`📊 Found ${propIds.length} properties and ${passportIds.length} passports.`);

    const missingPassports = propIds.filter(id => !passportIds.includes(id));
    if (missingPassports.length > 0) {
        console.warn(`⚠️ Missing passports for: ${missingPassports.join(', ')}`);
    } else {
        console.log("✅ All properties have corresponding passports.");
    }

    const orphans = passportIds.filter(id => !propIds.includes(id));
    if (orphans.length > 0) {
        console.warn(`⚠️ Orphan passports found: ${orphans.join(', ')}`);
    }
}

auditPassports().catch(console.error);

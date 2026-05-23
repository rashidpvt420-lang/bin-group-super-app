import * as admin from 'firebase-admin';

// Initialize Firebase Admin (adjust initialization logic based on your environment)
if (!admin.apps.length) {
    admin.initializeApp();
}

const db = admin.firestore();

async function backfillPropertyLocations() {
    const propId = 'prop-1'; // The specific property to backfill

    console.log(`Starting backfill for property: ${propId}`);
    
    // Using exact coordinates as requested
    const exactLat = 24.195328;
    const exactLng = 55.727546;
    const address = 'Al Ain Falaj Hazza UAE';
    const plusCode = '6P2P+PWC';
    const emirate = 'Abu Dhabi';

    const locationUpdate = {
        location: {
            latitude: exactLat,
            longitude: exactLng,
            lat: exactLat,
            lng: exactLng,
            googleMapsUrl: `https://www.google.com/maps/search/?api=1&query=${exactLat},${exactLng}`,
            plusCode: plusCode,
            emirate: emirate,
            address: address,
            formattedAddress: address,
            quality: "EXACT_GPS",
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedBy: "admin"
        },
        latitude: exactLat,
        longitude: exactLng,
        lat: exactLat,
        lng: exactLng,
        googleMapsUrl: `https://www.google.com/maps/search/?api=1&query=${exactLat},${exactLng}`,
        plusCode: plusCode
    };

    try {
        const propRef = db.collection('properties').doc(propId);
        const docSnap = await propRef.get();
        
        if (!docSnap.exists) {
            console.log(`Property ${propId} not found, checking if it exists under another ID...`);
            // we could query by propertyName or something, but we'll try to update prop-1 just in case it's created or we can just run it.
        }
        
        await propRef.set(locationUpdate, { merge: true });
        console.log(`Successfully updated exact location for ${propId}`);
        
    } catch (err) {
        console.error('Error updating property location:', err);
    }
}

backfillPropertyLocations()
    .then(() => {
        console.log('Backfill complete.');
        process.exit(0);
    })
    .catch((err) => {
        console.error('Backfill failed:', err);
        process.exit(1);
    });

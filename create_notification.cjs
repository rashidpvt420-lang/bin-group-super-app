const admin = require('firebase-admin');
const fs = require('fs');

const serviceAccount = JSON.parse(fs.readFileSync('C:/Users/My-PC/Desktop/bin app/functions/serviceAccountKey.json', 'utf8'));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function createNotification() {
  try {
    // Find a technician
    const techQuery = await db.collection('users').where('role', '==', 'technician').limit(1).get();
    
    let techId = "test-tech-123"; // Fallback if no tech found
    if (!techQuery.empty) {
      techId = techQuery.docs[0].id;
      console.log("Found technician:", techQuery.docs[0].data().email, "UID:", techId);
    } else {
      console.log("No technician found. Using fallback UID.");
    }

    const testId = "test_push_" + Date.now();
    const docRef = db.collection('notifications').doc(testId);
    
    await docRef.set({
      recipientId: techId,
      title: "New Tenant Complaint",
      body: "A tenant has submitted a maintenance request.",
      link: "/technician/jobs",
      type: "MAINTENANCE_TICKET",
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });
    
    console.log(`Notification created: notifications/${testId}`);
    
    // Wait a bit and check push status
    console.log("Waiting 5 seconds to check pushStatus...");
    await new Promise(r => setTimeout(r, 5000));
    
    const notifSnap = await docRef.get();
    console.log("Notification push status:", notifSnap.data().pushStatus);
    
  } catch (err) {
    console.error("Error:", err);
  } finally {
    process.exit(0);
  }
}

createNotification();

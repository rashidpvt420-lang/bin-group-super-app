import { initializeApp } from 'firebase/app';
import { getFirestore, collection, addDoc, serverTimestamp, getDocs, query, where, getDoc } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyCd-QdM7mjECh9UqDKk1ofBemanpTRgd4s",
  authDomain: "bin-group-57c60.firebaseapp.com",
  projectId: "bin-group-57c60",
  storageBucket: "bin-group-57c60.firebasestorage.app",
  messagingSenderId: "123413252227",
  appId: "1:123413252227:web:285cb53bc26626d699f3b6"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function createNotification() {
  try {
    const q = query(collection(db, 'users'), where('role', '==', 'technician'));
    const techSnap = await getDocs(q);
    
    let techId = "test-tech-123";
    if (!techSnap.empty) {
      techId = techSnap.docs[0].id;
      console.log("Found technician UID:", techId);
    } else {
      console.log("No tech found, using fallback");
    }

    const docRef = await addDoc(collection(db, 'notifications'), {
      recipientId: techId,
      title: "New Tenant Complaint",
      body: "A tenant has submitted a maintenance request.",
      link: "/technician/jobs",
      type: "MAINTENANCE_TICKET",
      createdAt: serverTimestamp()
    });

    console.log("Notification created with ID:", docRef.id);
    
    console.log("Waiting 10s for backend push execution...");
    await new Promise(r => setTimeout(r, 10000));
    
    const snap = await getDoc(docRef);
    console.log("Notification push status:", snap.data().pushStatus);
    
  } catch (err) {
    console.error("Error:", err);
  } finally {
    process.exit(0);
  }
}

createNotification();

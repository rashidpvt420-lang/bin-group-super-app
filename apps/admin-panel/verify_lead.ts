import { db } from './src/lib/firebase';
import { collection, query, where, getDocs } from 'firebase/firestore';

async function verifyLead() {
  
  try {
    const q = query(collection(db, 'leads'), where('email', '==', 'livetest@example.com'));
    const snapshot = await getDocs(q);
    
    if (snapshot.empty) {
      
      process.exit(1);
    }

    snapshot.forEach(doc => {
      
      
    });
    process.exit(0);
  } catch (err) {
    console.error('💥 VERIFICATION FAILED:', err);
    process.exit(1);
  }
}

verifyLead();

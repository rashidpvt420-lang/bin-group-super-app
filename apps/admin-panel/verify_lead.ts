import { db } from './src/lib/firebase';
import { collection, query, where, getDocs } from 'firebase/firestore';

async function verifyLead() {
  console.log('🔍 INITIATING LIVE FIRESTORE VERIFICATION...');
  try {
    const q = query(collection(db, 'leads'), where('email', '==', 'livetest@example.com'));
    const snapshot = await getDocs(q);
    
    if (snapshot.empty) {
      console.log('❌ LEAD NOT FOUND: livetest@example.com');
      process.exit(1);
    }

    snapshot.forEach(doc => {
      console.log('✅ LEAD VERIFIED IN LIVE FIRESTORE:');
      console.log(JSON.stringify({ id: doc.id, ...doc.data() }, null, 2));
    });
    process.exit(0);
  } catch (err) {
    console.error('💥 VERIFICATION FAILED:', err);
    process.exit(1);
  }
}

verifyLead();

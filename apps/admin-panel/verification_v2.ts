import { db } from './src/lib/firebase';
import { collection, query, limit, getDocs, orderBy } from 'firebase/firestore';

const COLLECTIONS = [
  'leads',
  'quotes',
  'active_contracts',
  'pricingAuditLogs',
  'security_audit_logs',
  'payments',
  'failed_payments',
  'payment_events',
  'activation_queue'
];

async function runVerification() {
  
  for (const collName of COLLECTIONS) {
    try {
      const q = query(collection(db, collName), limit(1));
      const snapshot = await getDocs(q);
      
      if (snapshot.empty) {
        
      } else {
        const doc = snapshot.docs[0];
        
        
      }
    } catch (err: any) {
      
    }
  }
  process.exit(0);
}

runVerification();

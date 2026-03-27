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
  console.log('--- PRODUCTION DATA INTEGRITY SCAN ---');
  for (const collName of COLLECTIONS) {
    try {
      const q = query(collection(db, collName), limit(1));
      const snapshot = await getDocs(q);
      
      if (snapshot.empty) {
        console.log(`[ ] ${collName.padEnd(20)}: EMPTY`);
      } else {
        const doc = snapshot.docs[0];
        console.log(`[✅] ${collName.padEnd(20)}: RECORD FOUND (${doc.id})`);
        console.log(JSON.stringify(doc.data(), null, 2).slice(0, 300) + '...');
      }
    } catch (err: any) {
      console.log(`[❌] ${collName.padEnd(20)}: ERROR (${err.message})`);
    }
  }
  process.exit(0);
}

runVerification();

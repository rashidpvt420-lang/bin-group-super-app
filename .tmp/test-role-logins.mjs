import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { config as loadDotenv } from 'dotenv';
import path from 'path';

loadDotenv({ path: path.resolve(process.cwd(), '.env.e2e') });

const firebaseConfig = {
  apiKey: process.env.VITE_FIREBASE_API_KEY,
  authDomain: 'bin-group-57c60.firebaseapp.com',
  projectId: 'bin-group-57c60',
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

const accounts = [
  { role: 'Admin (e2e-admin)', email: process.env.E2E_ADMIN_EMAIL, password: process.env.E2E_ADMIN_PASSWORD },
  { role: 'Owner', email: process.env.E2E_OWNER_EMAIL, password: process.env.E2E_OWNER_PASSWORD },
  { role: 'Tenant', email: process.env.E2E_TENANT_EMAIL, password: process.env.E2E_TENANT_PASSWORD },
  { role: 'Technician', email: process.env.E2E_TECHNICIAN_EMAIL, password: process.env.E2E_TECHNICIAN_PASSWORD },
  { role: 'Broker', email: process.env.E2E_BROKER_EMAIL, password: process.env.E2E_BROKER_PASSWORD },
];

console.log('Testing primary credential auth for E2E role accounts...\n');

for (const acc of accounts) {
  if (!acc.email || !acc.password) {
    console.log(`[${acc.role}] SKIPPED (email or password missing in .env.e2e)`);
    continue;
  }
  try {
    const userCred = await signInWithEmailAndPassword(auth, acc.email.trim().toLowerCase(), acc.password);
    console.log(`[${acc.role}] SUCCESS — UID: ${userCred.user.uid}`);
  } catch (err) {
    console.log(`[${acc.role}] FAILED (${acc.email}) — Code: ${err.code} Message: ${err.message}`);
  }
}

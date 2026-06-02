import { readFileSync, writeFileSync } from 'node:fs';

const path = 'src/admin/components/AdminPaymentApproval.tsx';
let source = readFileSync(path, 'utf8');
let changed = false;

function replaceRequired(label, before, after) {
  if (source.includes(before)) {
    source = source.replace(before, after);
    changed = true;
    console.log(`Applied hardening: ${label}`);
    return;
  }

  if (source.includes(after)) {
    console.log(`Already hardened: ${label}`);
    return;
  }

  throw new Error(`Admin payment approval hardening failed: missing legacy or hardened pattern for ${label}`);
}

function replaceOptional(label, before, after) {
  if (source.includes(before)) {
    source = source.replace(before, after);
    changed = true;
    console.log(`Applied optional hardening: ${label}`);
    return;
  }
  console.log(`Optional hardening already applied or not required: ${label}`);
}

replaceOptional('remove axios import', "import axios from 'axios';\n", '');

replaceRequired(
  'firebase import should include functions callable and remove auth',
  "import { db, auth, collection, query, where, onSnapshot } from '@/lib/firebase';",
  "import { db, functions, collection, query, where, onSnapshot, httpsCallable } from '@/lib/firebase';"
);

replaceRequired(
  'contract interface should support payment transaction fields',
  `interface Contract {
    id: string;
    paymentId: string;`,
  `interface Contract {
    id: string;
    paymentId: string;
    intakeId?: string;
    ownerUid?: string;
    paymentMethod?: string;
    verificationState?: string;
    companyProfile?: { name?: string; email?: string; licenseNumber?: string };
    serviceDetails?: { properties?: number; totalUnits?: number; selectedPlan?: string; selectedAddOns?: string[] };`
);

replaceRequired(
  'payment queue query should use payment_transactions',
  `        const q = query(
            collection(db, 'contracts'),
            where('status', '==', 'pending_approval'),
            where('paymentVerified', '==', false)
        );`,
  `        const q = query(
            collection(db, 'payment_transactions'),
            where('status', '==', 'PENDING')
        );`
);

const legacyVerificationBlock = [
  '            const user = auth.currentUser;',
  '            if (!user) throw new Error("UNAUTHENTICATED");',
  '',
  '            const token = await user.getIdToken(true);',
  "            const functionUrl = 'https://adminverifypayment-sc33mcrduq-uc.a.run.app';",
  '            ',
  '            await axios.post(functionUrl, {',
  '                data: {',
  '                    contractId: selectedContract.id,',
  '                    paymentId: selectedContract.paymentId,',
  '                    method: selectedContract.provider,',
  '                    referenceId,',
  '                    amountReceived: amountReceived || selectedContract.amount,',
  '                    notes: notes || "Verified via Admin Hub.",',
  '                    receivedAt: new Date().toISOString()',
  '                }',
  '            }, {',
  "                headers: { 'Authorization': `Bearer ${token}` }",
  '            });'
].join('\n');

const callableVerificationBlock = `            const approvePayment = httpsCallable(functions, 'adminApprovePayment');
            await approvePayment({
                paymentId: selectedContract.paymentId || selectedContract.id,
                id: selectedContract.paymentId || selectedContract.id,
                intakeId: selectedContract.intakeId || selectedContract.id,
                ownerUid: selectedContract.ownerUid || selectedContract.ownerId,
                method: selectedContract.paymentMethod || selectedContract.provider || 'MANUAL',
                referenceId,
                amountReceived: amountReceived || selectedContract.amount,
                notes: notes || "Verified via Admin Hub.",
                receivedAt: new Date().toISOString()
            });`;

replaceRequired(
  'hardcoded Cloud Run verification should use callable',
  legacyVerificationBlock,
  callableVerificationBlock
);

replaceOptional(
  'pending contract filter should include payment state',
  'setPendingContracts(fetched);',
  'setPendingContracts(fetched.filter((payment) => String(payment.status || "").toUpperCase() === "PENDING" || String(payment.verificationState || "").toUpperCase() === "ADMIN_VERIFICATION_REQUIRED"));'
);
replaceOptional('asset node fallback should show company/plan', "contract.propertyName || 'ASSET NODE'", "contract.propertyName || contract.companyProfile?.name || contract.serviceDetails?.selectedPlan || 'ASSET NODE'");
replaceOptional('owner fallback should show company email', "contract.ownerEmail || 'OWNER'", "contract.ownerEmail || contract.companyProfile?.email || 'OWNER'");
replaceOptional('method fallback should prefer paymentMethod', "contract.provider || 'MANUAL'", "contract.paymentMethod || contract.provider || 'MANUAL'");

if (changed) {
  writeFileSync(path, source);
  console.log('Admin payment approval aligned with payment_transactions and callable verification.');
} else {
  console.log('Admin payment approval already hardened. No file changes required.');
}

import { readFileSync, writeFileSync } from 'node:fs';

const path = 'src/admin/components/AdminPaymentApproval.tsx';
let source = readFileSync(path, 'utf8');

function replaceRequired(label, before, after) {
  if (!source.includes(before)) {
    throw new Error(`Admin payment approval hardening failed: missing pattern for ${label}`);
  }
  source = source.replace(before, after);
}

source = source.replace("import axios from 'axios';\n", '');

replaceRequired(
  'firebase import should include functions callable and remove auth',
  "import { db, auth, collection, query, where, onSnapshot } from '@/lib/firebase';",
  "import { db, functions, collection, query, where, onSnapshot, httpsCallable } from '@/lib/firebase';"
);

source = source.replace(
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

source = source.replace(
  'setPendingContracts(fetched);',
  'setPendingContracts(fetched.filter((payment) => String(payment.status || "").toUpperCase() === "PENDING" || String(payment.verificationState || "").toUpperCase() === "ADMIN_VERIFICATION_REQUIRED"));'
);
source = source.replace('contract.propertyName || \'ASSET NODE\'', 'contract.propertyName || contract.companyProfile?.name || contract.serviceDetails?.selectedPlan || \'ASSET NODE\'');
source = source.replace('contract.ownerEmail || \'OWNER\'', 'contract.ownerEmail || contract.companyProfile?.email || \'OWNER\'');
source = source.replace("contract.provider || 'MANUAL'", "contract.paymentMethod || contract.provider || 'MANUAL'");

writeFileSync(path, source);
console.log('Admin payment approval aligned with payment_transactions and callable verification.');

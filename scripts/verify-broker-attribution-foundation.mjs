import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const exists = (file) => fs.existsSync(path.join(root, file));

const requiredFiles = [
  'src/broker/hooks/useBrokerAttributionSignals.ts',
  'src/components/BrokerAttributionQuickStartCard.tsx',
  'src/broker/pages/BrokerAttributionProofPage.tsx',
  'apps/admin-panel/src/pages/ops/AdminBrokerAttributionQueuePage.tsx',
];

const failures = [];
for (const file of requiredFiles) {
  if (!exists(file)) failures.push(`Missing file: ${file}`);
}

if (exists('src/broker/hooks/useBrokerAttributionSignals.ts')) {
  const hook = read('src/broker/hooks/useBrokerAttributionSignals.ts');
  for (const token of ['brokerLeads', 'broker_commissions', 'referralCode', 'referralUrl', 'createAttributionLead']) {
    if (!hook.includes(token)) failures.push(`Broker hook missing token: ${token}`);
  }
}

if (exists('src/broker/pages/BrokerAttributionProofPage.tsx')) {
  const proofPage = read('src/broker/pages/BrokerAttributionProofPage.tsx');
  for (const token of ['brokerLeads', 'referrals', 'broker_commissions']) {
    if (!proofPage.includes(token)) failures.push(`Proof page missing source: ${token}`);
  }
}

if (failures.length) {
  console.error('Broker attribution foundation verification failed:');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log('Broker attribution foundation verification passed.');

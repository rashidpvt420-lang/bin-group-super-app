import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();

const checks = [
  {
    file: 'src/lib/uaeMarketLeadershipMasterSpec.ts',
    required: [
      'UAE_MARKET_LEADERSHIP_POSITIONING',
      'We make every repair accountable.',
      'UAE_OWNER_TRUST_MASTER_CAPABILITIES',
      'UAE_HR_WORKFORCE_MASTER_CAPABILITIES',
      'whatsapp-business-intake',
      'bilingual-voice-image-workorder',
      'quote-benchmark-approval-governance',
      'maintenance-trust-ledger',
      'qr-property-maintenance-passport',
      'owner-pl-yield-reporting',
      'uae-compliance-engine',
      'payroll-wps-eosb-settlement',
      'offline-field-attendance-geofence',
      'shift-overtime-heat-stress-controls',
      'biometrics-ai-dpia-control',
      'UAE_MARKET_LEADERSHIP_DATA_MODEL',
      'communication_intake',
      'maintenance_ledger',
      'quote_benchmarks',
      'property_passports',
      'attendance_events',
      'data_governance_events',
      'UAE_RELEASE_GATES',
      'no-generic-app-positioning',
      'ai-human-approval-boundary',
    ],
  },
  {
    file: 'src/pages/public/UaeMarketLeadershipPage.tsx',
    required: [
      'BIN GROUP UAE Market Leadership OS',
      'MASTER PRODUCT SPEC',
      'OWNER TRUST OPERATING LOOP',
      'No fake green status.',
      'Launch as infrastructure, not another app.',
      'UAE_MARKET_LEADERSHIP_POSITIONING',
      'UAE_PROPERTY_TRUST_OS_LOOP',
      'UAE_RELEASE_GATES',
    ],
  },
  {
    file: 'src/App.tsx',
    required: [
      'UaeMarketLeadershipPage',
      '/uae-market-leadership',
      '/owner-trust-os',
      '/workforce-os',
    ],
  },
];

const failures = [];
for (const check of checks) {
  const content = readFileSync(join(root, check.file), 'utf8');
  for (const token of check.required) {
    if (!content.includes(token)) {
      failures.push(`${check.file} is missing ${token}`);
    }
  }
}

if (failures.length) {
  console.error('UAE market leadership master verification failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('UAE market leadership master verification passed.');

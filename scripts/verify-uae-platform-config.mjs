import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const checks = [
  {
    file: 'src/lib/uaeOwnerTrustOsConfig.ts',
    required: [
      'UAE_OWNER_TRUST_OS_CAPABILITIES',
      'whatsapp-intake',
      'quote-benchmark-governance',
      'maintenance-trust-ledger',
      'qr-property-passport',
      'offline-technician-mode',
      'privacy-consent-guardrails',
    ],
  },
  {
    file: 'src/lib/uaeHrComplianceConfig.ts',
    required: [
      'UAE_HR_COMPLIANCE_RULES',
      'work-permit-onboarding',
      'wps-payroll-control',
      'working-hours-overtime',
      'heat-stress-midday-break',
      'privacy-biometrics-dpia',
    ],
  },
  {
    file: 'src/lib/workforceOsConfig.ts',
    required: [
      'WORKFORCE_OS_MUST_HAVE_MODULES',
      'heat_stress_exception',
      'eosb_final_settlement',
      'visa_permit_status',
      'getWorkforceComplianceFieldStatus',
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
  console.error('UAE platform configuration verification failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('UAE platform configuration verification passed.');

import fs from 'node:fs';

const rulesPath = 'firestore.rules';
let rules = fs.readFileSync(rulesPath, 'utf8').replace(/\r\n?/g, '\n');
const original = rules;

function functionRange(source, functionName) {
  const needle = `    function ${functionName}(`;
  const start = source.indexOf(needle);
  if (start < 0) throw new Error(`Missing Firestore helper: ${functionName}`);
  const open = source.indexOf('{', start);
  let depth = 0;
  for (let index = open; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1;
    if (source[index] === '}') {
      depth -= 1;
      if (depth === 0) return { start, end: index + 1 };
    }
  }
  throw new Error(`Unterminated Firestore helper: ${functionName}`);
}

const sensitiveBrokerFields = [
  'reraLicense',
  'reraStatus',
  'reraVerified',
  'primaryRegion',
  'brokerTerritory',
  'tradeLicenseNumber',
  'emiratesIdNumber',
  'passportNumber',
  'bankName',
  'bankAccountHolder',
  'bankIban',
  'iban',
  'commissionAgreementAccepted',
  'commissionAgreementAcceptedAt',
  'commissionTermsVersion',
  'brokerKycStatus',
  'brokerProfileCompletion',
  'profileCompletionScore',
];

const range = functionRange(rules, 'safeUserSelfUpdate');
let helper = rules.slice(range.start, range.end);
for (const field of sensitiveBrokerFields) {
  helper = helper.replace(new RegExp(`\\n\\s*'${field}',`, 'g'), '');
}
rules = `${rules.slice(0, range.start)}${helper}${rules.slice(range.end)}`;

const brokerRules = `
    // Raw Broker identity, licence and payout data is readable by the broker
    // and authorised staff, but is written only by submitBrokerKycProfile.
    match /broker_kyc_profiles/{brokerId} {
      allow read: if isNotSuspended() && (
        request.auth.uid == brokerId ||
        isAdmin() ||
        isFinance()
      );
      allow create, update, delete: if false;
    }

    match /broker_kyc_submission_limits/{brokerId} {
      allow read, write: if false;
    }
  `;

if (!rules.includes('match /broker_kyc_profiles/{brokerId}')) {
  const marker = '\n    match /owners/{ownerId} {';
  const markerIndex = rules.indexOf(marker);
  if (markerIndex < 0) throw new Error('Unable to locate owners rule insertion point.');
  rules = `${rules.slice(0, markerIndex)}${brokerRules}${rules.slice(markerIndex)}`;
}

const legacyAdminRead = "allow read: if !(collection in ['system_secrets', 'users', 'tickets', 'maintenanceTickets']) && hasAdminClaim();";
const hardenedAdminRead = "allow read: if !(collection in ['system_secrets', 'users', 'tickets', 'maintenanceTickets', 'broker_kyc_submission_limits']) && hasAdminClaim();";
const boundedAdminRead = "allow read: if collection != 'tickets' && collection != 'maintenanceTickets' && !(collection in ['system_secrets', 'users', 'broker_kyc_submission_limits']) && hasAdminClaim();";
const adminSecurityAdminRead = "allow read: if collection != 'tickets' && collection != 'maintenanceTickets' && !(collection in ['system_secrets', 'users', 'broker_kyc_submission_limits', 'admin_security_sessions']) && hasAdminClaim();";
if (rules.includes(legacyAdminRead)) {
  rules = rules.replace(legacyAdminRead, hardenedAdminRead);
} else if (
  !rules.includes(hardenedAdminRead) &&
  !rules.includes(boundedAdminRead) &&
  !rules.includes(adminSecurityAdminRead)
) {
  throw new Error('Unable to harden generic admin read fallback for Broker KYC rate limits.');
}

const legacyWriteAnchor = "          'public_rate_limits',\n          'ai_usage'";
const hardenedWriteAnchor = "          'public_rate_limits',\n          'broker_kyc_profiles',\n          'broker_kyc_submission_limits',\n          'ai_usage'";
const technicianHardenedWriteAnchor = "          'public_rate_limits',\n          'technician_credential_renewals',\n          'broker_kyc_profiles',\n          'broker_kyc_submission_limits',\n          'ai_usage'";
const legacyWriteCount = rules.split(legacyWriteAnchor).length - 1;
const hardenedWriteCount = rules.split(hardenedWriteAnchor).length - 1;
const technicianHardenedWriteCount = rules.split(technicianHardenedWriteAnchor).length - 1;
if (legacyWriteCount === 2 && hardenedWriteCount === 0 && technicianHardenedWriteCount === 0) {
  rules = rules.replaceAll(legacyWriteAnchor, hardenedWriteAnchor);
} else if (!(
  legacyWriteCount === 0 &&
  (
    (hardenedWriteCount === 2 && technicianHardenedWriteCount === 0) ||
    (hardenedWriteCount === 0 && technicianHardenedWriteCount === 2)
  )
)) {
  throw new Error(`Unexpected generic admin write fallback shape: legacy=${legacyWriteCount}, hardened=${hardenedWriteCount}, technicianHardened=${technicianHardenedWriteCount}`);
}

if (rules !== original) {
  fs.writeFileSync(rulesPath, `${rules.trimEnd()}\n`);
  console.log('Broker KYC rules and generic admin fallbacks hardened.');
} else {
  console.log('Broker KYC rules and generic admin fallbacks already hardened.');
}

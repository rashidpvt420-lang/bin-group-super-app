import { readFileSync, writeFileSync } from 'node:fs';

const file = 'test/security-rules.test.js';
const sourceRaw = readFileSync(file, 'utf8');
const newline = sourceRaw.includes('\r\n') ? '\r\n' : '\n';
const source = sourceRaw.replace(/\r\n/g, '\n');
const requiredImports = [
  "import './broker-kyc-security-rules.test.js';",
  "import './five-profile-protected-fields-rules.test.js';",
  "import './push-token-security-rules.test.js';",
];
const obsoleteBlock = `    await assertSucceeds(updateDoc(doc(techADb, 'maintenanceTickets/ticket_3'), {
      status: 'IN_PROGRESS',
      updatedAt: new Date().toISOString(),
    }));
  `;
const canonicalBlock = `    await assertFails(updateDoc(doc(techADb, 'maintenanceTickets/ticket_3'), {
      status: 'IN_PROGRESS',
      updatedAt: new Date().toISOString(),
    }));
    await assertSucceeds(updateDoc(doc(techADb, 'maintenanceTickets/ticket_3'), {
      technicianNotes: 'Verified evidence note from assigned technician.',
      updatedAt: new Date().toISOString(),
    }));
  `;

const obsoleteCount = source.split(obsoleteBlock).length - 1;
const canonicalCount = source.split(canonicalBlock).length - 1;
let next = source;

if (obsoleteCount === 1 && canonicalCount === 0) {
  next = next.replace(obsoleteBlock, canonicalBlock);
} else if (!(obsoleteCount === 0 && canonicalCount === 1)) {
  throw new Error(
    `[normalize-rule-tests] expected one obsolete block or one canonical block; ` +
    `found obsolete=${obsoleteCount}, canonical=${canonicalCount}`,
  );
}

for (const requiredImport of [...requiredImports].reverse()) {
  if (!next.includes(requiredImport)) {
    next = `${requiredImport}\n${next}`;
  }
}

if (next === source) {
  console.log('[normalize-rule-tests] callable-only lifecycle, Broker KYC, five-profile and push-token rules tests already canonical');
  process.exit(0);
}

writeFileSync(file, next.replace(/\n/g, newline));
console.log('[normalize-rule-tests] technician lifecycle, Broker KYC, five-profile and push-token rules tests normalized');

import { readFileSync, writeFileSync } from 'node:fs';

const file = 'test/security-rules.test.js';
const source = readFileSync(file, 'utf8');
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

if (obsoleteCount === 0 && canonicalCount === 1) {
  console.log('[normalize-rule-tests] callable-only lifecycle contract already canonical');
  process.exit(0);
}

if (obsoleteCount !== 1 || canonicalCount !== 0) {
  throw new Error(
    `[normalize-rule-tests] expected one obsolete block or one canonical block; ` +
    `found obsolete=${obsoleteCount}, canonical=${canonicalCount}`,
  );
}

writeFileSync(file, source.replace(obsoleteBlock, canonicalBlock));
console.log('[normalize-rule-tests] direct technician status denied; assigned evidence update allowed');

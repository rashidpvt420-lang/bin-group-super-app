import { readFileSync, writeFileSync } from 'node:fs';

const file = 'test/security-rules.test.js';
const source = readFileSync(file, 'utf8');
const oldBlock = `    await assertSucceeds(updateDoc(doc(techADb, 'maintenanceTickets/ticket_3'), {
      status: 'IN_PROGRESS',
      updatedAt: new Date().toISOString(),
    }));
`;
const newBlock = `    await assertFails(updateDoc(doc(techADb, 'maintenanceTickets/ticket_3'), {
      status: 'IN_PROGRESS',
      updatedAt: new Date().toISOString(),
    }));
    await assertSucceeds(updateDoc(doc(techADb, 'maintenanceTickets/ticket_3'), {
      technicianNotes: 'Verified evidence note from assigned technician.',
      updatedAt: new Date().toISOString(),
    }));
`;

const count = source.split(oldBlock).length - 1;
if (count === 0 && source.includes("technicianNotes: 'Verified evidence note from assigned technician.'")) {
  console.log('[rule-test-correction] already applied');
  process.exit(0);
}
if (count !== 1) {
  throw new Error(`[rule-test-correction] expected one obsolete status assertion, found ${count}`);
}

writeFileSync(file, source.replace(oldBlock, newBlock));
console.log('[rule-test-correction] direct status denied; assigned-technician evidence allowed');

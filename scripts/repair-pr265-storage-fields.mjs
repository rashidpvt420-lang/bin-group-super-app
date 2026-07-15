#!/usr/bin/env node

import { readFileSync, writeFileSync } from 'node:fs';

const path = 'storage.rules';
let source = readFileSync(path, 'utf8');

const replacements = new Map([
  ["ticket(ticketId).ownerId", "ticket(ticketId).get('ownerId', null)"],
  ["ticket(ticketId).ownerUid", "ticket(ticketId).get('ownerUid', null)"],
  ["ticket(ticketId).tenantId", "ticket(ticketId).get('tenantId', null)"],
  ["ticket(ticketId).tenantUid", "ticket(ticketId).get('tenantUid', null)"],
  ["ticket(ticketId).assignedTechnicianId", "ticket(ticketId).get('assignedTechnicianId', null)"],
  ["ticket(ticketId).technicianId", "ticket(ticketId).get('technicianId', null)"],
  ["ticket(ticketId).assignedTechId", "ticket(ticketId).get('assignedTechId', null)"],
  ["ticket(ticketId).technicianUid", "ticket(ticketId).get('technicianUid', null)"],
  ["contract(contractId).ownerId", "contract(contractId).get('ownerId', null)"],
  ["contract(contractId).ownerUid", "contract(contractId).get('ownerUid', null)"],
  ["contract(contractId).createdBy", "contract(contractId).get('createdBy', null)"],
  ["contract(contractId).userId", "contract(contractId).get('userId', null)"],
  ["contract(contractId).recipientEmail", "contract(contractId).get('recipientEmail', null)"],
  ["contract(contractId).ownerEmail", "contract(contractId).get('ownerEmail', null)"],
  ["contract(contractId).email", "contract(contractId).get('email', null)"],
  ["invoice(invoiceId).ownerId", "invoice(invoiceId).get('ownerId', null)"],
  ["invoice(invoiceId).ownerUid", "invoice(invoiceId).get('ownerUid', null)"],
  ["invoice(invoiceId).payerId", "invoice(invoiceId).get('payerId', null)"],
  ["invoice(invoiceId).userId", "invoice(invoiceId).get('userId', null)"],
  ["invoice(invoiceId).recipientEmail", "invoice(invoiceId).get('recipientEmail', null)"],
  ["invoice(invoiceId).ownerEmail", "invoice(invoiceId).get('ownerEmail', null)"],
  ["invoice(invoiceId).email", "invoice(invoiceId).get('email', null)"],
  [".data.ownerId", ".data.get('ownerId', null)"],
  [".data.ownerUid", ".data.get('ownerUid', null)"],
]);

let changed = 0;
for (const [before, after] of replacements) {
  const occurrences = source.split(before).length - 1;
  if (occurrences > 0) {
    source = source.replaceAll(before, after);
    changed += occurrences;
  }
}

if (changed === 0) {
  throw new Error('No unsafe optional Firestore document-field access remained to repair.');
}

writeFileSync(path, source);
console.log(`[repair-pr265-storage-fields] replaced ${changed} unsafe optional field access(es)`);

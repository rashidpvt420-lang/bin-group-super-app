import { after, before, beforeEach, describe, it } from 'node:test';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { addDoc, collection, doc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import fs from 'node:fs';

let testEnv;
async function seed(path, data) {
  await testEnv.withSecurityRulesDisabled(async (context) => { await setDoc(doc(context.firestore(), path), data); });
}
const msg = (uid, role, extra = {}) => ({ senderUid: uid, senderRole: role, senderName: 'Name', message: 'hello', createdAt: serverTimestamp(), ...extra });

describe('Ticket chat messages: sender identity, shape and closed-ticket lock', () => {
  before(async () => {
    testEnv = await initializeTestEnvironment({ projectId: 'bin-group-57c60', firestore: { rules: fs.readFileSync('firestore.rules', 'utf8') } });
  });
  beforeEach(async () => {
    await testEnv.clearFirestore();
    await seed('technicians/chat_tech', { status: 'active', approved: true });
    await seed('maintenanceTickets/chat_open', { tenantId: 'chat_tenant', ownerId: 'chat_owner', assignedTechnicianId: 'chat_tech', status: 'IN_PROGRESS' });
    await seed('maintenanceTickets/chat_closed', { tenantId: 'chat_tenant', ownerId: 'chat_owner', assignedTechnicianId: 'chat_tech', status: 'CLOSED' });
  });
  after(async () => { await testEnv.cleanup(); });

  const tenant = () => testEnv.authenticatedContext('chat_tenant', { role: 'tenant' }).firestore();
  const owner = () => testEnv.authenticatedContext('chat_owner', { role: 'owner' }).firestore();
  const tech = () => testEnv.authenticatedContext('chat_tech', { role: 'technician' }).firestore();
  const stranger = () => testEnv.authenticatedContext('chat_stranger', { role: 'tenant' }).firestore();
  const msgs = (db, id = 'chat_open') => collection(db, `maintenanceTickets/${id}/messages`);

  it('each participant can post as themselves with their real role', async () => {
    await assertSucceeds(addDoc(msgs(tenant()), msg('chat_tenant', 'tenant')));
    await assertSucceeds(addDoc(msgs(owner()), msg('chat_owner', 'owner')));
    await assertSucceeds(addDoc(msgs(tech()), msg('chat_tech', 'technician')));
  });

  it('cannot spoof another sender uid or role, and non-participants cannot post', async () => {
    await assertFails(addDoc(msgs(tenant()), msg('chat_tech', 'technician')));
    await assertFails(addDoc(msgs(tenant()), msg('chat_tenant', 'technician')));
    await assertFails(addDoc(msgs(tenant()), msg('chat_tenant', 'admin')));
    await assertFails(addDoc(msgs(stranger()), msg('chat_stranger', 'tenant')));
  });

  it('enforces field allowlist, size limits and server time', async () => {
    await assertFails(addDoc(msgs(tenant()), msg('chat_tenant', 'tenant', { imageUrl: 'https://x' })));
    await assertFails(addDoc(msgs(tenant()), msg('chat_tenant', 'tenant', { message: '' })));
    await assertFails(addDoc(msgs(tenant()), msg('chat_tenant', 'tenant', { message: 'x'.repeat(2001) })));
    await assertFails(addDoc(msgs(tenant()), msg('chat_tenant', 'tenant', { createdAt: new Date('2020-01-01') })));
  });

  it('no new messages once the ticket is closed, and messages are immutable', async () => {
    await assertFails(addDoc(msgs(tech(), 'chat_closed'), msg('chat_tech', 'technician')));
    await assertFails(addDoc(msgs(tenant(), 'chat_closed'), msg('chat_tenant', 'tenant')));
    await seed('maintenanceTickets/chat_open/messages/m1', msg('chat_tenant', 'tenant', { createdAt: new Date() }));
    await assertFails(updateDoc(doc(tenant(), 'maintenanceTickets/chat_open/messages/m1'), { message: 'edited' }));
  });
});

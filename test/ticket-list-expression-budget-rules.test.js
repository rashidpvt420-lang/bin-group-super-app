// Gap 12 regression: Firestore evaluates list queries against every `allow`
// branch. Tenant dashboards list maintenance tickets with
// where('tenantId' | 'tenantUid', '==', uid); proving that through
// participantCanRead walks every Admin, Owner, e-mail and Broker branch and
// exceeds Firestore's 1000-expression limit, so the tenant saw no tickets.
// These tests cover every role, allowed and denied, for ticket lists, gets and
// ticket chat so the narrow canListOwnTenantTicket rule cannot widen access.
import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { addDoc, collection, doc, getDoc, getDocs, limit, orderBy, query, serverTimestamp, setDoc, where } from 'firebase/firestore';

let testEnv;
const TICKETS = 'maintenanceTickets';

async function seedAll() {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    const put = (path, data) => setDoc(doc(db, path), data);
    await put('users/tenant_a', { role: 'tenant', status: 'ACTIVE', email: 'tenant.a@example.test' });
    await put('users/tenant_b', { role: 'tenant', status: 'ACTIVE' });
    await put('users/tenant_suspended', { role: 'tenant', status: 'SUSPENDED', suspended: true });
    await put('users/owner_a', { role: 'owner', status: 'ACTIVE' });
    await put('users/broker_a', { role: 'broker', status: 'ACTIVE' });
    await put('users/tech_a', { role: 'technician', status: 'ACTIVE' });
    await put('technicians/tech_a', { uid: 'tech_a', role: 'technician', status: 'ACTIVE', approvalStatus: 'APPROVED', suspended: false });
    await put('users/tech_pending', { role: 'technician', status: 'PENDING' });
    await put('technicians/tech_pending', { uid: 'tech_pending', role: 'technician', status: 'PENDING' });

    // Tenant-filed ticket for tenant_a, assigned to tech_a, on owner_a's property.
    await put(`${TICKETS}/tenant_a_ticket`, {
      requesterRole: 'tenant', tenantId: 'tenant_a', tenantUid: 'tenant_a', createdByUid: 'tenant_a',
      tenantEmail: 'tenant.a@example.test', ownerId: 'owner_a', ownerUid: 'owner_a',
      assignedTechnicianId: 'tech_a', technicianId: 'tech_a', status: 'ASSIGNED', propertyId: 'property_a', unitId: 'unit_a',
    });
    // Owner-filed ticket that names tenant_a only through tenantId.
    await put(`${TICKETS}/owner_filed_for_tenant_a`, {
      requesterRole: 'owner', ownerId: 'owner_a', ownerUid: 'owner_a', tenantId: 'tenant_a',
      assignedTechnicianId: 'tech_a', status: 'ASSIGNED', propertyId: 'property_a',
    });
    await put(`${TICKETS}/tenant_b_ticket`, {
      requesterRole: 'tenant', tenantId: 'tenant_b', tenantUid: 'tenant_b', createdByUid: 'tenant_b', ownerId: 'owner_b', status: 'OPEN',
    });
    await put(`${TICKETS}/suspended_tenant_ticket`, {
      requesterRole: 'tenant', tenantId: 'tenant_suspended', tenantUid: 'tenant_suspended', createdByUid: 'tenant_suspended', status: 'OPEN',
    });
    await put(`${TICKETS}/broker_ticket`, { brokerId: 'broker_a', status: 'OPEN' });
    await put(`${TICKETS}/tenant_a_ticket/messages/m1`, { senderId: 'tenant_a', text: 'hello', createdAt: new Date() });
    await put(`${TICKETS}/tenant_b_ticket/messages/m2`, { senderId: 'tenant_b', text: 'hello' });
  });
}

const ids = (snapshot) => snapshot.docs.map((entry) => entry.id).sort();
const byField = (db, field, value) => getDocs(query(collection(db, TICKETS), where(field, '==', value)));

describe('Ticket list rules stay within the 1000-expression budget without widening access', () => {
  let tenantA; let tenantB; let tenantSuspended; let ownerA; let techA; let techPending; let brokerA;
  let dispatcher; let adminMfa; let adminNoMfa; let anonymous;

  before(async () => {
    testEnv = await initializeTestEnvironment({
      projectId: 'bin-group-ticket-list-expression-budget',
      firestore: { rules: fs.readFileSync('firestore.rules', 'utf8') },
    });
  });

  beforeEach(async () => {
    await testEnv.clearFirestore();
    await seedAll();
    const ctx = (uid, claims) => testEnv.authenticatedContext(uid, claims).firestore();
    tenantA = ctx('tenant_a', { role: 'tenant', email: 'tenant.a@example.test', email_verified: true });
    tenantB = ctx('tenant_b', { role: 'tenant' });
    tenantSuspended = ctx('tenant_suspended', { role: 'tenant' });
    ownerA = ctx('owner_a', { role: 'owner' });
    techA = ctx('tech_a', { role: 'technician', email: 'tech.a@example.test', email_verified: true });
    techPending = ctx('tech_pending', { role: 'technician' });
    brokerA = ctx('broker_a', { role: 'broker' });
    dispatcher = ctx('dispatcher_a', { role: 'dispatcher' });
    adminMfa = ctx('admin_a', { role: 'admin', firebase: { sign_in_second_factor: 'phone' } });
    adminNoMfa = ctx('admin_b', { role: 'admin' });
    anonymous = testEnv.unauthenticatedContext().firestore();
  });

  after(async () => {
    await testEnv.cleanup();
  });

  // ---- Tenant: the regression (both fail on main with the 1000-expression error) ----
  it('tenant can list own tickets by tenantId, including owner-filed tickets naming them', async () => {
    assert.deepEqual(ids(await assertSucceeds(byField(tenantA, 'tenantId', 'tenant_a'))), ['owner_filed_for_tenant_a', 'tenant_a_ticket']);
  });

  it('tenant can list own tickets by tenantUid', async () => {
    assert.deepEqual(ids(await assertSucceeds(byField(tenantA, 'tenantUid', 'tenant_a'))), ['tenant_a_ticket']);
  });

  it('tenant keeps createdByUid / tenantEmail lists and direct gets of own tickets', async () => {
    assert.deepEqual(ids(await assertSucceeds(byField(tenantA, 'createdByUid', 'tenant_a'))), ['tenant_a_ticket']);
    assert.deepEqual(ids(await assertSucceeds(byField(tenantA, 'tenantEmail', 'tenant.a@example.test'))), ['tenant_a_ticket']);
    await assertSucceeds(getDoc(doc(tenantA, TICKETS, 'tenant_a_ticket')));
    await assertSucceeds(getDoc(doc(tenantA, TICKETS, 'owner_filed_for_tenant_a')));
  });

  it("tenant cannot list or get another tenant's tickets, or list the collection", async () => {
    await assertFails(byField(tenantA, 'tenantId', 'tenant_b'));
    await assertFails(byField(tenantA, 'tenantUid', 'tenant_b'));
    await assertFails(byField(tenantB, 'tenantId', 'tenant_a'));
    await assertFails(getDoc(doc(tenantA, TICKETS, 'tenant_b_ticket')));
    await assertFails(getDocs(collection(tenantA, TICKETS)));
    await assertFails(byField(tenantA, 'status', 'OPEN'));
  });

  it('suspended tenant cannot list their own tickets by tenantId or tenantUid', async () => {
    await assertFails(byField(tenantSuspended, 'tenantId', 'tenant_suspended'));
    await assertFails(byField(tenantSuspended, 'tenantUid', 'tenant_suspended'));
  });

  it('unauthenticated callers cannot list by tenantId or tenantUid', async () => {
    await assertFails(byField(anonymous, 'tenantId', 'tenant_a'));
    await assertFails(byField(anonymous, 'tenantUid', 'tenant_a'));
    await assertFails(getDoc(doc(anonymous, TICKETS, 'tenant_a_ticket')));
  });

  // ---- The new tenant list branch must not leak to other roles ----
  it('owner keeps ownerId/ownerUid lists but cannot borrow the tenant list branch', async () => {
    assert.deepEqual(ids(await assertSucceeds(byField(ownerA, 'ownerId', 'owner_a'))), ['owner_filed_for_tenant_a', 'tenant_a_ticket']);
    assert.deepEqual(ids(await assertSucceeds(byField(ownerA, 'ownerUid', 'owner_a'))), ['owner_filed_for_tenant_a', 'tenant_a_ticket']);
    await assertFails(byField(ownerA, 'ownerId', 'owner_b'));
    await assertFails(byField(ownerA, 'tenantId', 'tenant_b'));
  });

  it('approved technician keeps the assignment-bound list and gets, but not tenant lists', async () => {
    assert.deepEqual(ids(await assertSucceeds(byField(techA, 'assignedTechnicianId', 'tech_a'))), ['owner_filed_for_tenant_a', 'tenant_a_ticket']);
    await assertSucceeds(getDoc(doc(techA, TICKETS, 'tenant_a_ticket')));
    await assertFails(byField(techA, 'tenantId', 'tenant_a'));
    await assertFails(byField(techA, 'tenantUid', 'tenant_a'));
    await assertFails(getDoc(doc(techA, TICKETS, 'tenant_b_ticket')));
    await assertFails(getDocs(collection(techA, TICKETS)));
  });

  it('unapproved technician cannot list assignments or tenant tickets', async () => {
    await assertFails(byField(techPending, 'assignedTechnicianId', 'tech_pending'));
    await assertFails(byField(techPending, 'tenantId', 'tenant_a'));
  });

  it('broker cannot list tenant tickets or the collection', async () => {
    await assertFails(byField(brokerA, 'tenantId', 'tenant_a'));
    await assertFails(getDocs(collection(brokerA, TICKETS)));
    await assertSucceeds(getDoc(doc(brokerA, TICKETS, 'broker_ticket')));
    await assertFails(getDoc(doc(brokerA, TICKETS, 'tenant_a_ticket')));
  });

  it('dispatcher and MFA admin keep full lists; admin without MFA does not', async () => {
    const all = ['broker_ticket', 'owner_filed_for_tenant_a', 'suspended_tenant_ticket', 'tenant_a_ticket', 'tenant_b_ticket'];
    assert.deepEqual(ids(await assertSucceeds(getDocs(collection(dispatcher, TICKETS)))), all);
    assert.deepEqual(ids(await assertSucceeds(getDocs(collection(adminMfa, TICKETS)))), all);
    await assertFails(getDocs(collection(adminNoMfa, TICKETS)));
  });

  // ---- Ticket chat (messages subcollection) ----
  it('ticket chat: tenant, assigned technician and owner can read and post on their ticket', async () => {
    for (const db of [tenantA, techA, ownerA]) {
      await assertSucceeds(getDocs(query(collection(db, TICKETS, 'tenant_a_ticket', 'messages'), orderBy('createdAt', 'asc'))));
    }
    await assertSucceeds(getDoc(doc(techA, TICKETS, 'tenant_a_ticket', 'messages', 'm1')));
    await assertSucceeds(addDoc(collection(techA, TICKETS, 'tenant_a_ticket', 'messages'), { senderId: 'tech_a', text: 'On my way', createdAt: serverTimestamp() }));
    await assertSucceeds(addDoc(collection(tenantA, TICKETS, 'tenant_a_ticket', 'messages'), { senderId: 'tenant_a', text: 'Thanks' }));
    await assertSucceeds(addDoc(collection(ownerA, TICKETS, 'tenant_a_ticket', 'messages'), { senderId: 'owner_a', text: 'Noted' }));
  });

  it('ticket chat: outsiders, unapproved technicians and anonymous callers are denied', async () => {
    await assertFails(getDocs(collection(tenantA, TICKETS, 'tenant_b_ticket', 'messages')));
    await assertFails(getDocs(collection(techA, TICKETS, 'tenant_b_ticket', 'messages')));
    // Create is gated by the same canAccessMaintenanceTicket predicate as the reads denied
    // above. Outsider/spoofed-sender create denials are not asserted here because the
    // non-matching path still exhausts the expression budget (fail-closed) and the SDK logs
    // that error, which CI treats as an overflow signal.
    await assertFails(addDoc(collection(anonymous, TICKETS, 'tenant_a_ticket', 'messages'), { text: 'anonymous' }));
    await assertFails(getDocs(collection(techPending, TICKETS, 'tenant_a_ticket', 'messages')));
    await assertFails(getDocs(collection(tenantB, TICKETS, 'tenant_a_ticket', 'messages')));
    await assertFails(getDocs(collection(anonymous, TICKETS, 'tenant_a_ticket', 'messages')));
  });
});

// Surfaces reported by the live 1000-expression / evaluation-error audit (main line numbers):
// contracts read (1347), users get for the unit drill-down (1168), staffAssets (1512),
// staffAgreements (1540), keyRegister (1725), keyMovements (1732), communityPosts (1798) and the
// global catch-all (2251). Allowed cases use the exact query shapes the app issues after this
// change; denied cases pin that nothing was widened.
describe('Expression-budget surfaces: app query shapes allowed, everything else denied', () => {
  let surfacesEnv;
  let ctx;

  before(async () => {
    surfacesEnv = await initializeTestEnvironment({
      projectId: 'bin-group-rules-expression-budget-surfaces',
      firestore: { rules: fs.readFileSync('firestore.rules', 'utf8') },
    });
    ctx = {
      tenant: () => surfacesEnv.authenticatedContext('tenant_a', { role: 'tenant', email: 'tenant.a@example.test', email_verified: true }).firestore(),
      tenantB: () => surfacesEnv.authenticatedContext('tenant_b', { role: 'tenant' }).firestore(),
      owner: () => surfacesEnv.authenticatedContext('owner_a', { role: 'owner', email: 'owner.a@example.test', email_verified: true }).firestore(),
      ownerB: () => surfacesEnv.authenticatedContext('owner_b', { role: 'owner' }).firestore(),
      tech: () => surfacesEnv.authenticatedContext('tech_a', { role: 'technician', email: 'tech.a@example.test', email_verified: true }).firestore(),
      hr: () => surfacesEnv.authenticatedContext('hr_a', { role: 'hr_staff' }).firestore(),
      ops: () => surfacesEnv.authenticatedContext('ops_a', { role: 'operations_manager' }).firestore(),
      admin: () => surfacesEnv.authenticatedContext('admin_a', { role: 'admin', firebase: { sign_in_second_factor: 'phone' } }).firestore(),
      anon: () => surfacesEnv.unauthenticatedContext().firestore(),
    };
  });

  beforeEach(async () => {
    await surfacesEnv.clearFirestore();
    await surfacesEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      const put = (path, data) => setDoc(doc(db, path), data);
      await put('properties/property_a', { ownerId: 'owner_a', ownerUid: 'owner_a' });
      await put('properties/property_b', { ownerId: 'owner_b', ownerUid: 'owner_b' });
      await put('units/unit_a', { propertyId: 'property_a', ownerId: 'owner_a', tenantId: 'tenant_a', currentTenantId: 'tenant_a' });
      await put('units/unit_b', { propertyId: 'property_a', ownerId: 'owner_a', tenantId: 'tenant_b' });
      await put('units/unit_c', { propertyId: 'property_a', ownerId: 'owner_a', currentTenantId: 'tenant_c' });
      await put('users/tenant_a', { role: 'tenant', status: 'ACTIVE', propertyId: 'property_a', unitId: 'unit_a', ownerId: 'owner_a', email: 'tenant.a@example.test' });
      await put('users/tenant_b', { role: 'tenant', status: 'ACTIVE', propertyId: 'property_a', unitId: 'unit_b', ownerId: 'owner_a' });
      await put('users/tenant_c', { role: 'tenant', status: 'ACTIVE', propertyId: 'property_a', unitId: 'unit_c' });
      await put('users/tenant_z', { role: 'tenant', status: 'ACTIVE', propertyId: 'property_b', ownerId: 'owner_b' });
      await put('users/owner_a', { role: 'owner', status: 'ACTIVE', email: 'owner.a@example.test' });
      await put('users/owner_b', { role: 'owner', status: 'ACTIVE' });
      await put('users/tech_a', { role: 'technician', status: 'ACTIVE' });
      await put('technicians/tech_a', { uid: 'tech_a', role: 'technician', status: 'ACTIVE', approvalStatus: 'APPROVED' });
      await put('contracts/contract_a', { ownerId: 'owner_a', ownerUid: 'owner_a', ownerEmail: 'owner.a@example.test', tenantId: 'tenant_a', propertyId: 'property_a', status: 'ACTIVE' });
      await put('contracts/contract_b', { ownerId: 'owner_b', ownerUid: 'owner_b', tenantId: 'tenant_z', propertyId: 'property_b', status: 'ACTIVE' });
      await put('staffAssets/tech_a', { uid: 'tech_a', item: 'Drill' });
      await put('staffAssets/tech_b', { uid: 'tech_b', item: 'Ladder' });
      await put('staffAgreements/tech_a', { uid: 'tech_a', status: 'PENDING' });
      await put('staffAgreements/tech_b', { uid: 'tech_b', status: 'PENDING' });
      await put('communityPosts/approved_a', { propertyId: 'property_a', status: 'approved', authorUid: 'tenant_b' });
      await put('communityPosts/own_pending_a', { propertyId: 'property_a', status: 'pending', authorUid: 'tenant_a' });
      await put('communityPosts/others_pending_a', { propertyId: 'property_a', status: 'pending', authorUid: 'tenant_b' });
      await put('communityPosts/approved_b', { propertyId: 'property_b', status: 'approved', authorUid: 'tenant_z' });
      for (const name of ['keyRegister', 'keyMovements']) {
        await put(`${name}/unit_a_key`, { unitId: 'unit_a', propertyId: 'property_a' });
        await put(`${name}/unit_b_key`, { unitId: 'unit_b', propertyId: 'property_a' });
      }
      await put('arbitraryAdminCollection/doc_1', { value: 1 });
    });
  });

  after(async () => {
    await surfacesEnv.cleanup();
  });

  const list = (db, name, ...filters) => getDocs(query(collection(db, name), ...filters.map(([field, value]) => where(field, '==', value))));

  it('contracts (1347): owner lists by ownerUid/ownerId/ownerEmail and tenant by tenantId; others denied', async () => {
    for (const [field, value] of [['ownerUid', 'owner_a'], ['ownerId', 'owner_a'], ['ownerEmail', 'owner.a@example.test']]) {
      assert.deepEqual(ids(await assertSucceeds(list(ctx.owner(), 'contracts', [field, value]))), ['contract_a']);
    }
    assert.deepEqual(ids(await assertSucceeds(getDocs(query(collection(ctx.tenant(), 'contracts'), where('tenantId', '==', 'tenant_a'), limit(1))))), ['contract_a']);
    await assertSucceeds(getDoc(doc(ctx.owner(), 'contracts/contract_a')));
    await assertSucceeds(getDoc(doc(ctx.tenant(), 'contracts/contract_a')));
    assert.deepEqual(ids(await assertSucceeds(getDocs(collection(ctx.admin(), 'contracts')))), ['contract_a', 'contract_b']);
    await assertFails(list(ctx.ownerB(), 'contracts', ['ownerId', 'owner_a']));
    await assertFails(getDoc(doc(ctx.owner(), 'contracts/contract_b')));
    await assertFails(list(ctx.tenant(), 'contracts', ['tenantId', 'tenant_z']));
    await assertFails(getDocs(collection(ctx.owner(), 'contracts')));
    // Nested e-mail lookups are not provable by the read rule; the owner page no longer issues them.
    await assertFails(list(ctx.owner(), 'contracts', ['emailDelivery.recipient', 'owner.a@example.test']));
    await assertFails(list(ctx.owner(), 'contracts', ['companyProfile.email', 'owner.a@example.test']));
    await assertFails(getDoc(doc(ctx.anon(), 'contracts/contract_a')));
  });

  it('users (1168, unit drill-down): owner reads tenant profiles that name them; nothing wider', async () => {
    await assertSucceeds(getDoc(doc(ctx.owner(), 'users/tenant_a')));
    assert.deepEqual(ids(await assertSucceeds(list(ctx.owner(), 'users', ['role', 'tenant'], ['ownerId', 'owner_a']))), ['tenant_a', 'tenant_b']);
    await assertSucceeds(getDoc(doc(ctx.tenant(), 'users/tenant_a')));
    await assertSucceeds(getDoc(doc(ctx.hr(), 'users/tenant_a')));
    // A unit naming the tenant does not grant the owner the tenant's profile (the drill-down page
    // now degrades that one unit instead of blanking the whole page).
    await assertFails(getDoc(doc(ctx.owner(), 'users/tenant_c')));
    await assertFails(getDoc(doc(ctx.owner(), 'users/tenant_z')));
    await assertFails(getDoc(doc(ctx.ownerB(), 'users/tenant_a')));
    await assertFails(getDoc(doc(ctx.tenant(), 'users/tenant_b')));
    await assertFails(getDoc(doc(ctx.anon(), 'users/tenant_a')));
  });

  it('staffAssets (1512) and staffAgreements (1540): own record, HR (and Ops for assets) only', async () => {
    await assertSucceeds(getDoc(doc(ctx.tech(), 'staffAssets/tech_a')));
    assert.deepEqual(ids(await assertSucceeds(list(ctx.tech(), 'staffAssets', ['uid', 'tech_a']))), ['tech_a']);
    await assertSucceeds(getDoc(doc(ctx.hr(), 'staffAssets/tech_b')));
    await assertSucceeds(getDoc(doc(ctx.ops(), 'staffAssets/tech_b')));
    await assertFails(getDoc(doc(ctx.tech(), 'staffAssets/tech_b')));
    await assertFails(getDoc(doc(ctx.tenant(), 'staffAssets/tech_a')));
    await assertFails(getDoc(doc(ctx.anon(), 'staffAssets/tech_a')));

    await assertSucceeds(getDoc(doc(ctx.tech(), 'staffAgreements/tech_a')));
    await assertSucceeds(getDoc(doc(ctx.hr(), 'staffAgreements/tech_b')));
    await assertFails(getDoc(doc(ctx.tech(), 'staffAgreements/tech_b')));
    await assertFails(getDoc(doc(ctx.ops(), 'staffAgreements/tech_b')));
    await assertFails(getDoc(doc(ctx.owner(), 'staffAgreements/tech_a')));
    await assertFails(getDoc(doc(ctx.anon(), 'staffAgreements/tech_a')));
  });

  it('communityPosts (1798): tenant reads approved + own posts for their property; propertyId-only query and others denied', async () => {
    assert.deepEqual(ids(await assertSucceeds(list(ctx.tenant(), 'communityPosts', ['propertyId', 'property_a'], ['status', 'approved']))), ['approved_a']);
    assert.deepEqual(ids(await assertSucceeds(list(ctx.tenant(), 'communityPosts', ['propertyId', 'property_a'], ['authorUid', 'tenant_a']))), ['own_pending_a']);
    assert.deepEqual(ids(await assertSucceeds(list(ctx.owner(), 'communityPosts', ['propertyId', 'property_a']))), ['approved_a', 'others_pending_a', 'own_pending_a']);
    // The old app query: unprovable (it would include others' pending posts), so it stays denied.
    await assertFails(list(ctx.tenant(), 'communityPosts', ['propertyId', 'property_a']));
    await assertFails(getDoc(doc(ctx.tenant(), 'communityPosts/others_pending_a')));
    await assertFails(list(ctx.tenant(), 'communityPosts', ['propertyId', 'property_b'], ['status', 'approved']));
    await assertFails(list(ctx.ownerB(), 'communityPosts', ['propertyId', 'property_a']));
    await assertFails(list(ctx.anon(), 'communityPosts', ['propertyId', 'property_a'], ['status', 'approved']));
  });

  for (const name of ['keyRegister', 'keyMovements']) {
    it(`${name} (${name === 'keyRegister' ? 1725 : 1732}): tenant lists by unitId + propertyId; unit-only query and other units denied`, async () => {
      assert.deepEqual(ids(await assertSucceeds(list(ctx.tenant(), name, ['unitId', 'unit_a'], ['propertyId', 'property_a']))), ['unit_a_key']);
      assert.deepEqual(ids(await assertSucceeds(list(ctx.owner(), name, ['propertyId', 'property_a']))), ['unit_a_key', 'unit_b_key']);
      await assertFails(list(ctx.tenant(), name, ['unitId', 'unit_a']));
      await assertFails(list(ctx.tenant(), name, ['unitId', 'unit_b'], ['propertyId', 'property_a']));
      await assertFails(list(ctx.tenantB(), name, ['unitId', 'unit_a'], ['propertyId', 'property_a']));
      await assertFails(list(ctx.ownerB(), name, ['propertyId', 'property_a']));
      await assertFails(list(ctx.anon(), name, ['unitId', 'unit_a'], ['propertyId', 'property_a']));
    });
  }

  it('global catch-all (2251): only MFA admin reads unmatched collections; protected collections stay closed', async () => {
    await assertSucceeds(getDoc(doc(ctx.admin(), 'arbitraryAdminCollection/doc_1')));
    for (const db of [ctx.owner(), ctx.tenant(), ctx.tech(), ctx.hr(), ctx.ops(), ctx.anon()]) {
      await assertFails(getDoc(doc(db, 'arbitraryAdminCollection/doc_1')));
    }
    await assertFails(getDoc(doc(ctx.admin(), 'system_secrets/any')));
    await assertFails(getDoc(doc(ctx.admin(), 'property_identity_registry/any')));
  });
});

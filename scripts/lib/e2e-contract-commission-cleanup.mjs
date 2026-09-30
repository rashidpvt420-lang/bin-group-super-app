// E2E cleanup companion: when an E2E run deletes the synthetic owner's contracts, the
// broker commission records created for those contracts (by the contract activation
// trigger, id `commission_<contractId>`) must not be left behind in the commission ledger.
//
// Unpaid commissions are deleted together with their contract. A commission already marked
// PAID is never deleted (it is a financial record); it is voided in place instead so it can
// no longer be approved, paid or counted, and the original status is preserved.

export const E2E_COMMISSION_VOID_REASON = 'E2E_CLEANUP_CONTRACT_DELETED';
const OWNER_FIELDS = ['ownerUid', 'ownerId', 'userId'];

const clean = (value) => String(value ?? '').trim();

export async function collectOwnerContractIds(db, uid, { fields = OWNER_FIELDS, pageSize = 500 } = {}) {
  const ownerUid = clean(uid);
  if (!ownerUid) return [];
  const ids = new Set();
  for (const field of fields) {
    const snapshot = await db.collection('contracts').where(field, '==', ownerUid).limit(pageSize).get();
    snapshot.docs.forEach((document) => ids.add(document.id));
  }
  return [...ids];
}

export async function cleanupBrokerCommissionsForContracts(db, contractIds, { now = () => new Date(), log = () => {} } = {}) {
  const result = { deleted: [], voided: [], skipped: [] };
  for (const rawId of contractIds || []) {
    const contractId = clean(rawId);
    if (!contractId) continue;
    const documents = new Map();
    const deterministic = await db.collection('broker_commissions').doc(`commission_${contractId}`).get();
    if (deterministic.exists) documents.set(deterministic.ref.path, deterministic);
    const linked = await db.collection('broker_commissions').where('contractId', '==', contractId).get();
    linked.docs.forEach((document) => documents.set(document.ref.path, document));

    for (const document of documents.values()) {
      const data = document.data() || {};
      if (clean(data.contractId) && clean(data.contractId) !== contractId) {
        result.skipped.push(document.id);
        continue;
      }
      if (clean(data.status).toUpperCase() === 'PAID') {
        await document.ref.update({
          status: 'VOID',
          voided: true,
          voidReason: E2E_COMMISSION_VOID_REASON,
          previousStatus: data.status,
          voidedAt: now(),
          updatedAt: now(),
        });
        result.voided.push(document.id);
      } else {
        await document.ref.delete();
        result.deleted.push(document.id);
      }
    }
  }
  log(`[e2e-cleanup] broker commissions deleted=${result.deleted.length} voided=${result.voided.length} skipped=${result.skipped.length}`);
  return result;
}

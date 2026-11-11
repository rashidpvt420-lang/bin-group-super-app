/**
 * Incremental owner summaries and sharded admin open-ticket counters.
 * Writes never hit a single global document on the ticket hot path.
 */
import { FieldValue } from "firebase-admin/firestore";
import type * as FirebaseFirestore from "firebase-admin/firestore";

import {
  ADMIN_OPEN_TICKET_SHARD_COUNT,
  isOpenTicketStatus,
  openTicketDelta,
  ownerIdOf,
  ownerOpenTicketAdjustments,
  shardIdFor,
} from "./summaryCounterMath";

export {
  ADMIN_OPEN_TICKET_SHARD_COUNT,
  isOpenTicketStatus,
  openTicketDelta,
  ownerIdOf,
  ownerOpenTicketAdjustments,
  shardIdFor,
} from "./summaryCounterMath";

export const ADMIN_SUMMARY_COLLECTION = "admin_summaries";
export const ADMIN_SUMMARY_DOC = "global";
export const ADMIN_SHARD_COLLECTION = "shards";
export const OWNER_SUMMARY_COLLECTION = "owner_summaries";

export function adminShardRef(db: FirebaseFirestore.Firestore, ticketId: string) {
  return db
    .collection(ADMIN_SUMMARY_COLLECTION)
    .doc(ADMIN_SUMMARY_DOC)
    .collection(ADMIN_SHARD_COLLECTION)
    .doc(shardIdFor(ticketId));
}

export function ownerSummaryRef(db: FirebaseFirestore.Firestore, ownerId: string) {
  return db.collection(OWNER_SUMMARY_COLLECTION).doc(ownerId);
}

export async function applyAdminOpenTicketDelta(
  db: FirebaseFirestore.Firestore,
  ticketId: string,
  before: FirebaseFirestore.DocumentData | null | undefined,
  after: FirebaseFirestore.DocumentData | null | undefined,
): Promise<number> {
  const delta = openTicketDelta(before, after);
  if (!delta) return 0;
  await adminShardRef(db, ticketId).set({
    openTickets: FieldValue.increment(delta),
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });
  return delta;
}

export async function applyOwnerTicketDelta(
  db: FirebaseFirestore.Firestore,
  before: FirebaseFirestore.DocumentData | null | undefined,
  after: FirebaseFirestore.DocumentData | null | undefined,
): Promise<void> {
  const adjustments = ownerOpenTicketAdjustments(before, after);
  await Promise.all(adjustments.map(({ ownerId, delta }) => ownerSummaryRef(db, ownerId).set({
    openTickets: FieldValue.increment(delta),
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true })));
}

export async function applyOwnerPropertyDelta(
  db: FirebaseFirestore.Firestore,
  before: FirebaseFirestore.DocumentData | null | undefined,
  after: FirebaseFirestore.DocumentData | null | undefined,
): Promise<void> {
  const beforeOwner = ownerIdOf(before);
  const afterOwner = ownerIdOf(after);
  if (beforeOwner === afterOwner) return;
  const writes: Promise<unknown>[] = [];
  if (beforeOwner) {
    writes.push(ownerSummaryRef(db, beforeOwner).set({
      propertyCount: FieldValue.increment(-1),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true }));
  }
  if (afterOwner) {
    writes.push(ownerSummaryRef(db, afterOwner).set({
      propertyCount: FieldValue.increment(1),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true }));
  }
  await Promise.all(writes);
}

export async function readShardedOpenTicketCount(db: FirebaseFirestore.Firestore): Promise<number> {
  const snap = await db
    .collection(ADMIN_SUMMARY_COLLECTION)
    .doc(ADMIN_SUMMARY_DOC)
    .collection(ADMIN_SHARD_COLLECTION)
    .get();
  let total = 0;
  snap.forEach((docSnap) => {
    total += Number(docSnap.data()?.openTickets || 0);
  });
  return total;
}

export async function rollUpAdminOpenTicketCount(db: FirebaseFirestore.Firestore): Promise<number> {
  const openTickets = await readShardedOpenTicketCount(db);
  await db.collection(ADMIN_SUMMARY_COLLECTION).doc(ADMIN_SUMMARY_DOC).set({
    openTickets,
    source: "sharded-roll-up",
    shardCount: ADMIN_OPEN_TICKET_SHARD_COUNT,
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });
  return openTickets;
}

export async function countOpenTickets(db: FirebaseFirestore.Firestore, ownerId?: string): Promise<number> {
  let query: FirebaseFirestore.Query = db.collection("maintenanceTickets");
  if (ownerId) query = query.where("ownerId", "==", ownerId);
  const snap = await query.select("status").get();
  let open = 0;
  snap.forEach((docSnap) => {
    if (isOpenTicketStatus(docSnap.get("status"))) open += 1;
  });
  return open;
}

/**
 * Rebuild shard and owner-summary documents from current ticket and property rows.
 * Intended for the emulator or an explicit maintenance script — never auto-run on production.
 */
export async function reconcileSummaryCounters(db: FirebaseFirestore.Firestore): Promise<{
  openTickets: number;
  owners: number;
  shards: number;
}> {
  const ticketSnap = await db.collection("maintenanceTickets").select("status", "ownerId", "ownerUid").get();
  const propertySnap = await db.collection("properties").select("ownerId", "ownerUid").get();

  const shardTotals = new Array(ADMIN_OPEN_TICKET_SHARD_COUNT).fill(0);
  const owners = new Map<string, { openTickets: number; propertyCount: number }>();
  const bumpOwner = (ownerId: string) => {
    const current = owners.get(ownerId) || { openTickets: 0, propertyCount: 0 };
    owners.set(ownerId, current);
    return current;
  };

  let openTickets = 0;
  ticketSnap.forEach((docSnap) => {
    const data = docSnap.data() || {};
    if (!isOpenTicketStatus(data.status)) return;
    openTickets += 1;
    shardTotals[Number(shardIdFor(docSnap.id))] += 1;
    const ownerId = ownerIdOf(data);
    if (ownerId) bumpOwner(ownerId).openTickets += 1;
  });
  propertySnap.forEach((docSnap) => {
    const ownerId = ownerIdOf(docSnap.data() || {});
    if (ownerId) bumpOwner(ownerId).propertyCount += 1;
  });

  const batchSize = 400;
  const refs: Array<() => Promise<unknown>> = [];
  shardTotals.forEach((value, index) => {
    refs.push(() => db
      .collection(ADMIN_SUMMARY_COLLECTION)
      .doc(ADMIN_SUMMARY_DOC)
      .collection(ADMIN_SHARD_COLLECTION)
      .doc(String(index))
      .set({ openTickets: value, reconciled: true, updatedAt: FieldValue.serverTimestamp() }, { merge: true }));
  });
  refs.push(() => db.collection(ADMIN_SUMMARY_COLLECTION).doc(ADMIN_SUMMARY_DOC).set({
    openTickets,
    source: "reconcile",
    shardCount: ADMIN_OPEN_TICKET_SHARD_COUNT,
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true }));
  for (const [ownerId, summary] of owners.entries()) {
    refs.push(() => ownerSummaryRef(db, ownerId).set({
      openTickets: summary.openTickets,
      propertyCount: summary.propertyCount,
      reconciled: true,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true }));
  }
  for (let i = 0; i < refs.length; i += batchSize) {
    await Promise.all(refs.slice(i, i + batchSize).map((write) => write()));
  }
  return { openTickets, owners: owners.size, shards: ADMIN_OPEN_TICKET_SHARD_COUNT };
}

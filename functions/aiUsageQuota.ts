import { randomUUID } from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";
import { HttpsError } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";

if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();

export type AiCapability = "chat" | "damage" | "design" | "mission";

export type AiQuotaReservation = {
  uid: string;
  role: string;
  isAdmin: boolean;
  capability: AiCapability;
  units: number;
  day: string;
  reservationId: string;
};

const DAILY_CAPABILITY_LIMITS: Record<AiCapability, number> = {
  chat: 50,
  damage: 10,
  design: 15,
  mission: 25,
};
const DAILY_TOTAL_LIMIT = 75;
const RESERVATION_TTL_MS = 10 * 60 * 1000;
const ADMIN_ROLES = new Set(["admin", "super_admin", "ceo", "operations_admin"]);

function normalized(value: unknown) {
  return String(value || "").trim().toLowerCase();
}

function roleFromAuth(auth: any) {
  const token = auth?.token || {};
  return normalized(token.role || token.userRole || token.primaryRole);
}

function usageDay(now = new Date()) {
  return now.toISOString().slice(0, 10);
}

async function authorizeAiCaller(auth: any, allowedRoles: ReadonlySet<string>) {
  const uid = String(auth?.uid || "").trim();
  if (!uid) throw new HttpsError("unauthenticated", "Sign in before using AI services.");
  const role = roleFromAuth(auth);
  const token = auth?.token || {};
  const isAdmin = token.admin === true || token.isAdmin === true || ADMIN_ROLES.has(role);
  if (!isAdmin && !allowedRoles.has(role)) {
    throw new HttpsError("permission-denied", "This AI capability is not available to your portal role.");
  }

  const profileSnap = await db.collection("users").doc(uid).get();
  const profile = profileSnap.data() || {};
  const profileStatus = normalized(profile.status);
  if (
    !profileSnap.exists ||
    ["suspended", "rejected", "disabled", "inactive"].includes(profileStatus) ||
    (!isAdmin && profileStatus !== "active")
  ) {
    throw new HttpsError("permission-denied", "An active, server-approved profile is required for AI services.");
  }
  return { uid, role, isAdmin };
}

type ReservationRecord = {
  capability: AiCapability;
  units: number;
  createdAtMs: number;
};

function activeReservations(value: unknown, nowMs: number) {
  const source = value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  const active: Record<string, ReservationRecord> = {};
  for (const [id, raw] of Object.entries(source)) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
    const entry = raw as Record<string, unknown>;
    const capability = normalized(entry.capability) as AiCapability;
    const units = Math.max(1, Math.min(5, Math.floor(Number(entry.units) || 1)));
    const createdAtMs = Number(entry.createdAtMs || 0);
    if (!(capability in DAILY_CAPABILITY_LIMITS)) continue;
    if (!Number.isFinite(createdAtMs) || nowMs - createdAtMs > RESERVATION_TTL_MS) continue;
    active[id] = { capability, units, createdAtMs };
  }
  return active;
}

export async function reserveAiUsageQuota(
  auth: any,
  capability: AiCapability,
  allowedRoles: ReadonlySet<string>,
  units = 1,
): Promise<AiQuotaReservation> {
  const caller = await authorizeAiCaller(auth, allowedRoles);
  const safeUnits = Math.max(1, Math.min(5, Math.floor(Number(units) || 1)));
  const day = usageDay();
  const reservationId = randomUUID();
  const ref = db.collection("ai_usage").doc(`${caller.uid}_${day}`);
  const nowMs = Date.now();

  await db.runTransaction(async (transaction) => {
    const snap = await transaction.get(ref);
    const data = snap.data() || {};
    const counts = data.counts && typeof data.counts === "object"
      ? data.counts as Record<string, number>
      : {};
    const reservations = activeReservations(data.reservations, nowMs);
    const capabilityUsed = Number(counts[capability] || 0);
    const totalUsed = Number(data.totalUnits || 0);
    const capabilityPending = Object.values(reservations)
      .filter((entry) => entry.capability === capability)
      .reduce((sum, entry) => sum + entry.units, 0);
    const totalPending = Object.values(reservations)
      .reduce((sum, entry) => sum + entry.units, 0);

    if (
      capabilityUsed + capabilityPending + safeUnits > DAILY_CAPABILITY_LIMITS[capability] ||
      totalUsed + totalPending + safeUnits > DAILY_TOTAL_LIMIT
    ) {
      throw new HttpsError("resource-exhausted", "Daily AI usage limit reached. Try again after the UTC quota reset.");
    }

    transaction.set(ref, {
      uid: caller.uid,
      day,
      counts,
      totalUnits: totalUsed,
      reservations: {
        ...reservations,
        [reservationId]: { capability, units: safeUnits, createdAtMs: nowMs },
      },
      lastCapability: capability,
      reservationUpdatedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      ...(snap.exists ? {} : { createdAt: FieldValue.serverTimestamp() }),
    }, { merge: true });
  });

  return { ...caller, capability, units: safeUnits, day, reservationId };
}

export async function settleAiUsageQuota(reservation: AiQuotaReservation, charge: boolean) {
  const ref = db.collection("ai_usage").doc(`${reservation.uid}_${reservation.day}`);
  return db.runTransaction(async (transaction) => {
    const snap = await transaction.get(ref);
    if (!snap.exists) return { settled: false, charged: false };
    const data = snap.data() || {};
    const reservations = activeReservations(data.reservations, Date.now());
    const reserved = reservations[reservation.reservationId];
    if (!reserved) return { settled: false, charged: false };

    delete reservations[reservation.reservationId];
    const counts = data.counts && typeof data.counts === "object"
      ? data.counts as Record<string, number>
      : {};
    const capabilityUsed = Number(counts[reservation.capability] || 0);
    const totalUsed = Number(data.totalUnits || 0);
    const nextCounts = charge
      ? { ...counts, [reservation.capability]: capabilityUsed + reservation.units }
      : counts;

    transaction.set(ref, {
      counts: nextCounts,
      totalUnits: charge ? totalUsed + reservation.units : totalUsed,
      reservations,
      lastCapability: reservation.capability,
      lastSettlement: charge ? "charged" : "released",
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    return { settled: true, charged: charge };
  });
}

export async function enforceAiUsageQuota(
  auth: any,
  capability: AiCapability,
  allowedRoles: ReadonlySet<string>,
  units = 1,
) {
  const reservation = await reserveAiUsageQuota(auth, capability, allowedRoles, units);
  await settleAiUsageQuota(reservation, true);
  return reservation;
}

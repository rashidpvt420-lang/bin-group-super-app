import { FieldValue } from "firebase-admin/firestore";
import { HttpsError } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";

if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();

export type AiCapability = "chat" | "damage" | "design" | "mission";

const DAILY_CAPABILITY_LIMITS: Record<AiCapability, number> = {
  chat: 50,
  damage: 10,
  design: 15,
  mission: 25,
};
const DAILY_TOTAL_LIMIT = 75;
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

export async function enforceAiUsageQuota(
  auth: any,
  capability: AiCapability,
  allowedRoles: ReadonlySet<string>,
  units = 1,
) {
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

  const safeUnits = Math.max(1, Math.min(5, Math.floor(Number(units) || 1)));
  const day = usageDay();
  const ref = db.collection("ai_usage").doc(`${uid}_${day}`);
  await db.runTransaction(async (transaction) => {
    const snap = await transaction.get(ref);
    const data = snap.data() || {};
    const counts = data.counts && typeof data.counts === "object"
      ? data.counts as Record<string, number>
      : {};
    const capabilityUsed = Number(counts[capability] || 0);
    const totalUsed = Number(data.totalUnits || 0);
    if (
      capabilityUsed + safeUnits > DAILY_CAPABILITY_LIMITS[capability] ||
      totalUsed + safeUnits > DAILY_TOTAL_LIMIT
    ) {
      throw new HttpsError("resource-exhausted", "Daily AI usage limit reached. Try again after the UTC quota reset.");
    }
    transaction.set(ref, {
      uid,
      day,
      counts: {
        ...counts,
        [capability]: capabilityUsed + safeUnits,
      },
      totalUnits: totalUsed + safeUnits,
      lastCapability: capability,
      updatedAt: FieldValue.serverTimestamp(),
      ...(snap.exists ? {} : { createdAt: FieldValue.serverTimestamp() }),
    }, { merge: true });
  });

  return { uid, role, capability, units: safeUnits, day };
}

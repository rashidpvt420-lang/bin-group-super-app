import { FieldValue } from "firebase-admin/firestore";
import * as admin from "firebase-admin";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { createHash } from "crypto";

if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();

const ALLOWED_KINDS = new Set(["ANALYTICS", "SECURITY", "CRASH"]);
const ALLOWED_SECURITY_TYPES = new Set([
  "QUOTE_LIMIT",
  "OTP_THROTTLE",
  "BOT_DETECTION",
  "DUPLICATE_PROPERTY",
]);
const PROPERTY_CHECK_WINDOW_MS = 10 * 60 * 1000;
const PROPERTY_CHECK_LIMIT = 20;

const text = (value: unknown, max = 300) => String(value ?? "").trim().slice(0, max);

function safeMetadata(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const output: Record<string, string | number | boolean | null> = {};
  for (const [key, entry] of Object.entries(value as Record<string, unknown>).slice(0, 20)) {
    const safeKey = text(key, 60).replace(/[^A-Za-z0-9_.-]/g, "_");
    if (!safeKey) continue;
    if (typeof entry === "number" && Number.isFinite(entry)) output[safeKey] = entry;
    else if (typeof entry === "boolean" || entry === null) output[safeKey] = entry;
    else output[safeKey] = text(entry, 500);
  }
  return output;
}

export const recordClientTelemetry = onCall(
  { cors: true, region: "europe-west3", enforceAppCheck: true },
  async (request) => {
    const kind = text(request.data?.kind, 30).toUpperCase();
    if (!ALLOWED_KINDS.has(kind)) {
      throw new HttpsError("invalid-argument", "Unsupported telemetry kind.");
    }
    const eventType = text(request.data?.eventType, 100).toUpperCase();
    if (!eventType) throw new HttpsError("invalid-argument", "Telemetry event type is required.");
    if (kind === "SECURITY" && !ALLOWED_SECURITY_TYPES.has(eventType)) {
      throw new HttpsError("invalid-argument", "Unsupported security event type.");
    }

    const collectionName =
      kind === "ANALYTICS"
        ? "analytics_events"
        : kind === "SECURITY"
          ? "security_audit_logs"
          : "telemetry_logs";
    const ref = db.collection(collectionName).doc();
    await ref.create({
      kind,
      type: eventType,
      purpose: text(request.data?.purpose, 200),
      severity: kind === "CRASH" || eventType === "BOT_DETECTION" ? "CRITICAL" : "INFO",
      metadata: safeMetadata(request.data?.metadata),
      actorUid: request.auth?.uid || null,
      source: "APP_CHECK_CALLABLE",
      createdAt: FieldValue.serverTimestamp(),
    });
    return { ok: true, eventId: ref.id };
  },
);

export const checkPropertyUniqueness = onCall(
  { cors: true, region: "europe-west3", enforceAppCheck: true },
  async (request) => {
    const tokenRole = text(
      request.auth?.token?.role ||
      request.auth?.token?.userRole ||
      request.auth?.token?.primaryRole,
      40,
    ).toLowerCase();
    if (
      request.auth &&
      request.auth.token?.admin !== true &&
      request.auth.token?.isAdmin !== true &&
      tokenRole &&
      !["owner", "super_admin", "ceo"].includes(tokenRole)
    ) {
      throw new HttpsError("permission-denied", "Property checks are limited to owner onboarding.");
    }

    const unitNumber = text(request.data?.unitNumber, 80);
    const community = text(request.data?.community, 160);
    if (unitNumber.length < 1 || community.length < 2) {
      throw new HttpsError("invalid-argument", "Unit number and community are required.");
    }

    const requestIdentity = request.auth?.uid ||
      `${request.rawRequest.ip || "unknown"}|${request.rawRequest.get("user-agent") || "unknown"}`;
    const rateKey = createHash("sha256").update(requestIdentity).digest("hex");
    const rateRef = db.collection("public_rate_limits").doc(`property_${rateKey}`);
    const nowMs = Date.now();
    await db.runTransaction(async (transaction) => {
      const rateSnap = await transaction.get(rateRef);
      const rate = rateSnap.data() || {};
      const windowStartedAtMs = typeof rate.windowStartedAt?.toMillis === "function"
        ? rate.windowStartedAt.toMillis()
        : 0;
      const inCurrentWindow = nowMs - windowStartedAtMs < PROPERTY_CHECK_WINDOW_MS;
      const nextCount = inCurrentWindow ? Number(rate.count || 0) + 1 : 1;
      if (nextCount > PROPERTY_CHECK_LIMIT) {
        throw new HttpsError(
          "resource-exhausted",
          "Too many property checks. Wait ten minutes before retrying.",
        );
      }
      transaction.set(rateRef, {
        kind: "PROPERTY_UNIQUENESS",
        count: nextCount,
        windowStartedAt: inCurrentWindow
          ? rate.windowStartedAt
          : admin.firestore.Timestamp.fromMillis(nowMs),
        expiresAt: admin.firestore.Timestamp.fromMillis(nowMs + PROPERTY_CHECK_WINDOW_MS * 2),
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
    });

    const [activeContracts, onboardingLeads] = await Promise.all([
      db.collection("active_contracts")
        .where("propertyInfo.unitNumber", "==", unitNumber)
        .where("propertyInfo.community", "==", community)
        .limit(1)
        .get(),
      db.collection("onboarding_leads")
        .where("propertyInfo.unitNumber", "==", unitNumber)
        .where("propertyInfo.community", "==", community)
        .limit(1)
        .get(),
    ]);

    return { available: activeContracts.empty && onboardingLeads.empty };
  },
);

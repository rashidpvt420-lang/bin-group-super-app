import { FieldValue } from "firebase-admin/firestore";
import * as admin from "firebase-admin";
import { HttpsError, onCall } from "firebase-functions/v2/https";

if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();

const ALLOWED_KINDS = new Set(["ANALYTICS", "SECURITY", "CRASH"]);
const ALLOWED_SECURITY_TYPES = new Set([
  "QUOTE_LIMIT",
  "OTP_THROTTLE",
  "BOT_DETECTION",
  "DUPLICATE_PROPERTY",
]);

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

import { defineSecret } from "firebase-functions/params";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import { reserveAiUsageQuota, settleAiUsageQuota } from "./aiUsageQuota";

if (!admin.apps.length) admin.initializeApp();

const db = admin.firestore();
const geminiKey = defineSecret("GEMINI_API_KEY");
const ALLOWED_ROLES = new Set(["owner", "admin", "super_admin", "ceo", "operations_admin"]);
const ALLOWED_SPACE_TYPES = new Set([
  "bedroom", "bathroom", "kitchen", "pantry", "majlis_hall", "vip_room", "guest_room", "suite",
  "living_room", "dining_room", "office", "open_office", "meeting_room", "conference_room", "reception",
  "lobby", "storage", "laundry", "maid_room", "driver_room", "security_room", "server_room", "archive_room",
  "electrical_room", "mechanical_room", "pump_room", "plant_room", "parking_area", "garden", "pool", "gym",
  "spa", "prayer_room", "wudu_area", "shop", "common_area", "restaurant", "ballroom", "housekeeping_room",
  "cold_room", "patient_room", "consultation_room", "treatment_room", "operating_room", "laboratory", "pharmacy",
  "classroom", "library", "cafeteria", "warehouse_zone", "loading_bay", "workshop", "dorm_room", "locker_room",
  "control_room", "stage", "back_of_house", "stable", "guard_house", "food_court",
]);

function text(value: unknown, fallback = "", maxLength = 500) {
  const resolved = String(value ?? "").trim();
  return (resolved || fallback).slice(0, maxLength);
}

function stripJsonFence(value: string) {
  return value.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
}

function boundedConfidence(value: unknown) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.min(1, parsed > 1 ? parsed / 100 : parsed));
}

function safeCount(value: unknown) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return 0;
  return Math.min(10000, Math.round(parsed));
}

function normalizeSpace(value: any) {
  const rawType = text(value?.type || value?.spaceType, "", 80).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
  const type = ALLOWED_SPACE_TYPES.has(rawType) ? rawType : "custom";
  const count = safeCount(value?.count);
  if (!count) return null;
  return {
    type,
    label: text(value?.label || value?.name || rawType || "Space", "Space", 120),
    count,
    floorLabel: text(value?.floorLabel || value?.floor, "", 80),
    confidence: boundedConfidence(value?.confidence),
  };
}

function normalizeResult(value: any) {
  const record = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const spaces = Array.isArray(record.spaces) ? record.spaces.map(normalizeSpace).filter(Boolean).slice(0, 120) : [];
  const totals = new Map<string, { type: string; label: string; count: number; confidence: number }>();
  for (const rawSpace of spaces as any[]) {
    if (!rawSpace) continue;
    const space = rawSpace as { type: string; label: string; count: number; confidence: number };
    const key = space.type === "custom" ? `custom:${space.label.toLowerCase()}` : space.type;
    const current = totals.get(key);
    if (current) {
      current.count += space.count;
      current.confidence = Math.min(current.confidence, space.confidence);
    } else {
      totals.set(key, { type: space.type, label: space.label, count: space.count, confidence: space.confidence });
    }
  }
  const floorsMentioned = safeCount(record.floorsMentioned || record.floors);
  return {
    propertyTypeHint: text(record.propertyTypeHint || record.propertyType, "", 120),
    floorsMentioned: floorsMentioned || null,
    spaces,
    totals: [...totals.values()],
    questions: Array.isArray(record.questions)
      ? record.questions.map((item: unknown) => text(item, "", 240)).filter(Boolean).slice(0, 6)
      : [],
    confidenceScore: boundedConfidence(record.confidenceScore),
  };
}

async function analyseWithGemini(apiKey: string, description: string, propertyType: string) {
  const model = text(process.env.GEMINI_OCR_MODEL, "gemini-2.5-flash", 120);
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const allowed = [...ALLOWED_SPACE_TYPES].join(", ");
  const prompt = [
    "Extract only explicit property-layout facts from the owner's description.",
    propertyType ? `The owner currently selected property type: ${propertyType}. Treat that as context, not proof of spaces that were not described.` : "",
    "Return JSON only with keys: propertyTypeHint, floorsMentioned, spaces, questions, confidenceScore.",
    "Each spaces item must contain type, label, count, floorLabel, confidence.",
    `Use these canonical type values when they clearly match: ${allowed}. Otherwise use type custom and preserve the owner's space label.`,
    "Do not invent room counts, floor counts, areas, equipment, capacity, legal status, compliance, pricing, contract scope, or ownership.",
    "If the owner says a space exists without giving a count, do not turn that into count 1; instead add a short follow-up question.",
    "Questions should ask only for useful missing layout details that cannot be safely derived from the text. Maximum six questions.",
    "confidenceScore and per-space confidence must be between 0 and 1 and reflect extraction confidence only.",
    `Owner description: ${description}`,
  ].filter(Boolean).join(" ");
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0, responseMimeType: "application/json" },
    }),
  });
  if (!response.ok) throw new Error(`Gemini property-description provider returned HTTP ${response.status}.`);
  const payload: any = await response.json();
  const answer = text(payload?.candidates?.[0]?.content?.parts?.map((part: any) => part?.text || "").join("\n"), "", 22000);
  if (!answer) throw new Error("Gemini property-description provider returned no structured output.");
  return normalizeResult(JSON.parse(stripJsonFence(answer)));
}

export const processPropertyDescriptionAI = onCall({
  cors: true,
  enforceAppCheck: true,
  timeoutSeconds: 60,
  memory: "512MiB",
  secrets: [geminiKey],
}, async (request) => {
  if (!request.auth?.uid) throw new HttpsError("unauthenticated", "Sign in before using property-description AI.");
  const description = text(request.data?.description, "", 6000);
  const propertyType = text(request.data?.propertyType, "", 120);
  if (description.length < 3) throw new HttpsError("invalid-argument", "Describe the property before asking AI to extract spaces.");

  const reservation = await reserveAiUsageQuota(request.auth, "chat", ALLOWED_ROLES, 1);
  let chargeQuota = false;
  try {
    const key = geminiKey.value() || "";
    if (!key) {
      return {
        status: "MANUAL_ENTRY_REQUIRED",
        provider: "unconfigured",
        data: null,
        advisoryOnly: true,
        verificationState: "OWNER_CONFIRMATION_REQUIRED",
        autoVerified: false,
      };
    }
    const data = await analyseWithGemini(key, description, propertyType);
    chargeQuota = true;
    await db.collection("audit_logs").add({
      actorId: reservation.uid,
      actorRole: reservation.role,
      action: "PROPERTY_DESCRIPTION_AI_EXTRACTED",
      targetType: "owner_property_profile",
      targetId: text(request.data?.propertyId, "unassigned", 160),
      metadata: {
        provider: "gemini",
        propertyType,
        extractedSpaceTypes: data.totals.map((item) => item.type),
        confidenceScore: data.confidenceScore,
        verificationState: "OWNER_CONFIRMATION_REQUIRED",
      },
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    return {
      status: "SUCCESS",
      provider: "gemini",
      data,
      advisoryOnly: true,
      verificationState: "OWNER_CONFIRMATION_REQUIRED",
      autoVerified: false,
    };
  } catch (error: any) {
    console.error("processPropertyDescriptionAI provider failure", { uid: reservation.uid, message: error?.message || error });
    return {
      status: "MANUAL_ENTRY_REQUIRED",
      provider: "gemini",
      data: null,
      advisoryOnly: true,
      verificationState: "OWNER_CONFIRMATION_REQUIRED",
      autoVerified: false,
      message: "Automated description analysis did not complete. Continue with manual space entry.",
    };
  } finally {
    await settleAiUsageQuota(reservation, chargeQuota).catch((error) => {
      console.error("processPropertyDescriptionAI quota settlement failed", { uid: reservation.uid, error });
    });
  }
});

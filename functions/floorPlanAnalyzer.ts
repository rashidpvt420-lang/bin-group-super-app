import { defineSecret } from "firebase-functions/params";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import { reserveAiUsageQuota, settleAiUsageQuota } from "./aiUsageQuota";

if (!admin.apps.length) admin.initializeApp();

const db = admin.firestore();
const STORAGE_BUCKET = "bin-group-57c60.firebasestorage.app";
const bucket = admin.storage().bucket(STORAGE_BUCKET);
const geminiKey = defineSecret("GEMINI_API_KEY");
const MAX_DOCUMENT_BYTES = 12 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["application/pdf", "image/jpeg", "image/png", "image/webp"]);
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

function roleOf(token: any) {
  return text(token?.role || token?.userRole || token?.primaryRole).toLowerCase();
}

function storagePathFromUrl(value: unknown) {
  const raw = text(value, "", 4000);
  if (!raw) return "";
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:") return "";
    if (url.hostname === "firebasestorage.googleapis.com") {
      const marker = "/o/";
      const index = url.pathname.indexOf(marker);
      if (index < 0) return "";
      return decodeURIComponent(url.pathname.slice(index + marker.length));
    }
    if (url.hostname === "storage.googleapis.com") {
      const segments = url.pathname.split("/").filter(Boolean);
      if (segments.length < 2) return "";
      return decodeURIComponent(segments.slice(1).join("/"));
    }
    return "";
  } catch {
    return "";
  }
}

function scopedPath(data: any, uid: string) {
  const path = text(data?.storagePath, "", 1000) || storagePathFromUrl(data?.fileUrl);
  if (!path.startsWith(`owners/${uid}/property_documents/floor_plans/`) || path.includes("..") || path.includes("\\")) {
    throw new HttpsError("permission-denied", "Floor plan is not scoped to the signed-in owner.");
  }
  return path;
}

function contentType(value: unknown) {
  const resolved = text(value, "application/pdf", 80).toLowerCase();
  if (!ALLOWED_TYPES.has(resolved)) {
    throw new HttpsError("invalid-argument", "Floor plan analysis accepts PDF, JPEG, PNG, or WebP documents.");
  }
  return resolved;
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
    confidence: boundedConfidence(value?.confidence),
  };
}

function normalizeFloor(value: any, index: number) {
  const spaces = Array.isArray(value?.spaces)
    ? value.spaces.map(normalizeSpace).filter(Boolean).slice(0, 120)
    : [];
  return {
    floorLabel: text(value?.floorLabel || value?.floor || `Floor ${index + 1}`, `Floor ${index + 1}`, 80),
    spaces,
  };
}

function normalizedResult(value: any) {
  const record = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const floors = Array.isArray(record.floors) ? record.floors.map(normalizeFloor).slice(0, 80) : [];
  const totals = new Map<string, { type: string; label: string; count: number; confidence: number }>();
  for (const floor of floors) {
    for (const rawSpace of floor.spaces as any[]) {
      if (!rawSpace) continue;
      const space = rawSpace as { type: string; label: string; count: number; confidence: number };
      const key = space.type === "custom" ? `custom:${space.label.toLowerCase()}` : space.type;
      const current = totals.get(key);
      if (current) {
        current.count += space.count;
        current.confidence = Math.min(current.confidence, space.confidence);
      } else {
        totals.set(key, { ...space });
      }
    }
  }
  return {
    propertyTypeHint: text(record.propertyTypeHint || record.propertyType, "", 120),
    floorsDetected: Math.max(0, Math.round(Number(record.floorsDetected) || floors.length)),
    floors,
    totals: [...totals.values()],
    measuredAreaSqft: Number.isFinite(Number(record.measuredAreaSqft)) && Number(record.measuredAreaSqft) > 0 ? Number(record.measuredAreaSqft) : null,
    confidenceScore: boundedConfidence(record.confidenceScore),
    notes: Array.isArray(record.notes) ? record.notes.map((item: unknown) => text(item, "", 240)).filter(Boolean).slice(0, 12) : [],
  };
}

async function analyseWithGemini(apiKey: string, document: Buffer, mimeType: string, propertyType: string) {
  const model = text(process.env.GEMINI_OCR_MODEL, "gemini-2.5-flash", 120);
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const allowed = [...ALLOWED_SPACE_TYPES].join(", ");
  const prompt = [
    "Analyse this property floor plan only for visible, factual layout information.",
    propertyType ? `The owner selected property type: ${propertyType}. Treat this only as a hint, not proof.` : "",
    "Return JSON only with keys: propertyTypeHint, floorsDetected, floors, measuredAreaSqft, confidenceScore, notes.",
    "Each floors item must contain floorLabel and spaces. Each space must contain type, label, count, confidence.",
    `Use these canonical type values when they clearly match: ${allowed}. Otherwise use type custom with the visible plan label.`,
    "Count a space only when the plan label or boundaries make it reasonably clear. Do not invent bedrooms, offices, kitchens, bathrooms, floor counts, areas, equipment, occupancy, or legal capacity.",
    "If a value is not visible, omit it or use null/empty arrays. confidenceScore and per-space confidence must be between 0 and 1 and reflect extraction confidence only.",
    "Do not determine compliance, property ownership, contract scope, pricing, or approval.",
  ].filter(Boolean).join(" ");
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }, { inlineData: { mimeType, data: document.toString("base64") } }] }],
      generationConfig: { temperature: 0, responseMimeType: "application/json" },
    }),
  });
  if (!response.ok) throw new Error(`Gemini floor-plan provider returned HTTP ${response.status}.`);
  const payload: any = await response.json();
  const answer = text(payload?.candidates?.[0]?.content?.parts?.map((part: any) => part?.text || "").join("\n"), "", 30000);
  if (!answer) throw new Error("Gemini floor-plan provider returned no structured output.");
  return normalizedResult(JSON.parse(stripJsonFence(answer)));
}

export const processFloorPlanAI = onCall({
  cors: true,
  enforceAppCheck: true,
  timeoutSeconds: 120,
  memory: "1GiB",
  secrets: [geminiKey],
}, async (request) => {
  if (!request.auth?.uid) throw new HttpsError("unauthenticated", "Sign in before analysing a floor plan.");
  const role = roleOf(request.auth.token);
  if (!ALLOWED_ROLES.has(role) || request.auth.token?.suspended === true) {
    throw new HttpsError("permission-denied", "An active Owner or authorised Admin account is required.");
  }

  const uid = request.auth.uid;
  const storagePath = scopedPath(request.data, uid);
  const expectedType = contentType(request.data?.contentType);
  const propertyType = text(request.data?.propertyType, "", 120);
  const file = bucket.file(storagePath);

  let buffer: Buffer;
  let actualType = expectedType;
  try {
    const [metadata] = await file.getMetadata();
    actualType = contentType(metadata.contentType || expectedType);
    const [downloaded] = await file.download();
    buffer = downloaded;
  } catch (error) {
    console.error("processFloorPlanAI storage read failed", { uid, storagePath, error });
    throw new HttpsError("not-found", "The uploaded floor plan could not be read.");
  }

  if (!buffer.length || buffer.length > MAX_DOCUMENT_BYTES) {
    throw new HttpsError("invalid-argument", "Floor plan is empty or exceeds 12 MB.");
  }

  const key = geminiKey.value() || "";
  if (!key) {
    await db.collection("audit_logs").add({
      actorId: uid,
      actorRole: role,
      action: "FLOOR_PLAN_AI_MANUAL_REVIEW_REQUIRED",
      targetType: "property_floor_plan",
      targetId: storagePath,
      metadata: { reason: "GEMINI_API_KEY_NOT_CONFIGURED", propertyType },
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    return {
      status: "MANUAL_REVIEW_REQUIRED",
      provider: "unconfigured",
      data: null,
      advisoryOnly: true,
      verificationState: "OWNER_CONFIRMATION_REQUIRED",
      autoVerified: false,
    };
  }

  const reservation = await reserveAiUsageQuota(request.auth, "chat", ALLOWED_ROLES, 2);
  let chargeQuota = false;
  try {
    const data = await analyseWithGemini(key, buffer, actualType, propertyType);
    chargeQuota = true;
    await db.collection("audit_logs").add({
      actorId: reservation.uid,
      actorRole: reservation.role || role,
      action: "FLOOR_PLAN_AI_EXTRACTED",
      targetType: "property_floor_plan",
      targetId: storagePath,
      metadata: {
        provider: "gemini",
        propertyType,
        floorsDetected: data.floorsDetected,
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
    console.error("processFloorPlanAI provider failure", { uid, storagePath, message: error?.message || error });
    return {
      status: "MANUAL_REVIEW_REQUIRED",
      provider: "gemini",
      data: null,
      advisoryOnly: true,
      verificationState: "OWNER_CONFIRMATION_REQUIRED",
      autoVerified: false,
      message: "Automated floor-plan analysis did not complete. Continue with manual space entry.",
    };
  } finally {
    await settleAiUsageQuota(reservation, chargeQuota).catch((error) => {
      console.error("processFloorPlanAI quota settlement failed", { uid, error });
    });
  }
});
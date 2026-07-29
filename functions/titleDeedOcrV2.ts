import { HttpsError, onCall } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import * as admin from "firebase-admin";

if (!admin.apps.length) admin.initializeApp();

const db = admin.firestore();
const bucket = admin.storage().bucket();
const geminiKey = defineSecret("GEMINI_API_KEY");
const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["application/pdf", "image/jpeg", "image/png", "image/webp"]);
const ALLOWED_ROLES = new Set(["owner", "admin", "super_admin", "ceo", "operations_admin"]);

function text(value: unknown, fallback = "", maxLength = 500) {
  const resolved = String(value ?? "").trim();
  return (resolved || fallback).slice(0, maxLength);
}

function roleOf(token: any) {
  return text(token?.role || token?.userRole || token?.primaryRole).toLowerCase();
}

function scopedPath(value: unknown, uid: string) {
  const path = text(value, "", 1000);
  if (!path.startsWith(`temp_kyc/${uid}/`) || path.includes("..") || path.includes("\\")) {
    throw new HttpsError("permission-denied", "Title deed document is not scoped to the signed-in user.");
  }
  return path;
}

function contentType(value: unknown) {
  const resolved = text(value, "application/pdf", 80).toLowerCase();
  if (!ALLOWED_TYPES.has(resolved)) {
    throw new HttpsError("invalid-argument", "Title deed OCR accepts PDF, JPEG, PNG, or WebP documents.");
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

function normalizedResult(value: any) {
  const record = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  return {
    titleDeedNumber: text(record.titleDeedNumber || record.deedNumber, "", 120),
    plotNumber: text(record.plotNumber, "", 120),
    ownerName: text(record.ownerName, "", 200),
    propertyType: text(record.propertyType, "", 120),
    area: text(record.area || record.locationArea, "", 180),
    emirate: text(record.emirate, "", 80),
    municipality: text(record.municipality || record.issuingAuthority, "", 160),
    issueDate: text(record.issueDate, "", 80),
    landAreaSqft: Number.isFinite(Number(record.landAreaSqft)) ? Math.max(0, Number(record.landAreaSqft)) : null,
    unitCount: Number.isFinite(Number(record.unitCount)) ? Math.max(0, Math.round(Number(record.unitCount))) : null,
    confidenceScore: boundedConfidence(record.confidenceScore),
  };
}

async function analyseWithGemini(apiKey: string, document: Buffer, mimeType: string) {
  const model = text(process.env.GEMINI_OCR_MODEL, "gemini-2.5-flash", 120);
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const prompt = [
    "Extract factual fields from this UAE title deed or property ownership document.",
    "Return JSON only with keys: titleDeedNumber, plotNumber, ownerName, propertyType, area, emirate, municipality, issueDate, landAreaSqft, unitCount, confidenceScore.",
    "Use null or an empty string when a field is not visible. Do not infer ownership, legal validity, approval, or missing numbers.",
    "confidenceScore must be between 0 and 1 and reflect extraction confidence only.",
  ].join(" ");
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      contents: [{
        role: "user",
        parts: [
          { text: prompt },
          { inlineData: { mimeType, data: document.toString("base64") } },
        ],
      }],
      generationConfig: {
        temperature: 0,
        responseMimeType: "application/json",
      },
    }),
  });
  if (!response.ok) {
    throw new Error(`Gemini OCR provider returned HTTP ${response.status}.`);
  }
  const payload: any = await response.json();
  const answer = text(payload?.candidates?.[0]?.content?.parts?.map((part: any) => part?.text || "").join("\n"), "", 12000);
  if (!answer) throw new Error("Gemini OCR provider returned no structured output.");
  return normalizedResult(JSON.parse(stripJsonFence(answer)));
}

export const processTitleDeedOCRV2 = onCall({
  cors: true,
  enforceAppCheck: true,
  timeoutSeconds: 120,
  memory: "1GiB",
  secrets: [geminiKey],
}, async (request) => {
  if (!request.auth?.uid) throw new HttpsError("unauthenticated", "Sign in before scanning a title deed.");
  const role = roleOf(request.auth.token);
  if (!ALLOWED_ROLES.has(role) || request.auth.token?.suspended === true) {
    throw new HttpsError("permission-denied", "An active Owner or authorised Admin account is required.");
  }

  const uid = request.auth.uid;
  const storagePath = scopedPath(request.data?.storagePath, uid);
  const expectedType = contentType(request.data?.contentType);
  const file = bucket.file(storagePath);
  let buffer: Buffer;
  let actualType = expectedType;
  try {
    const [metadata] = await file.getMetadata();
    actualType = contentType(metadata.contentType || expectedType);
    const [downloaded] = await file.download();
    buffer = downloaded;
  } catch (error) {
    console.error("processTitleDeedOCRV2 storage read failed", { uid, storagePath, error });
    throw new HttpsError("not-found", "The uploaded title deed could not be read.");
  }
  if (!buffer.length || buffer.length > MAX_DOCUMENT_BYTES) {
    throw new HttpsError("invalid-argument", "Title deed document is empty or exceeds 10 MB.");
  }

  const key = geminiKey.value() || "";
  if (!key) {
    await db.collection("audit_logs").add({
      actorId: uid,
      actorRole: role,
      action: "TITLE_DEED_OCR_MANUAL_REVIEW_REQUIRED",
      targetType: "temp_kyc",
      targetId: storagePath,
      metadata: { reason: "GEMINI_API_KEY_NOT_CONFIGURED" },
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    return {
      status: "MANUAL_REVIEW_REQUIRED",
      provider: "unconfigured",
      data: null,
      advisoryOnly: true,
      verificationState: "ADMIN_REVIEW_REQUIRED",
      message: "Automated extraction is unavailable. Continue with manual document review.",
    };
  }

  try {
    const data = await analyseWithGemini(key, buffer, actualType);
    await db.collection("audit_logs").add({
      actorId: uid,
      actorRole: role,
      action: "TITLE_DEED_OCR_EXTRACTED",
      targetType: "temp_kyc",
      targetId: storagePath,
      metadata: {
        provider: "gemini",
        confidenceScore: data.confidenceScore,
        populatedFields: Object.entries(data).filter(([, value]) => value !== "" && value !== null && value !== 0).map(([field]) => field),
        verificationState: "ADMIN_REVIEW_REQUIRED",
      },
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    return {
      status: "SUCCESS",
      provider: "gemini",
      data,
      advisoryOnly: true,
      verificationState: "ADMIN_REVIEW_REQUIRED",
      autoVerified: false,
    };
  } catch (error: any) {
    console.error("processTitleDeedOCRV2 provider failure", { uid, storagePath, message: error?.message || error });
    return {
      status: "MANUAL_REVIEW_REQUIRED",
      provider: "gemini",
      data: null,
      advisoryOnly: true,
      verificationState: "ADMIN_REVIEW_REQUIRED",
      message: "Automated extraction did not complete. Continue with manual document review.",
    };
  } finally {
    await file.delete({ ignoreNotFound: true }).catch((error) => {
      console.warn("Temporary title deed cleanup failed", { uid, storagePath, error });
    });
  }
});

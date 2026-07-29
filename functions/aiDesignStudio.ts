import { createHash, randomUUID } from "node:crypto";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import * as admin from "firebase-admin";
import { enforceAiUsageQuota } from "./aiUsageQuota";

if (!admin.apps.length) admin.initializeApp();

const db = admin.firestore();
const bucket = admin.storage().bucket();
const openAiKey = defineSecret("OPENAI_API_KEY");
const imageGenerationKey = defineSecret("IMAGE_GENERATION_API_KEY");

const MAX_REFERENCE_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_GENERATED_IMAGE_BYTES = 8 * 1024 * 1024;
const PRIVATE_MEDIA_URL_TTL_MS = 15 * 60 * 1000;
const QUOTE_AUTHORITY = "SERVER_CALCULATED_DESIGN_STUDIO_V1";
const ALLOWED_IMAGE_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const PUBLIC_DESIGN_ROLES = new Set(["owner", "tenant", "admin", "super_admin", "ceo", "operations_admin"]);
const ADMIN_DESIGN_ROLES = new Set(["admin", "super_admin", "ceo", "operations_admin"]);

type DesignScope = {
  dimensions: number;
  isMetric: boolean;
  zoneType: string;
  propertyType: string;
  finishTier: string;
  furnitureBudget: number;
  hasMEP: boolean;
  hasStructural: boolean;
  accessLevel: string;
  emirate: string;
  isNightWork: boolean;
  isMallEnvironment: boolean;
  scopeDescription: string;
  addons: string[];
};

function cleanText(value: unknown, fallback = "", maxLength = 500) {
  const resolved = String(value ?? "").trim();
  return (resolved || fallback).slice(0, maxLength);
}

function safeNumber(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function cleanRequestId(value: unknown) {
  const resolved = cleanText(value, `design_${randomUUID()}`, 160)
    .replace(/[^A-Za-z0-9_-]/g, "_")
    .replace(/_+/g, "_");
  return resolved || `design_${randomUUID()}`;
}

function cleanStoragePath(value: unknown) {
  const path = cleanText(value, "", 1000);
  if (!path || path.startsWith("/") || path.includes("..") || path.includes("\\")) {
    throw new HttpsError("failed-precondition", "Protected design media path is invalid.");
  }
  return path;
}

function normalizeMimeType(value: unknown) {
  const mimeType = cleanText(value, "image/jpeg", 64).toLowerCase();
  if (!ALLOWED_IMAGE_MIME_TYPES.has(mimeType)) {
    throw new HttpsError("invalid-argument", "Reference image must be JPEG, PNG, or WebP.");
  }
  return mimeType;
}

function extensionForMimeType(mimeType: string) {
  if (mimeType === "image/png") return "png";
  if (mimeType === "image/webp") return "webp";
  return "jpg";
}

function hasExpectedImageSignature(buffer: Buffer, mimeType: string) {
  if (mimeType === "image/jpeg") {
    return buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  }
  if (mimeType === "image/png") {
    return buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  }
  if (mimeType === "image/webp") {
    return buffer.length >= 12
      && buffer.subarray(0, 4).toString("ascii") === "RIFF"
      && buffer.subarray(8, 12).toString("ascii") === "WEBP";
  }
  return false;
}

function decodeReferenceImage(value: unknown, mimeType: string) {
  const encoded = String(value ?? "")
    .replace(/^data:image\/[a-zA-Z0-9.+-]+;base64,/, "")
    .replace(/\s/g, "");
  if (!encoded || encoded.length % 4 === 1 || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) {
    throw new HttpsError("invalid-argument", "Reference image payload is not valid base64.");
  }
  const buffer = Buffer.from(encoded, "base64");
  if (!buffer.length || buffer.toString("base64").replace(/=+$/, "") !== encoded.replace(/=+$/, "")) {
    throw new HttpsError("invalid-argument", "Reference image payload is malformed.");
  }
  if (buffer.length > MAX_REFERENCE_IMAGE_BYTES) {
    throw new HttpsError("invalid-argument", "Reference image must be 5MB or smaller.");
  }
  if (!hasExpectedImageSignature(buffer, mimeType)) {
    throw new HttpsError("invalid-argument", "Reference image content does not match its MIME type.");
  }
  return {
    buffer,
    base64: buffer.toString("base64"),
    sha256: createHash("sha256").update(buffer).digest("hex"),
  };
}

function cleanScope(value: unknown): DesignScope {
  const scope = value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  return {
    dimensions: Math.max(1, Math.min(10000, safeNumber(scope.dimensions, 50))),
    isMetric: scope.isMetric === true,
    zoneType: cleanText(scope.zoneType, "living room", 120),
    propertyType: cleanText(scope.propertyType, "Residential", 120),
    finishTier: cleanText(scope.finishTier, "Premium", 80),
    furnitureBudget: Math.max(0, Math.min(500000, safeNumber(scope.furnitureBudget, 0))),
    hasMEP: scope.hasMEP === true,
    hasStructural: scope.hasStructural === true,
    accessLevel: cleanText(scope.accessLevel, "Standard", 80),
    emirate: cleanText(scope.emirate, "Dubai", 80),
    isNightWork: scope.isNightWork === true,
    isMallEnvironment: scope.isMallEnvironment === true,
    scopeDescription: cleanText(scope.scopeDescription || scope.requiredWork, "", 1000),
    addons: Array.isArray(scope.addons)
      ? scope.addons.map((item) => cleanText(item, "", 80)).filter(Boolean).slice(0, 20)
      : [],
  };
}

function calculateServerQuote(scope: DesignScope) {
  const areaSqft = scope.isMetric ? scope.dimensions * 10.7639 : scope.dimensions;
  const tier = scope.finishTier.toLowerCase();
  const tierMultiplier = tier.includes("luxury") ? 1.45 : tier.includes("standard") ? 0.82 : 1;
  const materialsEstimate = Math.round(areaSqft * 180 * tierMultiplier);
  const laborEstimate = Math.round(areaSqft * 95 * tierMultiplier);
  const approvalsAllowance = scope.hasStructural || scope.hasMEP ? 2500 : 0;
  const logisticsAllowance = scope.isMallEnvironment || scope.isNightWork ? 4500 : 1800;
  const subtotal = Math.max(
    2500,
    materialsEstimate + laborEstimate + approvalsAllowance + logisticsAllowance + scope.furnitureBudget,
  );
  const contingency = Math.round(subtotal * 0.08);
  const binMargin = Math.round(subtotal * 0.12);
  const finalTotal = subtotal + contingency + binMargin;
  const mobilizationAmount = Math.round(finalTotal * 0.15);
  const unsigned = {
    currency: "AED",
    materialsEstimate,
    laborEstimate,
    approvalsAllowance,
    logisticsAllowance,
    contingency,
    binMargin,
    finalTotal,
    mobilizationPercent: 15,
    mobilizationAmount,
    quoteAuthority: QUOTE_AUTHORITY,
  };
  return {
    ...unsigned,
    quoteHash: createHash("sha256").update(JSON.stringify(unsigned)).digest("hex"),
  };
}

function buildExecutionDetails(scope: DesignScope, quote: ReturnType<typeof calculateServerQuote>) {
  return [
    {
      category: "Design intent",
      items: [
        `${scope.finishTier} redesign for ${scope.zoneType}.`,
        "Reference geometry and camera perspective must remain recognisable.",
        "Final execution scope remains subject to physical site verification.",
      ],
    },
    {
      category: "MEP and authority review",
      items: [
        scope.hasMEP ? "MEP coordination is included in the allowance." : "No major MEP relocation is assumed.",
        scope.hasStructural ? "Structural review and approval are required." : "No structural alteration is assumed.",
        "Landlord, building and UAE authority requirements remain mandatory.",
      ],
    },
    {
      category: "Commercial path",
      items: [
        `Server estimate: AED ${quote.finalTotal.toLocaleString("en-AE")}.`,
        `15% mobilisation: AED ${quote.mobilizationAmount.toLocaleString("en-AE")}.`,
        "No payment or execution starts before required approval and site verification.",
      ],
    },
  ];
}

function buildPrompt(payload: any, scope: DesignScope) {
  const style = cleanText(payload.designStyle, "Modern", 160);
  const objective = cleanText(payload.designObjective, "refresh", 160);
  const notes = cleanText(payload.notes || scope.scopeDescription, "", 1000);
  return [
    `Edit the supplied reference image into a photorealistic UAE property redesign for a ${scope.zoneType}.`,
    `Style: ${style}. Objective: ${objective}. Finish tier: ${scope.finishTier}.`,
    "Preserve the original camera angle, doors, windows, walls, ceiling height, fixed services, structural geometry, and room proportions.",
    "Upgrade only realistic visible finishes, lighting, furniture, decor, and approved non-structural elements.",
    "Do not add people, readable text, watermarks, logos, unsafe work, blocked fire routes, or unrealistic structural changes.",
    notes ? `Owner or tenant scope note: ${notes}` : "",
  ].filter(Boolean).join(" ");
}

async function editReferenceImage(apiKey: string, prompt: string, imageBase64: string, mimeType: string) {
  const { default: OpenAI } = await import("openai");
  const client = new OpenAI({ apiKey, timeout: 150_000 });
  const response: any = await client.responses.create({
    model: process.env.OPENAI_IMAGE_ORCHESTRATOR_MODEL || "gpt-5",
    input: [{
      role: "user",
      content: [
        { type: "input_text", text: prompt },
        { type: "input_image", image_url: `data:${mimeType};base64,${imageBase64}`, detail: "high" },
      ],
    }],
    tools: [{
      type: "image_generation",
      action: "edit",
      model: process.env.OPENAI_IMAGE_MODEL || "gpt-image-1",
      input_fidelity: "high",
      output_format: "jpeg",
      output_compression: 85,
      quality: "medium",
      size: "1024x1024",
    }],
    tool_choice: "required",
  } as any);
  const imageCall = Array.isArray(response.output)
    ? response.output.find((item: any) => item?.type === "image_generation_call")
    : null;
  const encoded = cleanText(imageCall?.result, "", 16 * 1024 * 1024);
  if (!encoded) throw new Error("AI image provider returned no image payload.");
  const buffer = Buffer.from(encoded, "base64");
  if (!buffer.length || buffer.length > MAX_GENERATED_IMAGE_BYTES) {
    throw new Error("AI image provider returned an invalid or oversized image payload.");
  }
  return {
    buffer,
    mimeType: "image/jpeg",
    providerRequestId: cleanText(response.id, "", 160),
  };
}

async function writePrivateMedia(path: string, buffer: Buffer, contentType: string, metadata: Record<string, string>) {
  const safePath = cleanStoragePath(path);
  await bucket.file(safePath).save(buffer, {
    resumable: false,
    metadata: {
      contentType,
      cacheControl: "private,no-store",
      metadata,
    },
  });
  return safePath;
}

async function signedMediaUrl(path: string) {
  const safePath = cleanStoragePath(path);
  const [url] = await bucket.file(safePath).getSignedUrl({
    action: "read",
    expires: Date.now() + PRIVATE_MEDIA_URL_TTL_MS,
  });
  return url;
}

async function resolveTenantContext(uid: string, email: string) {
  const lookups = [
    db.collection("units").where("tenantId", "==", uid).limit(1),
    db.collection("units").where("tenantUid", "==", uid).limit(1),
  ];
  if (email) lookups.push(db.collection("units").where("tenantEmail", "==", email).limit(1));
  for (const lookup of lookups) {
    const snap = await lookup.get();
    if (snap.empty) continue;
    const unitDoc = snap.docs[0];
    const unit: any = { id: unitDoc.id, ...unitDoc.data() };
    const propertyId = cleanText(unit.propertyId, "", 160);
    const propertySnap = propertyId ? await db.collection("properties").doc(propertyId).get() : null;
    const property: any = propertySnap?.exists ? { id: propertySnap.id, ...propertySnap.data() } : null;
    if (!property) {
      throw new HttpsError("failed-precondition", "The tenant unit is not linked to a canonical property.");
    }
    return { unit, property };
  }
  throw new HttpsError("failed-precondition", "A verified tenant unit link is required before submitting a design request.");
}

function canReadRequest(auth: any, data: any) {
  const role = cleanText(auth?.token?.role || auth?.token?.userRole || auth?.token?.primaryRole).toLowerCase();
  return ADMIN_DESIGN_ROLES.has(role)
    || data.userId === auth?.uid
    || data.createdByUid === auth?.uid
    || data.ownerId === auth?.uid
    || data.ownerUid === auth?.uid
    || data.tenantId === auth?.uid
    || data.tenantUid === auth?.uid;
}

async function resolveMedia(requestId: string, data: any) {
  const referencePaths = Array.isArray(data.referenceImagePaths)
    ? data.referenceImagePaths.map(cleanStoragePath)
    : [];
  const generatedPaths = Array.isArray(data.generatedImagePaths)
    ? data.generatedImagePaths.map(cleanStoragePath)
    : [];
  const [referenceImages, generatedImages] = await Promise.all([
    Promise.all(referencePaths.map(signedMediaUrl)),
    Promise.all(generatedPaths.map(signedMediaUrl)),
  ]);
  return {
    requestId,
    referenceImages,
    generatedImages,
    expiresAtMs: Date.now() + PRIVATE_MEDIA_URL_TTL_MS,
  };
}

export const submitAIDesignRequest = onCall({
  cors: true,
  enforceAppCheck: true,
  timeoutSeconds: 180,
  memory: "1GiB",
  secrets: [openAiKey, imageGenerationKey],
}, async (request) => {
  if (!request.auth?.uid) throw new HttpsError("unauthenticated", "Sign in before submitting an AI design request.");
  const quota = await enforceAiUsageQuota(request.auth, "design", PUBLIC_DESIGN_ROLES, 3);
  const uid = request.auth.uid;
  const role = cleanText(quota.role || request.auth.token?.role).toLowerCase();
  const email = cleanText(request.auth.token?.email).toLowerCase();
  const payload = request.data || {};
  const requestId = cleanRequestId(payload.requestId);
  const requestRef = db.collection("design_requests").doc(requestId);
  const existing = await requestRef.get();
  if (existing.exists) {
    const existingData = existing.data() || {};
    if (!canReadRequest(request.auth, existingData) || existingData.userId !== uid) {
      throw new HttpsError("already-exists", "This design request ID belongs to another user.");
    }
    const media = await resolveMedia(requestId, existingData);
    return {
      status: "SUCCESS",
      idempotent: true,
      requestId,
      renderStatus: existingData.renderStatus || "AI_RENDER_COMPLETE",
      quote: existingData.quote || null,
      concepts: (Array.isArray(existingData.concepts) ? existingData.concepts : []).map((concept: any, index: number) => ({
        ...concept,
        beforeImageUrl: media.referenceImages[0] || "",
        afterImageUrl: media.generatedImages[index] || media.generatedImages[0] || "",
      })),
      ...media,
    };
  }

  const mimeType = normalizeMimeType(payload.mimeType);
  const reference = decodeReferenceImage(payload.imageBase64, mimeType);
  const scope = cleanScope(payload.scope || payload);
  const quote = calculateServerQuote(scope);
  const executionDetails = buildExecutionDetails(scope, quote);
  const prompt = buildPrompt(payload, scope);
  const apiKey = imageGenerationKey.value() || openAiKey.value();
  if (!apiKey) {
    throw new HttpsError("failed-precondition", "AI image generation is not configured in Firebase Functions secrets.");
  }

  const tenantContext = role === "tenant"
    ? await resolveTenantContext(uid, email)
    : { unit: null, property: null };
  const unit: any = tenantContext.unit || {};
  const property: any = tenantContext.property || {};
  const ownerId = role === "tenant"
    ? cleanText(property.ownerId || property.ownerUid || unit.ownerId || unit.ownerUid, "", 160)
    : uid;
  if (!ownerId) throw new HttpsError("failed-precondition", "The canonical property owner could not be resolved.");
  const ownerEmail = role === "tenant"
    ? cleanText(property.ownerEmail || unit.ownerEmail).toLowerCase() || null
    : email || null;

  try {
    const rendered = await editReferenceImage(apiKey, prompt, reference.base64, mimeType);
    const referencePath = await writePrivateMedia(
      `design_requests/${uid}/${requestId}/reference.${extensionForMimeType(mimeType)}`,
      reference.buffer,
      mimeType,
      { ownerUid: uid, requestId, kind: "reference", sha256: reference.sha256 },
    );
    const generatedPath = await writePrivateMedia(
      `ai_design_renders/${uid}/${requestId}/primary.jpg`,
      rendered.buffer,
      rendered.mimeType,
      { ownerUid: uid, requestId, kind: "generated", providerRequestId: rendered.providerRequestId || "" },
    );
    const media = await resolveMedia(requestId, {
      referenceImagePaths: [referencePath],
      generatedImagePaths: [generatedPath],
    });
    const status = role === "tenant" ? "AWAITING_OWNER_APPROVAL" : "AI_CONCEPT_READY";
    const approvalStatus = role === "tenant" ? "PENDING_OWNER_APPROVAL" : "OWNER_CREATED";
    const concept = {
      id: "primary",
      title: `${cleanText(payload.designStyle, "Modern", 120)} ${scope.zoneType} concept`,
      beforeImageStoragePath: referencePath,
      afterImageStoragePath: generatedPath,
      renderStatus: "AI_RENDER_COMPLETE",
      generationStatus: "AI_RENDER_COMPLETE",
      renderEngineRequired: false,
      scopeSummary: `Server-authoritative ${scope.finishTier} redesign for ${scope.zoneType}.`,
      executionDetails,
      finishTier: scope.finishTier,
      quoteTotal: quote.finalTotal,
      mobilizationAmount: quote.mobilizationAmount,
      prompt,
    };
    const now = admin.firestore.FieldValue.serverTimestamp();
    const requestPayload = {
      id: requestId,
      requestId,
      userId: uid,
      createdByUid: uid,
      authUid: uid,
      role,
      userEmail: email || null,
      ownerId,
      ownerUid: ownerId,
      ownerEmail,
      tenantId: role === "tenant" ? uid : null,
      tenantUid: role === "tenant" ? uid : null,
      tenantEmail: role === "tenant" ? email || null : null,
      propertyId: property.id || unit.propertyId || null,
      propertyName: property.name || property.propertyName || unit.propertyName || (role === "tenant" ? "Tenant assigned property" : "Owner design request"),
      unitId: unit.id || null,
      designStyle: cleanText(payload.designStyle, "Modern", 120),
      designObjective: cleanText(payload.designObjective, "refresh", 120),
      scope: { ...scope, referenceImagePaths: [referencePath], imageCount: 1 },
      quote,
      concepts: [concept],
      conceptPrompt: prompt,
      executionDetails,
      referenceImagePaths: [referencePath],
      generatedImagePaths: [generatedPath],
      renderStatus: "AI_RENDER_COMPLETE",
      aiProvider: "openai",
      providerRequestId: rendered.providerRequestId || null,
      status,
      workflowStage: status,
      approvalStatus,
      quoteStatus: role === "tenant" ? "PENDING_OWNER_APPROVAL" : "DEPOSIT_PENDING",
      paymentStatus: "NOT_STARTED",
      adminHandoffStatus: role === "tenant" ? "WAITING_OWNER_APPROVAL" : "PAYMENT_NOT_STARTED",
      engineerHandoffStatus: "WAITING_PAYMENT",
      source: "AI_DESIGN_STUDIO_SERVER_AUTHORITY_V1",
      createdAt: now,
      updatedAt: now,
    };

    await db.runTransaction(async (transaction) => {
      const fresh = await transaction.get(requestRef);
      if (fresh.exists) throw new HttpsError("already-exists", "This design request was already created.");
      transaction.create(requestRef, requestPayload);
      transaction.create(db.collection("design_quotes").doc(requestId), {
        requestId,
        userId: uid,
        ownerId,
        tenantId: role === "tenant" ? uid : null,
        quote,
        quoteHash: quote.quoteHash,
        status: role === "tenant" ? "PENDING_OWNER_APPROVAL" : "DEPOSIT_PENDING",
        createdAt: now,
        updatedAt: now,
      });
      transaction.create(db.collection("design_concepts").doc(`${requestId}_primary`), {
        requestId,
        userId: uid,
        ownerId,
        tenantId: role === "tenant" ? uid : null,
        ...concept,
        createdAt: now,
      });
      if (role === "tenant") {
        transaction.create(db.collection("design_approvals").doc(`${requestId}_owner`), {
          requestId,
          ownerId,
          ownerUid: ownerId,
          tenantUid: uid,
          tenantEmail: email || null,
          propertyId: property.id || unit.propertyId || null,
          status: "PENDING_OWNER_APPROVAL",
          approvalStatus: "PENDING_OWNER_APPROVAL",
          decision: "pending",
          payerRole: "tenant",
          payerId: uid,
          createdAt: now,
          updatedAt: now,
        });
      }
      transaction.create(db.collection("audit_logs").doc(), {
        actorId: uid,
        actorRole: role,
        action: "AI_DESIGN_REQUEST_SUBMITTED_SERVER_AUTHORITY",
        targetType: "design_requests",
        targetId: requestId,
        metadata: {
          ownerId,
          propertyId: property.id || unit.propertyId || null,
          inputImageSha256: reference.sha256,
          quoteHash: quote.quoteHash,
          providerRequestId: rendered.providerRequestId || null,
        },
        createdAt: now,
      });
    });

    return {
      status: "SUCCESS",
      idempotent: false,
      requestId,
      renderStatus: "AI_RENDER_COMPLETE",
      aiProvider: "openai",
      quote,
      concepts: [{
        ...concept,
        beforeImageUrl: media.referenceImages[0],
        afterImageUrl: media.generatedImages[0],
      }],
      ...media,
    };
  } catch (error: any) {
    console.error("submitAIDesignRequest failed", {
      requestId,
      uid,
      role,
      message: cleanText(error?.message, "AI image provider did not complete the request.", 300),
    });
    if (error instanceof HttpsError) throw error;
    throw new HttpsError("unavailable", "AI image rendering is temporarily unavailable. No design workflow record was created.");
  }
});

export const getAIDesignRequestMedia = onCall({
  cors: true,
  enforceAppCheck: true,
  timeoutSeconds: 60,
  memory: "256MiB",
}, async (request) => {
  if (!request.auth?.uid) throw new HttpsError("unauthenticated", "Sign in before accessing protected design media.");
  const requestId = cleanRequestId(request.data?.requestId);
  const snap = await db.collection("design_requests").doc(requestId).get();
  if (!snap.exists) throw new HttpsError("not-found", "Design request not found.");
  const data = snap.data() || {};
  if (!canReadRequest(request.auth, data)) {
    throw new HttpsError("permission-denied", "You cannot access this design request media.");
  }
  return resolveMedia(requestId, data);
});

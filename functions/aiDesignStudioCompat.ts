import { createHash, randomUUID } from "node:crypto";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import * as admin from "firebase-admin";
import { enforceAiUsageQuota } from "./aiUsageQuota";

const openAiKey = defineSecret("OPENAI_API_KEY");
const imageGenerationKey = defineSecret("IMAGE_GENERATION_API_KEY");
const MAX_REFERENCE_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_GENERATED_IMAGE_BYTES = 8 * 1024 * 1024;
const PRIVATE_MEDIA_URL_TTL_MS = 15 * 60 * 1000;
const ALLOWED_IMAGE_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const ADMIN_DESIGN_ROLES = new Set(["admin", "super_admin", "ceo", "operations_admin"]);
const PUBLIC_DESIGN_ROLES = new Set(["owner", "tenant", ...ADMIN_DESIGN_ROLES]);

if (!admin.apps.length) admin.initializeApp();

const db = admin.firestore();
const bucket = admin.storage().bucket();

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
  if (mimeType === "image/jpeg") return buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  if (mimeType === "image/png") return buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  if (mimeType === "image/webp") return buffer.length >= 12 && buffer.subarray(0, 4).toString("ascii") === "RIFF" && buffer.subarray(8, 12).toString("ascii") === "WEBP";
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
  const canonicalInput = encoded.replace(/=+$/, "");
  const canonicalDecoded = buffer.toString("base64").replace(/=+$/, "");
  if (!buffer.length || canonicalInput !== canonicalDecoded) throw new HttpsError("invalid-argument", "Reference image payload is malformed.");
  if (buffer.length > MAX_REFERENCE_IMAGE_BYTES) throw new HttpsError("invalid-argument", "Reference image must be 5MB or smaller.");
  if (!hasExpectedImageSignature(buffer, mimeType)) throw new HttpsError("invalid-argument", "Reference image content does not match its MIME type.");
  return {
    buffer,
    base64: buffer.toString("base64"),
    bytes: buffer.length,
    sha256: createHash("sha256").update(buffer).digest("hex"),
  };
}

function buildAdminDesignPrompt(data: any) {
  const scope = data?.scope && typeof data.scope === "object" && !Array.isArray(data.scope) ? data.scope : {};
  const zoneType = cleanText(data?.zoneType || scope.zoneType || scope.propertyType, "interior space", 120);
  const style = cleanText(data?.designStyle || data?.theme, "Sovereign Elite gold and graphite", 160);
  const notes = cleanText(data?.customPrompt || data?.prompt || data?.notes, "", 600);
  return [
    `Edit the supplied reference image into one photorealistic UAE property redesign for a ${zoneType}.`,
    `Design style: ${style}.`,
    "Preserve the camera angle, windows, doors, structural geometry, and room proportions.",
    "Upgrade lighting, walls, flooring, furniture, decor, and visible finishes for a premium BIN GROUP owner-approval render.",
    "Do not add people, readable text, watermarks, logos, unsafe construction, or unrealistic structural changes.",
    notes ? `Additional admin directive: ${notes}` : "",
  ].filter(Boolean).join(" ");
}

function cleanPublicScope(value: unknown) {
  const scope = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
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
    addons: Array.isArray(scope.addons) ? scope.addons.map((item) => cleanText(item, "", 80)).filter(Boolean).slice(0, 20) : [],
  };
}

function calculatePublicDesignQuote(scope: ReturnType<typeof cleanPublicScope>) {
  const areaSqft = scope.isMetric ? scope.dimensions * 10.7639 : scope.dimensions;
  const tier = scope.finishTier.toLowerCase();
  const tierMultiplier = tier.includes("luxury") ? 1.45 : tier.includes("standard") ? 0.82 : 1;
  const materialsEstimate = Math.round(areaSqft * 180 * tierMultiplier);
  const laborEstimate = Math.round(areaSqft * 95 * tierMultiplier);
  const approvalsAllowance = scope.hasStructural || scope.hasMEP ? 2500 : 0;
  const logisticsAllowance = scope.isMallEnvironment || scope.isNightWork ? 4500 : 1800;
  const subtotal = Math.max(2500, materialsEstimate + laborEstimate + approvalsAllowance + logisticsAllowance + scope.furnitureBudget);
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
    quoteAuthority: "SERVER_CALCULATED_DESIGN_STUDIO_V2",
  };
  return { ...unsigned, quoteHash: createHash("sha256").update(JSON.stringify(unsigned)).digest("hex") };
}

function buildPublicExecutionDetails(scope: ReturnType<typeof cleanPublicScope>, quote: ReturnType<typeof calculatePublicDesignQuote>) {
  return [
    {
      category: "Design intent",
      items: [
        `${scope.finishTier} redesign for ${scope.zoneType}.`,
        "Reference geometry and camera perspective must remain recognisable.",
        "Final scope remains subject to a physical site inspection.",
      ],
    },
    {
      category: "MEP and authority review",
      items: [
        scope.hasMEP ? "MEP coordination is included in the review allowance." : "No major MEP relocation is assumed.",
        scope.hasStructural ? "Structural review and approvals are required before execution." : "No structural alteration is assumed.",
        "Building, landlord and UAE authority requirements remain mandatory.",
      ],
    },
    {
      category: "Commercial path",
      items: [
        `Server estimate: AED ${quote.finalTotal.toLocaleString("en-AE")}.`,
        `15% mobilisation: AED ${quote.mobilizationAmount.toLocaleString("en-AE")}.`,
        "No payment or execution starts before the required owner approval and site verification.",
      ],
    },
  ];
}

function buildPublicDesignPrompt(data: any, scope: ReturnType<typeof cleanPublicScope>) {
  const style = cleanText(data?.designStyle, "Modern", 160);
  const objective = cleanText(data?.designObjective, "refresh", 160);
  const notes = cleanText(data?.notes || scope.scopeDescription, "", 1000);
  return [
    `Edit the supplied reference image into a photorealistic UAE property redesign for a ${scope.zoneType}.`,
    `Style: ${style}. Objective: ${objective}. Finish tier: ${scope.finishTier}.`,
    "Preserve the original camera angle, doors, windows, walls, ceiling height, fixed services, structural geometry, and room proportions.",
    "Upgrade only realistic visible finishes, lighting, furniture, decor, and approved non-structural elements.",
    "Do not add people, readable text, watermarks, logos, unsafe work, blocked fire routes, or unrealistic structural changes.",
    notes ? `Owner or tenant scope note: ${notes}` : "",
  ].filter(Boolean).join(" ");
}

async function editImageWithOpenAI(apiKey: string, prompt: string, imageBase64: string, mimeType: string) {
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
  const imageCall = Array.isArray(response.output) ? response.output.find((item: any) => item?.type === "image_generation_call") : null;
  const generatedImage = String(imageCall?.result || "").trim();
  if (!generatedImage) throw new Error("OpenAI image editing returned no image payload.");
  const outputBuffer = Buffer.from(generatedImage, "base64");
  if (!outputBuffer.length || outputBuffer.length > MAX_GENERATED_IMAGE_BYTES) throw new Error("OpenAI image editing returned an invalid or oversized image payload.");
  return {
    outputBuffer,
    generatedImage: outputBuffer.toString("base64"),
    mimeType: "image/jpeg",
    providerRequestId: cleanText(response.id, "", 160),
  };
}

async function savePrivateMedia(path: string, buffer: Buffer, contentType: string, metadata: Record<string, string>) {
  const file = bucket.file(path);
  await file.save({
    resumable: false,
  } as any).catch(() => undefined);
  await file.save(buffer, {
    resumable: false,
    metadata: { contentType, cacheControl: "private,no-store", metadata },
  });
  return path;
}

async function signPrivateMedia(path: string) {
  const [signedUrl] = await bucket.file(path).getSignedUrl({ action: "read", expires: Date.now() + PRIVATE_MEDIA_URL_TTL_MS });
  return signedUrl;
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
    if (!property) throw new HttpsError("failed-precondition", "The tenant unit is not linked to a canonical property.");
    return { unit, property };
  }
  throw new HttpsError("failed-precondition", "A verified tenant unit link is required before submitting a design request.");
}

function canReadDesignRequest(auth: any, requestData: any) {
  const role = cleanText(auth?.token?.role || auth?.token?.userRole || auth?.token?.primaryRole).toLowerCase();
  return ADMIN_DESIGN_ROLES.has(role)
    || requestData.userId === auth?.uid
    || requestData.createdByUid === auth?.uid
    || requestData.ownerId === auth?.uid
    || requestData.ownerUid === auth?.uid
    || requestData.tenantId === auth?.uid
    || requestData.tenantUid === auth?.uid;
}

async function mediaResponseForRequest(requestId: string, requestData: any) {
  const referencePaths = Array.isArray(requestData.referenceImagePaths)
    ? requestData.referenceImagePaths.map((value: unknown) => cleanText(value, "", 1000)).filter(Boolean)
    : [];
  const generatedPaths = Array.isArray(requestData.generatedImagePaths)
    ? requestData.generatedImagePaths.map((value: unknown) => cleanText(value, "", 1000)).filter(Boolean)
    : [];
  const [referenceImages, generatedImages] = await Promise.all([
    Promise.all(referencePaths.map(signPrivateMedia)),
    Promise.all(generatedPaths.map(signPrivateMedia)),
  ]);
  return { requestId, referenceImages, generatedImages, expiresAtMs: Date.now() + PRIVATE_MEDIA_URL_TTL_MS };
}

export const generateDesignConceptCompat = onCall({
  cors: true,
  enforceAppCheck: true,
  timeoutSeconds: 180,
  memory: "1GiB",
  secrets: [openAiKey, imageGenerationKey],
}, async (request) => {
  if (!request.auth?.uid) throw new HttpsError("unauthenticated", "Sign in before using AI Design Studio.");
  const quota = await enforceAiUsageQuota(request.auth, "design", ADMIN_DESIGN_ROLES, 3);
  const payload = request.data || {};
  const requestId = cleanRequestId(payload.requestId);
  const mimeType = normalizeMimeType(payload.mimeType);
  const reference = decodeReferenceImage(payload.imageBase64, mimeType);
  const prompt = buildAdminDesignPrompt(payload);
  const apiKey = imageGenerationKey.value() || openAiKey.value();
  if (!apiKey) throw new HttpsError("failed-precondition", "AI image generation is not configured in Firebase Functions secrets.");
  try {
    const result = await editImageWithOpenAI(apiKey, prompt, reference.base64, mimeType);
    const concept = {
      requestId,
      provider: "openai",
      live: true,
      renderStatus: "AI_RENDER_COMPLETE",
      scope: payload.scope && typeof payload.scope === "object" && !Array.isArray(payload.scope) ? payload.scope : null,
      designStyle: cleanText(payload.designStyle || payload.theme, "Sovereign Elite", 160),
      createdAt: new Date().toISOString(),
    };
    await db.collection("design_requests").add({
      userId: request.auth.uid,
      createdBy: request.auth.uid,
      createdByRole: quota.role,
      requestId,
      provider: "openai",
      providerRequestId: result.providerRequestId || null,
      live: true,
      renderStatus: "AI_RENDER_COMPLETE",
      inputMimeType: mimeType,
      inputImageBytes: reference.bytes,
      inputImageSha256: reference.sha256,
      outputMimeType: result.mimeType,
      prompt,
      scope: concept.scope,
      designStyle: concept.designStyle,
      status: "AI_CONCEPT_READY",
      type: "IMAGE_TO_IMAGE_COMPAT",
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    return {
      status: "SUCCESS",
      provider: "openai",
      live: true,
      renderStatus: "AI_RENDER_COMPLETE",
      generatedImage: result.generatedImage,
      mimeType: result.mimeType,
      concept,
    };
  } catch (error: any) {
    const message = cleanText(error?.message, "AI image provider did not complete the request.", 300);
    console.error("generateDesignConceptCompat failed", { requestId, uid: request.auth.uid, message });
    throw new HttpsError("unavailable", "AI image rendering is temporarily unavailable. Retry after checking the Functions secret and provider status.");
  }
});

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
    if (!canReadDesignRequest(request.auth, existingData) || existingData.userId !== uid) {
      throw new HttpsError("already-exists", "This design request ID belongs to another user.");
    }
    const media = await mediaResponseForRequest(requestId, existingData);
    const concepts = Array.isArray(existingData.concepts) ? existingData.concepts : [];
    return {
      status: "SUCCESS",
      idempotent: true,
      requestId,
      renderStatus: existingData.renderStatus || "AI_RENDER_COMPLETE",
      concepts: concepts.map((concept: any, index: number) => ({
        ...concept,
        beforeImageUrl: media.referenceImages[0] || "",
        afterImageUrl: media.generatedImages[index] || media.generatedImages[0] || "",
      })),
      ...media,
    };
  }

  const mimeType = normalizeMimeType(payload.mimeType);
  const reference = decodeReferenceImage(payload.imageBase64, mimeType);
  const scope = cleanPublicScope(payload.scope || payload);
  const quote = calculatePublicDesignQuote(scope);
  const executionDetails = buildPublicExecutionDetails(scope, quote);
  const prompt = buildPublicDesignPrompt(payload, scope);
  const apiKey = imageGenerationKey.value() || openAiKey.value();
  if (!apiKey) throw new HttpsError("failed-precondition", "AI image generation is not configured in Firebase Functions secrets.");

  const tenantContext = role === "tenant" ? await resolveTenantContext(uid, email) : { unit: null, property: null };
  const unit: any = tenantContext.unit || {};
  const property: any = tenantContext.property || {};
  const ownerId = role === "tenant"
    ? cleanText(property.ownerId || property.ownerUid || unit.ownerId || unit.ownerUid, "", 160)
    : uid;
  if (!ownerId) throw new HttpsError("failed-precondition", "The canonical property owner could not be resolved.");
  const ownerEmail = role === "tenant" ? cleanText(property.ownerEmail || unit.ownerEmail).toLowerCase() || null : email || null;

  try {
    const rendered = await editImageWithOpenAI(apiKey, prompt, reference.base64, mimeType);
    const inputPath = `design_requests/${uid}/${requestId}/reference.${extensionForMimeType(mimeType)}`;
    const outputPath = `ai_design_renders/${uid}/${requestId}/primary.jpg`;
    await Promise.all([
      savePrivateMedia(inputPath, reference.buffer, mimeType, { ownerUid: uid, requestId, kind: "reference", sha256: reference.sha256 }),
      savePrivateMedia(outputPath, rendered.outputBuffer, rendered.mimeType, { ownerUid: uid, requestId, kind: "generated", providerRequestId: rendered.providerRequestId || "" }),
    ]);
    const media = await mediaResponseForRequest(requestId, { referenceImagePaths: [inputPath], generatedImagePaths: [outputPath] });
    const status = role === "tenant" ? "AWAITING_OWNER_APPROVAL" : "AI_CONCEPT_READY";
    const approvalStatus = role === "tenant" ? "PENDING_OWNER_APPROVAL" : "OWNER_CREATED";
    const concept = {
      id: "primary",
      title: `${cleanText(payload.designStyle, "Modern", 120)} ${scope.zoneType} concept`,
      beforeImageUrl: media.referenceImages[0],
      afterImageUrl: media.generatedImages[0],
      beforeImageStoragePath: inputPath,
      afterImageStoragePath: outputPath,
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
      scope: { ...scope, referenceImages: media.referenceImages, referenceImagePaths: [inputPath], imageCount: 1 },
      quote,
      concepts: [concept],
      conceptPrompt: prompt,
      executionDetails,
      referenceImagePaths: [inputPath],
      generatedImagePaths: [outputPath],
      generatedImages: media.generatedImages,
      mediaUrlExpiresAtMs: media.expiresAtMs,
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
      source: "AI_DESIGN_STUDIO_SERVER_AUTHORITY_V2",
      createdAt: now,
      updatedAt: now,
    };
    const batch = db.batch();
    batch.create(requestRef, requestPayload);
    batch.create(db.collection("design_quotes").doc(requestId), {
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
    batch.create(db.collection("design_concepts").doc(`${requestId}_primary`), {
      requestId,
      userId: uid,
      ownerId,
      tenantId: role === "tenant" ? uid : null,
      ...concept,
      beforeImageUrl: null,
      afterImageUrl: null,
      createdAt: now,
    });
    if (role === "tenant") {
      batch.create(db.collection("design_approvals").doc(`${requestId}_owner`), {
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
    batch.create(db.collection("audit_logs").doc(), {
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
    await batch.commit();
    return {
      status: "SUCCESS",
      idempotent: false,
      requestId,
      renderStatus: "AI_RENDER_COMPLETE",
      aiProvider: "openai",
      quote,
      concepts: [concept],
      ...media,
    };
  } catch (error: any) {
    const message = cleanText(error?.message, "AI image provider did not complete the request.", 300);
    console.error("submitAIDesignRequest failed", { requestId, uid, role, message });
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
  if (!canReadDesignRequest(request.auth, data)) throw new HttpsError("permission-denied", "You cannot access this design request media.");
  return mediaResponseForRequest(requestId, data);
});

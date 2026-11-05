import { createHash, randomUUID } from "node:crypto";
import { chooseTenantLink, propertyOwnerId } from "./designTenantLink";
import { IMAGE_PROVIDER_FAILURE_MESSAGES, buildImageEditTool, classifyImageProviderError, imageOrchestratorModel } from "./openaiImageModels";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import * as admin from "firebase-admin";
import { reserveAiUsageQuota, settleAiUsageQuota } from "./aiUsageQuota";
import { protectedMediaUrl, type ProtectedMediaKind } from "./aiDesignMedia";

if (!admin.apps.length) admin.initializeApp();

const db = admin.firestore();
const STORAGE_BUCKET = "bin-group-57c60.firebasestorage.app";
const bucket = admin.storage().bucket(STORAGE_BUCKET);
const openAiKey = defineSecret("OPENAI_API_KEY");
const imageGenerationKey = defineSecret("IMAGE_GENERATION_API_KEY");

import { DEFAULT_DESIGN_RATES, ESTIMATE_LABEL, loadDesignPriceList, type DesignRates } from "./designPriceList";
const MAX_REFERENCE_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_GENERATED_IMAGE_BYTES = 8 * 1024 * 1024;
const PRIVATE_MEDIA_URL_TTL_MS = 15 * 60 * 1000;
const QUOTE_AUTHORITY = "SERVER_CALCULATED_DESIGN_STUDIO_V1";
const ALLOWED_IMAGE_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const PUBLIC_DESIGN_ROLES = new Set(["owner", "tenant", "broker", "admin", "super_admin", "ceo", "operations_admin"]);
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
  unitNumber: string;
  floorLevel: string;
  existingCondition: string;
  requiredWork: string;
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
    unitNumber: cleanText(scope.unitNumber, "", 40),
    floorLevel: cleanText(scope.floorLevel || scope.floor, "", 40),
    existingCondition: cleanText(scope.existingCondition, "", 240),
    requiredWork: cleanText(scope.requiredWork || scope.scopeDescription, "", 1000),
  };
}

export function calculateServerQuote(scope: DesignScope, priceList: { rates: DesignRates; version: string; source: string } = { rates: DEFAULT_DESIGN_RATES, version: "default-v1", source: "BIN_DEFAULT" }) {
  const r = priceList.rates;
  const areaSqft = scope.isMetric ? scope.dimensions * 10.7639 : scope.dimensions;
  const tier = scope.finishTier.toLowerCase();
  const tierMultiplier = tier.includes("luxury") ? r.luxuryMultiplier : tier.includes("standard") ? r.standardMultiplier : 1;
  const materialsEstimate = Math.round(areaSqft * r.materialsPerSqft * tierMultiplier);
  const laborEstimate = Math.round(areaSqft * r.laborPerSqft * tierMultiplier);
  const approvalsAllowance = scope.hasStructural || scope.hasMEP ? r.approvalsAllowance : 0;
  const logisticsAllowance = scope.isMallEnvironment || scope.isNightWork ? r.logisticsMallOrNight : r.logisticsStandard;
  const subtotal = Math.max(
    r.minimumSubtotal,
    materialsEstimate + laborEstimate + approvalsAllowance + logisticsAllowance + scope.furnitureBudget,
  );
  const contingency = Math.round(subtotal * r.contingencyRate);
  const binMargin = Math.round(subtotal * r.binMarginRate);
  const finalTotal = subtotal + contingency + binMargin;
  const mobilizationAmount = Math.round(finalTotal * (r.mobilizationPercent / 100) * 100) / 100;
  const unsigned = {
    currency: "AED",
    materialsEstimate,
    laborEstimate,
    approvalsAllowance,
    logisticsAllowance,
    contingency,
    binMargin,
    finalTotal,
    mobilizationPercent: r.mobilizationPercent,
    mobilizationAmount,
    quoteAuthority: QUOTE_AUTHORITY,
    isEstimate: true,
    estimateLabel: ESTIMATE_LABEL,
    priceListVersion: priceList.version,
    priceListSource: priceList.source,
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
        `${quote.mobilizationPercent}% mobilisation: AED ${quote.mobilizationAmount.toLocaleString("en-AE")}.`,
        quote.estimateLabel,
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

// The owner picks from several distinct options (audit 2026-11-04): each option is a separate
// image-edit call with its own creative direction, run in parallel so the callable stays inside
// its 180s budget. At least one must succeed; partial failures are dropped, never faked.
export const DESIGN_OPTION_DIRECTIONS = [
  { id: "option_1", label: "Option 1 - Balanced", direction: "Balanced take on the requested style with warm, layered lighting." },
  { id: "option_2", label: "Option 2 - Light and airy", direction: "Lighter palette, brighter natural light, minimal decor." },
  { id: "option_3", label: "Option 3 - Rich and bold", direction: "Richer materials, deeper accent colours and statement lighting." },
] as const;

export function buildOptionPrompt(basePrompt: string, optionIndex: number) {
  const option = DESIGN_OPTION_DIRECTIONS[optionIndex] || DESIGN_OPTION_DIRECTIONS[0];
  return `${basePrompt} Design direction: ${option.direction}`;
}

/** Public, owner-safe concept fields. The internal provider prompt never leaves the server. */
export function publicConcept(concept: any) {
  const { prompt: _prompt, conceptPrompt: _conceptPrompt, ...rest } = concept || {};
  return rest;
}

async function editReferenceImage(apiKey: string, prompt: string, imageBase64: string, mimeType: string) {
  const { default: OpenAI } = await import("openai");
  const client = new OpenAI({ apiKey, timeout: 150_000 });
  const response: any = await client.responses.create({
    model: imageOrchestratorModel(),
    input: [{
      role: "user",
      content: [
        { type: "input_text", text: prompt },
        { type: "input_image", image_url: `data:${mimeType};base64,${imageBase64}`, detail: "high" },
      ],
    }],
    tools: [buildImageEditTool()],
    tool_choice: { type: "image_generation" },
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

async function signedMediaUrl(path: string, kind: ProtectedMediaKind) {
  const safePath = cleanStoragePath(path);
  return protectedMediaUrl(bucket, safePath, kind, PRIVATE_MEDIA_URL_TTL_MS, (message, detail) => {
    console.warn(`aiDesignStudio: ${message}`, detail);
  });
}

async function resolveTenantContext(uid: string, email: string) {
  const lookups = [
    db.collection("units").where("tenantId", "==", uid).limit(10),
    db.collection("units").where("tenantUid", "==", uid).limit(10),
  ];
  if (email) lookups.push(db.collection("units").where("tenantEmail", "==", email).limit(10));
  const seen = new Set<string>();
  const links: Array<{ unit: any; property: any | null }> = [];
  for (const lookup of lookups) {
    const snap = await lookup.get();
    for (const unitDoc of snap.docs) {
      if (seen.has(unitDoc.id)) continue;
      seen.add(unitDoc.id);
      const unit: any = { id: unitDoc.id, ...unitDoc.data() };
      const propertyId = cleanText(unit.propertyId, "", 160);
      const propertySnap = propertyId ? await db.collection("properties").doc(propertyId).get() : null;
      links.push({ unit, property: propertySnap?.exists ? { id: propertySnap.id, ...propertySnap.data() } : null });
    }
  }
  if (!links.length) {
    throw new HttpsError("failed-precondition", "Your account is not linked to a unit yet. Ask your property owner or BIN Group to link your unit, then try again.", { reason: "tenant_unit_missing" });
  }
  const profile = (await db.collection("users").doc(uid).get()).data() || {};
  const chosen = chooseTenantLink(links, cleanText(profile.unitId || profile.assignedUnitId, "", 200));
  if (!chosen) {
    console.warn("submitAIDesignRequest tenant link unusable", { uid, units: links.map((l) => l.unit.id) });
    throw new HttpsError("failed-precondition", "Your unit is not linked to an active property with an owner yet, so we can't send designs for approval. Ask your property owner or BIN Group to fix the link.", { reason: "tenant_owner_missing" });
  }
  return chosen;
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

async function resolveMedia(data: any) {
  const referencePaths = Array.isArray(data.referenceImagePaths)
    ? data.referenceImagePaths.map(cleanStoragePath)
    : [];
  const generatedPaths = Array.isArray(data.generatedImagePaths)
    ? data.generatedImagePaths.map(cleanStoragePath)
    : [];
  const [referenceImages, generatedImages] = await Promise.all([
    Promise.all(referencePaths.map((path: string) => signedMediaUrl(path, "reference"))),
    Promise.all(generatedPaths.map((path: string) => signedMediaUrl(path, "generated"))),
  ]);
  return {
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
  const uid = request.auth.uid;
  const role = cleanText(request.auth.token?.role || request.auth.token?.userRole || request.auth.token?.primaryRole).toLowerCase();
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
    const media = await resolveMedia(existingData);
    return {
      status: "SUCCESS",
      idempotent: true,
      requestId,
      renderStatus: existingData.renderStatus || "AI_RENDER_COMPLETE",
      quote: existingData.quote || null,
      concepts: (Array.isArray(existingData.concepts) ? existingData.concepts : []).map((concept: any, index: number) => ({
        ...publicConcept(concept),
        beforeImageUrl: media.referenceImages[0] || "",
        afterImageUrl: media.generatedImages[index] || media.generatedImages[0] || "",
      })),
      ...media,
    };
  }

  const mimeType = normalizeMimeType(payload.mimeType);
  const reference = decodeReferenceImage(payload.imageBase64, mimeType);
  const scope = cleanScope(payload.scope || payload);
  const quote = calculateServerQuote(scope, await loadDesignPriceList());
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
  const ownerId = role === "tenant" ? propertyOwnerId(property, unit) : uid;
  const linkedUnitNumber = cleanText(unit.unitNumber || unit.unitNo, "", 40);
  const linkedFloor = cleanText(unit.floorLevel || unit.floor || unit.floorNumber, "", 40);
  if (!scope.unitNumber && linkedUnitNumber) scope.unitNumber = linkedUnitNumber;
  if (!scope.floorLevel && linkedFloor) scope.floorLevel = linkedFloor;
  if (!ownerId) throw new HttpsError("failed-precondition", "The canonical property owner could not be resolved.");
  const quota = await reserveAiUsageQuota(request.auth, "design", PUBLIC_DESIGN_ROLES, 3);
  const ownerEmail = role === "tenant"
    ? cleanText(property.ownerEmail || unit.ownerEmail).toLowerCase() || null
    : email || null;

  try {
    const settled = await Promise.allSettled(DESIGN_OPTION_DIRECTIONS.map((_option, index) =>
      editReferenceImage(apiKey, buildOptionPrompt(prompt, index), reference.base64, mimeType)));
    const renders = settled.flatMap((result, index) => result.status === "fulfilled"
      ? [{ ...result.value, option: DESIGN_OPTION_DIRECTIONS[index] }]
      : []);
    if (renders.length === 0) {
      // Every option failed: surface the real provider error, never "concept ready".
      throw (settled.find((result) => result.status === "rejected") as PromiseRejectedResult).reason;
    }
    settled.forEach((result, index) => {
      if (result.status === "rejected") {
        console.warn("submitAIDesignRequest option failed", { requestId, option: DESIGN_OPTION_DIRECTIONS[index].id, reason: classifyImageProviderError(result.reason) });
      }
    });
    const rendered = renders[0];
    const generatedImageSha256 = createHash("sha256").update(rendered.buffer).digest("hex");
    const referencePath = await writePrivateMedia(
      `design_requests/${uid}/${requestId}/reference.${extensionForMimeType(mimeType)}`,
      reference.buffer,
      mimeType,
      { ownerUid: uid, requestId, kind: "reference", sha256: reference.sha256 },
    );
    const generatedOptions = await Promise.all(renders.map(async (render, index) => {
      const sha256 = createHash("sha256").update(render.buffer).digest("hex");
      const fileName = index === 0 ? "primary" : render.option.id;
      const path = await writePrivateMedia(
        `ai_design_renders/${uid}/${requestId}/${fileName}.jpg`,
        render.buffer,
        render.mimeType,
        { ownerUid: uid, requestId, kind: "generated", providerRequestId: render.providerRequestId || "", sha256 },
      );
      return { path, sha256, render };
    }));
    const generatedPaths = generatedOptions.map((option) => option.path);
    const media = await resolveMedia({
      referenceImagePaths: [referencePath],
      generatedImagePaths: generatedPaths,
    });
    const status = role === "tenant" ? "AWAITING_OWNER_APPROVAL" : role === "broker" ? "BROKER_CONCEPT_READY" : "AI_CONCEPT_READY";
    const approvalStatus = role === "tenant" ? "PENDING_OWNER_APPROVAL" : role === "broker" ? "BROKER_MARKETING_CONCEPT" : "OWNER_CREATED";
    const conceptBase = {
      beforeImageStoragePath: referencePath,
      renderStatus: "AI_RENDER_COMPLETE",
      generationStatus: "AI_RENDER_COMPLETE",
      renderEngineRequired: false,
      scopeSummary: `Server-authoritative ${scope.finishTier} redesign for ${scope.zoneType}.`,
      executionDetails,
      finishTier: scope.finishTier,
      quoteTotal: quote.finalTotal,
      mobilizationAmount: quote.mobilizationAmount,
    };
    const generatedConcepts = generatedOptions.map((option, index) => ({
      ...conceptBase,
      id: index === 0 ? "primary" : option.render.option.id,
      optionKey: option.render.option.id,
      optionLabel: option.render.option.label,
      title: `${cleanText(payload.designStyle, "Modern", 120)} ${scope.zoneType} - ${option.render.option.label}`,
      afterImageStoragePath: option.path,
      generatedImageSha256: option.sha256,
      providerRequestId: option.render.providerRequestId || null,
      prompt: buildOptionPrompt(prompt, DESIGN_OPTION_DIRECTIONS.findIndex((d) => d.id === option.render.option.id)),
    }));
    const optionPrompts = generatedConcepts.map((concept) => ({ id: concept.id, prompt: concept.prompt }));
    const concepts = generatedConcepts.map(({ prompt: _prompt, ...rest }) => rest);
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
      concepts,
      conceptCount: concepts.length,
      selectedConceptId: null,
      executionDetails,
      referenceImagePaths: [referencePath],
      generatedImagePaths: generatedPaths,
      renderStatus: "AI_RENDER_COMPLETE",
      aiProvider: "openai",
      providerRequestId: rendered.providerRequestId || null,
      inputImageSha256: reference.sha256,
      generatedImageSha256,
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
      transaction.create(db.collection("design_generation_prompts").doc(requestId), {
        requestId,
        sourceCollection: "design_requests",
        conceptPrompt: prompt,
        conceptPrompts: optionPrompts,
        createdAt: now,
      });
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
      for (const option of concepts) {
        transaction.create(db.collection("design_concepts").doc(`${requestId}_${option.id}`), {
          requestId,
          userId: uid,
          ownerId,
          tenantId: role === "tenant" ? uid : null,
          ...option,
          createdAt: now,
        });
      }
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
          generatedImageSha256,
        },
        createdAt: now,
      });
    });

    await settleAiUsageQuota(quota, true);
    return {
      status: "SUCCESS",
      idempotent: false,
      requestId,
      renderStatus: "AI_RENDER_COMPLETE",
      aiProvider: "openai",
      quote,
      concepts: concepts.map((option, index) => ({
        ...publicConcept(option),
        beforeImageUrl: media.referenceImages[0],
        afterImageUrl: media.generatedImages[index] || "",
      })),
      ...media,
    };
  } catch (error: any) {
    await settleAiUsageQuota(quota, false).catch(() => undefined);
    console.error("submitAIDesignRequest failed", {
      requestId,
      uid,
      role,
      message: cleanText(error?.message, "AI image provider did not complete the request.", 300),
    });
    // Admin-only failure ledger (no client rule grants access): failed renders were previously only
    // visible in Cloud Logging. No image bytes, prompts or contact details are stored here.
    await db.collection("design_request_failures").doc(requestId).set({
      requestId,
      uid,
      role,
      status: "FAILED",
      errorCode: error instanceof HttpsError ? error.code : "unavailable",
      providerReason: error instanceof HttpsError ? null : classifyImageProviderError(error),
      message: cleanText(error?.message, "AI image provider did not complete the request.", 300),
      quotaRefunded: true,
      failedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true }).catch(() => undefined);
    if (error instanceof HttpsError) throw error;
    const reason = classifyImageProviderError(error);
    console.warn("submitAIDesignRequest provider failure", { requestId, reason, status: Number(error?.status || 0) || null });
    // Access/verification/credential/model problems will not fix themselves on retry, so they
    // surface as failed-precondition with a specific reason instead of a generic "unavailable".
    const code = reason === "provider_timeout" ? "deadline-exceeded" : reason === "provider_other" ? "unavailable" : "failed-precondition";
    throw new HttpsError(code, IMAGE_PROVIDER_FAILURE_MESSAGES[reason], { reason });
  }
});

export const getAIDesignRequestMedia = onCall({
  cors: true,
  enforceAppCheck: true,
  timeoutSeconds: 60,
  memory: "256MiB",
}, async (request) => {
  if (!request.auth?.uid) throw new HttpsError("unauthenticated", "Sign in before accessing protected design media.");
  const rawRequestId = cleanText(request.data?.requestId, "", 160);
  if (!rawRequestId) throw new HttpsError("invalid-argument", "requestId is required.");
  const requestId = cleanRequestId(rawRequestId);
  const snap = await db.collection("design_requests").doc(requestId).get();
  // A missing request is an expected outcome (deleted/old links, uptime probes). Answer with an
  // empty, non-error payload instead of a logged 404 so real failures stay visible in the logs.
  if (!snap.exists) return { requestId, found: false, referenceImages: [], generatedImages: [], expiresAtMs: 0 };
  const data = snap.data() || {};
  if (!canReadRequest(request.auth, data)) {
    throw new HttpsError("permission-denied", "You cannot access this design request media.");
  }
  return {
    requestId,
    found: true,
    ...(await resolveMedia(data)),
  };
});

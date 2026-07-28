import { onCall, HttpsError } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import * as admin from "firebase-admin";
import { enforceAiUsageQuota } from "./aiUsageQuota";

const openAiKey = defineSecret("OPENAI_API_KEY");
const imageGenerationKey = defineSecret("IMAGE_GENERATION_API_KEY");

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

function getStorageBucket() {
  return admin.storage().bucket();
}

const DESIGN_CONCEPTS = [
  {
    id: "premium_functional",
    title: "Premium Functional Concept",
    summary: "Durable premium redesign with stronger lighting, cleaner finishes, and practical furniture planning.",
    emphasis: "premium functional finish, practical circulation, durable materials, high visual improvement"
  },
  {
    id: "luxury_signature",
    title: "Luxury Signature Concept",
    summary: "Signature luxury upgrade with feature lighting, high-end materials, and bespoke decor language.",
    emphasis: "luxury signature interior, bespoke lighting, statement materials, premium hospitality ambience"
  },
  {
    id: "cost_controlled",
    title: "Cost-Controlled Upgrade",
    summary: "Controlled-cost upgrade that keeps the core layout and improves visible surfaces, lighting, and furnishings.",
    emphasis: "cost controlled renovation, retain existing structure, improve visible finishes, smart budget allocation"
  }
];

type ExecutionDetail = {
  category: string;
  items: string[];
};

type GeneratePayload = {
  requestId?: string;
  imageUrl?: string;
  referenceImages?: Array<{ url?: string; path?: string; name?: string; size?: number; contentType?: string }>;
  scope?: Record<string, unknown>;
  zoneType?: string;
  designStyle?: string;
  designObjective?: string;
  finishTier?: string;
  dimensions?: number;
  notes?: string;
  quoteTotal?: number;
  mobilizationAmount?: number;
};

function cleanText(value: unknown, fallback = "") {
  const resolved = String(value || "").trim();
  return resolved || fallback;
}

function safeNumber(value: unknown, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function boundedText(value: unknown, fallback = "", maxLength = 500) {
  return cleanText(value, fallback).slice(0, maxLength);
}

function cleanStoragePath(value: unknown, uid: string) {
  const path = String(value || "").trim();
  if (!path.startsWith(`design_requests/${uid}/`) || path.includes("..")) {
    throw new HttpsError("permission-denied", "Reference image path is not scoped to the signed-in user.");
  }
  return path.slice(0, 1000);
}

function cleanReferenceImages(value: unknown, uid: string) {
  if (!Array.isArray(value) || value.length === 0) {
    throw new HttpsError("invalid-argument", "At least one reference image is required.");
  }
  if (value.length > 3) {
    throw new HttpsError("invalid-argument", "Submit up to three reference images for one design request.");
  }
  return value.map((entry) => {
    const record = entry && typeof entry === "object" && !Array.isArray(entry)
      ? entry as Record<string, unknown>
      : {};
    return {
      url: boundedText(record.url, "", 2000),
      path: cleanStoragePath(record.path, uid),
      name: boundedText(record.name, "reference-image", 160),
      size: Math.max(0, safeNumber(record.size, 0)),
      contentType: boundedText(record.contentType, "image/jpeg", 80),
    };
  });
}

function cleanScope(value: unknown) {
  const scope = value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  return {
    dimensions: Math.max(1, Math.min(10000, safeNumber(scope.dimensions, 50))),
    isMetric: scope.isMetric === true,
    zoneType: boundedText(scope.zoneType, "living room", 120),
    propertyType: boundedText(scope.propertyType, "Residential", 120),
    finishTier: boundedText(scope.finishTier, "Premium", 80),
    furnitureBudget: Math.max(0, Math.min(500000, safeNumber(scope.furnitureBudget, 0))),
    hasMEP: scope.hasMEP === true,
    hasStructural: scope.hasStructural === true,
    accessLevel: boundedText(scope.accessLevel, "Standard", 80),
    emirate: boundedText(scope.emirate, "Dubai", 80),
    isNightWork: scope.isNightWork === true,
    isMallEnvironment: scope.isMallEnvironment === true,
    addons: Array.isArray(scope.addons)
      ? scope.addons.map((item) => boundedText(item, "", 80)).filter(Boolean).slice(0, 20)
      : [],
  };
}

function calculateServerDesignQuote(scope: ReturnType<typeof cleanScope>) {
  const area = scope.isMetric ? scope.dimensions * 10.7639 : scope.dimensions;
  const tierMultiplier = scope.finishTier.toLowerCase().includes("luxury")
    ? 1.45
    : scope.finishTier.toLowerCase().includes("basic")
      ? 0.82
      : 1;
  const mepAllowance = scope.hasMEP ? 8500 : 0;
  const structuralAllowance = scope.hasStructural ? 15000 : 0;
  const logisticsAllowance = scope.isMallEnvironment || scope.isNightWork ? 4500 : 1800;
  const materialsEstimate = Math.round(area * 180 * tierMultiplier);
  const laborEstimate = Math.round(area * 95 * tierMultiplier);
  const finalTotal = Math.max(
    2500,
    materialsEstimate + laborEstimate + mepAllowance + structuralAllowance + logisticsAllowance + scope.furnitureBudget,
  );
  return {
    currency: "AED",
    materialsEstimate,
    laborEstimate,
    approvalsAllowance: scope.hasStructural || scope.hasMEP ? 2500 : 0,
    logisticsAllowance,
    contingency: Math.round(finalTotal * 0.08),
    binMargin: Math.round(finalTotal * 0.12),
    finalTotal,
    quoteAuthority: "SERVER_CALCULATED_DESIGN_STUDIO_V1",
  };
}

function initialDesignStatus(role: string) {
  return role === "tenant" ? "AWAITING_OWNER_APPROVAL" : "AI_CONCEPT_READY";
}

function needsPlumbing(zoneType: string) {
  const zone = zoneType.toLowerCase();
  return ["bathroom", "kitchen", "pantry", "garden", "landscape", "pool"].some((keyword) => zone.includes(keyword));
}

function needsHeavyMep(zoneType: string) {
  const zone = zoneType.toLowerCase();
  return ["kitchen", "bathroom", "pool", "garden", "landscape", "clinic", "hotel", "facade", "retail"].some((keyword) => zone.includes(keyword));
}

function buildExecutionDetails(input: Required<Pick<GeneratePayload, "zoneType" | "designStyle" | "designObjective" | "finishTier">> & Pick<GeneratePayload, "dimensions" | "notes" | "quoteTotal" | "mobilizationAmount">): ExecutionDetail[] {
  const zoneType = cleanText(input.zoneType, "design area");
  const style = cleanText(input.designStyle, "Modern");
  const objective = cleanText(input.designObjective, "redesign");
  const finishTier = cleanText(input.finishTier, "Premium");
  const dimensions = safeNumber(input.dimensions, 50);
  const quoteTotal = safeNumber(input.quoteTotal, 0);
  const mobilizationAmount = safeNumber(input.mobilizationAmount, quoteTotal > 0 ? Math.round(quoteTotal * 0.15) : 0);
  const plumbingRequired = needsPlumbing(zoneType);
  const mepRequired = needsHeavyMep(zoneType);

  return [
    {
      category: "Lighting",
      items: [
        `${style} ambient lighting layout for ${zoneType}.`,
        "Feature lighting points for focal wall, seating zone, or circulation line.",
        "Warm-white LED specification with dimming provision where practical.",
        "Final lux level to be confirmed after site inspection."
      ]
    },
    {
      category: "Ceiling",
      items: [
        `${finishTier} ceiling finish with clean junctions and access panels where required.`,
        "Optional gypsum bulkhead/cove detail based on site height and MEP clearance.",
        "Paint finish matched to design palette and existing building condition."
      ]
    },
    {
      category: "Walls & paint",
      items: [
        "Surface preparation, crack filling, primer, and final paint system.",
        `${style} feature wall treatment for the main visual angle.`,
        "Moisture-resistant coating in wet or external zones where applicable."
      ]
    },
    {
      category: "Flooring",
      items: [
        `${finishTier} floor finish allowance for ${Math.max(1, Math.round(dimensions))} sq ft.`,
        "Skirting alignment, threshold treatment, and transition strips included as required.",
        "Existing substrate condition to be verified before execution."
      ]
    },
    {
      category: "Furniture",
      items: [
        "Furniture layout plan based on circulation, access, and visual balance.",
        `${finishTier} loose furniture or built-in allowance according to approved scope.`,
        "Final model, fabric, and finish selections require owner approval before procurement."
      ]
    },
    {
      category: "Curtains & soft furnishings",
      items: [
        "Curtain/blind style matched to the design concept and privacy requirement.",
        "Soft furnishing palette for cushions, rugs, upholstery, or acoustic comfort where relevant.",
        "Measurements to be confirmed on site before order placement."
      ]
    },
    {
      category: "Decor & accessories",
      items: [
        "Decor package for artwork, mirrors, planters, display items, or majlis accessories.",
        "Accessories coordinated with lighting temperature, wall palette, and furniture material.",
        "Owner approval required before final purchasing."
      ]
    },
    {
      category: "Electrical points",
      items: [
        "Switch/socket review for new layout and lighting control logic.",
        "Cable routing to be concealed where practical and compliant with site conditions.",
        "Load changes require technician verification before execution."
      ]
    },
    {
      category: "MEP / HVAC",
      items: mepRequired ? [
        "MEP coordination required because this zone may affect services or wet/external systems.",
        "HVAC diffuser, access, drainage, and service clearance to be checked before final scope lock.",
        "Any hidden MEP defect is excluded until site verification."
      ] : [
        "Light MEP review only unless hidden defects are found during site verification.",
        "Existing HVAC location is retained unless owner approves variation.",
        "No structural or major MEP relocation included without revised approval."
      ]
    },
    {
      category: "Plumbing",
      items: plumbingRequired ? [
        "Plumbing line, drainage, waterproofing, and fixture position review included for this zone type.",
        "Waterproofing integrity must be verified before tiles, finishes, or landscape works proceed.",
        "Fixture brands and sanitaryware selections require final owner approval."
      ] : [
        "No plumbing scope assumed for this zone.",
        "Any discovered leak, drainage, or waterproofing issue becomes a separate approved variation."
      ]
    },
    {
      category: "Smart controls",
      items: [
        "Optional smart lighting control, motion sensor, or scene setting allowance subject to owner approval.",
        "Compatibility with existing electrical system must be verified before installation.",
        "App-based controls are optional and not assumed unless selected."
      ]
    },
    {
      category: "Safety & compliance",
      items: [
        "Execution must comply with building management, landlord, and UAE site safety requirements.",
        "Fire access, emergency routes, and electrical safety cannot be compromised.",
        "Any permit/NOC requirement is subject to building authority process."
      ]
    },
    {
      category: "Materials grade",
      items: [
        `${finishTier} material grade used for quote assumptions.`,
        "Final materials are locked only after sample approval and supplier confirmation.",
        "Equivalent approved alternatives may be used if selected stock is unavailable."
      ]
    },
    {
      category: "Site protection",
      items: [
        "Floor, wall, lift, and access-route protection during execution.",
        "Dust control and waste removal included according to building rules.",
        "Working hours remain subject to property management approval."
      ]
    },
    {
      category: "Timeline stages",
      items: [
        "Stage 1: owner approval, site verification, and final scope confirmation.",
        "Stage 2: 15% mobilization, procurement, and work scheduling.",
        "Stage 3: execution, photo evidence, inspection, and handover."
      ]
    },
    {
      category: "Assumptions",
      items: [
        `Quote assumes ${Math.max(1, Math.round(dimensions))} sq ft for ${zoneType}.`,
        `Design objective is ${objective}.`,
        input.notes ? `Client note considered: ${cleanText(input.notes).slice(0, 240)}` : "No additional client note declared.",
        "Final execution price remains subject to site verification and confirmed material selection."
      ]
    },
    {
      category: "Exclusions",
      items: [
        "Hidden structural, waterproofing, electrical, pest, mold, or authority issues are excluded until inspected.",
        "Major layout changes, authority permits, and landlord variation costs require separate approval.",
        "No execution starts before approval, confirmed scope, and mobilization/payment step."
      ]
    },
    {
      category: "Payment / 15% mobilization",
      items: [
        quoteTotal > 0 ? `Estimated execution quote: AED ${Math.round(quoteTotal).toLocaleString()}.` : "Estimated execution quote will be confirmed by the pricing engine.",
        mobilizationAmount > 0 ? `15% mobilization amount: AED ${Math.round(mobilizationAmount).toLocaleString()}.` : "15% mobilization amount will be calculated from the confirmed quote.",
        "Remaining payment path follows approved BIN GROUP owner/tenant workflow."
      ]
    }
  ];
}

function buildPrompt(input: GeneratePayload, concept: typeof DESIGN_CONCEPTS[number]) {
  const zoneType = cleanText(input.zoneType, "interior space");
  const designStyle = cleanText(input.designStyle, "Modern");
  const designObjective = cleanText(input.designObjective, "redesign");
  const finishTier = cleanText(input.finishTier, "Premium");
  const dimensions = safeNumber(input.dimensions, 50);
  const notes = cleanText(input.notes);

  return [
    `Create a photorealistic UAE property redesign concept for a ${zoneType}.`,
    `Style: ${designStyle}. Objective: ${designObjective}. Finish tier: ${finishTier}. Approximate area: ${dimensions} sq ft.`,
    `Concept direction: ${concept.emphasis}.`,
    "Preserve the room geometry and camera angle from the reference image. Upgrade lighting, ceiling, walls, flooring, furniture, decor, and visible finishes.",
    "Produce a clean after-design image suitable for owner approval and execution quoting. Do not add people, logos, text, watermark, or unsafe construction conditions.",
    notes ? `Owner/tenant notes: ${notes}` : ""
  ].filter(Boolean).join(" ");
}

async function generateImageWithOpenAI(apiKey: string, prompt: string) {
  const { default: OpenAI } = await import("openai");
  const client = new OpenAI({ apiKey });
  const result = await client.images.generate({
    model: process.env.OPENAI_IMAGE_MODEL || "gpt-image-1",
    prompt,
    size: "1024x1024"
  });
  const base64 = result.data?.[0]?.b64_json;
  if (!base64) throw new Error("OpenAI image generation returned no image payload.");
  return Buffer.from(base64, "base64");
}

async function saveRender(uid: string, requestId: string, conceptId: string, buffer: Buffer) {
  const bucket = getStorageBucket();
  const filePath = `ai_design_renders/${uid}/${requestId}/${conceptId}.png`;
  const file = bucket.file(filePath);
  await file.save(buffer, {
    contentType: "image/png",
    resumable: false,
    metadata: {
      cacheControl: "private,no-store",
      metadata: {
        ownerUid: uid,
        requestId,
        conceptId,
      },
    }
  });
  const [signedUrl] = await file.getSignedUrl({
    action: "read",
    expires: Date.now() + 15 * 60 * 1000,
  });
  return {
    storagePath: filePath,
    signedUrl,
  };
}

async function resolveTenantContext(uid: string, email: string) {
  const lookups = [
    db.collection("units").where("tenantId", "==", uid).limit(1),
    db.collection("units").where("tenantUid", "==", uid).limit(1),
  ];
  if (email) lookups.push(db.collection("units").where("tenantEmail", "==", email).limit(1));
  for (const lookup of lookups) {
    const snap = await lookup.get();
    if (!snap.empty) {
      const unitDoc = snap.docs[0];
      const unit = { id: unitDoc.id, ...unitDoc.data() };
      const propertyId = String((unit as any).propertyId || "").trim();
      const propertySnap = propertyId ? await db.collection("properties").doc(propertyId).get() : null;
      const property = propertySnap?.exists ? { id: propertySnap.id, ...propertySnap.data() } : null;
      return { unit, property };
    }
  }
  return { unit: null, property: null };
}

export const generateAIDesignConceptImages = onCall({
  cors: true,
  timeoutSeconds: 180,
  memory: "1GiB",
  secrets: [openAiKey, imageGenerationKey],
}, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Sign in before generating AI design renders.");
  await enforceAiUsageQuota(
    request.auth,
    "design",
    new Set(["owner", "tenant", "admin", "super_admin", "ceo"]),
    3,
  );

  const data = (request.data || {}) as GeneratePayload;
  const requestId = cleanText(data.requestId, `preview_${Date.now()}`);
  const imageUrl = cleanText(data.imageUrl);
  const zoneType = cleanText(data.zoneType, "living room");
  const designStyle = cleanText(data.designStyle, "Modern");
  const designObjective = cleanText(data.designObjective, "redesign");
  const finishTier = cleanText(data.finishTier, "Premium");
  const quoteTotal = safeNumber(data.quoteTotal, 0);
  const mobilizationAmount = safeNumber(data.mobilizationAmount, quoteTotal > 0 ? Math.round(quoteTotal * 0.15) : 0);

  const executionDetails = buildExecutionDetails({
    zoneType,
    designStyle,
    designObjective,
    finishTier,
    dimensions: data.dimensions,
    notes: data.notes,
    quoteTotal,
    mobilizationAmount
  });

  const apiKey = imageGenerationKey.value() || openAiKey.value();
  if (!apiKey) {
    return {
      provider: "fallback",
      aiProvider: "fallback",
      renderStatus: "AI_RENDER_PENDING",
      error: "Image generation secret is not configured.",
      executionDetails,
      generatedImages: [],
      concepts: DESIGN_CONCEPTS.map((concept) => ({
        id: concept.id,
        title: concept.title,
        beforeImageUrl: imageUrl,
        afterImageUrl: "",
        renderStatus: "AI_RENDER_PENDING",
        generationStatus: "AI_RENDER_PENDING",
        renderEngineRequired: true,
        scopeSummary: concept.summary,
        executionDetails,
        prompt: buildPrompt(data, concept)
      }))
    };
  }

  const generatedImages: string[] = [];
  const concepts = [];
  const errors: string[] = [];

  for (const concept of DESIGN_CONCEPTS) {
    const prompt = buildPrompt(data, concept);
    try {
      const buffer = await generateImageWithOpenAI(apiKey, prompt);
      const render = await saveRender(uid, requestId, concept.id, buffer);
      generatedImages.push(render.signedUrl);
      concepts.push({
        id: concept.id,
        title: concept.title,
        beforeImageUrl: imageUrl,
        afterImageUrl: render.signedUrl,
        afterImageStoragePath: render.storagePath,
        renderStatus: "AI_RENDER_COMPLETE",
        generationStatus: "AI_RENDER_COMPLETE",
        renderEngineRequired: false,
        scopeSummary: concept.summary,
        executionDetails,
        prompt
      });
    } catch (error: any) {
      errors.push(`${concept.id}: ${error?.message || "generation failed"}`);
      concepts.push({
        id: concept.id,
        title: concept.title,
        beforeImageUrl: imageUrl,
        afterImageUrl: "",
        renderStatus: "AI_RENDER_PENDING",
        generationStatus: "AI_RENDER_PENDING",
        renderEngineRequired: true,
        scopeSummary: concept.summary,
        executionDetails,
        prompt,
        renderError: error?.message || "generation failed"
      });
    }
  }

  const renderStatus = generatedImages.length > 0 ? "AI_RENDER_COMPLETE" : "AI_RENDER_PENDING";
  return {
    provider: "openai",
    aiProvider: "openai",
    renderStatus,
    errors: errors.slice(0, 3),
    executionDetails,
    generatedImages,
    concepts
  };
});

export const submitAIDesignRequest = onCall({
  cors: true,
  enforceAppCheck: true,
  timeoutSeconds: 180,
  memory: "1GiB",
  secrets: [openAiKey, imageGenerationKey],
}, async (request) => {
  const auth = request.auth;
  const uid = auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Sign in before submitting an AI Design Studio request.");

  const quota = await enforceAiUsageQuota(
    auth,
    "design",
    new Set(["owner", "tenant", "admin", "super_admin", "ceo"]),
    3,
  );
  const role = String(quota.role || auth.token?.role || "").trim().toLowerCase();
  if (!["owner", "tenant", "admin", "super_admin", "ceo"].includes(role)) {
    throw new HttpsError("permission-denied", "This role cannot submit design requests.");
  }

  const data = (request.data || {}) as GeneratePayload;
  const requestedId = cleanText(data.requestId).replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 120);
  const requestRef = requestedId
    ? admin.firestore().collection("design_requests").doc(requestedId)
    : admin.firestore().collection("design_requests").doc();
  const requestId = requestRef.id;
  const referenceImages = cleanReferenceImages(data.referenceImages, uid);
  const scope = cleanScope(data.scope || data);
  const designStyle = boundedText(data.designStyle, "Modern", 120);
  const designObjective = boundedText(data.designObjective, "refresh", 120);
  const notes = boundedText(data.notes, "", 1000);
  const quote = calculateServerDesignQuote(scope);
  const mobilizationAmount = Math.round(quote.finalTotal * 0.15);
  const primaryImageUrl = referenceImages[0]?.url || "";
  const status = initialDesignStatus(role);
  const email = String(auth.token?.email || "").trim().toLowerCase();
  const tenantContext = role === "tenant" ? await resolveTenantContext(uid, email) : { unit: null, property: null };
  const unit: any = tenantContext.unit || {};
  const property: any = tenantContext.property || {};
  const ownerId = role === "tenant"
    ? String(property.ownerId || property.ownerUid || unit.ownerId || unit.ownerUid || "").trim() || null
    : uid;
  const ownerEmail = role === "tenant"
    ? String(property.ownerEmail || unit.ownerEmail || "").trim().toLowerCase() || null
    : email || null;

  const executionDetails = buildExecutionDetails({
    zoneType: scope.zoneType,
    designStyle,
    designObjective,
    finishTier: scope.finishTier,
    dimensions: scope.dimensions,
    notes,
    quoteTotal: quote.finalTotal,
    mobilizationAmount,
  });

  const apiKey = imageGenerationKey.value() || openAiKey.value();
  const concepts: any[] = [];
  const generatedImages: string[] = [];
  const generatedImagePaths: string[] = [];
  const errors: string[] = [];
  for (const concept of DESIGN_CONCEPTS) {
    const prompt = buildPrompt({
      ...data,
      zoneType: scope.zoneType,
      designStyle,
      designObjective,
      finishTier: scope.finishTier,
      dimensions: scope.dimensions,
      notes,
      quoteTotal: quote.finalTotal,
      mobilizationAmount,
    }, concept);
    if (!apiKey) {
      concepts.push({
        id: concept.id,
        title: concept.title,
        beforeImageUrl: primaryImageUrl,
        afterImageUrl: "",
        renderStatus: "AI_RENDER_PENDING",
        generationStatus: "AI_RENDER_PENDING",
        renderEngineRequired: true,
        scopeSummary: concept.summary,
        executionDetails,
        prompt,
      });
      continue;
    }
    try {
      const buffer = await generateImageWithOpenAI(apiKey, prompt);
      const render = await saveRender(uid, requestId, concept.id, buffer);
      generatedImages.push(render.signedUrl);
      generatedImagePaths.push(render.storagePath);
      concepts.push({
        id: concept.id,
        title: concept.title,
        beforeImageUrl: primaryImageUrl,
        afterImageUrl: render.signedUrl,
        afterImageStoragePath: render.storagePath,
        renderStatus: "AI_RENDER_COMPLETE",
        generationStatus: "AI_RENDER_COMPLETE",
        renderEngineRequired: false,
        scopeSummary: concept.summary,
        executionDetails,
        prompt,
      });
    } catch (error: any) {
      errors.push(`${concept.id}: ${error?.message || "generation failed"}`);
      concepts.push({
        id: concept.id,
        title: concept.title,
        beforeImageUrl: primaryImageUrl,
        afterImageUrl: "",
        renderStatus: "AI_RENDER_PENDING",
        generationStatus: "AI_RENDER_PENDING",
        renderEngineRequired: true,
        scopeSummary: concept.summary,
        executionDetails,
        prompt,
        renderErrorCode: "PROVIDER_RENDER_PENDING",
      });
    }
  }

  const renderStatus = generatedImages.length > 0 ? "AI_RENDER_COMPLETE" : "AI_RENDER_PENDING";
  const now = admin.firestore.FieldValue.serverTimestamp();
  const requestPayload = {
    id: requestId,
    userId: uid,
    createdByUid: uid,
    authUid: uid,
    role,
    userName: String(auth.token?.name || email || "BIN GROUP user").slice(0, 160),
    userEmail: email || null,
    ownerId,
    ownerUid: ownerId,
    ownerEmail,
    tenantId: role === "tenant" ? uid : null,
    tenantUid: role === "tenant" ? uid : null,
    tenantEmail: role === "tenant" ? email || null : null,
    propertyId: property.id || unit.propertyId || null,
    propertyName: property.name || property.propertyName || unit.propertyName || (role === "tenant" ? "Tenant assigned unit" : "Owner design request"),
    propertyLocation: property.address || property.location || unit.propertyLocation || null,
    unitId: unit.id || null,
    roomType: scope.zoneType,
    theme: designStyle,
    budget: quote.finalTotal,
    referenceImages: referenceImages.map((image) => image.url).filter(Boolean),
    referenceImagePaths: referenceImages.map((image) => image.path),
    generatedImages,
    generatedImagePaths,
    renderStatus,
    aiProvider: apiKey ? "openai" : "fallback",
    mobilizationAmount,
    executionDetails,
    scope: {
      ...scope,
      scopeDescription: notes,
      requiredWork: notes,
      designObjective,
      referenceImages: referenceImages.map((image) => image.url).filter(Boolean),
      referenceImagePaths: referenceImages.map((image) => image.path),
      generatedImages,
      generatedImagePaths,
      unitNumber: unit.unitNumber || "",
      floorLevel: unit.floorNumber || "",
      imageCount: referenceImages.length,
    },
    designStyle,
    designObjective,
    quote,
    concepts,
    conceptPrompt: concepts[0]?.prompt || "",
    status,
    workflowStage: status,
    approvalStatus: role === "tenant" ? "PENDING_OWNER_APPROVAL" : "OWNER_CREATED",
    quoteStatus: role === "tenant" ? "PENDING_OWNER_APPROVAL" : "DEPOSIT_PENDING",
    paymentStatus: "NOT_STARTED",
    adminHandoffStatus: role === "tenant" ? "WAITING_OWNER_APPROVAL" : "PAYMENT_NOT_STARTED",
    engineerHandoffStatus: "WAITING_PAYMENT",
    source: "AI_DESIGN_STUDIO_SERVER_CALLABLE",
    authority: "SERVER_AUTHORITATIVE",
    createdAt: now,
    updatedAt: now,
  };

  await db.runTransaction(async (transaction: FirebaseFirestore.Transaction) => {
    transaction.create(requestRef, requestPayload);
    transaction.create(db.collection("design_quotes").doc(requestId), {
      requestId,
      ...requestPayload,
      createdAt: now,
    });
    concepts.forEach((concept) => {
      transaction.create(db.collection("design_concepts").doc(`${requestId}_${concept.id}`), {
        requestId,
        ownerId,
        ownerUid: ownerId,
        tenantId: role === "tenant" ? uid : null,
        tenantUid: role === "tenant" ? uid : null,
        userId: uid,
        role,
        ...concept,
        createdAt: now,
      });
    });
    if (role === "tenant") {
      transaction.create(db.collection("design_approvals").doc(requestId), {
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
      action: "AI_DESIGN_REQUEST_SUBMITTED_SERVER",
      actorId: uid,
      actorRole: role,
      targetType: "design_requests",
      targetId: requestId,
      renderStatus,
      aiProvider: apiKey ? "openai" : "fallback",
      createdAt: now,
    });
  });

  return {
    status: "SUCCESS",
    requestId,
    renderStatus,
    aiProvider: apiKey ? "openai" : "fallback",
    generatedImages,
    generatedImagePaths,
    concepts,
    executionDetails,
    errors: errors.slice(0, 3),
  };
});

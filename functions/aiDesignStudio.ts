import { onCall, HttpsError } from "firebase-functions/v2/https";
const defineSecret = (name: string) => ({ value: () => process.env[name] || "" });
import * as admin from "firebase-admin";
import OpenAI from "openai";

const openAiKey = defineSecret("OPENAI_API_KEY");
const imageGenerationKey = defineSecret("IMAGE_GENERATION_API_KEY");

if (!admin.apps.length) {
  admin.initializeApp();
}

const storage = admin.storage();

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
  const bucket = storage.bucket();
  const filePath = `ai_design_renders/${uid}/${requestId}/${conceptId}.png`;
  const file = bucket.file(filePath);
  await file.save(buffer, {
    contentType: "image/png",
    resumable: false,
    metadata: {
      cacheControl: "public,max-age=31536000"
    }
  });
  await file.makePublic().catch(() => undefined);
  return `https://storage.googleapis.com/${bucket.name}/${encodeURIComponent(filePath).replace(/%2F/g, "/")}`;
}

export const generateAIDesignConceptImages = onCall({
  cors: true,
  timeoutSeconds: 180,
  memory: "1GiB"
}, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Sign in before generating AI design renders.");

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
      const afterImageUrl = await saveRender(uid, requestId, concept.id, buffer);
      generatedImages.push(afterImageUrl);
      concepts.push({
        id: concept.id,
        title: concept.title,
        beforeImageUrl: imageUrl,
        afterImageUrl,
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

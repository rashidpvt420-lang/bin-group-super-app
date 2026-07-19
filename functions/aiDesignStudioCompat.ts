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

function cleanText(value: unknown, fallback = "") {
  const resolved = String(value || "").trim();
  return resolved || fallback;
}

function cleanBase64(value: unknown) {
  return String(value || "")
    .replace(/^data:image\/[a-zA-Z0-9.+-]+;base64,/, "")
    .replace(/\s/g, "")
    .slice(0, 8_000_000);
}

function buildAdminDesignPrompt(data: any) {
  const scope = data?.scope || {};
  const zoneType = cleanText(data?.zoneType || scope.zoneType || scope.propertyType, "interior space");
  const style = cleanText(data?.designStyle || data?.theme, "Sovereign Elite gold and graphite");
  const notes = cleanText(data?.customPrompt || data?.prompt || data?.notes);

  return [
    `Create one photorealistic UAE property redesign image for a ${zoneType}.`,
    `Design style: ${style}.`,
    "Preserve the same camera angle and room geometry as much as possible, but produce a clean upgraded after-design concept.",
    "Upgrade lighting, walls, flooring, furniture, decor, and visible finishes for a premium BIN GROUP owner approval render.",
    "Do not add people, readable text, watermarks, logos, unsafe construction, or unrealistic structural changes.",
    notes ? `Additional admin directive: ${notes.slice(0, 500)}` : ""
  ].filter(Boolean).join(" ");
}

async function generateImageWithOpenAI(apiKey: string, prompt: string) {
  const { default: OpenAI } = await import("openai");
  const client = new OpenAI({ apiKey, timeout: 60_000 });
  const result = await client.images.generate({
    model: process.env.OPENAI_IMAGE_MODEL || "gpt-image-1",
    prompt,
    size: "1024x1024"
  });
  const base64 = result.data?.[0]?.b64_json;
  if (!base64) throw new Error("OpenAI image generation returned no image payload.");
  return base64;
}

export const generateDesignConcept = onCall({
  cors: true,
  timeoutSeconds: 180,
  memory: "1GiB",
  secrets: [openAiKey, imageGenerationKey],
}, async (request) => {
  if (!request.auth?.uid) {
    throw new HttpsError("unauthenticated", "Sign in before using AI Design Studio.");
  }

  const quota = await enforceAiUsageQuota(
    request.auth,
    "design",
    new Set(["admin", "super_admin", "ceo", "operations_admin", "owner", "tenant"]),
    3,
  );

  const payload = request.data || {};
  const requestId = cleanText(payload.requestId, `design_${Date.now()}`);
  const imageBase64 = cleanBase64(payload.imageBase64);
  const mimeType = cleanText(payload.mimeType, "image/png");
  const prompt = buildAdminDesignPrompt(payload);
  const apiKey = imageGenerationKey.value() || openAiKey.value();

  if (!imageBase64) {
    throw new HttpsError("invalid-argument", "Reference image is required.");
  }

  try {
    let generatedImage = imageBase64;
    let live = false;
    let provider = "fallback";
    let renderStatus = "AI_RENDER_PENDING";
    let renderError: string | null = null;

    if (apiKey) {
      try {
        generatedImage = await generateImageWithOpenAI(apiKey, prompt);
        live = true;
        provider = "openai";
        renderStatus = "AI_RENDER_COMPLETE";
      } catch (error: any) {
        renderError = error?.message || "Image provider failed.";
      }
    } else {
      renderError = "IMAGE_GENERATION_API_KEY or OPENAI_API_KEY is not configured in Firebase Functions secrets.";
    }

    const concept = {
      requestId,
      provider,
      live,
      renderStatus,
      renderError,
      prompt,
      scope: payload.scope || null,
      designStyle: cleanText(payload.designStyle || payload.theme, "Sovereign Elite"),
      createdAt: new Date().toISOString(),
    };

    await db.collection("design_requests").add({
      userId: request.auth.uid,
      createdBy: request.auth.uid,
      createdByRole: quota.role,
      requestId,
      provider,
      live,
      renderStatus,
      renderError,
      mimeType,
      prompt,
      scope: payload.scope || null,
      designStyle: payload.designStyle || payload.theme || null,
      status: live ? "AI_CONCEPT_READY" : "AI_RENDER_PENDING",
      type: "IMAGE_TO_IMAGE_COMPAT",
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return {
      status: "SUCCESS",
      provider,
      live,
      renderStatus,
      generatedImage,
      mimeType: "image/png",
      concept,
    };
  } catch (error: any) {
    console.error("generateDesignConcept failed", error);
    throw new HttpsError("internal", error?.message || "AI Design Studio generation failed.");
  }
});

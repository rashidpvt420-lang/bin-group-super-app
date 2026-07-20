import { createHash, randomUUID } from "node:crypto";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import * as admin from "firebase-admin";
import { enforceAiUsageQuota } from "./aiUsageQuota";

const openAiKey = defineSecret("OPENAI_API_KEY");
const imageGenerationKey = defineSecret("IMAGE_GENERATION_API_KEY");
const MAX_REFERENCE_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_GENERATED_IMAGE_BYTES = 8 * 1024 * 1024;
const ALLOWED_IMAGE_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

function cleanText(value: unknown, fallback = "", maxLength = 500) {
  const resolved = String(value ?? "").trim();
  return (resolved || fallback).slice(0, maxLength);
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

function hasExpectedImageSignature(buffer: Buffer, mimeType: string) {
  if (mimeType === "image/jpeg") {
    return buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  }
  if (mimeType === "image/png") {
    return buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  }
  if (mimeType === "image/webp") {
    return buffer.length >= 12 && buffer.subarray(0, 4).toString("ascii") === "RIFF" && buffer.subarray(8, 12).toString("ascii") === "WEBP";
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
  const canonicalInput = encoded.replace(/=+$/, "");
  const canonicalDecoded = buffer.toString("base64").replace(/=+$/, "");
  if (!buffer.length || canonicalInput !== canonicalDecoded) {
    throw new HttpsError("invalid-argument", "Reference image payload is malformed.");
  }
  if (buffer.length > MAX_REFERENCE_IMAGE_BYTES) {
    throw new HttpsError("invalid-argument", "Reference image must be 5MB or smaller.");
  }
  if (!hasExpectedImageSignature(buffer, mimeType)) {
    throw new HttpsError("invalid-argument", "Reference image content does not match its MIME type.");
  }

  return {
    base64: buffer.toString("base64"),
    bytes: buffer.length,
    sha256: createHash("sha256").update(buffer).digest("hex"),
  };
}

function buildAdminDesignPrompt(data: any) {
  const scope = data?.scope && typeof data.scope === "object" && !Array.isArray(data.scope)
    ? data.scope
    : {};
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

async function editImageWithOpenAI(
  apiKey: string,
  prompt: string,
  imageBase64: string,
  mimeType: string,
) {
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
  const generatedImage = String(imageCall?.result || "").trim();
  if (!generatedImage) {
    throw new Error("OpenAI image editing returned no image payload.");
  }

  const outputBuffer = Buffer.from(generatedImage, "base64");
  if (!outputBuffer.length || outputBuffer.length > MAX_GENERATED_IMAGE_BYTES) {
    throw new Error("OpenAI image editing returned an invalid or oversized image payload.");
  }

  return {
    generatedImage: outputBuffer.toString("base64"),
    mimeType: "image/jpeg",
    providerRequestId: cleanText(response.id, "", 160),
  };
}

export const generateDesignConceptCompat = onCall({
  cors: true,
  enforceAppCheck: true,
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
    new Set(["admin", "super_admin", "ceo", "operations_admin"]),
    3,
  );

  const payload = request.data || {};
  const requestId = cleanRequestId(payload.requestId);
  const mimeType = normalizeMimeType(payload.mimeType);
  const reference = decodeReferenceImage(payload.imageBase64, mimeType);
  const prompt = buildAdminDesignPrompt(payload);
  const apiKey = imageGenerationKey.value() || openAiKey.value();

  if (!apiKey) {
    throw new HttpsError(
      "failed-precondition",
      "AI image generation is not configured in Firebase Functions secrets.",
    );
  }

  try {
    const result = await editImageWithOpenAI(apiKey, prompt, reference.base64, mimeType);
    const concept = {
      requestId,
      provider: "openai",
      live: true,
      renderStatus: "AI_RENDER_COMPLETE",
      scope: payload.scope && typeof payload.scope === "object" && !Array.isArray(payload.scope)
        ? payload.scope
        : null,
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
    console.error("generateDesignConceptCompat failed", {
      requestId,
      uid: request.auth.uid,
      message,
    });
    throw new HttpsError(
      "unavailable",
      "AI image rendering is temporarily unavailable. Retry after checking the Functions secret and provider status.",
    );
  }
});

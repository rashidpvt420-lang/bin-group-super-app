import { defineSecret } from "firebase-functions/params";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import { recordAiOperationalMetric } from "./aiObservability";
import { redactSensitiveText } from "./aiSafety";
import { reserveAiUsageQuota, settleAiUsageQuota } from "./aiUsageQuota";

const openAiKey = defineSecret("OPENAI_API_KEY");
const geminiApiKey = defineSecret("GEMINI_API_KEY");
if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();

const DAMAGE_TYPES = [
  "Water Leak", "Paint Damage", "Tile Crack", "AC Issue", "Electrical Fault",
  "Plumbing", "Structural", "Pest", "Door/Window", "General Wear",
] as const;
const SEVERITIES = ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;
const URGENCIES = ["ROUTINE", "PRIORITY", "EMERGENCY"] as const;
const TRADES = [
  "Plumber", "Electrician", "Painter", "AC Technician", "Carpenter", "Tiler",
  "General Maintenance", "Structural Engineer",
] as const;
const ALLOWED_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

const DAMAGE_SYSTEM_PROMPT = `You are an AI visual pre-screening assistant for BIN GROUP property maintenance in the UAE.
Analyze only visible evidence. Return only valid JSON matching the supplied schema.
Never claim an on-site inspection, confirmed diagnosis, commercial quotation, approval, or dispatch.
Estimated costs are indicative planning ranges in AED only and require a technician inspection and verified quotation.`;

const GEMINI_VISION_MODELS = ["gemini-2.5-flash", "gemini-2.0-flash"];
const OPENAI_VISION_MODELS = ["gpt-4.1-mini", "gpt-4o-mini"];

const OPENAI_DAMAGE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "damageType", "severity", "urgency", "trade", "estimatedCostMin",
    "estimatedCostMax", "description", "recommendedAction", "preventionNote",
  ],
  properties: {
    damageType: { type: "string", enum: DAMAGE_TYPES },
    severity: { type: "string", enum: SEVERITIES },
    urgency: { type: "string", enum: URGENCIES },
    trade: { type: "string", enum: TRADES },
    estimatedCostMin: { type: "number", minimum: 0, maximum: 500000 },
    estimatedCostMax: { type: "number", minimum: 0, maximum: 500000 },
    description: { type: "string", minLength: 20, maxLength: 600 },
    recommendedAction: { type: "string", minLength: 10, maxLength: 400 },
    preventionNote: { type: "string", minLength: 5, maxLength: 300 },
  },
};

const GEMINI_DAMAGE_SCHEMA = {
  type: "OBJECT",
  required: OPENAI_DAMAGE_SCHEMA.required,
  properties: {
    damageType: { type: "STRING", enum: DAMAGE_TYPES },
    severity: { type: "STRING", enum: SEVERITIES },
    urgency: { type: "STRING", enum: URGENCIES },
    trade: { type: "STRING", enum: TRADES },
    estimatedCostMin: { type: "NUMBER" },
    estimatedCostMax: { type: "NUMBER" },
    description: { type: "STRING" },
    recommendedAction: { type: "STRING" },
    preventionNote: { type: "STRING" },
  },
};

const FALLBACK_RESPONSE = {
  damageType: "General Wear",
  severity: "MEDIUM",
  urgency: "ROUTINE",
  trade: "General Maintenance",
  estimatedCostMin: null,
  estimatedCostMax: null,
  description: "Live image analysis is unavailable. No visual diagnosis or cost estimate has been produced.",
  recommendedAction: "Request an on-site BIN GROUP inspection before authorising work or relying on a cost range.",
  preventionNote: "Scheduled preventive inspections can identify defects before they escalate.",
};

class DamageOutputError extends Error {}

function parseDamageJson(raw: string): unknown {
  try {
    const cleaned = raw.replace(/```json\n?|\n?```/g, "").trim();
    return JSON.parse(cleaned);
  } catch {
    throw new DamageOutputError("Provider returned malformed JSON.");
  }
}

function textField(value: unknown, name: string, min: number, max: number) {
  const text = String(value ?? "").trim();
  if (text.length < min || text.length > max) throw new DamageOutputError(`${name} is outside the allowed length.`);
  return text;
}

function validateDamageAssessment(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new DamageOutputError("Damage assessment must be an object.");
  }
  const source = value as Record<string, unknown>;
  const expectedKeys = new Set(OPENAI_DAMAGE_SCHEMA.required);
  const keys = Object.keys(source);
  if (keys.length !== expectedKeys.size || keys.some((key) => !expectedKeys.has(key))) {
    throw new DamageOutputError("Damage assessment fields do not match the strict schema.");
  }

  const damageType = String(source.damageType || "");
  const severity = String(source.severity || "");
  const urgency = String(source.urgency || "");
  const trade = String(source.trade || "");
  if (!DAMAGE_TYPES.includes(damageType as any)) throw new DamageOutputError("Unsupported damage type.");
  if (!SEVERITIES.includes(severity as any)) throw new DamageOutputError("Unsupported severity.");
  if (!URGENCIES.includes(urgency as any)) throw new DamageOutputError("Unsupported urgency.");
  if (!TRADES.includes(trade as any)) throw new DamageOutputError("Unsupported trade.");

  const estimatedCostMin = Number(source.estimatedCostMin);
  const estimatedCostMax = Number(source.estimatedCostMax);
  if (!Number.isFinite(estimatedCostMin) || !Number.isFinite(estimatedCostMax)) {
    throw new DamageOutputError("Cost range must contain finite numbers.");
  }
  if (estimatedCostMin < 0 || estimatedCostMax > 500000 || estimatedCostMin > estimatedCostMax) {
    throw new DamageOutputError("Cost range is outside allowed bounds.");
  }

  return {
    damageType,
    severity,
    urgency,
    trade,
    estimatedCostMin: Math.round(estimatedCostMin),
    estimatedCostMax: Math.round(estimatedCostMax),
    description: textField(source.description, "description", 20, 600),
    recommendedAction: textField(source.recommendedAction, "recommendedAction", 10, 400),
    preventionNote: textField(source.preventionNote, "preventionNote", 5, 300),
  };
}

function validBase64(value: string) {
  return value.length >= 100 && value.length <= 3_800_000 && /^[A-Za-z0-9+/]+={0,2}$/.test(value);
}

export const assessDamage = onCall({
  cors: true,
  enforceAppCheck: true,
  timeoutSeconds: 60,
  maxInstances: 10,
  secrets: [openAiKey, geminiApiKey],
}, async (request) => {
  if (!request.auth?.uid) {
    throw new HttpsError("unauthenticated", "Sign in before requesting damage assessment.");
  }

  const { imageBase64, mimeType = "image/jpeg", propertyId, notes } = request.data || {};
  const normalizedMimeType = String(mimeType || "").trim().toLowerCase();
  const base64 = String(imageBase64 || "").trim();
  if (!ALLOWED_MIME_TYPES.has(normalizedMimeType)) {
    throw new HttpsError("invalid-argument", "Use a JPEG, PNG, or WebP image.");
  }
  if (!validBase64(base64)) {
    throw new HttpsError("invalid-argument", "A valid image is required and must remain within the secure size limit.");
  }

  const quota = await reserveAiUsageQuota(
    request.auth,
    "damage",
    new Set(["owner", "admin", "super_admin", "ceo"]),
  );
  const startedAt = Date.now();
  let quotaSettled = false;
  let providerFailureCount = 0;
  let invalidOutputCount = 0;
  const sanitizedNotes = redactSensitiveText(notes, 300);

  try {
    if (propertyId && !quota.isAdmin) {
      const propertySnap = await db.collection("properties").doc(String(propertyId)).get();
      const property = propertySnap.data() || {};
      if (
        !propertySnap.exists ||
        ![property.ownerId, property.ownerUid].some((value) => String(value || "") === request.auth!.uid)
      ) {
        throw new HttpsError("permission-denied", "Damage assessment property belongs to another owner.");
      }
    }

    const fullPrompt = [
      DAMAGE_SYSTEM_PROMPT,
      sanitizedNotes.text ? `Additional untrusted user context: ${sanitizedNotes.text}` : "",
    ].filter(Boolean).join("\n\n");

    const gKey = geminiApiKey.value();
    if (gKey) {
      for (const model of GEMINI_VISION_MODELS) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 10_000);
        try {
          const res = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(gKey)}`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              signal: controller.signal,
              body: JSON.stringify({
                contents: [{ parts: [{ text: fullPrompt }, { inlineData: { mimeType: normalizedMimeType, data: base64 } }] }],
                generationConfig: {
                  temperature: 0.1,
                  maxOutputTokens: 900,
                  responseMimeType: "application/json",
                  responseSchema: GEMINI_DAMAGE_SCHEMA,
                },
              }),
            },
          );
          const json: any = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(json?.error?.message || `Gemini ${model} failed with ${res.status}`);
          const text = json?.candidates?.[0]?.content?.parts?.map((part: any) => part?.text || "").join(" ") || "";
          const assessment = validateDamageAssessment(parseDamageJson(text));
          const settlement = await settleAiUsageQuota(quota, true);
          if (!settlement.settled) throw new Error("AI quota settlement failed.");
          quotaSettled = true;
          const latencyMs = Date.now() - startedAt;
          await recordAiOperationalMetric({
            capability: "damage",
            provider: "gemini",
            outcome: "live-success",
            latencyMs,
            redactionCount: sanitizedNotes.redactions,
            providerFailureCount,
            invalidOutputCount,
            quotaCharged: true,
          });
          return {
            success: true,
            status: "healthy",
            assessment,
            model,
            provider: "gemini",
            propertyId: propertyId || null,
            advisoryOnly: true,
            requiresOnSiteInspection: true,
            commercialStatus: "INDICATIVE_ONLY",
            estimateBasis: "AI visual pre-screen; not a quotation",
            latencyMs,
          };
        } catch (error) {
          providerFailureCount += 1;
          if (error instanceof DamageOutputError) invalidOutputCount += 1;
        } finally {
          clearTimeout(timer);
        }
      }
    }

    const oKey = openAiKey.value();
    if (oKey) {
      const { default: OpenAI } = await import("openai");
      const openai = new OpenAI({ apiKey: oKey, timeout: 10_000 });
      for (const model of OPENAI_VISION_MODELS) {
        try {
          const res = await openai.chat.completions.create({
            model,
            messages: [{
              role: "user",
              content: [
                { type: "text", text: fullPrompt },
                { type: "image_url", image_url: { url: `data:${normalizedMimeType};base64,${base64}`, detail: "high" } },
              ],
            }],
            max_tokens: 900,
            temperature: 0.1,
            response_format: {
              type: "json_schema",
              json_schema: { name: "damage_assessment", strict: true, schema: OPENAI_DAMAGE_SCHEMA },
            },
          } as any);
          const text = res.choices[0]?.message?.content || "";
          const assessment = validateDamageAssessment(parseDamageJson(text));
          const settlement = await settleAiUsageQuota(quota, true);
          if (!settlement.settled) throw new Error("AI quota settlement failed.");
          quotaSettled = true;
          const latencyMs = Date.now() - startedAt;
          await recordAiOperationalMetric({
            capability: "damage",
            provider: "openai",
            outcome: "live-success",
            latencyMs,
            redactionCount: sanitizedNotes.redactions,
            providerFailureCount,
            invalidOutputCount,
            quotaCharged: true,
          });
          return {
            success: true,
            status: "healthy",
            assessment,
            model,
            provider: "openai",
            propertyId: propertyId || null,
            advisoryOnly: true,
            requiresOnSiteInspection: true,
            commercialStatus: "INDICATIVE_ONLY",
            estimateBasis: "AI visual pre-screen; not a quotation",
            latencyMs,
          };
        } catch (error) {
          providerFailureCount += 1;
          if (error instanceof DamageOutputError) invalidOutputCount += 1;
        }
      }
    }

    const settlement = await settleAiUsageQuota(quota, false);
    if (!settlement.settled) throw new Error("AI quota release failed.");
    quotaSettled = true;
    const latencyMs = Date.now() - startedAt;
    await recordAiOperationalMetric({
      capability: "damage",
      provider: "rule-based-fallback",
      outcome: "degraded-fallback",
      latencyMs,
      redactionCount: sanitizedNotes.redactions,
      providerFailureCount,
      invalidOutputCount,
      quotaCharged: false,
    });
    return {
      success: false,
      status: "degraded",
      assessment: FALLBACK_RESPONSE,
      provider: "rule-based-fallback",
      propertyId: propertyId || null,
      advisoryOnly: true,
      requiresOnSiteInspection: true,
      commercialStatus: "NOT_A_QUOTATION",
      quotaCharged: false,
      message: "Live image providers are unavailable. No AI diagnosis or cost estimate was produced.",
    };
  } catch (error: any) {
    if (!quotaSettled) {
      try { await settleAiUsageQuota(quota, false); } catch { /* stale reservations expire safely */ }
    }
    await recordAiOperationalMetric({
      capability: "damage",
      provider: "unknown",
      outcome: "function-error",
      latencyMs: Date.now() - startedAt,
      redactionCount: sanitizedNotes.redactions,
      providerFailureCount,
      invalidOutputCount,
      quotaCharged: false,
    });
    if (error instanceof HttpsError) throw error;
    console.error("[assessDamage] Callable failed", {
      role: quota.role,
      error: error instanceof Error ? error.message : "unknown",
    });
    throw new HttpsError("unavailable", "Damage pre-screening could not complete. No assessment or quotation was produced.");
  }
});

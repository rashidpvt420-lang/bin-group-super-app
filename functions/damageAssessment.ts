import { onCall } from "firebase-functions/v2/https";
const defineSecret = (name: string) => ({ value: () => process.env[name] || "" });
import OpenAI from "openai";

const openAiKey = defineSecret("OPENAI_API_KEY");
const geminiApiKey = defineSecret("GEMINI_API_KEY");

const DAMAGE_SYSTEM_PROMPT = `You are an expert UAE property maintenance assessor for BIN GROUP, licensed in Abu Dhabi.
Analyze the image provided and return ONLY a valid JSON object — no markdown fences, no explanation — with exactly these fields:
{
  "damageType": "string (Water Leak | Paint Damage | Tile Crack | AC Issue | Electrical Fault | Plumbing | Structural | Pest | Door/Window | General Wear)",
  "severity": "LOW | MEDIUM | HIGH | CRITICAL",
  "urgency": "ROUTINE | PRIORITY | EMERGENCY",
  "trade": "string (Plumber | Electrician | Painter | AC Technician | Carpenter | Tiler | General Maintenance | Structural Engineer)",
  "estimatedCostMin": number (AED, UAE market rates for Al Ain / Abu Dhabi),
  "estimatedCostMax": number (AED),
  "description": "2-3 sentence factual description of visible damage",
  "recommendedAction": "specific next step the property owner should take",
  "preventionNote": "one sentence on how to prevent recurrence"
}`;

const GEMINI_VISION_MODELS = ["gemini-2.0-flash", "gemini-1.5-flash"];
const OPENAI_VISION_MODELS = ["gpt-4o", "gpt-4o-mini"];

function parseDamageJson(raw: string): any {
  const cleaned = raw.replace(/```json\n?|\n?```/g, "").trim();
  return JSON.parse(cleaned);
}

const FALLBACK_RESPONSE = {
  damageType: "General Maintenance",
  severity: "MEDIUM",
  urgency: "ROUTINE",
  trade: "General Maintenance",
  estimatedCostMin: 200,
  estimatedCostMax: 800,
  description: "Image analysis is temporarily unavailable. Please describe the damage in the notes field and a BIN GROUP technician will assess on-site.",
  recommendedAction: "Contact BIN GROUP on +971 55 7474560 or WhatsApp +971 55 2423233 to schedule an inspection.",
  preventionNote: "Scheduled AMC visits catch issues before they escalate.",
};

export const assessDamage = onCall({
  cors: true,
  timeoutSeconds: 60,
  maxInstances: 10,
}, async (request) => {
  const { imageBase64, mimeType = "image/jpeg", propertyId, notes } = request.data || {};

  if (!imageBase64) return { success: false, error: "No image provided", assessment: FALLBACK_RESPONSE };

  const base64 = String(imageBase64).slice(0, 3_800_000);
  const userNote = notes ? `\n\nAdditional context from user: ${String(notes).slice(0, 300)}` : "";
  const fullPrompt = DAMAGE_SYSTEM_PROMPT + userNote;

  // Try Gemini Vision
  const gKey = geminiApiKey.value();
  if (gKey) {
    for (const model of GEMINI_VISION_MODELS) {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 25000);
        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${gKey}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            signal: controller.signal,
            body: JSON.stringify({
              contents: [{ parts: [{ text: fullPrompt }, { inlineData: { mimeType, data: base64 } }] }],
              generationConfig: { temperature: 0.1, maxOutputTokens: 900 },
            }),
          }
        );
        clearTimeout(timer);
        if (!res.ok) continue;
        const json: any = await res.json();
        const text = json?.candidates?.[0]?.content?.parts?.[0]?.text || "";
        const assessment = parseDamageJson(text);
        return { success: true, assessment, model, provider: "gemini", propertyId };
      } catch { /* try next */ }
    }
  }

  // Fall back to OpenAI Vision
  const oKey = openAiKey.value();
  if (oKey) {
    const openai = new OpenAI({ apiKey: oKey, timeout: 25000 });
    for (const model of OPENAI_VISION_MODELS) {
      try {
        const res = await openai.chat.completions.create({
          model,
          messages: [{
            role: "user",
            content: [
              { type: "text", text: fullPrompt },
              { type: "image_url", image_url: { url: `data:${mimeType};base64,${base64}`, detail: "high" } },
            ],
          }],
          max_tokens: 900,
          temperature: 0.1,
        });
        const text = res.choices[0]?.message?.content || "";
        const assessment = parseDamageJson(text);
        return { success: true, assessment, model, provider: "openai", propertyId };
      } catch { /* try next */ }
    }
  }

  return { success: true, assessment: FALLBACK_RESPONSE, provider: "fallback", propertyId };
});

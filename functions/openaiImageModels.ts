/**
 * Single source for the OpenAI models used by the AI Design Studio render path.
 *
 * gpt-image-1 was shut down by OpenAI on 2026-10-23 and every render then failed with
 * "404 The model `gpt-image-1` has been deprecated" after ~75s. The GPT Image 2+ family processes
 * reference images at high fidelity automatically and rejects `input_fidelity`, so it is only sent
 * to older models. Env overrides stay available for a future model rotation without a code change.
 */
export const DEFAULT_IMAGE_ORCHESTRATOR_MODEL = "gpt-5.5";
export const DEFAULT_IMAGE_EDIT_MODEL = "gpt-image-2.5-sunburst";
export const RETIRED_IMAGE_MODELS = new Set(["gpt-image-1", "dall-e-2", "dall-e-3"]);

function envModel(value: string | undefined, fallback: string) {
  const model = String(value || "").trim();
  if (!model || RETIRED_IMAGE_MODELS.has(model)) return fallback;
  return model;
}

export function imageOrchestratorModel(env: Record<string, string | undefined> = process.env) {
  const model = envModel(env.OPENAI_IMAGE_ORCHESTRATOR_MODEL, DEFAULT_IMAGE_ORCHESTRATOR_MODEL);
  return model === "gpt-5" ? DEFAULT_IMAGE_ORCHESTRATOR_MODEL : model;
}

export function imageEditModel(env: Record<string, string | undefined> = process.env) {
  return envModel(env.OPENAI_IMAGE_MODEL, DEFAULT_IMAGE_EDIT_MODEL);
}

export function supportsInputFidelity(model: string) {
  return /^gpt-image-1(\.|-mini|$)/.test(model);
}

export function buildImageEditTool(env: Record<string, string | undefined> = process.env) {
  const model = imageEditModel(env);
  return {
    type: "image_generation",
    action: "edit",
    model,
    ...(supportsInputFidelity(model) ? { input_fidelity: "high" } : {}),
    output_format: "jpeg",
    output_compression: 85,
    quality: "medium",
    size: "1024x1024",
  };
}

export type ImageProviderFailureReason = "provider_access" | "provider_auth" | "provider_model_unavailable" | "provider_quota" | "provider_timeout" | "provider_other";

/**
 * Classifies an OpenAI SDK/API error so the callable can return a clear, specific
 * failure instead of a generic "temporarily unavailable" (audit 2026-11-04, fix 2).
 * Only status/code/message are inspected; no request content is read.
 */
export function classifyImageProviderError(error: any): ImageProviderFailureReason {
  const status = Number(error?.status ?? error?.response?.status ?? 0);
  const code = String(error?.code ?? error?.error?.code ?? "").toLowerCase();
  const type = String(error?.type ?? error?.error?.type ?? "").toLowerCase();
  const message = String(error?.message ?? error?.error?.message ?? "").toLowerCase();
  const text = `${code} ${type} ${message}`;
  if (/verif(y|ied|ication)|organization must be|(do|does) not have access|not have access to (the )?model|access to this model|not allowed to (use|sample)/.test(text)) {
    return "provider_access";
  }
  if (status === 401 || /invalid_api_key|incorrect api key|authentication/.test(text)) return "provider_auth";
  if (status === 403) return "provider_access";
  if (/insufficient_quota|billing|quota/.test(text)) return "provider_quota";
  if (status === 404 || /model_not_found|deprecated|does not exist/.test(text)) return "provider_model_unavailable";
  if (/timeout|timed out|etimedout|aborted/.test(text) || error?.name === "APIConnectionTimeoutError") return "provider_timeout";
  return "provider_other";
}

export const IMAGE_PROVIDER_FAILURE_MESSAGES: Record<ImageProviderFailureReason, string> = {
  provider_access: "AI Design is paused: the AI image provider has not enabled access to the image model for this account (provider verification required). No design request was created and no usage was charged.",
  provider_auth: "AI Design is paused: the AI image provider rejected the server credentials. No design request was created and no usage was charged.",
  provider_model_unavailable: "AI Design is paused: the configured AI image model is not available. No design request was created and no usage was charged.",
  provider_quota: "AI Design is paused: the AI image provider account has no remaining quota. No design request was created and no usage was charged.",
  provider_timeout: "The AI image provider took too long to answer. No design request was created and no usage was charged. Please retry later.",
  provider_other: "AI image rendering is temporarily unavailable. No design workflow record was created.",
};

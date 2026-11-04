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

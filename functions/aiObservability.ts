import { FieldValue } from "firebase-admin/firestore";
import * as admin from "firebase-admin";
import type { AiCapability } from "./aiUsageQuota";

if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();

export const AI_OPERATIONAL_SLO = Object.freeze({
  maxLiveLatencyMs: 20_000,
  maxOutputTokensPerResponse: 700,
  maxTotalTokensPerChatRequest: 5_000,
  budgetEnvelopeAedPerMillionTokens: 40,
  maxBudgetEnvelopeAedMicrosPerChatRequest: 200_000,
  minLiveProviderSuccessRate: 0.95,
  maxFallbackRate: 0.05,
  maxInvalidOutputRate: 0.01,
  maxFunctionErrorRate: 0.01,
});

export type AiProviderUsage = {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  budgetEnvelopeAedMicros: number;
};

type AiOutcome = "live-success" | "degraded-fallback" | "function-error";

type AiOperationalMetric = {
  capability: AiCapability;
  provider: string;
  outcome: AiOutcome;
  latencyMs: number;
  redactionCount?: number;
  providerFailureCount?: number;
  invalidOutputCount?: number;
  usage?: AiProviderUsage;
  quotaCharged: boolean;
};

function metricDay(now = new Date()) {
  return now.toISOString().slice(0, 10);
}

function providerMetricKey(provider: string) {
  const normalized = String(provider || "unknown").trim().toLowerCase();
  if (normalized === "gemini") return "gemini";
  if (normalized === "openai") return "openai";
  if (normalized.includes("fallback")) return "ruleBasedFallback";
  return "unknown";
}

function latencyBucket(latencyMs: number) {
  if (latencyMs <= 2_000) return "latencyLe2s";
  if (latencyMs <= 5_000) return "latencyLe5s";
  if (latencyMs <= 10_000) return "latencyLe10s";
  if (latencyMs <= 20_000) return "latencyLe20s";
  return "latencyGt20s";
}

function safeCounter(value: unknown, max = 10_000_000) {
  return Math.max(0, Math.min(max, Math.round(Number(value) || 0)));
}

export async function recordAiOperationalMetric(metric: AiOperationalMetric) {
  try {
    const latencyMs = safeCounter(metric.latencyMs, 120_000);
    const providerKey = providerMetricKey(metric.provider);
    const bucket = latencyBucket(latencyMs);
    const inputTokens = safeCounter(metric.usage?.inputTokens);
    const outputTokens = safeCounter(metric.usage?.outputTokens);
    const totalTokens = safeCounter(metric.usage?.totalTokens);
    const budgetEnvelopeAedMicros = safeCounter(metric.usage?.budgetEnvelopeAedMicros, 100_000_000);
    const ref = db.collection("ai_health_daily").doc(metricDay());
    await ref.set({
      day: metricDay(),
      totalRequests: FieldValue.increment(1),
      liveSuccesses: FieldValue.increment(metric.outcome === "live-success" ? 1 : 0),
      degradedFallbacks: FieldValue.increment(metric.outcome === "degraded-fallback" ? 1 : 0),
      functionErrors: FieldValue.increment(metric.outcome === "function-error" ? 1 : 0),
      providerFailures: FieldValue.increment(safeCounter(metric.providerFailureCount)),
      invalidOutputs: FieldValue.increment(safeCounter(metric.invalidOutputCount)),
      redactionsApplied: FieldValue.increment(safeCounter(metric.redactionCount)),
      quotaCharged: FieldValue.increment(metric.quotaCharged ? 1 : 0),
      quotaReleased: FieldValue.increment(metric.quotaCharged ? 0 : 1),
      inputTokens: FieldValue.increment(inputTokens),
      outputTokens: FieldValue.increment(outputTokens),
      totalTokens: FieldValue.increment(totalTokens),
      budgetEnvelopeAedMicros: FieldValue.increment(budgetEnvelopeAedMicros),
      tokenSamples: FieldValue.increment(totalTokens > 0 ? 1 : 0),
      tokenBudgetBreaches: FieldValue.increment(
        totalTokens > AI_OPERATIONAL_SLO.maxTotalTokensPerChatRequest
          || outputTokens > AI_OPERATIONAL_SLO.maxOutputTokensPerResponse
          ? 1
          : 0,
      ),
      costEnvelopeBreaches: FieldValue.increment(
        budgetEnvelopeAedMicros > AI_OPERATIONAL_SLO.maxBudgetEnvelopeAedMicrosPerChatRequest ? 1 : 0,
      ),
      latencyTotalMs: FieldValue.increment(latencyMs),
      latencySamples: FieldValue.increment(1),
      [bucket]: FieldValue.increment(1),
      [`${providerKey}Requests`]: FieldValue.increment(1),
      [`${providerKey}LiveSuccesses`]: FieldValue.increment(metric.outcome === "live-success" ? 1 : 0),
      [`${providerKey}TotalTokens`]: FieldValue.increment(totalTokens),
      [`${metric.capability}Requests`]: FieldValue.increment(1),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
  } catch (error) {
    console.error("[ai-observability] Aggregate metric write failed", {
      capability: metric.capability,
      outcome: metric.outcome,
      error: error instanceof Error ? error.message : "unknown",
    });
  }
}

/**
 * Scale options for Cloud Functions.
 *
 * minInstances is behind CRITICAL_FN_MIN_INSTANCES (default 0) because reserved
 * instances incur a 24/7 monthly cost even when idle. Leave the param at 0 until
 * an owner explicitly accepts that cost. maxInstances is always applied so one
 * noisy function cannot consume the project quota.
 */
import { defineInt } from "firebase-functions/params";

/** Default ceiling for v2 functions unless a function sets its own maxInstances. */
export const DEFAULT_MAX_INSTANCES = 40;

/** Tight ceiling for the small set of always-on critical callables. */
export const CRITICAL_MAX_INSTANCES = 20;

/**
 * Reserved instances for critical user-facing callables.
 * Default 0: no idle cost. Set to 1 only after the monthly cost is accepted.
 */
export const criticalMinInstances = defineInt("CRITICAL_FN_MIN_INSTANCES", { default: 0 });

export const criticalCallableOptions = {
  cors: true,
  region: "europe-west3" as const,
  enforceAppCheck: true,
  minInstances: criticalMinInstances,
  maxInstances: CRITICAL_MAX_INSTANCES,
};

export function withCriticalScale<T extends Record<string, unknown>>(options: T): T & {
  minInstances: typeof criticalMinInstances;
  maxInstances: number;
} {
  return {
    ...options,
    minInstances: criticalMinInstances,
    maxInstances: typeof options.maxInstances === "number" ? options.maxInstances : CRITICAL_MAX_INSTANCES,
  };
}

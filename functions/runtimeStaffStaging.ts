// Staff OS staging-only Functions entrypoint.
//
// The staging workflow temporarily points functions/package.json at the
// compiled version of this file. It intentionally exports only the Staff OS
// backend surface so staging does not require unrelated production secrets
// (IoT, AI, payments, messaging, etc.). The canonical production entrypoint
// remains functions/lib/runtimeAll.js.

export * from "./staffOperatingSystem";
export * from "./staffInventoryEngine";
export * from "./staffPdfReporting";

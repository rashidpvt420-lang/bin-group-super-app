// packages/shared/src/index.ts
// console.log("⚡ [SHARED-LOAD] Exported Firebase."); (DISABLED TO PREVENT POISONING)
// export * from './lib/firebase';
export * from './utils/uaePricingEngine';
export * from './utils/buildingHealthEngine';
export * from './utils/predictiveIntelligence';
export * from './geo/geoAnchor';
console.log("⚡ [SHARED-LOAD] Exported Pricing Engine.");
export * from './utils/RateLimiter';
console.log("⚡ [SHARED-LOAD] Exported Rate Limiter.");
export * from './theme/binGroupTheme';
console.log("⚡ [SHARED-LOAD] Exported Theme Tokens.");
export * from './components/SovereignAIChat';
export * from './context/AIContext';
export * from './lib/notificationService';
export * from './utils/DesignStudioPricingEngine';
export * from './context/LanguageContext';
console.log("⚡ [SHARED-LOAD] Evaluation Complete.");

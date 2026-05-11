// src/shared-exports.ts
// This file acts as a compatibility layer to replace the deprecated @bin/shared package
// by re-exporting all localized src modules.

export * from './utils/uaePricingEngine_v2';
export * from './utils/uaePricingMatrix2026';
export * from './utils/calculateUaeQuote2026';
export * from './utils/buildingHealthEngine';
export * from './utils/predictiveIntelligence';
export * from './utils/geoAnchor';
export * from './utils/RateLimiter';
export * from './theme/binGroupTheme';
export * from './components/SovereignAIChat';
export * from './context/AIContext';
export * from './lib/notificationService';
export * from './utils/DesignStudioPricingEngine';
export * from './context/LanguageContext';
export { RoleProvider as AuthProvider, useRole } from './context/RoleContext';
export * from './components/CeoContactButtons';
export * from './components/SovereignSupportChat';
export * from './components/SovereignAlertHandler';
export * from './utils/auditLogger';
export * from './lib/firebase';

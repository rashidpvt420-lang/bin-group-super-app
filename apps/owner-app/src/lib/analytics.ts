// apps/owner-app/src/lib/analytics.ts
import { functions, httpsCallable } from './firebase';

/**
 * Telemetry Implementation (V1.12)
 * Purpose: Track institutional conversion funnel from Landing to Activation.
 */
export const trackEvent = async (metric: string, purpose: string, metadata: any = {}) => {
    try {
        const recordClientTelemetry = httpsCallable(functions, 'recordClientTelemetry');
        await recordClientTelemetry({
            kind: 'ANALYTICS',
            eventType: metric,
            purpose,
            metadata: {
                ...metadata,
                userAgent: navigator.userAgent,
                viewport: `${window.innerWidth}x${window.innerHeight}`
            }
        });
        
    } catch (e) {
        console.error("Telemetry failure:", e);
    }
};

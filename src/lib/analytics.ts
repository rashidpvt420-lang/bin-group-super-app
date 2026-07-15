import { functions, httpsCallable } from './firebase';

/**
 * Telemetry Implementation (V1.12)
 * Purpose: Track institutional conversion funnel from Landing to Activation.
 */
export const trackEvent = async (metric: string, purpose: string, metadata: any = {}) => {
    try {
        const recordTelemetry = httpsCallable(functions, 'recordClientTelemetry');
        await recordTelemetry({
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

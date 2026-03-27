// apps/owner-app/src/lib/analytics.ts
import { db } from './firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';

/**
 * Telemetry Implementation (V1.12)
 * Purpose: Track institutional conversion funnel from Landing to Activation.
 */
export const trackEvent = async (metric: string, purpose: string, metadata: any = {}) => {
    try {
        // Using "analytics_events" as specified in CTO requirements
        await addDoc(collection(db, 'analytics_events'), {
            metric,
            purpose,
            timestamp: serverTimestamp(),
            metadata: {
                ...metadata,
                userAgent: navigator.userAgent,
                viewport: `${window.innerWidth}x${window.innerHeight}`
            }
        });
        console.log(`[Telemetry] ${metric} tracked.`);
    } catch (e) {
        console.error("Telemetry failure:", e);
    }
};

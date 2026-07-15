import { db, collection, query, where, getDocs, limit, functions, httpsCallable } from '../lib/firebase';

/**
 * Public Security Registry - Scaling Protection for UAE Launch.
 * Tracks anonymous quote generations, OTP requests and blocked attempts.
 */
export const logSecurityEvent = async (type: 'QUOTE_LIMIT' | 'OTP_THROTTLE' | 'BOT_DETECTION' | 'DUPLICATE_PROPERTY', metadata: any) => {
    try {
        const recordTelemetry = httpsCallable(functions, 'recordClientTelemetry');
        await recordTelemetry({
            kind: 'SECURITY',
            eventType: type,
            metadata,
        });
    } catch (e) {
        console.error('Security Logging Failed:', e);
    }
};

/**
 * Checks for duplicate properties globally in the leads/contracts collections.
 */
export const checkPropertyUniqueness = async (unitNumber: string, community: string): Promise<boolean> => {
    const q1 = query(collection(db, 'active_contracts'), 
        where('propertyInfo.unitNumber', '==', unitNumber),
        where('propertyInfo.community', '==', community),
        limit(1)
    );
    const snap1 = await getDocs(q1);
    
    if (!snap1.empty) return false;

    const q2 = query(collection(db, 'onboarding_leads'), 
        where('propertyInfo.unitNumber', '==', unitNumber),
        where('propertyInfo.community', '==', community),
        limit(1)
    );
    const snap2 = await getDocs(q2);
    
    return snap2.empty;
};

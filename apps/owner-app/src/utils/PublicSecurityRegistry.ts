import { functions, httpsCallable } from '../lib/firebase';

/**
 * Public Security Registry - Scaling Protection for UAE Launch.
 * Tracks anonymous quote generations, OTP requests and blocked attempts.
 */
export const logSecurityEvent = async (type: 'QUOTE_LIMIT' | 'OTP_THROTTLE' | 'BOT_DETECTION' | 'DUPLICATE_PROPERTY', metadata: any) => {
    try {
        const recordClientTelemetry = httpsCallable(functions, 'recordClientTelemetry');
        await recordClientTelemetry({
            kind: 'SECURITY',
            eventType: type,
            purpose: 'PUBLIC_OWNER_ONBOARDING_GUARD',
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
    const check = httpsCallable(functions, 'checkPropertyUniqueness');
    const result = await check({ unitNumber, community });
    return (result.data as { available?: boolean })?.available === true;
};

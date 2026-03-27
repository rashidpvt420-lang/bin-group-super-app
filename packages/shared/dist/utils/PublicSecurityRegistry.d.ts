/**
 * Public Security Registry - Scaling Protection for UAE Launch.
 * Tracks anonymous quote generations, OTP requests and blocked attempts.
 */
export declare const logSecurityEvent: (type: "QUOTE_LIMIT" | "OTP_THROTTLE" | "BOT_DETECTION" | "DUPLICATE_PROPERTY", metadata: any) => Promise<void>;
/**
 * Checks for duplicate properties globally in the leads/contracts collections.
 */
export declare const checkPropertyUniqueness: (unitNumber: string, community: string) => Promise<boolean>;

/**
 * Simple client-side Rate Limiter for Abu Dhabi/Dubai traffic hardening.
 * Prevents bot-driven quote generation and anonymous session abuse.
 */
declare class RateLimiter {
    private static storageKey;
    static checkLimit(action: string, limit: number, windowMs: number): {
        allowed: boolean;
        remaining: number;
    };
    static getRemaining(action: string, limit: number, windowMs: number): number;
}
export default RateLimiter;

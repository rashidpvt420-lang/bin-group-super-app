"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * Simple client-side Rate Limiter for Abu Dhabi/Dubai traffic hardening.
 * Prevents bot-driven quote generation and anonymous session abuse.
 */
class RateLimiter {
    static storageKey = 'bg_rate_limit_data';
    static checkLimit(action, limit, windowMs) {
        const now = Date.now();
        const rawData = localStorage.getItem(this.storageKey);
        const data = rawData ? JSON.parse(rawData) : {};
        if (!data[action])
            data[action] = [];
        // Filter out timestamps outside the window
        data[action] = data[action].filter((timestamp) => now - timestamp < windowMs);
        if (data[action].length >= limit) {
            return { allowed: false, remaining: 0 };
        }
        data[action].push(now);
        localStorage.setItem(this.storageKey, JSON.stringify(data));
        return { allowed: true, remaining: limit - data[action].length };
    }
    static getRemaining(action, limit, windowMs) {
        const now = Date.now();
        const rawData = localStorage.getItem(this.storageKey);
        if (!rawData)
            return limit;
        const data = JSON.parse(rawData);
        if (!data[action])
            return limit;
        const currentWindow = data[action].filter((timestamp) => now - timestamp < windowMs);
        return Math.max(0, limit - currentWindow.length);
    }
}
exports.default = RateLimiter;

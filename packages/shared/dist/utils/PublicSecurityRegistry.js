"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.checkPropertyUniqueness = exports.logSecurityEvent = void 0;
const firestore_1 = require("firebase/firestore");
const firebase_1 = require("../lib/firebase");
/**
 * Public Security Registry - Scaling Protection for UAE Launch.
 * Tracks anonymous quote generations, OTP requests and blocked attempts.
 */
const logSecurityEvent = async (type, metadata) => {
    try {
        await (0, firestore_1.addDoc)((0, firestore_1.collection)(firebase_1.db, 'security_audit_logs'), {
            type,
            metadata,
            timestamp: (0, firestore_1.serverTimestamp)(),
            severity: type === 'BOT_DETECTION' ? 'CRITICAL' : 'WARNING'
        });
    }
    catch (e) {
        console.error('Security Logging Failed:', e);
    }
};
exports.logSecurityEvent = logSecurityEvent;
/**
 * Checks for duplicate properties globally in the leads/contracts collections.
 */
const checkPropertyUniqueness = async (unitNumber, community) => {
    const q1 = (0, firestore_1.query)((0, firestore_1.collection)(firebase_1.db, 'active_contracts'), (0, firestore_1.where)('propertyInfo.unitNumber', '==', unitNumber), (0, firestore_1.where)('propertyInfo.community', '==', community), (0, firestore_1.limit)(1));
    const snap1 = await (0, firestore_1.getDocs)(q1);
    if (!snap1.empty)
        return false;
    const q2 = (0, firestore_1.query)((0, firestore_1.collection)(firebase_1.db, 'onboarding_leads'), (0, firestore_1.where)('propertyInfo.unitNumber', '==', unitNumber), (0, firestore_1.where)('propertyInfo.community', '==', community), (0, firestore_1.limit)(1));
    const snap2 = await (0, firestore_1.getDocs)(q2);
    return snap2.empty;
};
exports.checkPropertyUniqueness = checkPropertyUniqueness;

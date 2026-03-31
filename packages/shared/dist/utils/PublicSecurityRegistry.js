import { collection, addDoc, serverTimestamp, query, where, getDocs, limit } from 'firebase/firestore';
import { db } from '../lib/firebase';
/**
 * Public Security Registry - Scaling Protection for UAE Launch.
 * Tracks anonymous quote generations, OTP requests and blocked attempts.
 */
export const logSecurityEvent = async (type, metadata) => {
    try {
        await addDoc(collection(db, 'security_audit_logs'), {
            type,
            metadata,
            timestamp: serverTimestamp(),
            severity: type === 'BOT_DETECTION' ? 'CRITICAL' : 'WARNING'
        });
    }
    catch (e) {
        console.error('Security Logging Failed:', e);
    }
};
/**
 * Checks for duplicate properties globally in the leads/contracts collections.
 */
export const checkPropertyUniqueness = async (unitNumber, community) => {
    const q1 = query(collection(db, 'active_contracts'), where('propertyInfo.unitNumber', '==', unitNumber), where('propertyInfo.community', '==', community), limit(1));
    const snap1 = await getDocs(q1);
    if (!snap1.empty)
        return false;
    const q2 = query(collection(db, 'onboarding_leads'), where('propertyInfo.unitNumber', '==', unitNumber), where('propertyInfo.community', '==', community), limit(1));
    const snap2 = await getDocs(q2);
    return snap2.empty;
};

import { db, messaging, functions } from './firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { getToken } from 'firebase/messaging';
import { httpsCallable } from 'firebase/functions';

export interface RoleNotification {
    userId: string;
    role: 'owner' | 'tenant' | 'technician' | 'broker' | 'admin';
    title: string;
    body: string;
    type: string;
    link?: string;
    data?: Record<string, any>;
    language?: 'en' | 'ar';
}

/**
 * [SOVEREIGN NOTIFICATION ENGINE]
 * Dispatches a notification record to Firestore.
 * A background Cloud Function will route this to the user's active FCM tokens.
 * Multi-device and language-aware.
 */
export async function sendRoleNotification(params: RoleNotification) {
    try {
        await addDoc(collection(db, 'notifications'), {
            ...params,
            status: 'PENDING',
            read: false,
            createdAt: serverTimestamp(),
            source: 'SYSTEM_PROTOCOL_V7_MULTI_DEVICE'
        });
        console.log(`[NOTIFY] Payload anchored for UID: ${params.userId} (${params.type}) -> Route: ${params.link || 'none'}`);
    } catch (err) {
        console.error("🚨 [NOTIFY] Critical Handshake Failure:", err);
    }
}

/**
 * Full 5-Role Event Dispatches
 */
export const NotificationEvents = {
    OWNER: {
        ONBOARDING_APPROVED: (userId: string, propertyName: string) => 
            sendRoleNotification({ userId, role: 'owner', title: 'ONBOARDING APPROVED', body: `Asset ${propertyName} is now fully active in your portfolio.`, type: 'ONBOARDING_VERIFIED', link: '/dashboard' }),
        PAYMENT_VERIFIED: (userId: string, amount: number) =>
            sendRoleNotification({ userId, role: 'owner', title: 'PAYMENT SECURED', body: `Mobilization deposit (AED ${amount}) verified. Operations commencing.`, type: 'PAYMENT_VERIFIED', link: '/financials' }),
        QUOTE_READY: (userId: string, propertyName: string, ticketId: string) => 
            sendRoleNotification({ userId, role: 'owner', title: 'QUOTE AWAITING APPROVAL', body: `A new maintenance quote for ${propertyName} requires your authorization.`, type: 'QUOTE_APPROVAL', link: `/dashboard`, data: { ticketId } }),
        REVISED_QUOTE_SENT: (userId: string, propertyName: string) =>
            sendRoleNotification({ userId, role: 'owner', title: 'QUOTE REVISED', body: `A revised quote for ${propertyName} has been submitted.`, type: 'QUOTE_REVISED', link: `/dashboard` }),
        SLA_BREACH: (userId: string, ticketId: string) =>
            sendRoleNotification({ userId, role: 'owner', title: 'SLA BREACH ALERT', body: `Service Level Agreement breached for Mission #${ticketId}. Credit protocol initiated.`, type: 'SLA_BREACH', link: '/reports' }),
        RENEWAL_REMINDER: (userId: string, propertyName: string) =>
            sendRoleNotification({ userId, role: 'owner', title: 'CONTRACT RENEWAL', body: `Your service contract for ${propertyName} is expiring within 60 days.`, type: 'CONTRACT_RENEWAL', link: '/dashboard' }),
        URGENT_ISSUE: (userId: string, propertyName: string, category: string) =>
            sendRoleNotification({ userId, role: 'owner', title: 'URGENT MISSION DETECTED', body: `A critical ${category} fault was reported at ${propertyName}.`, type: 'URGENT_ISSUE', link: '/dashboard' }),
        MONTHLY_REPORT: (userId: string) =>
            sendRoleNotification({ userId, role: 'owner', title: 'EXECUTIVE REPORT READY', body: `Your monthly institutional portfolio yield report is available.`, type: 'REPORT_READY', link: '/analytics/executive' }),
        DESIGN_STUDIO_NOC: (userId: string, tenantName: string, zone: string) =>
            sendRoleNotification({ userId, role: 'owner', title: 'DESIGN STUDIO: NOC REQUIRED', body: `${tenantName} has submitted an AI redesign concept for ${zone}. Approval required.`, type: 'DESIGN_NOC', link: '/notifications' }),
    },
    TENANT: {
        TICKET_RECEIVED: (userId: string, ticketId: string) =>
            sendRoleNotification({ userId, role: 'tenant', title: 'MISSION ACKNOWLEDGED', body: `Request #${ticketId} received. Awaiting specialist dispatch.`, type: 'TICKET_RECEIVED', link: '/tenant' }),
        TECH_ASSIGNED: (userId: string, techName: string) =>
            sendRoleNotification({ userId, role: 'tenant', title: 'SPECIALIST ASSIGNED', body: `${techName} has been assigned to your request.`, type: 'TECH_ASSIGNED', link: '/tenant' }),
        TECH_EN_ROUTE: (userId: string) =>
            sendRoleNotification({ userId, role: 'tenant', title: 'TECHNICIAN EN ROUTE', body: 'Your assigned specialist is currently in transit to your property.', type: 'TECH_EN_ROUTE', link: '/tenant' }),
        JOB_COMPLETED: (userId: string, ticketId: string) =>
            sendRoleNotification({ userId, role: 'tenant', title: 'MISSION COMPLETED', body: `Request #${ticketId} has been successfully resolved.`, type: 'JOB_COMPLETED', link: '/tenant' }),
        MOVE_REMINDER: (userId: string, type: 'IN' | 'OUT', date: string) =>
            sendRoleNotification({ userId, role: 'tenant', title: `MOVE-${type} PROTOCOL`, body: `Reminder: Your scheduled move-${type.toLowerCase()} date is ${date}.`, type: 'MOVE_REMINDER', link: '/tenant' }),
        DESIGN_APPROVED: (userId: string, zone: string) =>
            sendRoleNotification({ userId, role: 'tenant', title: 'DESIGN STUDIO: APPROVED', body: `Your owner has granted NOC for the ${zone} redesign. You may now proceed with payment.`, type: 'DESIGN_APPROVED', link: '/design-studio' }),
    },
};

export async function requestNotificationPermission(vapidKey?: string) {
    if (!messaging || typeof Notification === 'undefined') return null;
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') return null;
    return getToken(messaging, vapidKey ? { vapidKey } : undefined);
}

export const notifyRole = httpsCallable(functions, 'notifyRole');

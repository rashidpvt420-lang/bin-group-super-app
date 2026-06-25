/**
 * BIN GROUP — Sovereign Notification Service
 * Notification creation is routed through a callable Cloud Function so browser clients
 * cannot directly create arbitrary push-triggering Firestore documents.
 */

import {
    db, collection, query, where, onSnapshot, updateDoc, doc, orderBy, limit,
    functions, httpsCallable
} from '../lib/firebase';

export type NotificationType = string;

export interface BinNotification {
    id?: string;
    recipientId: string;
    recipientRole: string;
    type: NotificationType;
    title: string;
    body: string;
    ticketId?: string;
    read: boolean;
    createdAt: any;
    metadata?: Record<string, any>;
    link?: string;
}

type NotificationCreatePayload = Omit<BinNotification, 'id' | 'read' | 'createdAt'>;

const createNotificationCallable = httpsCallable<NotificationCreatePayload, { notificationIds: string[]; recipientCount: number }>(
    functions,
    'createNotification'
);

const roleHome = (role?: string) => {
    switch (String(role || '').toLowerCase()) {
        case 'tenant': return '/tenant/dashboard';
        case 'technician': return '/technician/dashboard';
        case 'broker': return '/broker/dashboard';
        case 'owner': return '/owner/dashboard';
        case 'admin': return '/admin/dashboard';
        default: return '/notifications';
    }
};

const technicianJobLink = (ticketId: string) => `/technician/job/${ticketId}`;
const tenantTicketLink = (ticketId: string) => ticketId ? `/tenant/ticket/${ticketId}` : '/tenant/tickets';
const ownerTicketLink = (ticketId: string) => ticketId ? `/owner/ticket/${ticketId}` : '/owner/tickets';
const adminTicketLink = (ticketId: string) => ticketId ? `/admin/tickets?ticketId=${encodeURIComponent(ticketId)}` : '/admin/tickets';
const adminPaymentLink = (paymentId: string) => paymentId ? `/admin/payments?paymentId=${encodeURIComponent(paymentId)}` : '/admin/payments';

// ─── Send a notification through the server-side gatekeeper ──────────────────
export async function sendNotification(payload: NotificationCreatePayload) {
    try {
        await createNotificationCallable({
            ...payload,
            link: payload.link || roleHome(payload.recipientRole),
            metadata: payload.metadata || {},
        });
    } catch (err) {
        console.error('[Notifications] Failed to create notification:', err);
    }
}

// ─── Notify admin group ──────────────────────────────────────────────────────
export async function notifyAdmins(payload: Omit<BinNotification, 'id' | 'read' | 'createdAt' | 'recipientId' | 'recipientRole'>) {
    await sendNotification({
        ...payload,
        recipientId: 'ADMIN_GROUP',
        recipientRole: 'admin',
        link: payload.link || adminTicketLink(payload.ticketId || ''),
    });
}

// ─── Notify all on-duty technicians for SOS/Emergency ────────────────────────
export async function notifyOnDutyTechnicians(payload: Omit<BinNotification, 'id' | 'read' | 'createdAt' | 'recipientId' | 'recipientRole'>) {
    await sendNotification({
        ...payload,
        recipientId: 'ON_DUTY_TECHNICIANS',
        recipientRole: 'technician',
        link: payload.ticketId ? technicianJobLink(payload.ticketId) : '/technician/jobs',
    });
}

// ─── General 5-profile notification event facade ─────────────────────────────
export const NotificationEvents = {
    OWNER: {
        DESIGN_STUDIO_NOC: (userId: string, tenantName: string, zone: string) =>
            sendNotification({
                recipientId: userId,
                recipientRole: 'owner',
                type: 'DESIGN_NOC',
                title: 'DESIGN STUDIO: NOC REQUIRED',
                body: `${tenantName} submitted an AI redesign concept for ${zone}. Approval required.`,
                link: '/owner/design-studio',
                metadata: { tenantName, zone }
            }),
        ONBOARDING_APPROVED: (userId: string, propertyName: string) =>
            sendNotification({
                recipientId: userId,
                recipientRole: 'owner',
                type: 'ONBOARDING_VERIFIED',
                title: 'ONBOARDING APPROVED',
                body: `Asset ${propertyName} is now active in your portfolio.`,
                link: '/owner/dashboard',
                metadata: { propertyName }
            }),
        PAYMENT_VERIFIED: (userId: string, amount: number) =>
            sendNotification({
                recipientId: userId,
                recipientRole: 'owner',
                type: 'PAYMENT_VERIFIED',
                title: 'PAYMENT SECURED',
                body: `Mobilization deposit AED ${amount} verified. Operations commencing.`,
                link: '/owner/financials',
                metadata: { amount }
            }),
        RENT_PAYMENT_SUBMITTED: (userId: string, amount: number, propertyName: string, paymentId: string) =>
            sendNotification({
                recipientId: userId,
                recipientRole: 'owner',
                type: 'OWNER_RENT_PAYMENT_SUBMITTED',
                title: 'RENT PAYMENT SENT FOR VERIFICATION',
                body: `AED ${Number(amount || 0).toLocaleString('en-AE')} rent payment for ${propertyName || 'your property'} is pending admin verification.`,
                link: '/owner/dashboard',
                metadata: { amount, propertyName, paymentId }
            }),
        QUOTE_READY: (userId: string, propertyName: string, ticketId: string) =>
            sendNotification({
                recipientId: userId,
                recipientRole: 'owner',
                type: 'QUOTE_APPROVAL',
                title: 'QUOTE AWAITING APPROVAL',
                body: `A new maintenance quote for ${propertyName} requires authorization.`,
                ticketId,
                link: ownerTicketLink(ticketId),
                metadata: { propertyName, ticketId }
            }),
    },
    TENANT: {
        DESIGN_APPROVED: (userId: string, zone: string) =>
            sendNotification({
                recipientId: userId,
                recipientRole: 'tenant',
                type: 'DESIGN_APPROVED',
                title: 'DESIGN STUDIO: APPROVED',
                body: `Your owner has granted NOC for the ${zone} redesign. You may proceed with payment.`,
                link: '/tenant/design-studio',
                metadata: { zone }
            }),
        TICKET_RECEIVED: (userId: string, ticketId: string) =>
            sendNotification({
                recipientId: userId,
                recipientRole: 'tenant',
                type: 'TICKET_RECEIVED',
                title: 'MISSION ACKNOWLEDGED',
                body: `Request #${ticketId} received. Awaiting specialist dispatch.`,
                ticketId,
                link: tenantTicketLink(ticketId)
            }),
        TECH_ASSIGNED: (userId: string, techName: string) =>
            sendNotification({
                recipientId: userId,
                recipientRole: 'tenant',
                type: 'TECH_ASSIGNED',
                title: 'SPECIALIST ASSIGNED',
                body: `${techName} has been assigned to your request.`,
                link: '/tenant/tickets',
                metadata: { techName }
            }),
    },
    TECH: {
        NEW_JOB: (userId: string, propertyName: string, ticketId: string) =>
            sendNotification({
                recipientId: userId,
                recipientRole: 'technician',
                type: 'NEW_JOB',
                title: 'NEW MISSION ASSIGNED',
                body: `Urgent request received for ${propertyName}. View node for coordinates.`,
                ticketId,
                link: technicianJobLink(ticketId),
                metadata: { propertyName }
            }),
    },
    BROKER: {
        LEAD_ACCEPTED: (userId: string, leadName: string) =>
            sendNotification({
                recipientId: userId,
                recipientRole: 'broker',
                type: 'LEAD_ACCEPTED',
                title: 'LEAD ACCEPTED',
                body: `Your referral for ${leadName} has been accepted into the pipeline.`,
                link: '/broker/referrals',
                metadata: { leadName }
            }),
    },
    ADMIN: {
        NEW_ONBOARDING: (propertyName: string) =>
            notifyAdmins({
                type: 'NEW_ONBOARDING',
                title: 'NEW ASSET INTAKE',
                body: `A new asset (${propertyName}) requires verification.`,
                link: '/admin/vault',
                metadata: { propertyName }
            }),
        OWNER_RENT_PAYMENT_SUBMITTED: (ownerId: string, propertyName: string, amount: number, paymentId: string) =>
            notifyAdmins({
                type: 'OWNER_RENT_PAYMENT_SUBMITTED',
                title: 'OWNER RENT PAYMENT NEEDS VERIFICATION',
                body: `Owner ${ownerId} submitted AED ${Number(amount || 0).toLocaleString('en-AE')} rent payment proof for ${propertyName || 'a property'}.`,
                link: adminPaymentLink(paymentId),
                metadata: { ownerId, propertyName, amount, paymentId }
            }),
        EMERGENCY_TICKET: (propertyName: string, category: string) =>
            notifyAdmins({
                type: 'EMERGENCY_SOS',
                title: 'CRITICAL SOS DETECTED',
                body: `Emergency ${category} issue at ${propertyName}. Ensure immediate dispatch.`,
                link: '/admin/tickets',
                metadata: { propertyName, category }
            }),
    }
};

// ─── Convenience wrappers for lifecycle events ────────────────────────────────
export async function notifyTicketCreated(ticketId: string, tenantName: string, category: string, priority: string) {
    await notifyAdmins({
        type: 'TICKET_CREATED',
        title: `New ${priority.toUpperCase()} Request`,
        body: `${tenantName} submitted a ${category} complaint. Requires assignment.`,
        ticketId,
        link: adminTicketLink(ticketId),
        metadata: { category, priority }
    });
}

export async function notifyTechnicianAssigned(ticketId: string, technicianId: string, propertyName: string, category: string) {
    await sendNotification({
        recipientId: technicianId,
        recipientRole: 'technician',
        type: 'TICKET_ASSIGNED',
        title: 'New Job Assigned',
        body: `You have been assigned a ${category} job at ${propertyName}.`,
        ticketId,
        link: technicianJobLink(ticketId),
        metadata: { propertyName, category }
    });
}

export async function notifyStatusUpdate(ticketId: string, tenantId: string, newStatus: string) {
    const statusLabels: Record<string, string> = {
        EN_ROUTE: 'Your technician is on the way.',
        on_the_way: 'Your technician is on the way.',
        ARRIVED: 'Your technician has arrived.',
        arrived: 'Your technician has arrived.',
        IN_PROGRESS: 'Work has started on your request.',
        in_progress: 'Work has started on your request.',
        WAITING_PARTS: 'Waiting for parts. You will be updated shortly.',
        waiting_parts: 'Waiting for parts. You will be updated shortly.',
    };
    await sendNotification({
        recipientId: tenantId,
        recipientRole: 'tenant',
        type: 'STATUS_UPDATE',
        title: 'Request Update',
        body: statusLabels[newStatus] || `Your request status changed to ${newStatus.replace('_', ' ')}.`,
        ticketId,
        link: tenantTicketLink(ticketId),
        metadata: { newStatus }
    });
}

export async function notifyCompletionRequest(ticketId: string, tenantId: string, techName: string) {
    await sendNotification({
        recipientId: tenantId,
        recipientRole: 'tenant',
        type: 'COMPLETION_REQUEST',
        title: 'Work Completed — Your Approval Needed',
        body: `${techName} has completed the job. Please review and approve or reject.`,
        ticketId,
        link: tenantTicketLink(ticketId),
    });
}

export async function notifyTenantApproved(ticketId: string, tenantName: string) {
    await notifyAdmins({
        type: 'TENANT_APPROVED',
        title: 'Job Approved & Closed',
        body: `${tenantName} approved the completion. Ticket is now CLOSED.`,
        ticketId,
        link: adminTicketLink(ticketId),
    });
}

export async function notifyTenantRejected(ticketId: string, tenantName: string, reason: string) {
    await notifyAdmins({
        type: 'TENANT_REJECTED',
        title: '⚠️ Job Rejected — Dispute Opened',
        body: `${tenantName} rejected the completion. Reason: ${reason}`,
        ticketId,
        link: adminTicketLink(ticketId),
        metadata: { reason }
    });
}

export async function notifyEmergency(ticketId: string, tenantName: string, propertyName: string, unitNumber: string) {
    const sosPayload = {
        type: 'EMERGENCY_SOS' as NotificationType,
        title: '🚨 EMERGENCY SOS',
        body: `${tenantName} in Unit ${unitNumber}, ${propertyName} has declared an emergency. Respond immediately.`,
        ticketId,
        link: adminTicketLink(ticketId),
        metadata: { propertyName, unitNumber }
    };
    await Promise.all([
        notifyAdmins(sosPayload),
        notifyOnDutyTechnicians({ ...sosPayload, link: technicianJobLink(ticketId) })
    ]);
}

// ─── Real-time notification listener hook ────────────────────────────────────
export function subscribeToNotifications(
    userId: string,
    onUpdate: (notifications: BinNotification[]) => void,
    maxItems = 20
): () => void {
    const q = query(
        collection(db, 'notifications'),
        where('recipientId', '==', userId),
        orderBy('createdAt', 'desc'),
        limit(maxItems)
    );
    return onSnapshot(q, (snap) => {
        onUpdate(snap.docs.map(d => ({ id: d.id, ...d.data() } as BinNotification)));
    }, (err) => console.warn('[Notifications] Listener error:', err));
}

export async function markNotificationRead(notificationId: string) {
    try {
        await updateDoc(doc(db, 'notifications', notificationId), { read: true });
    } catch (err) {
        console.error('[Notifications] markRead failed:', err);
    }
}

/**
 * BIN GROUP — Sovereign Notification Service
 * Phase 9A: In-app notifications with Firestore backend.
 * FCM push is wired but gracefully falls back if token is unavailable.
 */

import {
    db, collection, addDoc, serverTimestamp,
    query, where, onSnapshot, updateDoc, doc, getDocs, orderBy, limit
} from '../lib/firebase';

export type NotificationType =
    | 'TICKET_CREATED'
    | 'TICKET_ASSIGNED'
    | 'STATUS_UPDATE'
    | 'COMPLETION_REQUEST'
    | 'TENANT_APPROVED'
    | 'TENANT_REJECTED'
    | 'EMERGENCY_SOS'
    | 'CHAT_MESSAGE';

export interface BinNotification {
    id?: string;
    recipientId: string;       // UID of the target user
    recipientRole: string;     // 'admin' | 'tenant' | 'technician'
    type: NotificationType;
    title: string;
    body: string;
    ticketId?: string;
    read: boolean;
    createdAt: any;
    metadata?: Record<string, any>;
}

// ─── Send a notification to a specific user ──────────────────────────────────
export async function sendNotification(payload: Omit<BinNotification, 'id' | 'read' | 'createdAt'>) {
    try {
        await addDoc(collection(db, 'notifications'), {
            ...payload,
            read: false,
            createdAt: serverTimestamp(),
        });
    } catch (err) {
        console.error('[Notifications] Failed to write notification:', err);
    }
}

// ─── Notify admin(s) ─────────────────────────────────────────────────────────
export async function notifyAdmins(payload: Omit<BinNotification, 'id' | 'read' | 'createdAt' | 'recipientId' | 'recipientRole'>) {
    try {
        const adminSnap = await getDocs(query(collection(db, 'users'), where('role', 'in', ['admin', 'super_admin', 'manager'])));
        const writes = adminSnap.docs.map(d =>
            addDoc(collection(db, 'notifications'), {
                ...payload,
                recipientId: d.id,
                recipientRole: 'admin',
                read: false,
                createdAt: serverTimestamp(),
            })
        );
        await Promise.all(writes);
    } catch (err) {
        console.error('[Notifications] Admin broadcast failed:', err);
    }
}

// ─── Notify all on-duty technicians (for SOS/Emergency) ──────────────────────
export async function notifyOnDutyTechnicians(payload: Omit<BinNotification, 'id' | 'read' | 'createdAt' | 'recipientId' | 'recipientRole'>) {
    try {
        const techSnap = await getDocs(query(
            collection(db, 'users'),
            where('role', '==', 'technician'),
            where('onDuty', '==', true)
        ));
        const writes = techSnap.docs.map(d =>
            addDoc(collection(db, 'notifications'), {
                ...payload,
                recipientId: d.id,
                recipientRole: 'technician',
                read: false,
                createdAt: serverTimestamp(),
            })
        );
        await Promise.all(writes);
    } catch (err) {
        console.error('[Notifications] On-duty tech broadcast failed:', err);
    }
}

// ─── Convenience wrappers for lifecycle events ────────────────────────────────

/** Tenant submitted a new ticket — notify admins */
export async function notifyTicketCreated(ticketId: string, tenantName: string, category: string, priority: string) {
    await notifyAdmins({
        type: 'TICKET_CREATED',
        title: `New ${priority.toUpperCase()} Request`,
        body: `${tenantName} submitted a ${category} complaint. Requires assignment.`,
        ticketId,
        metadata: { category, priority }
    });
}

/** Admin assigned a technician — notify the technician */
export async function notifyTechnicianAssigned(ticketId: string, technicianId: string, propertyName: string, category: string) {
    await sendNotification({
        recipientId: technicianId,
        recipientRole: 'technician',
        type: 'TICKET_ASSIGNED',
        title: 'New Job Assigned',
        body: `You have been assigned a ${category} job at ${propertyName}.`,
        ticketId,
        metadata: { propertyName, category }
    });
}

/** Technician updated status — notify the tenant */
export async function notifyStatusUpdate(ticketId: string, tenantId: string, newStatus: string) {
    const statusLabels: Record<string, string> = {
        EN_ROUTE: 'Your technician is on the way.',
        ARRIVED: 'Your technician has arrived.',
        IN_PROGRESS: 'Work has started on your request.',
        WAITING_PARTS: 'Waiting for parts. You will be updated shortly.',
    };
    await sendNotification({
        recipientId: tenantId,
        recipientRole: 'tenant',
        type: 'STATUS_UPDATE',
        title: 'Request Update',
        body: statusLabels[newStatus] || `Your request status changed to ${newStatus.replace('_', ' ')}.`,
        ticketId,
        metadata: { newStatus }
    });
}

/** Technician marked complete — notify tenant to approve */
export async function notifyCompletionRequest(ticketId: string, tenantId: string, techName: string) {
    await sendNotification({
        recipientId: tenantId,
        recipientRole: 'tenant',
        type: 'COMPLETION_REQUEST',
        title: 'Work Completed — Your Approval Needed',
        body: `${techName} has completed the job. Please review and approve or reject.`,
        ticketId,
    });
}

/** Tenant approved — notify admin */
export async function notifyTenantApproved(ticketId: string, tenantName: string) {
    await notifyAdmins({
        type: 'TENANT_APPROVED',
        title: 'Job Approved & Closed',
        body: `${tenantName} approved the completion. Ticket is now CLOSED.`,
        ticketId,
    });
}

/** Tenant rejected — notify admin */
export async function notifyTenantRejected(ticketId: string, tenantName: string, reason: string) {
    await notifyAdmins({
        type: 'TENANT_REJECTED',
        title: '⚠️ Job Rejected — Dispute Opened',
        body: `${tenantName} rejected the completion. Reason: ${reason}`,
        ticketId,
        metadata: { reason }
    });
}

/** Emergency/SOS — notify admins AND on-duty technicians */
export async function notifyEmergency(ticketId: string, tenantName: string, propertyName: string, unitNumber: string) {
    const sosPayload = {
        type: 'EMERGENCY_SOS' as NotificationType,
        title: '🚨 EMERGENCY SOS',
        body: `${tenantName} in Unit ${unitNumber}, ${propertyName} has declared an emergency. Respond immediately.`,
        ticketId,
        metadata: { propertyName, unitNumber }
    };
    await Promise.all([
        notifyAdmins(sosPayload),
        notifyOnDutyTechnicians(sosPayload)
    ]);
}

// ─── Real-time notification listener hook ────────────────────────────────────
/**
 * Call this in a React component:
 * const unsub = subscribeToNotifications(user.uid, setNotifications);
 * return () => unsub();
 */
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

/** Mark a notification as read */
export async function markNotificationRead(notificationId: string) {
    try {
        await updateDoc(doc(db, 'notifications', notificationId), { read: true });
    } catch (err) {
        console.error('[Notifications] markRead failed:', err);
    }
}

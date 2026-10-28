// Admin alert for an SLA breach. Dependency-free on purpose (no firebase-admin import) so the id,
// the payload and the once-only guarantee can be unit-tested without a Firestore emulator.
//
// Delivery reuses the existing pipeline: a document written to `notifications` is picked up by
// deliverNotificationPush (functions/notificationDelivery.ts) which sends FCM push to the recipient
// and records the provider outcome on the document. Nothing here sends a push directly.

export const SLA_BREACH_NOTIFICATION_TYPE = "SLA_BREACH";

type NotificationWriter = {
    collection(name: string): { doc(id: string): { create(data: Record<string, unknown>): Promise<unknown> } };
};

function clean(value: unknown, max = 160): string {
    return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

/** One id per (ticket, admin). Re-running the cron or retrying a partial fan-out can never duplicate. */
export function slaBreachNotificationId(ticketId: string, recipientId: string): string {
    return `sla_breach_${ticketId}_${recipientId}`.slice(0, 1400);
}

export function buildSlaBreachNotification(params: {
    ticketId: string;
    ticket: Record<string, unknown>;
    recipientId: string;
    createdAt: unknown;
    breachWindowHours: number;
}): Record<string, unknown> {
    const { ticketId, ticket, recipientId, createdAt, breachWindowHours } = params;
    const category = clean(ticket.category || ticket.trade || ticket.issueType, 60) || "Maintenance";
    const propertyName = clean(ticket.propertyName, 120) || "the property";
    const unit = clean(ticket.unitNumber, 40);
    const where = unit ? `${propertyName}, unit ${unit}` : propertyName;
    const ref8 = ticketId.substring(0, 8).toUpperCase();
    return {
        recipientId,
        recipientRole: "admin",
        type: SLA_BREACH_NOTIFICATION_TYPE,
        title: "SLA breached",
        body: `#${ref8} (${category}) at ${where} has not been started ${breachWindowHours}h after it was raised. Assign or escalate it.`,
        ticketId,
        link: `/admin/tickets?ticketId=${encodeURIComponent(ticketId)}`,
        metadata: { category, priority: clean(ticket.priority, 20), event: "SLA_BREACH", breachWindowHours },
        read: false,
        pushDeliveryState: "PENDING",
        deliverySource: "server:slaCron",
        createdAt,
    };
}

async function createOnce(ref: { create(data: Record<string, unknown>): Promise<unknown> }, data: Record<string, unknown>): Promise<boolean> {
    try {
        await ref.create(data);
        return true;
    } catch (error: any) {
        if (error?.code === 6 || /already exists/i.test(String(error?.message || ""))) return false;
        throw error;
    }
}

/**
 * Creates one notification per admin for this ticket's breach. Safe to call repeatedly: existing
 * notifications are left untouched. Returns how many were newly created. Throws on any other write
 * error so the caller can retry on the next cron run without having marked the ticket as notified.
 */
export async function createSlaBreachNotifications(params: {
    db: NotificationWriter;
    ticketId: string;
    ticket: Record<string, unknown>;
    adminIds: string[];
    createdAt: unknown;
    breachWindowHours: number;
}): Promise<number> {
    const { db, ticketId, ticket, adminIds, createdAt, breachWindowHours } = params;
    if (!ticketId) throw new Error("ticketId is required for an SLA breach notification");
    const recipients = [...new Set(adminIds.map((id) => clean(id, 128)).filter(Boolean))];
    const results = await Promise.all(recipients.map((recipientId) => createOnce(
        db.collection("notifications").doc(slaBreachNotificationId(ticketId, recipientId)),
        buildSlaBreachNotification({ ticketId, ticket, recipientId, createdAt, breachWindowHours }),
    )));
    return results.filter(Boolean).length;
}

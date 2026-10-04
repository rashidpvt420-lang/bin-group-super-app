import * as crypto from "crypto";
import * as admin from "firebase-admin";

// Admin and the property Owner must hear about a complaint when it is filed, when a technician
// is assigned, and when the work is completed. Before this, only the tenant web form told Admin
// about a new ticket (client-side, so SOS and every other path told nobody), the Owner was never
// told a complaint had been filed, and Admin was never told a job was completed.
//
// Every notification id is deterministic and written with create(), so trigger retries never
// duplicate an alert. The "created" admin alert reuses the createNotification ADMIN_GROUP claim
// key, so the tenant form's own TICKET_CREATED call becomes an idempotent no-op afterwards.

export type TicketStakeholderEvent = "CREATED" | "ASSIGNED" | "COMPLETED";

const ADMIN_ROLES = ["admin", "super_admin", "ceo", "manager", "operations_admin", "dispatcher"];

function clean(value: unknown, max = 160): string {
    return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

export async function adminRecipientIds(db: admin.firestore.Firestore): Promise<string[]> {
    const snaps = await Promise.all(
        ADMIN_ROLES.map((role) => db.collection("users").where("role", "==", role).limit(100).get()),
    );
    return [...new Set(snaps.flatMap((snap) => snap.docs.map((doc) => doc.id)))];
}

export function ticketSummary(ticket: admin.firestore.DocumentData) {
    const category = clean(ticket.category || ticket.trade || ticket.issueType, 60) || "Maintenance";
    const description = clean(ticket.description, 140);
    const propertyName = clean(ticket.propertyName, 120) || "the property";
    const unit = clean(ticket.unitNumber, 40);
    const emergency = clean(ticket.priority, 20).toLowerCase() === "emergency" || ticket.isEmergency === true;
    const technician = clean(ticket.assignedTechnicianName, 80) || "A technician";
    const where = unit ? `${propertyName}, unit ${unit}` : propertyName;
    return { category, description, propertyName, unit, emergency, technician, where };
}

function ownerIdOf(ticket: admin.firestore.DocumentData): string {
    return clean(ticket.ownerId || ticket.ownerUid, 128);
}

function requesterIdOf(ticket: admin.firestore.DocumentData): string {
    return clean(ticket.createdBy || ticket.createdByUid || ticket.requesterId, 128);
}

function adminCreatedClaimKey(ticketId: string): string {
    // Must match createNotification's group dispatch key for ADMIN_GROUP / TICKET_CREATED.
    return crypto.createHash("sha256").update(`${ticketId}|TICKET_CREATED|ADMIN_GROUP`).digest("hex");
}

async function createOnce(ref: admin.firestore.DocumentReference, data: admin.firestore.DocumentData): Promise<boolean> {
    try {
        await ref.create(data);
        return true;
    } catch (error: any) {
        if (error?.code === 6 || /already exists/i.test(String(error?.message || ""))) return false;
        throw error;
    }
}

export async function notifyTicketStakeholders(params: {
    db: admin.firestore.Firestore;
    ticketId: string;
    ticket: admin.firestore.DocumentData;
    event: TicketStakeholderEvent;
}): Promise<{ admins: number; owner: boolean }> {
    const { db, ticketId, ticket, event } = params;
    const s = ticketSummary(ticket);
    const ref8 = ticketId.substring(0, 8).toUpperCase();
    const ownerId = ownerIdOf(ticket);
    const technicianId = clean(ticket.assignedTechnicianId || ticket.technicianId, 128);
    const now = admin.firestore.FieldValue.serverTimestamp();
    const adminLink = `/admin/tickets?ticketId=${encodeURIComponent(ticketId)}`;
    const ownerLink = `/owner/ticket/${encodeURIComponent(ticketId)}`;
    const base = {
        ticketId,
        read: false,
        pushDeliveryState: "PENDING",
        deliverySource: "server:ticketStakeholderNotifications",
        createdAt: now,
    };
    const what = s.description ? `${s.category}: ${s.description}` : s.category;

    let adminCopy: { type: string; title: string; body: string } | null = null;
    let ownerCopy: { type: string; title: string; body: string } | null = null;
    let suffix = event.toLowerCase();
    const scheduled = clean(ticket.requestType, 40).toUpperCase() === "SCHEDULED_SERVICE";
    if (event === "CREATED") {
        adminCopy = {
            type: "TICKET_CREATED",
            title: s.emergency ? "New EMERGENCY complaint" : "New complaint",
            body: `#${ref8} at ${s.where} — ${what}. Status: ${scheduled ? "awaiting scheduling" : "pending assignment"}.`,
        };
        ownerCopy = {
            type: "TICKET_CREATED",
            title: s.emergency ? "Emergency complaint at your property" : "New complaint at your property",
            body: `#${ref8} at ${s.where} — ${what}. ${scheduled ? "BIN GROUP will confirm the schedule." : "We are assigning a qualified technician."}`,
        };
    } else if (event === "ASSIGNED") {
        if (!technicianId) return { admins: 0, owner: false };
        suffix = `assigned_${technicianId}`;
        adminCopy = {
            type: "TICKET_ASSIGNED",
            title: "Technician assigned",
            body: `${s.technician} was assigned to #${ref8} (${s.category}) at ${s.where}.`,
        };
    } else if (event === "COMPLETED") {
        adminCopy = {
            type: "TICKET_COMPLETED",
            title: "Job completed",
            body: `${s.technician} completed #${ref8} (${s.category}) at ${s.where}. Review the completion evidence.`,
        };
    }

    let adminsNotified = 0;
    if (adminCopy) {
        const admins = await adminRecipientIds(db);
        if (event === "CREATED") {
            const key = adminCreatedClaimKey(ticketId);
            const claimRef = db.collection("notification_dispatch_claims").doc(key);
            adminsNotified = await db.runTransaction(async (transaction) => {
                const claim = await transaction.get(claimRef);
                if (claim.exists) return 0;
                transaction.create(claimRef, {
                    ticketId, type: "TICKET_CREATED", recipientGroup: "ADMIN_GROUP", createdByUid: "SYSTEM", createdAt: now,
                });
                for (const adminId of admins) {
                    transaction.create(db.collection("notifications").doc(`${key.slice(0, 24)}_${adminId}`), {
                        ...base, ...adminCopy, recipientId: adminId, recipientRole: "admin", link: adminLink,
                        metadata: { category: s.category, priority: clean(ticket.priority, 20), event },
                    });
                }
                return admins.length;
            });
        } else {
            const results = await Promise.all(admins.map((adminId) => createOnce(
                db.collection("notifications").doc(`lifecycle_${suffix}_${ticketId}_${adminId}`.slice(0, 1400)),
                { ...base, ...adminCopy, recipientId: adminId, recipientRole: "admin", link: adminLink, metadata: { category: s.category, event } },
            )));
            adminsNotified = results.filter(Boolean).length;
        }
    }

    let ownerNotified = false;
    // The Owner is told about a new complaint unless they filed it themselves. Assignment and
    // completion already reach the Owner through onTicketStatusChanged.
    if (ownerCopy && ownerId && ownerId !== requesterIdOf(ticket)) {
        ownerNotified = await createOnce(
            db.collection("notifications").doc(`lifecycle_${suffix}_${ticketId}_${ownerId}`.slice(0, 1400)),
            { ...base, ...ownerCopy, recipientId: ownerId, recipientRole: "owner", link: ownerLink, metadata: { category: s.category, event } },
        );
    }
    return { admins: adminsNotified, owner: ownerNotified };
}

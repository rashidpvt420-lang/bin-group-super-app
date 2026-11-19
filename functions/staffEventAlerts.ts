import * as crypto from "crypto";
import * as admin from "firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import { onDocumentCreated, onDocumentWritten } from "firebase-functions/v2/firestore";
import { AlertPlan, planChatAlert, planDocumentAlert, selectRecipients, StaffProfile } from "./shared/staffEventAlertsCore";

// One server-side fan-out for staff + leadership alerts (see shared/staffEventAlertsCore.ts for the
// registry, role scoping and privacy rules). Each alert becomes one notifications/{id} document per
// recipient; deliverNotificationPush (notificationDelivery.ts) then sends the FCM push with the
// notification + data payload, Android high priority channel, APNs alert sound and web push link,
// so it arrives with the app closed and the in-app inbox / bell shows it with the app open.
//
// A single wildcard trigger is used instead of one function per collection, so the production
// deploy does not grow by dozens of functions. Collections that are not in the registry return
// before any read.

if (!admin.apps.length) admin.initializeApp();

const MAX_RECIPIENTS = 300;

function db() {
    return admin.firestore();
}

async function staffProfilesForRoles(roles: string[]): Promise<StaffProfile[]> {
    if (!roles.length) return [];
    const snap = await db().collection("users").where("role", "in", roles.slice(0, 30)).limit(MAX_RECIPIENTS).get();
    return snap.docs.map((doc) => {
        const data = doc.data() || {};
        return { uid: doc.id, role: data.role, status: data.status, suspended: data.suspended, disabled: data.disabled };
    });
}

export function staffAlertNotificationId(dedupeKey: string, recipientId: string): string {
    const key = crypto.createHash("sha256").update(dedupeKey, "utf8").digest("hex").slice(0, 32);
    return `staff_alert_${key}_${recipientId}`.slice(0, 1400);
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

export async function fanOutStaffAlert(plan: AlertPlan): Promise<number> {
    const recipients = selectRecipients(await staffProfilesForRoles(plan.roles), plan.roles, plan.actorUid);
    if (!recipients.length) return 0;
    const now = FieldValue.serverTimestamp();
    const results = await Promise.all(recipients.slice(0, MAX_RECIPIENTS).map((recipientId) => createOnce(
        db().collection("notifications").doc(staffAlertNotificationId(plan.dedupeKey, recipientId)),
        {
            recipientId,
            recipientRole: "staff",
            type: plan.type,
            title: plan.titleEn,
            body: plan.bodyEn,
            titleAr: plan.titleAr,
            bodyAr: plan.bodyAr,
            link: plan.link,
            ticketId: plan.collection === "maintenanceTickets" || plan.collection === "tickets" ? plan.docId : null,
            metadata: plan.metadata,
            emailFallback: plan.emailFallback,
            read: false,
            pushDeliveryState: "PENDING",
            deliverySource: "server:staffEventAlerts",
            createdAt: now,
        },
    )));
    return results.filter(Boolean).length;
}

export const fanOutStaffEventAlerts = onDocumentWritten({
    document: "{collectionId}/{docId}",
    region: "europe-west3",
    retry: true,
}, async (event) => {
    let plan: AlertPlan | null = null;
    try {
        plan = planDocumentAlert({
            collection: event.params.collectionId,
            docId: event.params.docId,
            before: event.data?.before?.exists ? event.data.before.data() : null,
            after: event.data?.after?.exists ? event.data.after.data() : null,
            eventId: event.id,
        });
    } catch (error) {
        console.error("[staff-alerts] plan failed", { collection: event.params.collectionId, error: String(error) });
        return;
    }
    if (!plan) return;
    await fanOutStaffAlert(plan);
});

export const fanOutStaffChatAlerts = onDocumentCreated({
    document: "{parentCollection}/{parentId}/messages/{messageId}",
    region: "europe-west3",
    retry: true,
}, async (event) => {
    const plan = planChatAlert({
        parentCollection: event.params.parentCollection,
        parentId: event.params.parentId,
        messageId: event.params.messageId,
        message: event.data?.data() || null,
    });
    if (!plan) return;
    await fanOutStaffAlert(plan);
});

import { onDocumentCreated, onDocumentUpdated } from "firebase-functions/v2/firestore";
import { onSchedule } from "firebase-functions/v2/scheduler";
import * as admin from "firebase-admin";

if (!admin.apps.length) {
    admin.initializeApp();
}

const db = admin.firestore();
const serverTimestamp = admin.firestore.FieldValue.serverTimestamp;

const HR_RECIPIENT_ROLES = ["admin", "super_admin", "ceo", "manager", "hr_admin", "hr_manager", "hr_staff", "operations_manager"];
const STAFF_ROLES = ["technician", "hr_staff", "hr_manager", "finance_staff", "account_manager", "finance_admin", "dispatcher", "operations_manager"];
const EXPIRY_FIELDS = [
    { key: "visaExpiry", label: "Residency Visa" },
    { key: "emiratesIdExpiry", label: "Emirates ID" },
    { key: "passportExpiry", label: "Passport" },
    { key: "medicalExpiry", label: "Medical / Insurance" },
    { key: "drivingLicenseExpiry", label: "Driving Licence" },
    { key: "tradeCertificateExpiry", label: "Trade Certificate" },
    { key: "occupationalHealthCardExpiry", label: "Occupational Health Card" },
];

function normalizeRole(value: unknown) {
    return String(value || "").trim().toLowerCase();
}

function safeText(value: unknown, fallback = "") {
    const text = String(value || "").trim();
    return text || fallback;
}

function requestLabel(data: FirebaseFirestore.DocumentData) {
    return safeText(data.requestLabel || data.requestType || data.category, "HR request").replace(/_/g, " ").toUpperCase();
}

function chunkRoles(roles: string[]) {
    const chunks: string[][] = [];
    for (let index = 0; index < roles.length; index += 10) chunks.push(roles.slice(index, index + 10));
    return chunks;
}

async function usersByRoles(roles: string[]) {
    const users = new Map<string, FirebaseFirestore.DocumentData>();
    for (const chunk of chunkRoles(roles)) {
        const snap = await db.collection("users").where("role", "in", chunk).get();
        snap.docs.forEach((doc) => users.set(doc.id, { id: doc.id, ...doc.data() }));
    }
    return Array.from(users.values());
}

async function queueUserNotification(userId: string, title: string, body: string, data: Record<string, unknown> = {}) {
    if (!userId) return;
    await db.collection("notifications").add({
        recipientId: userId,
        userId,
        title,
        body,
        read: false,
        source: "hr_automation",
        type: safeText(data.type, "hr_update"),
        url: safeText(data.url, "/notifications"),
        extraData: data,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
    });
}

async function writeHrAudit(action: string, targetId: string, details: Record<string, unknown>) {
    const payload = {
        action,
        targetId,
        targetType: "hr",
        actorId: "HR_AUTOMATION",
        actorName: "BIN People AI",
        module: "hr_automation",
        details,
        timestamp: serverTimestamp(),
        createdAt: serverTimestamp(),
    };
    await Promise.allSettled([
        db.collection("auditLogs").add(payload),
        db.collection("audit_logs").add(payload),
    ]);
}

function dateFromAny(value: unknown): Date | null {
    if (!value) return null;
    const candidate = value as { toDate?: () => Date };
    const date = typeof candidate.toDate === "function" ? candidate.toDate() : new Date(String(value));
    return Number.isNaN(date.getTime()) ? null : date;
}

function daysUntil(value: unknown) {
    const date = dateFromAny(value);
    if (!date) return null;
    return Math.ceil((date.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
}

function complianceWarnings(data: FirebaseFirestore.DocumentData) {
    return EXPIRY_FIELDS.map((field) => ({ ...field, days: daysUntil(data[field.key]) }))
        .filter((item) => item.days !== null && item.days <= 30)
        .map((item) => `${item.label}: ${item.days! < 0 ? `${Math.abs(item.days!)} days expired` : `${item.days} days left`}`);
}

export const onStaffRequestCreated = onDocumentCreated("staffRequests/{requestId}", async (event) => {
    const snap = event.data;
    if (!snap) return;

    const data = snap.data();
    const requestId = event.params.requestId;
    const priority = safeText(data.priority, "normal").toLowerCase();
    const isUrgent = priority === "urgent" || data.category === "safety" || data.category === "confidential" || data.requestType === "manager_issue" || data.requestType === "safety_incident";
    const staffName = safeText(data.displayName || data.fullName || data.email, "Staff member");
    const title = isUrgent ? "URGENT HR CASE" : "New HR self-service request";
    const body = `${staffName} submitted ${requestLabel(data)}${isUrgent ? " and needs immediate review." : "."}`;

    if (!data.status) {
        await snap.ref.update({ status: "pending_hr_review", updatedAt: serverTimestamp() });
    }

    const recipients = await usersByRoles(HR_RECIPIENT_ROLES);
    await Promise.allSettled(recipients.map((recipient) => queueUserNotification(String(recipient.id), title, body, {
        type: "hr_request_created",
        requestId,
        priority,
        url: "/admin/hr",
    })));

    if (isUrgent) {
        await db.collection("systemLogs").add({
            type: "URGENT_HR_ESCALATION",
            requestId,
            staffUid: data.uid || data.userId || data.technicianId || null,
            priority,
            requestType: data.requestType || null,
            message: body,
            createdAt: serverTimestamp(),
        });
    }

    await writeHrAudit("HR_REQUEST_CREATED", requestId, { priority, requestType: data.requestType || null, source: data.source || "paperless_staff_portal" });
});

export const onStaffRequestReviewed = onDocumentUpdated("staffRequests/{requestId}", async (event) => {
    const before = event.data?.before.data();
    const after = event.data?.after.data();
    if (!before || !after || before.status === after.status) return;

    const requestId = event.params.requestId;
    const nextStatus = safeText(after.status, "updated").replace(/_/g, " ").toUpperCase();
    const staffUid = safeText(after.uid || after.userId || after.technicianId);
    const reviewer = safeText(after.reviewedBy, "HR Command");

    if (["approved", "rejected", "closed", "escalated"].includes(safeText(after.status).toLowerCase()) && staffUid) {
        await queueUserNotification(staffUid, `HR request ${nextStatus}`, `${requestLabel(after)} was updated by ${reviewer}.`, {
            type: "hr_request_reviewed",
            requestId,
            status: after.status,
            url: "/technician/hr",
        });
    }

    await writeHrAudit("HR_REQUEST_STATUS_CHANGED", requestId, {
        before: before.status || null,
        after: after.status || null,
        reviewedBy: reviewer,
    });
});

export const dailyHrComplianceSweep = onSchedule("every 24 hours", async () => {
    const todayKey = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    const staffUsers = await usersByRoles(STAFF_ROLES);

    for (const staff of staffUsers) {
        const warnings = complianceWarnings(staff);
        if (warnings.length === 0) continue;

        const staffId = safeText(staff.id || staff.uid);
        if (!staffId) continue;

        const alertId = `compliance_${staffId}_${todayKey}`;
        const alertRef = db.collection("staffComplianceAlerts").doc(alertId);
        const existingAlert = await alertRef.get();
        if (existingAlert.exists) continue;

        await alertRef.set({
            staffId,
            displayName: staff.displayName || staff.fullName || staff.email || "Staff member",
            email: staff.email || null,
            warnings,
            status: "open",
            source: "daily_hr_compliance_sweep",
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
        });

        await db.collection("staffRequests").doc(alertId).set({
            uid: staffId,
            userId: staffId,
            displayName: staff.displayName || staff.fullName || staff.email || "Staff member",
            email: staff.email || null,
            role: normalizeRole(staff.role || "technician"),
            requestType: "document_update",
            requestLabel: "Document / Compliance Update",
            category: "documents",
            priority: warnings.some((warning) => warning.includes("expired")) ? "urgent" : "high",
            reason: `Automated compliance alert: ${warnings.join("; ")}`,
            status: "pending_hr_review",
            source: "daily_hr_compliance_sweep",
            paperless: true,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
        });

        await queueUserNotification(staffId, "HR document update required", warnings.join(" · "), {
            type: "hr_compliance_alert",
            alertId,
            url: "/technician/hr",
        });
    }

    await writeHrAudit("DAILY_HR_COMPLIANCE_SWEEP", todayKey, { scanned: staffUsers.length });
});

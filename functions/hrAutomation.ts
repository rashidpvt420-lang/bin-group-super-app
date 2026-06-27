import { FieldValue } from "firebase-admin/firestore";
import { onDocumentCreated, onDocumentUpdated } from "firebase-functions/v2/firestore";
import { onSchedule } from "firebase-functions/v2/scheduler";
import * as admin from "firebase-admin";

if (!admin.apps.length) {
    admin.initializeApp();
}

const db = admin.firestore();
const serverTimestamp = FieldValue.serverTimestamp;

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
const UAE_NATIONALITY_TOKENS = ["uae", "emirati", "united arab emirates", "uae national"];
// GPSSA pension registration is due within ~30 working days of joining; approximated as 42 calendar days.
const GPSSA_REGISTRATION_WINDOW_DAYS = 42;

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

function isUaeNational(value: unknown) {
    return UAE_NATIONALITY_TOKENS.includes(String(value || "").trim().toLowerCase());
}

function gpssaOverdueWarning(data: FirebaseFirestore.DocumentData): string | null {
    if (!isUaeNational(data.nationality)) return null;
    if (data.gpssaRegisteredAt || data.gpssaStatus === "registered") return null;
    const joinDate = dateFromAny(data.joiningDate || data.hireDate || data.createdAt);
    if (!joinDate) return null;
    const dueDate = new Date(joinDate.getTime() + GPSSA_REGISTRATION_WINDOW_DAYS * 24 * 60 * 60 * 1000);
    const daysPastDue = Math.floor((Date.now() - dueDate.getTime()) / (1000 * 60 * 60 * 24));
    if (daysPastDue < 0) return null;
    return `GPSSA pension registration: ${daysPastDue} days overdue (approx. 30-working-day filing window)`;
}

function complianceWarnings(data: FirebaseFirestore.DocumentData) {
    const expiryWarnings = EXPIRY_FIELDS.map((field) => ({ ...field, days: daysUntil(data[field.key]) }))
        .filter((item) => item.days !== null && item.days <= 30)
        .map((item) => `${item.label}: ${item.days! < 0 ? `${Math.abs(item.days!)} days expired` : `${item.days} days left`}`);
    const gpssaWarning = gpssaOverdueWarning(data);
    return gpssaWarning ? [...expiryWarnings, gpssaWarning] : expiryWarnings;
}


function normalizedKey(value: unknown) {
    return safeText(value).toLowerCase().replace(/[\s-]+/g, "_");
}

function isApprovedHrStatus(value: unknown) {
    return ["approved", "hr_approved", "approved_by_hr", "accepted"].includes(normalizedKey(value));
}

function isNewHireRequest(data: FirebaseFirestore.DocumentData) {
    const candidates = [
        data.requestType,
        data.type,
        data.category,
        data.requestLabel,
        data.hrAction,
    ].map(normalizedKey);

    return candidates.some((value) =>
        value === "new_hire" ||
        value === "newhire" ||
        value === "new_staff" ||
        value === "staff_onboarding" ||
        value.includes("new_hire") ||
        value.includes("new_staff")
    );
}

function readNumber(value: unknown, fallback = 0) {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : fallback;
}

function currentPayrollPeriod() {
    return new Date().toISOString().slice(0, 7);
}

async function provisionApprovedNewHire(requestId: string, data: FirebaseFirestore.DocumentData, reviewer: string) {
    const staffUid = safeText(
        data.uid ||
        data.userId ||
        data.staffUid ||
        data.technicianId ||
        data.targetUid ||
        data.newHireUid ||
        data.newStaffUid
    );

    if (!staffUid) {
        await writeHrAudit("HR_NEW_HIRE_PROVISION_SKIPPED", requestId, {
            reason: "missing_staff_uid",
            reviewedBy: reviewer,
        });
        return;
    }

    const period = safeText(data.payrollPeriod, currentPayrollPeriod());
    const role = normalizeRole(data.role || data.staffRole || data.position || "technician") || "technician";
    const displayName = safeText(data.displayName || data.fullName || data.name || data.employeeName, "New staff member");
    const email = safeText(data.email || data.workEmail);
    const phone = safeText(data.phone || data.mobile || data.whatsapp);
    const trade = safeText(data.trade || data.primaryTrade || data.specialization, "General Maintenance");

    const baseSalary = readNumber(data.baseSalary || data.basicSalary || data.salary);
    const bonus = readNumber(data.bonus || data.joiningBonus || data.overtimeBonus);
    const absenceDeduction = readNumber(data.absenceDeduction || data.absences || data.absencePenalty);
    const grossSalary = baseSalary + bonus;
    const netSalary = grossSalary - absenceDeduction;

    const payrollRecordId = staffUid + "_" + period;

    const userRef = db.collection("users").doc(staffUid);
    const technicianRef = db.collection("technicians").doc(staffUid);
    const readinessRef = technicianRef.collection("deviceReadiness").doc("onboarding");
    const payrollRef = db.collection("payroll").doc(payrollRecordId);

    const batch = db.batch();

    batch.set(userRef, {
        uid: staffUid,
        userId: staffUid,
        displayName,
        fullName: displayName,
        email: email || null,
        phone: phone || null,
        role,
        staffRole: role,
        hrStatus: "active",
        onboardingStatus: "provisioned",
        isInstitutionalActive: true,
        provisionedFromRequestId: requestId,
        updatedAt: serverTimestamp(),
        createdAt: data.createdAt || serverTimestamp(),
    }, { merge: true });

    batch.set(technicianRef, {
        uid: staffUid,
        userId: staffUid,
        technicianId: staffUid,
        displayName,
        fullName: displayName,
        email: email || null,
        phone: phone || null,
        role: "technician",
        staffRole: role,
        trade,
        skillTags: Array.isArray(data.skillTags) ? data.skillTags : [trade],
        status: "ONBOARDING",
        availability: "pending_device_readiness",
        hrStatus: "active",
        payrollStatus: "pending_finance_review",
        source: "hr_new_hire_provisioning",
        provisionedFromRequestId: requestId,
        updatedAt: serverTimestamp(),
        createdAt: data.createdAt || serverTimestamp(),
    }, { merge: true });

    batch.set(readinessRef, {
        technicianId: staffUid,
        userId: staffUid,
        gps: false,
        push: false,
        camera: false,
        storage: false,
        appLogin: false,
        safetyBriefing: false,
        ppeIssued: false,
        toolsIssued: false,
        status: "pending",
        source: "hr_new_hire_provisioning",
        updatedAt: serverTimestamp(),
        createdAt: serverTimestamp(),
    }, { merge: true });

    batch.set(payrollRef, {
        staffId: staffUid,
        techId: staffUid,
        uid: staffUid,
        displayName,
        email: email || null,
        month: period,
        payPeriod: period,
        baseSalary,
        bonus,
        absenceDeduction,
        grossSalary,
        netSalary,
        formula: "baseSalary + bonus - absenceDeduction",
        status: "pending_finance_review",
        source: "hr_new_hire_provisioning",
        provisionedFromRequestId: requestId,
        updatedAt: serverTimestamp(),
        createdAt: serverTimestamp(),
    }, { merge: true });

    batch.update(db.collection("staffRequests").doc(requestId), {
        provisionedUid: staffUid,
        provisionedAt: serverTimestamp(),
        payrollRecordId,
        updatedAt: serverTimestamp(),
    });

    await batch.commit();

    await queueUserNotification(staffUid, "BIN GROUP onboarding activated", "Your staff profile, technician record, device readiness checklist, and payroll setup are now initialized.", {
        type: "hr_new_hire_provisioned",
        requestId,
        payrollRecordId,
        url: "/technician/hr",
    });

    await writeHrAudit("HR_NEW_HIRE_PROVISIONED", requestId, {
        staffUid,
        role,
        payrollPeriod: period,
        payrollRecordId,
        reviewedBy: reviewer,
    });
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

    if (isApprovedHrStatus(after.status) && isNewHireRequest(after)) {
        await provisionApprovedNewHire(requestId, after, reviewer);
    }

    await writeHrAudit("HR_REQUEST_STATUS_CHANGED", requestId, {
        before: before.status || null,
        after: after.status || null,
        reviewedBy: reviewer,
    });
});

// Federal heat-stress rule bans outdoor direct-sun work 12:30-15:00, 15 June - 15 September.
// Sends one reminder per season (not daily) to avoid alert fatigue.
async function maybeSendHeatStressSeasonReminder() {
    const now = new Date();
    const year = now.getFullYear();
    const seasonStart = new Date(year, 5, 15);
    const seasonEnd = new Date(year, 8, 15, 23, 59, 59);
    if (now < seasonStart || now > seasonEnd) return;

    const reminderId = `heat_stress_season_${year}`;
    const reminderRef = db.collection("systemLogs").doc(reminderId);
    const existing = await reminderRef.get();
    if (existing.exists) return;

    await reminderRef.set({
        type: "HEAT_STRESS_SEASON_ACTIVE",
        year,
        message: "Midday outdoor work ban in effect: 12:30-15:00, 15 June - 15 September. Confirm rosters exclude direct-sun outdoor work in this window or record a supervisor exception.",
        createdAt: serverTimestamp(),
    });

    const recipients = await usersByRoles(HR_RECIPIENT_ROLES);
    await Promise.allSettled(recipients.map((recipient) => queueUserNotification(String(recipient.id), "Heat-stress season active", "Midday outdoor work ban (12:30-15:00) is in effect until 15 September. Confirm rosters and exception records.", {
        type: "heat_stress_season_reminder",
        url: "/admin/hr",
    })));
}

export const dailyHrComplianceSweep = onSchedule("every 24 hours", async () => {
    const todayKey = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    await maybeSendHeatStressSeasonReminder();
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
            priority: warnings.some((warning) => warning.includes("expired") || warning.includes("overdue")) ? "urgent" : "high",
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

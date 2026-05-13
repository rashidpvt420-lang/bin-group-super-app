import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";

export * from "./index";

if (!admin.apps.length) {
    admin.initializeApp();
}

const runtimeDb = admin.firestore();

const normalizeRole = (value: unknown) => String(value || "").trim().toLowerCase();

async function assertAdmin(auth: any) {
    if (!auth) throw new HttpsError("unauthenticated", "Admin authentication required.");

    const token = auth.token || {};
    const tokenRole = normalizeRole(token.role || token.userRole || token.primaryRole);
    const tokenIsAdmin = token.admin === true || token.isAdmin === true || token.superAdmin === true || token.super_admin === true || ["admin", "super_admin", "ceo", "manager", "operations_admin", "finance_admin"].includes(tokenRole);
    if (tokenIsAdmin) return;

    const userDoc = await runtimeDb.collection("users").doc(auth.uid).get();
    const user = userDoc.data() || {};
    const userRole = normalizeRole(user.role || user.userRole || user.primaryRole);
    const userIsAdmin = user.admin === true || user.isAdmin === true || user.superAdmin === true || user.super_admin === true || ["admin", "super_admin", "ceo", "manager", "operations_admin", "finance_admin"].includes(userRole);
    if (!userIsAdmin) throw new HttpsError("permission-denied", "Only admins can approve or reject payments.");
}

function requirePaymentId(data: any) {
    const paymentId = String(data?.paymentId || data?.id || "").trim();
    if (!paymentId) throw new HttpsError("invalid-argument", "paymentId is required.");
    return paymentId;
}

export const adminApprovePayment = onCall({ cors: true }, async (request) => {
    await assertAdmin(request.auth);

    const paymentId = requirePaymentId(request.data);
    const paymentRef = runtimeDb.collection("payment_transactions").doc(paymentId);
    const paymentSnap = await paymentRef.get();
    if (!paymentSnap.exists) throw new HttpsError("not-found", "Payment transaction not found.");

    const payment = paymentSnap.data() || {};
    const now = admin.firestore.FieldValue.serverTimestamp();
    const batch = runtimeDb.batch();

    batch.set(paymentRef, {
        status: "APPROVED",
        verificationState: "APPROVED_BY_ADMIN",
        verified: true,
        approved: true,
        unlocksDashboard: true,
        approvedBy: request.auth?.uid || "admin",
        approvedAt: now,
        updatedAt: now,
        history: admin.firestore.FieldValue.arrayUnion({
            status: "APPROVED",
            timestamp: new Date(),
            actorId: request.auth?.uid || "admin",
            note: "Payment approved from admin payment approval console."
        })
    }, { merge: true });

    const ownerId = String(payment.ownerId || payment.userId || "").trim();
    const contractId = String(payment.contractId || "").trim();
    const intakeId = String(payment.intakeId || "").trim();

    if (contractId) {
        batch.set(runtimeDb.collection("contracts").doc(contractId), {
            paymentVerified: true,
            paymentStatus: "APPROVED",
            status: "ACTIVE",
            activationStatus: "ACTIVE",
            approved: true,
            approvedBy: request.auth?.uid || "admin",
            approvedAt: now,
            activatedAt: now,
            updatedAt: now
        }, { merge: true });
    }

    if (ownerId) {
        batch.set(runtimeDb.collection("owners").doc(ownerId), {
            status: "ACTIVE",
            dashboardUnlocked: true,
            paymentVerified: true,
            activeContractId: contractId || payment.activeContractId || null,
            updatedAt: now
        }, { merge: true });
        batch.set(runtimeDb.collection("users").doc(ownerId), {
            status: "ACTIVE",
            dashboardUnlocked: true,
            paymentVerified: true,
            activeContractId: contractId || payment.activeContractId || null,
            updatedAt: now
        }, { merge: true });
    }

    if (intakeId) {
        batch.set(runtimeDb.collection("intake_submissions").doc(intakeId), {
            paymentStatus: "APPROVED",
            paymentState: "APPROVED",
            adminReviewState: "PAYMENT_APPROVED",
            activationState: "ACTIVE",
            status: "ACTIVE",
            updatedAt: now
        }, { merge: true });
    }

    batch.set(runtimeDb.collection("audit_logs").doc(), {
        actorId: request.auth?.uid || "admin",
        actorRole: "admin",
        action: "ADMIN_APPROVE_PAYMENT",
        targetType: "payment_transactions",
        targetId: paymentId,
        metadata: { ownerId, contractId, intakeId },
        createdAt: now
    });

    await batch.commit();
    return { status: "SUCCESS", paymentId, ownerId, contractId, intakeId };
});

export const adminRejectPayment = onCall({ cors: true }, async (request) => {
    await assertAdmin(request.auth);

    const paymentId = requirePaymentId(request.data);
    const reason = String(request.data?.reason || "Rejected from admin payment approval console.").trim();
    const paymentRef = runtimeDb.collection("payment_transactions").doc(paymentId);
    const paymentSnap = await paymentRef.get();
    if (!paymentSnap.exists) throw new HttpsError("not-found", "Payment transaction not found.");

    const payment = paymentSnap.data() || {};
    const now = admin.firestore.FieldValue.serverTimestamp();
    const batch = runtimeDb.batch();

    batch.set(paymentRef, {
        status: "REJECTED",
        verificationState: "REJECTED_BY_ADMIN",
        verified: false,
        approved: false,
        unlocksDashboard: false,
        rejectedBy: request.auth?.uid || "admin",
        rejectedAt: now,
        rejectionReason: reason,
        updatedAt: now,
        history: admin.firestore.FieldValue.arrayUnion({
            status: "REJECTED",
            timestamp: new Date(),
            actorId: request.auth?.uid || "admin",
            note: reason
        })
    }, { merge: true });

    const ownerId = String(payment.ownerId || payment.userId || "").trim();
    const contractId = String(payment.contractId || "").trim();
    const intakeId = String(payment.intakeId || "").trim();

    if (contractId) {
        batch.set(runtimeDb.collection("contracts").doc(contractId), {
            paymentVerified: false,
            paymentStatus: "REJECTED",
            status: "PAYMENT_REJECTED",
            activationStatus: "LOCKED_PAYMENT_REJECTED",
            updatedAt: now
        }, { merge: true });
    }

    if (ownerId) {
        batch.set(runtimeDb.collection("owners").doc(ownerId), {
            status: "PAYMENT_REJECTED",
            dashboardUnlocked: false,
            paymentVerified: false,
            updatedAt: now
        }, { merge: true });
        batch.set(runtimeDb.collection("users").doc(ownerId), {
            status: "PAYMENT_REJECTED",
            dashboardUnlocked: false,
            paymentVerified: false,
            updatedAt: now
        }, { merge: true });
    }

    if (intakeId) {
        batch.set(runtimeDb.collection("intake_submissions").doc(intakeId), {
            paymentStatus: "REJECTED",
            paymentState: "REJECTED",
            adminReviewState: "PAYMENT_REJECTED",
            activationState: "LOCKED_PAYMENT_REJECTED",
            status: "PAYMENT_REJECTED",
            rejectionReason: reason,
            updatedAt: now
        }, { merge: true });
    }

    batch.set(runtimeDb.collection("audit_logs").doc(), {
        actorId: request.auth?.uid || "admin",
        actorRole: "admin",
        action: "ADMIN_REJECT_PAYMENT",
        targetType: "payment_transactions",
        targetId: paymentId,
        reason,
        metadata: { ownerId, contractId, intakeId },
        createdAt: now
    });

    await batch.commit();
    return { status: "SUCCESS", paymentId, ownerId, contractId, intakeId };
});

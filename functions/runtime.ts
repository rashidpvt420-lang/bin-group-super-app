import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";

export * from "./index";
export * from "./contractActivation";

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

export const createOwnerPaymentTransaction = onCall({ cors: true }, async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "User authentication required.");

    const method = String(request.data?.method || "").trim().toUpperCase();
    if (!["CASH", "CHEQUE", "BANK_TRANSFER", "DIGITAL"].includes(method)) {
        throw new HttpsError("invalid-argument", "Invalid payment method. Allowed methods: CASH, CHEQUE, BANK_TRANSFER, DIGITAL.");
    }

    const ownerId = String(request.data?.ownerId || "").trim();
    if (!ownerId) {
        throw new HttpsError("invalid-argument", "ownerId is required.");
    }

    if (ownerId !== request.auth.uid) {
        await assertAdmin(request.auth);
    }

    const amount = Number(request.data?.amount || 0);
    const contractId = String(request.data?.contractId || "").trim();
    const propertyId = String(request.data?.propertyId || "").trim();
    const now = admin.firestore.FieldValue.serverTimestamp();

    const isPspConfigured = Boolean(process.env.PSP_SECRET_KEY || process.env.STRIPE_SECRET_KEY || process.env.TAP_SECRET_KEY);
    let paymentData: any = {
        method,
        amount,
        ownerId,
        contractId,
        propertyId,
        createdAt: now,
        updatedAt: now,
        createdBy: request.auth.uid
    };

    if (method === "DIGITAL") {
        if (!isPspConfigured) {
            paymentData.status = "PSP_CONFIGURATION_REQUIRED";
            paymentData.gateway = "UNCONFIGURED_PSP";
            paymentData.paymentVerified = false;
            paymentData.unlocksDashboard = false;
            paymentData.productionBlockedReason = "Production PSP gateway is not configured. Webhook and checkout capabilities are disabled until PSP integration keys are provided.";
        } else {
            paymentData.status = "PENDING_PSP_CHECKOUT";
            paymentData.gateway = "DIGITAL_PSP";
            paymentData.paymentVerified = false;
            paymentData.unlocksDashboard = false;
        }
    } else {
        paymentData.status = "PENDING";
        paymentData.gateway = "MANUAL";
        paymentData.paymentVerified = false;
        paymentData.unlocksDashboard = false;
        paymentData.requiresAdminVerification = true;
    }

    const batch = runtimeDb.batch();
    const newPaymentRef = runtimeDb.collection("payment_transactions").doc();
    batch.set(newPaymentRef, paymentData);

    batch.set(runtimeDb.collection("audit_logs").doc(), {
        actorId: request.auth.uid,
        actorRole: request.auth.uid === ownerId ? "owner" : "admin",
        action: "CREATE_PAYMENT_TRANSACTION",
        targetType: "payment_transactions",
        targetId: newPaymentRef.id,
        metadata: { method, amount, ownerId, contractId, propertyId, gateway: paymentData.gateway, status: paymentData.status },
        createdAt: now
    });

    await batch.commit();
    return { status: "SUCCESS", paymentId: newPaymentRef.id, ...paymentData };
});

export const adminApprovePayment = onCall({ cors: true }, async (request) => {
    await assertAdmin(request.auth);

    const paymentId = requirePaymentId(request.data);
    const paymentRef = runtimeDb.collection("payment_transactions").doc(paymentId);
    const paymentSnap = await paymentRef.get();
    if (!paymentSnap.exists) throw new HttpsError("not-found", "Payment transaction not found.");

    const payment = paymentSnap.data() || {};
    if (payment.gateway === "UNCONFIGURED_PSP" || payment.status === "PSP_CONFIGURATION_REQUIRED") {
        throw new HttpsError("failed-precondition", "Cannot approve a payment transaction requiring PSP configuration.");
    }
    if (payment.method === "DIGITAL" && payment.gateway !== "MANUAL") {
        throw new HttpsError("failed-precondition", "Digital payments must be verified via PSP webhook, not manual admin approval.");
    }
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

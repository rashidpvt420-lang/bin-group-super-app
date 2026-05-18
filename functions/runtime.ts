import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";

export * from "./index";
export * from "./contractActivation";
export * from "./ownerOnboarding";
export * from "./ownerRegistrationRequest";

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
    const contractId = String(request.data?.contractId || "").trim();
    const amount = Number(request.data?.amount || 0);
    const currency = String(request.data?.currency || "AED").trim().toUpperCase();
    const provider = String(request.data?.provider || "MANUAL").trim().toUpperCase();
    const reference = String(request.data?.reference || "").trim();

    if (!contractId) throw new HttpsError("invalid-argument", "contractId is required.");
    if (!Number.isFinite(amount) || amount <= 0) throw new HttpsError("invalid-argument", "A positive payment amount is required.");
    if (!["BANK_TRANSFER", "CARD", "TAP", "STRIPE", "MANUAL"].includes(method)) throw new HttpsError("invalid-argument", "Unsupported payment method.");

    const paymentRef = runtimeDb.collection("payments").doc();
    const now = admin.firestore.FieldValue.serverTimestamp();
    await paymentRef.set({
        id: paymentRef.id,
        ownerUid: request.auth.uid,
        contractId,
        amount,
        currency,
        method,
        provider,
        reference,
        status: "PENDING_VERIFICATION",
        paymentVerified: false,
        dashboardUnlocked: false,
        createdAt: now,
        updatedAt: now,
    });

    await runtimeDb.collection("audit_logs").add({
        actorId: request.auth.uid,
        actorRole: request.auth.token?.role || "owner",
        action: "CREATE_OWNER_PAYMENT_TRANSACTION",
        targetType: "payments",
        targetId: paymentRef.id,
        metadata: { contractId, amount, currency, method, provider },
        createdAt: now,
    });

    return { paymentId: paymentRef.id, status: "PENDING_VERIFICATION" };
});

export const verifyOwnerPaymentTransaction = onCall({ cors: true }, async (request) => {
    await assertAdmin(request.auth);

    const paymentId = requirePaymentId(request.data);
    const paymentRef = runtimeDb.collection("payments").doc(paymentId);
    const paymentSnap = await paymentRef.get();
    if (!paymentSnap.exists) throw new HttpsError("not-found", "Payment transaction not found.");

    const payment = paymentSnap.data() || {};
    const ownerUid = String(payment.ownerUid || "").trim();
    const contractId = String(payment.contractId || "").trim();
    const now = admin.firestore.FieldValue.serverTimestamp();

    const batch = runtimeDb.batch();
    batch.set(paymentRef, {
        status: "VERIFIED",
        paymentVerified: true,
        verifiedAt: now,
        verifiedBy: request.auth?.uid || "admin",
        updatedAt: now,
    }, { merge: true });

    if (ownerUid) {
        batch.set(runtimeDb.collection("users").doc(ownerUid), {
            paymentVerified: true,
            dashboardUnlocked: true,
            dashboardLocked: false,
            status: "ACTIVE",
            updatedAt: now,
        }, { merge: true });
    }

    if (contractId) {
        batch.set(runtimeDb.collection("contracts").doc(contractId), {
            paymentVerified: true,
            status: "ACTIVE",
            activatedAt: now,
            updatedAt: now,
        }, { merge: true });
    }

    batch.set(runtimeDb.collection("audit_logs").doc(), {
        actorId: request.auth?.uid || "admin",
        actorRole: request.auth?.token?.role || "admin",
        action: "VERIFY_OWNER_PAYMENT_TRANSACTION",
        targetType: "payments",
        targetId: paymentId,
        metadata: { ownerUid, contractId },
        createdAt: now,
    });

    await batch.commit();
    return { paymentId, status: "VERIFIED", ownerUid, contractId };
});

export const rejectOwnerPaymentTransaction = onCall({ cors: true }, async (request) => {
    await assertAdmin(request.auth);

    const paymentId = requirePaymentId(request.data);
    const reason = String(request.data?.reason || "").trim();
    const now = admin.firestore.FieldValue.serverTimestamp();

    await runtimeDb.collection("payments").doc(paymentId).set({
        status: "REJECTED",
        paymentVerified: false,
        rejectionReason: reason || "Rejected by admin",
        rejectedAt: now,
        rejectedBy: request.auth?.uid || "admin",
        updatedAt: now,
    }, { merge: true });

    await runtimeDb.collection("audit_logs").add({
        actorId: request.auth?.uid || "admin",
        actorRole: request.auth?.token?.role || "admin",
        action: "REJECT_OWNER_PAYMENT_TRANSACTION",
        targetType: "payments",
        targetId: paymentId,
        metadata: { reason },
        createdAt: now,
    });

    return { paymentId, status: "REJECTED" };
});

// Backward-compatible exports for already deployed production callable names.
// Keeps Admin Payment Approvals working and prevents Firebase CI from trying
// to delete these live functions during non-interactive production deploy.
export const adminApprovePayment = verifyOwnerPaymentTransaction;
export const adminRejectPayment = rejectOwnerPaymentTransaction;

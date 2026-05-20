import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";

export * from "./index";
export * from "./contractActivation";
export * from "./ownerOnboarding";
export * from "./ownerRegistrationRequest";
export * from "./stripePayment";
export * from "./adminOwnerOperations";
export * from "./mailDelivery";

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
    const userData = userDoc.data() || {};
    const firestoreRole = normalizeRole(userData.role || userData.userRole || userData.primaryRole);
    const userIsAdmin = userData.isAdmin === true || userData.admin === true || userData.superAdmin === true || userData.super_admin === true || ["admin", "super_admin", "ceo", "manager", "operations_admin", "finance_admin"].includes(firestoreRole);
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

    const contractSnap = await runtimeDb.collection("contracts").doc(contractId).get();
    if (!contractSnap.exists) throw new HttpsError("not-found", "Contract not found.");

    const contractData = contractSnap.data() || {};
    const contractOwnerUid = String(contractData.ownerUid || contractData.ownerId || contractData.createdBy || "").trim();
    const contractOwnerEmail = String(contractData.ownerEmail || "").trim().toLowerCase();
    const authEmail = String(request.auth.token?.email || "").trim().toLowerCase();
    const callerOwnsContract = contractOwnerUid === request.auth.uid || (!!contractOwnerEmail && contractOwnerEmail === authEmail);
    if (!callerOwnsContract) throw new HttpsError("permission-denied", "Contract does not belong to the authenticated owner.");

    const now = admin.firestore.FieldValue.serverTimestamp();
    const paymentRef = runtimeDb.collection("payment_transactions").doc();
    await paymentRef.set({
        id: paymentRef.id,
        ownerUid: request.auth.uid,
        ownerId: request.auth.uid,
        ownerEmail: authEmail || contractOwnerEmail || null,
        contractId,
        intakeId: contractData.intakeId || null,
        onboardingSessionId: contractData.onboardingSessionId || null,
        amount,
        currency,
        method,
        paymentMethod: method,
        provider,
        reference,
        status: "PENDING",
        verificationState: "ADMIN_VERIFICATION_REQUIRED",
        paymentVerified: false,
        dashboardUnlocked: false,
        contractActivated: false,
        createdAt: now,
        updatedAt: now,
    });

    await runtimeDb.collection("audit_logs").add({
        actorId: request.auth.uid,
        actorRole: request.auth.token?.role || "owner",
        action: "CREATE_OWNER_PAYMENT_TRANSACTION",
        targetType: "payment_transactions",
        targetId: paymentRef.id,
        metadata: { contractId, amount, currency, method, provider },
        createdAt: now,
    });

    return { paymentId: paymentRef.id, status: "PENDING", verificationState: "ADMIN_VERIFICATION_REQUIRED" };
});

export const verifyOwnerPaymentTransaction = onCall({ cors: true }, async (request) => {
    await assertAdmin(request.auth);

    const paymentId = requirePaymentId(request.data);
    let collectionName = "payments";
    let paymentRef = runtimeDb.collection("payments").doc(paymentId);
    let paymentSnap = await paymentRef.get();
    if (!paymentSnap.exists) {
        const pTxRef = runtimeDb.collection("payment_transactions").doc(paymentId);
        const pTxSnap = await pTxRef.get();
        if (pTxSnap.exists) {
            paymentRef = pTxRef;
            paymentSnap = pTxSnap;
            collectionName = "payment_transactions";
        }
    }
    if (!paymentSnap.exists) throw new HttpsError("not-found", "Payment transaction not found.");

    const payment = paymentSnap.data() || {};
    let ownerUid = String(payment.ownerUid || payment.ownerId || "").trim();
    const contractId = String(payment.contractId || "").trim();
    const now = admin.firestore.FieldValue.serverTimestamp();

    if (!ownerUid && contractId) {
        const contractSnap = await runtimeDb.collection("contracts").doc(contractId).get();
        if (contractSnap.exists) {
            const contractData = contractSnap.data() || {};
            ownerUid = String(contractData.ownerId || contractData.ownerUid || "").trim();
        }
    }

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

        batch.set(runtimeDb.collection("owners").doc(ownerUid), {
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
        targetType: collectionName,
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

    let collectionName = "payments";
    let paymentRef = runtimeDb.collection("payments").doc(paymentId);
    let paymentSnap = await paymentRef.get();
    if (!paymentSnap.exists) {
        const pTxRef = runtimeDb.collection("payment_transactions").doc(paymentId);
        const pTxSnap = await pTxRef.get();
        if (pTxSnap.exists) {
            paymentRef = pTxRef;
            paymentSnap = pTxSnap;
            collectionName = "payment_transactions";
        }
    }
    if (!paymentSnap.exists) throw new HttpsError("not-found", "Payment transaction not found.");

    await paymentRef.set({
        status: "REJECTED",
        paymentVerified: false,
        rejectionReason: reason || "Rejected by admin",
        rejectedAt: now,
        rejectedBy: request.auth?.uid || "admin",
        updatedAt: now,
    }, { merge: true });

    const payment = paymentSnap.data() || {};
    let ownerUid = String(payment.ownerUid || payment.ownerId || "").trim();
    const contractId = String(payment.contractId || "").trim();
    if (!ownerUid && contractId) {
        const contractSnap = await runtimeDb.collection("contracts").doc(contractId).get();
        if (contractSnap.exists) {
            const contractData = contractSnap.data() || {};
            ownerUid = String(contractData.ownerId || contractData.ownerUid || "").trim();
        }
    }

    const batch = runtimeDb.batch();
    if (ownerUid) {
        batch.set(runtimeDb.collection("users").doc(ownerUid), {
            status: "PAYMENT_REJECTED",
            updatedAt: now,
        }, { merge: true });

        batch.set(runtimeDb.collection("owners").doc(ownerUid), {
            status: "PAYMENT_REJECTED",
            updatedAt: now,
        }, { merge: true });
    }

    batch.set(runtimeDb.collection("audit_logs").doc(), {
        actorId: request.auth?.uid || "admin",
        actorRole: request.auth?.token?.role || "admin",
        action: "REJECT_OWNER_PAYMENT_TRANSACTION",
        targetType: collectionName,
        targetId: paymentId,
        metadata: { reason, ownerUid, contractId },
        createdAt: now,
    });

    await batch.commit();
    return { paymentId, status: "REJECTED" };
});

// Backward-compatible exports for already deployed production callable names.
// Keeps Admin Payment Approvals working and prevents Firebase CI from trying
// to delete these live functions during non-interactive production deploy.
export const adminApprovePayment = verifyOwnerPaymentTransaction;
export const adminRejectPayment = rejectOwnerPaymentTransaction;
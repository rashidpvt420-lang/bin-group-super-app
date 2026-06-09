import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import { OWNER_CONTRACT_TERM_MONTHS, asDate, termFieldsFromStart } from "./ownerContractTerm";
import { buildOwnerCommercialApprovalPatch } from "./ownerCommercialSchedule";

export * from "./index";
export * from "./contractActivation";
export * from "./ownerOnboarding";
export * from "./ownerRegistrationRequest";
export * from "./onboardingProofUpload";
export * from "./stripePayment";
export * from "./adminOwnerOperations";
export * from "./mailDelivery";
export * from "./notificationDelivery";
export * from "./ticketNormalization";
export * from "./hrAutomation";
export * from "./liveAi";

if (!admin.apps.length) {
    admin.initializeApp();
}

const runtimeDb = admin.firestore();

const normalizeRole = (value: unknown) => String(value || "").trim().toLowerCase();
const normalizeEmail = (value: unknown) => String(value || "").trim().toLowerCase();

function canonicalEmail(value: unknown) {
    const email = normalizeEmail(value);
    const [local, domain] = email.split("@");
    if (!local || !domain) return email;
    const normalizedDomain = domain === "googlemail.com" ? "gmail.com" : domain;
    const normalizedLocal = normalizedDomain === "gmail.com" ? local.split("+")[0].replace(/\./g, "") : local;
    return `${normalizedLocal}@${normalizedDomain}`;
}

function emailCandidates(contractData: FirebaseFirestore.DocumentData) {
    return [
        contractData.ownerEmail,
        contractData.recipientEmail,
        contractData.email,
        contractData.contactEmail,
        contractData.emailDelivery?.recipient,
        contractData.owner?.email,
        contractData.ownerProfile?.email,
        contractData.companyProfile?.email,
        contractData.commercialSchedule?.ownerEmail,
        contractData.ownerSelectedScopeSnapshot?.ownerEmail,
        ...(Array.isArray(contractData.properties) ? contractData.properties.map((property: any) => property?.ownerEmail) : []),
    ].map(normalizeEmail).filter(Boolean);
}

function resolveContractOwnerEmail(contractData: FirebaseFirestore.DocumentData) {
    return emailCandidates(contractData)[0] || "";
}

async function assertAdmin(auth: any) {
    if (!auth) throw new HttpsError("unauthenticated", "Admin authentication required.");

    const token = auth.token || {};
    const tokenRole = normalizeRole(token.role || token.userRole || token.primaryRole);
    const tokenIsAdmin = token.admin === true || token.isAdmin === true || token.superAdmin === true || token.super_admin === true || ["admin", "super_admin", "ceo", "manager", "operations_admin", "finance_admin"].includes(tokenRole);
    if (!tokenIsAdmin) throw new HttpsError("permission-denied", "Only admins can perform this action.");
}

function requirePaymentId(data: any) {
    const paymentId = String(data?.paymentId || data?.id || "").trim();
    if (!paymentId) throw new HttpsError("invalid-argument", "paymentId is required.");
    return paymentId;
}

function callerOwnsContract(auth: any, contractData: FirebaseFirestore.DocumentData) {
    const authUid = String(auth?.uid || "").trim();
    const authEmail = normalizeEmail(auth?.token?.email);
    const authCanonicalEmail = canonicalEmail(authEmail);

    const uidCandidates = [
        contractData.ownerUid,
        contractData.ownerId,
        contractData.createdBy,
        contractData.userId,
        contractData.uid,
        contractData.owner?.uid,
        contractData.ownerProfile?.uid,
    ].map((value) => String(value || "").trim()).filter(Boolean);

    if (authUid && uidCandidates.includes(authUid)) return true;

    const contractEmails = emailCandidates(contractData);
    if (authEmail && contractEmails.includes(authEmail)) return true;

    const canonicalContractEmails = contractEmails.map(canonicalEmail).filter(Boolean);
    return !!authCanonicalEmail && canonicalContractEmails.includes(authCanonicalEmail);
}

function firstPositiveNumber(...values: unknown[]) {
    for (const value of values) {
        const numeric = Number(value);
        if (Number.isFinite(numeric) && numeric > 0) return numeric;
    }
    return 0;
}

function contractAnnualValue(contractData: FirebaseFirestore.DocumentData) {
    return firstPositiveNumber(
        contractData.annualValue,
        contractData.annualContractValue,
        contractData.estimatedAnnualValue,
        contractData.totalAnnual,
        contractData.quoteTotal,
        contractData.contractValue,
        contractData.serviceValue,
        contractData.pricing?.annualContractValue,
        contractData.pricing?.annualValue,
        contractData.quote?.annualContractValue,
        contractData.quote?.totalAnnual,
        contractData.payment?.annualValue,
        contractData.paymentSchedule?.annualContractValue,
        contractData.commercialSchedule?.annualContractValue
    );
}

function contractMoneyValue(contractData: FirebaseFirestore.DocumentData) {
    const annualValue = contractAnnualValue(contractData);
    return firstPositiveNumber(
        contractData.mobilizationAmount,
        contractData.mobilizationFee,
        contractData.upfrontAmount,
        contractData.depositAmount,
        contractData.pricing?.mobilizationAmount,
        contractData.pricing?.upfrontAmount,
        contractData.quote?.mobilizationAmount,
        contractData.payment?.amount,
        contractData.paymentAmount,
        contractData.amount,
        contractData.paymentSchedule?.mobilizationAmount,
        contractData.commercialSchedule?.mobilizationAmount,
        annualValue > 0 ? annualValue * 0.15 : 0
    );
}

function contractPaymentIsVerified(contractData: FirebaseFirestore.DocumentData) {
    const paymentStatus = String(
        contractData.paymentStatus ||
        contractData.paymentSchedule?.paymentStatus ||
        contractData.commercialSchedule?.paymentStatus ||
        ''
    ).trim().toUpperCase();

    return contractData.paymentVerified === true ||
        contractData.paymentSchedule?.paymentVerified === true ||
        contractData.commercialSchedule?.paymentVerified === true ||
        ['VERIFIED', 'RECONCILED', 'ADMIN_VERIFIED', 'PAID'].includes(paymentStatus);
}

function ownerLifecyclePatch(contractId: string, authEmail: string, termFields: any, now: any, paymentVerified: boolean) {
    const active = paymentVerified === true;
    return {
        email: authEmail || null,
        latestActivationContractId: contractId,
        activeContractId: contractId,
        contractSignatureStatus: active ? 'ACTIVE' : 'OWNER_SIGNED',
        activationStatus: active ? 'ACTIVE' : 'READY_FOR_ACTIVATION',
        status: active ? 'ACTIVE' : 'PENDING_PAYMENT_VERIFICATION',
        activeContractTermMonths: OWNER_CONTRACT_TERM_MONTHS,
        activeContractValidFrom: termFields.effectiveFrom,
        activeContractValidTo: termFields.validTo,
        ownerCanRequestPlanChangeUntil: termFields.ownerCanRequestPlanChangeUntil,
        dashboardLocked: !active,
        dashboardUnlocked: active,
        ...(active ? { adminApproved: true, paymentVerified: true } : {}),
        updatedAt: now,
    };
}

export const createOwnerPaymentTransaction = onCall({ cors: true }, async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "User authentication required.");

    const method = String(request.data?.method || "").trim().toUpperCase();
    const contractId = String(request.data?.contractId || "").trim();
    const requestedAmount = Number(request.data?.amount || 0);
    const currency = String(request.data?.currency || "AED").trim().toUpperCase();
    const provider = String(request.data?.provider || "MANUAL").trim().toUpperCase();
    const reference = String(request.data?.reference || "").trim();
    const amountSource = String(request.data?.amountSource || "CLIENT").trim().toUpperCase();

    if (!contractId) throw new HttpsError("invalid-argument", "contractId is required.");
    if (!["BANK_TRANSFER", "CARD", "TAP", "STRIPE", "MANUAL"].includes(method)) throw new HttpsError("invalid-argument", "Unsupported payment method.");

    const contractSnap = await runtimeDb.collection("contracts").doc(contractId).get();
    if (!contractSnap.exists) throw new HttpsError("not-found", "Contract not found.");

    const contractData = contractSnap.data() || {};
    if (!callerOwnsContract(request.auth, contractData)) throw new HttpsError("permission-denied", "Contract does not belong to the authenticated owner.");

    const existingPendingSnap = await runtimeDb.collection("payment_transactions")
        .where("contractId", "==", contractId)
        .where("ownerUid", "==", request.auth.uid)
        .where("status", "==", "PENDING")
        .limit(1)
        .get();

    if (!existingPendingSnap.empty) {
        const existingDoc = existingPendingSnap.docs[0];
        const existing = existingDoc.data() || {};
        return {
            paymentId: existingDoc.id,
            status: existing.status || "PENDING",
            verificationState: existing.verificationState || "ADMIN_VERIFICATION_REQUIRED",
            amountPendingAdminConfirmation: existing.amountPendingAdminConfirmation === true,
            idempotent: true,
        };
    }

    const contractStatus = String(contractData.status || "").trim().toUpperCase();
    const signedOrReady = ["READY_FOR_ACTIVATION", "ACTIVE", "SIGNED"].includes(contractStatus) || contractData.ownerSigned === true || contractData.signatureStatus === "OWNER_SIGNED";
    const contractAmount = contractMoneyValue(contractData);
    const amount = Number.isFinite(requestedAmount) && requestedAmount > 0 ? requestedAmount : contractAmount;
    const amountPendingAdminConfirmation = !(Number.isFinite(amount) && amount > 0);

    if (amountPendingAdminConfirmation && !(signedOrReady && amountSource === "OWNER_CONFIRMATION_FALLBACK")) {
        throw new HttpsError("invalid-argument", "A positive payment amount is required unless the signed contract is pending admin amount confirmation.");
    }

    const contractOwnerEmail = resolveContractOwnerEmail(contractData);
    const authEmail = normalizeEmail(request.auth.token?.email);
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
        amount: amountPendingAdminConfirmation ? 0 : amount,
        amountPendingAdminConfirmation,
        amountSource: amountPendingAdminConfirmation ? "ADMIN_CONFIRMATION_REQUIRED" : amountSource,
        currency,
        method,
        paymentMethod: method,
        provider,
        reference,
        status: "PENDING",
        verificationState: amountPendingAdminConfirmation ? "AMOUNT_CONFIRMATION_REQUIRED" : "ADMIN_VERIFICATION_REQUIRED",
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
        metadata: { contractId, amount: amountPendingAdminConfirmation ? 0 : amount, currency, method, provider, amountPendingAdminConfirmation },
        createdAt: now,
    });

    return { paymentId: paymentRef.id, status: "PENDING", verificationState: amountPendingAdminConfirmation ? "AMOUNT_CONFIRMATION_REQUIRED" : "ADMIN_VERIFICATION_REQUIRED", amountPendingAdminConfirmation };
});

export const adminVerifyOwnerPaymentTransaction = onCall({ cors: true }, async (request) => {
    await assertAdmin(request.auth);
    const paymentId = requirePaymentId(request.data);
    const now = admin.firestore.FieldValue.serverTimestamp();
    const paymentRef = runtimeDb.collection("payment_transactions").doc(paymentId);

    await runtimeDb.runTransaction(async (transaction) => {
        const paymentSnap = await transaction.get(paymentRef);
        if (!paymentSnap.exists) throw new HttpsError("not-found", "Payment transaction not found.");
        const payment = paymentSnap.data() || {};
        const contractId = String(payment.contractId || "").trim();
        if (!contractId) throw new HttpsError("failed-precondition", "Payment transaction is not linked to a contract.");

        const contractRef = runtimeDb.collection("contracts").doc(contractId);
        const contractSnap = await transaction.get(contractRef);
        if (!contractSnap.exists) throw new HttpsError("not-found", "Linked contract not found.");
        const contractData = contractSnap.data() || {};
        const termFields = termFieldsFromStart(asDate(contractData.contractStartDate || contractData.effectiveFrom || payment.createdAt?.toDate?.() || new Date()));

        transaction.update(paymentRef, {
            status: "VERIFIED",
            verificationState: "ADMIN_VERIFIED",
            paymentVerified: true,
            dashboardUnlocked: true,
            verifiedBy: request.auth?.uid || null,
            verifiedAt: now,
            updatedAt: now,
        });

        transaction.update(contractRef, {
            paymentVerified: true,
            paymentStatus: "VERIFIED",
            dashboardUnlocked: true,
            activationStatus: "ACTIVE",
            status: "ACTIVE",
            signatureStatus: "ACTIVE",
            contractStatus: "ACTIVE",
            ...termFields,
            updatedAt: now,
        });

        const ownerUid = String(contractData.ownerUid || contractData.ownerId || payment.ownerUid || "").trim();
        if (ownerUid) {
            const ownerRef = runtimeDb.collection("owners").doc(ownerUid);
            transaction.set(ownerRef, ownerLifecyclePatch(contractId, payment.ownerEmail || contractData.ownerEmail || "", termFields, now, true), { merge: true });
        }
    });

    await runtimeDb.collection("audit_logs").add({
        actorId: request.auth?.uid || null,
        actorRole: request.auth?.token?.role || "admin",
        action: "ADMIN_VERIFY_OWNER_PAYMENT_TRANSACTION",
        targetType: "payment_transactions",
        targetId: paymentId,
        createdAt: now,
    });

    return { paymentId, status: "VERIFIED" };
});

export const adminRejectOwnerPaymentTransaction = onCall({ cors: true }, async (request) => {
    await assertAdmin(request.auth);
    const paymentId = requirePaymentId(request.data);
    const reason = String(request.data?.reason || "Payment evidence could not be verified.").trim();
    const now = admin.firestore.FieldValue.serverTimestamp();
    await runtimeDb.collection("payment_transactions").doc(paymentId).set({
        status: "REJECTED",
        verificationState: "ADMIN_REJECTED",
        paymentVerified: false,
        dashboardUnlocked: false,
        rejectionReason: reason,
        rejectedBy: request.auth?.uid || null,
        rejectedAt: now,
        updatedAt: now,
    }, { merge: true });
    return { paymentId, status: "REJECTED" };
});

export const adminApproveOwnerCommercialSchedule = onCall({ cors: true }, async (request) => {
    await assertAdmin(request.auth);
    const contractId = String(request.data?.contractId || "").trim();
    if (!contractId) throw new HttpsError("invalid-argument", "contractId is required.");

    const contractRef = runtimeDb.collection("contracts").doc(contractId);
    const snap = await contractRef.get();
    if (!snap.exists) throw new HttpsError("not-found", "Contract not found.");
    const patch = buildOwnerCommercialApprovalPatch(snap.data() || {}, request.auth?.uid || "admin");
    await contractRef.set(patch, { merge: true });
    return { contractId, status: "APPROVED", patch };
});

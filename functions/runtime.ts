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
export * from "./aiAssistant";

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
        throw new HttpsError("failed-precondition", "Payment amount could not be resolved from the contract.");
    }

    const paymentId = `pay_${contractId}_${Date.now()}`;
    const paymentDoc = {
        paymentId,
        contractId,
        ownerUid: request.auth.uid,
        ownerId: request.auth.uid,
        ownerEmail: normalizeEmail(request.auth.token?.email),
        method,
        provider,
        reference,
        amount: Number.isFinite(amount) ? Math.round(amount * 100) / 100 : null,
        currency,
        status: "PENDING",
        verificationState: "ADMIN_VERIFICATION_REQUIRED",
        amountPendingAdminConfirmation,
        amountSource,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    await runtimeDb.collection("payment_transactions").doc(paymentId).set(paymentDoc, { merge: true });
    return { paymentId, status: "PENDING", verificationState: "ADMIN_VERIFICATION_REQUIRED", amountPendingAdminConfirmation };
});

export const adminVerifyOwnerPayment = onCall({ cors: true }, async (request) => {
    await assertAdmin(request.auth);
    const paymentId = requirePaymentId(request.data);
    const paymentRef = runtimeDb.collection("payment_transactions").doc(paymentId);
    const paymentSnap = await paymentRef.get();
    if (!paymentSnap.exists) throw new HttpsError("not-found", "Payment transaction not found.");

    const payment = paymentSnap.data() || {};
    const contractId = String(payment.contractId || request.data?.contractId || "").trim();
    if (!contractId) throw new HttpsError("failed-precondition", "Payment transaction is missing contractId.");

    const contractRef = runtimeDb.collection("contracts").doc(contractId);
    const contractSnap = await contractRef.get();
    if (!contractSnap.exists) throw new HttpsError("not-found", "Contract not found.");
    const contractData = contractSnap.data() || {};

    const ownerUid = String(contractData.ownerUid || contractData.ownerId || payment.ownerUid || payment.ownerId || "").trim();
    const ownerEmail = resolveContractOwnerEmail(contractData) || normalizeEmail(payment.ownerEmail);
    const now = admin.firestore.FieldValue.serverTimestamp();
    const baseDate = asDate(contractData.ownerSignedAt || contractData.createdAt || payment.createdAt) || new Date();
    const termFields = termFieldsFromStart(baseDate);
    const adminUid = request.auth?.uid || "admin";
    const amountReceived = firstPositiveNumber(payment.amount, payment.amountReceived, contractMoneyValue(contractData));
    const annualContractValue = contractAnnualValue(contractData);
    const mobilizationAmount = contractMoneyValue(contractData);
    const paymentVerified = contractPaymentIsVerified({ ...contractData, paymentVerified: true, paymentStatus: "VERIFIED" });

    const commercialApproval = buildOwnerCommercialApprovalPatch({
        payment,
        contractData,
        contractId,
        paymentId,
        termFields,
        now,
        approvedAt: baseDate,
        approvedBy: adminUid,
        adminUid,
        amountReceived,
        annualContractValue,
        mobilizationAmount,
        paymentReferenceId: payment.reference || payment.paymentReferenceId || payment.paymentId || paymentId,
        paymentPlan: payment.paymentPlan || contractData.paymentPlan || contractData.paymentSchedule?.paymentPlan || "manual",
    });

    const batch = runtimeDb.batch();
    batch.set(paymentRef, {
        ...(commercialApproval.paymentPatch || {}),
        status: "VERIFIED",
        verificationState: "ADMIN_VERIFIED",
        paymentVerified: true,
        verifiedBy: adminUid,
        verifiedAt: now,
        updatedAt: now,
    }, { merge: true });
    batch.set(contractRef, commercialApproval.contractPatch || commercialApproval, { merge: true });

    if (ownerUid) {
        const ownerPatch = ownerLifecyclePatch(contractId, ownerEmail, termFields, now, paymentVerified);
        batch.set(runtimeDb.collection("owners").doc(ownerUid), ownerPatch, { merge: true });
        batch.set(runtimeDb.collection("users").doc(ownerUid), {
            role: "owner",
            ...ownerPatch,
        }, { merge: true });
    }

    await batch.commit();
    return { ok: true, contractId, ownerUid, status: "ACTIVE" };
});

export const adminRejectOwnerPayment = onCall({ cors: true }, async (request) => {
    await assertAdmin(request.auth);
    const paymentId = requirePaymentId(request.data);
    const reason = String(request.data?.reason || "Payment proof could not be verified.").trim().slice(0, 500);
    await runtimeDb.collection("payment_transactions").doc(paymentId).set({
        status: "REJECTED",
        verificationState: "ADMIN_REJECTED",
        rejectionReason: reason,
        paymentVerified: false,
        rejectedBy: request.auth?.uid || "admin",
        rejectedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
    return { ok: true, paymentId, status: "REJECTED" };
});

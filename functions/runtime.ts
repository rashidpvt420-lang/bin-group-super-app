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

export const ownerSignContract = onCall({ cors: true }, async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Owner authentication required.");

    const contractId = String(request.data?.contractId || "").trim();
    const signatureName = String(request.data?.signatureName || request.auth.token?.name || request.auth.token?.email || "").trim();
    const accepted = request.data?.acceptedTerms === true;

    if (!contractId) throw new HttpsError("invalid-argument", "contractId is required.");
    if (!accepted) throw new HttpsError("failed-precondition", "Owner must accept the contract terms before signing.");

    const contractRef = runtimeDb.collection("contracts").doc(contractId);
    const contractSnap = await contractRef.get();
    if (!contractSnap.exists) throw new HttpsError("not-found", "Contract not found.");

    const contractData = contractSnap.data() || {};
    if (!callerOwnsContract(request.auth, contractData)) throw new HttpsError("permission-denied", "Contract does not belong to the authenticated owner.");

    const status = String(contractData.status || contractData.activationStatus || contractData.signatureState?.status || "").trim().toUpperCase();
    const terminalStatuses = ["READY_FOR_ACTIVATION", "ACTIVE", "SIGNED"];
    if (terminalStatuses.includes(status) || contractData.ownerSigned === true || contractData.signatureStatus === "OWNER_SIGNED") {
        const now = admin.firestore.FieldValue.serverTimestamp();
        const previousStart = asDate(contractData.ownerSignature?.signedAt) || asDate(contractData.ownerSignedAt) || asDate(contractData.signedAt) || asDate(contractData.effectiveFrom) || new Date();
        const termFields = termFieldsFromStart(previousStart);
        await contractRef.set({
            ownerUid: request.auth.uid,
            ownerId: request.auth.uid,
            ownerEmail: normalizeEmail(request.auth.token?.email) || resolveContractOwnerEmail(contractData) || null,
            ownerSigned: true,
            signatureStatus: "OWNER_SIGNED",
            ...termFields,
            updatedAt: now,
        }, { merge: true });
        return { contractId, status: status || "READY_FOR_ACTIVATION", ownerSigned: true, idempotent: true, ...termFields };
    }

    const allowedStatuses = ["DRAFT", "PENDING_SIGNATURE", "PENDING_OWNER_SIGNATURE", "PENDING_APPROVAL", "PENDING_PAYMENT", "PAYMENT_PENDING", "APPROVED"];
    if (status && !allowedStatuses.includes(status)) throw new HttpsError("failed-precondition", `Contract cannot be signed from status ${status}.`);

    const now = admin.firestore.FieldValue.serverTimestamp();
    const termFields = termFieldsFromStart(new Date());
    const paymentVerified = contractPaymentIsVerified(contractData);
    const authEmail = normalizeEmail(request.auth.token?.email) || resolveContractOwnerEmail(contractData);
    await contractRef.set({
        ownerUid: request.auth.uid,
        ownerId: request.auth.uid,
        ownerEmail: authEmail || null,
        ownerSigned: true,
        ownerSignedAt: now,
        signedAt: now,
        signatureStatus: "OWNER_SIGNED",
        signatureState: {
            ...(contractData.signatureState || {}),
            ownerSigned: true,
            ownerSignedAt: new Date().toISOString(),
            status: paymentVerified ? "ACTIVE" : "OWNER_SIGNED",
        },
        ownerSignature: {
            name: signatureName,
            signedAt: now,
            signedByUid: request.auth.uid,
            signedByEmail: authEmail || null,
            method: "OWNER_APP_DIGITAL_ACCEPTANCE",
        },
        ...termFields,
        ...ownerLifecyclePatch(contractId, authEmail, termFields, now, paymentVerified),
    }, { merge: true });

    const paymentSnap = await runtimeDb.collection("payment_transactions")
        .where("contractId", "==", contractId)
        .where("ownerUid", "==", request.auth.uid)
        .where("status", "==", "PENDING")
        .limit(1)
        .get();

    if (!paymentSnap.empty) {
        const paymentRef = paymentSnap.docs[0].ref;
        await paymentRef.set({
            ownerSignedAt: now,
            contractSignatureStatus: "OWNER_SIGNED",
            verificationState: paymentVerified ? "VERIFIED" : "ADMIN_VERIFICATION_REQUIRED",
            updatedAt: now,
        }, { merge: true });
    }

    const ownerRef = runtimeDb.collection("owners").doc(request.auth.uid);
    await ownerRef.set(ownerLifecyclePatch(contractId, authEmail, termFields, now, paymentVerified), { merge: true });

    await runtimeDb.collection("audit_logs").add({
        actorId: request.auth.uid,
        actorRole: request.auth.token?.role || "owner",
        action: "OWNER_SIGN_CONTRACT",
        targetType: "contracts",
        targetId: contractId,
        metadata: { paymentVerified, statusBefore: status || null, termMonths: OWNER_CONTRACT_TERM_MONTHS },
        createdAt: now,
    });

    return { contractId, status: paymentVerified ? "ACTIVE" : "OWNER_SIGNED", ownerSigned: true, paymentVerified, ...termFields };
});

export const approveOwnerPayment = onCall({ cors: true }, async (request) => {
    await assertAdmin(request.auth);
    const paymentId = requirePaymentId(request.data);
    const approvalNote = String(request.data?.approvalNote || request.data?.note || "Approved by BIN GROUP admin.").trim();

    const paymentRef = runtimeDb.collection("payment_transactions").doc(paymentId);
    const paymentSnap = await paymentRef.get();
    if (!paymentSnap.exists) throw new HttpsError("not-found", "Payment transaction not found.");
    const paymentData = paymentSnap.data() || {};
    const contractId = String(paymentData.contractId || "").trim();
    if (!contractId) throw new HttpsError("failed-precondition", "Payment transaction is not linked to a contract.");

    const contractRef = runtimeDb.collection("contracts").doc(contractId);
    const contractSnap = await contractRef.get();
    if (!contractSnap.exists) throw new HttpsError("not-found", "Linked contract not found.");
    const contractData = contractSnap.data() || {};

    const ownerId = String(paymentData.ownerUid || paymentData.ownerId || contractData.ownerUid || contractData.ownerId || "").trim();
    if (!ownerId) throw new HttpsError("failed-precondition", "Unable to resolve owner account for payment approval.");

    const now = admin.firestore.FieldValue.serverTimestamp();
    const amount = Number(paymentData.amount || paymentData.mobilizationAmount || contractMoneyValue(contractData) || 0);
    const termStart = asDate(contractData.ownerSignedAt) || asDate(contractData.signedAt) || new Date();
    const termFields = termFieldsFromStart(termStart);
    const authEmail = normalizeEmail(request.auth?.token?.email);
    const commercialPatch = buildOwnerCommercialApprovalPatch({
        contractId,
        annualContractValue: contractAnnualValue(contractData),
        mobilizationAmount: amount,
        paymentPlan: String(contractData.paymentPlan || contractData.paymentSchedule?.paymentPlan || 'manual'),
        ownerEmail: resolveContractOwnerEmail(contractData),
        approvedBy: request.auth?.uid || 'admin',
        approvedAt: now,
    });

    await runtimeDb.runTransaction(async (transaction) => {
        transaction.set(paymentRef, {
            status: "APPROVED",
            verificationState: "VERIFIED",
            paymentVerified: true,
            verified: true,
            verifiedAt: now,
            approvedAt: now,
            approvedBy: request.auth?.uid || "admin",
            approvalNote,
            dashboardUnlocked: true,
            contractActivated: true,
            updatedAt: now,
        }, { merge: true });

        transaction.set(contractRef, {
            status: "ACTIVE",
            activationStatus: "ACTIVE",
            contractStatus: "ACTIVE",
            paymentStatus: "VERIFIED",
            paymentVerified: true,
            approved: true,
            adminApproved: true,
            approvedAt: now,
            approvedBy: request.auth?.uid || "admin",
            activePaymentTransactionId: paymentId,
            activeMobilizationAmount: amount,
            activeContractTermMonths: OWNER_CONTRACT_TERM_MONTHS,
            ...termFields,
            ...commercialPatch,
            updatedAt: now,
        }, { merge: true });

        transaction.set(runtimeDb.collection("owners").doc(ownerId), {
            status: "ACTIVE",
            activationStatus: "ACTIVE",
            paymentStatus: "VERIFIED",
            paymentVerified: true,
            adminApproved: true,
            dashboardUnlocked: true,
            dashboardLocked: false,
            activeContractId: contractId,
            activePaymentTransactionId: paymentId,
            activeMobilizationAmount: amount,
            activeContractTermMonths: OWNER_CONTRACT_TERM_MONTHS,
            activeContractValidFrom: termFields.effectiveFrom,
            activeContractValidTo: termFields.validTo,
            ownerCanRequestPlanChangeUntil: termFields.ownerCanRequestPlanChangeUntil,
            approvedBy: request.auth?.uid || "admin",
            approvedByEmail: authEmail || null,
            approvedAt: now,
            updatedAt: now,
        }, { merge: true });

        transaction.set(runtimeDb.collection("users").doc(ownerId), {
            role: "owner",
            status: "ACTIVE",
            activationStatus: "ACTIVE",
            dashboardUnlocked: true,
            dashboardLocked: false,
            activeContractId: contractId,
            activePaymentTransactionId: paymentId,
            updatedAt: now,
        }, { merge: true });
    });

    await runtimeDb.collection("audit_logs").add({
        actorId: request.auth?.uid || "admin",
        actorRole: request.auth?.token?.role || "admin",
        action: "APPROVE_OWNER_PAYMENT",
        targetType: "payment_transactions",
        targetId: paymentId,
        metadata: { contractId, ownerId, amount, approvalNote, termMonths: OWNER_CONTRACT_TERM_MONTHS },
        createdAt: now,
    });

    return { paymentId, contractId, ownerId, status: "APPROVED", dashboardUnlocked: true, ...termFields };
});

export const rejectOwnerPayment = onCall({ cors: true }, async (request) => {
    await assertAdmin(request.auth);
    const paymentId = requirePaymentId(request.data);
    const rejectionReason = String(request.data?.rejectionReason || request.data?.reason || "Rejected by BIN GROUP admin.").trim();

    const paymentRef = runtimeDb.collection("payment_transactions").doc(paymentId);
    const paymentSnap = await paymentRef.get();
    if (!paymentSnap.exists) throw new HttpsError("not-found", "Payment transaction not found.");
    const paymentData = paymentSnap.data() || {};
    const contractId = String(paymentData.contractId || "").trim();
    const ownerId = String(paymentData.ownerUid || paymentData.ownerId || "").trim();
    const now = admin.firestore.FieldValue.serverTimestamp();

    await paymentRef.set({
        status: "REJECTED",
        verificationState: "REJECTED",
        paymentVerified: false,
        verified: false,
        rejectedAt: now,
        rejectedBy: request.auth?.uid || "admin",
        rejectionReason,
        dashboardUnlocked: false,
        contractActivated: false,
        updatedAt: now,
    }, { merge: true });

    if (contractId) {
        await runtimeDb.collection("contracts").doc(contractId).set({
            paymentStatus: "REJECTED",
            paymentVerified: false,
            activationStatus: "PAYMENT_REJECTED",
            status: "PAYMENT_REJECTED",
            rejectionReason,
            updatedAt: now,
        }, { merge: true });
    }

    if (ownerId) {
        await runtimeDb.collection("owners").doc(ownerId).set({
            status: "PAYMENT_REJECTED",
            activationStatus: "PAYMENT_REJECTED",
            dashboardUnlocked: false,
            dashboardLocked: true,
            rejectionReason,
            updatedAt: now,
        }, { merge: true });
    }

    await runtimeDb.collection("audit_logs").add({
        actorId: request.auth?.uid || "admin",
        actorRole: request.auth?.token?.role || "admin",
        action: "REJECT_OWNER_PAYMENT",
        targetType: "payment_transactions",
        targetId: paymentId,
        metadata: { contractId, ownerId, rejectionReason },
        createdAt: now,
    });

    return { paymentId, contractId, ownerId, status: "REJECTED" };
});

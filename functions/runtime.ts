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
        return { contractId, status: status || "READY_FOR_ACTIVATION", ownerSigned: true, idempotent: true, contractTermMonths: OWNER_CONTRACT_TERM_MONTHS, termSummary: termFields.termSummary };
    }

    const signableStatuses = ["PENDING_OWNER_SIGNATURE", "APPROVED_PENDING_OWNER_SIGNATURE", "PENDING_SIGNATURE", "DRAFT", "PENDING"];
    if (!signableStatuses.includes(status)) {
        throw new HttpsError("failed-precondition", `Contract cannot be signed from status ${status || "UNKNOWN"}.`);
    }

    const now = admin.firestore.FieldValue.serverTimestamp();
    const signedAtDate = new Date();
    const signedAt = admin.firestore.Timestamp.fromDate(signedAtDate);
    const termFields = termFieldsFromStart(signedAtDate);
    const authEmail = normalizeEmail(request.auth.token?.email);
    const paymentVerified = contractPaymentIsVerified(contractData);
    const nextStatus = paymentVerified ? "ACTIVE" : "READY_FOR_ACTIVATION";
    const nextContractStatus = paymentVerified ? "signed_active" : "owner_signed_ready_for_payment_verification";
    const batch = runtimeDb.batch();

    batch.set(contractRef, {
        ownerUid: request.auth.uid,
        ownerId: request.auth.uid,
        ownerEmail: authEmail || resolveContractOwnerEmail(contractData) || null,
        status: nextStatus,
        activationStatus: nextStatus,
        contractStatus: nextContractStatus,
        paymentVerified,
        dashboardLocked: !paymentVerified,
        dashboardUnlocked: paymentVerified,
        ownerSigned: true,
        ownerSignedAt: signedAt,
        signedAt,
        signatureStatus: "OWNER_SIGNED",
        signatureState: {
            ...(contractData.signatureState || {}),
            ownerSigned: true,
            ownerSignedAt: signedAtDate.toISOString(),
            status: paymentVerified ? "ACTIVE" : "OWNER_SIGNED",
        },
        ...termFields,
        ownerSignature: {
            uid: request.auth.uid,
            email: authEmail || resolveContractOwnerEmail(contractData) || null,
            name: signatureName || request.auth.token?.email || request.auth.uid,
            acceptedTerms: true,
            signedAt,
            contractTermMonths: OWNER_CONTRACT_TERM_MONTHS,
            effectiveFrom: termFields.effectiveFrom,
            validTo: termFields.validTo,
            firstMonthWindowEndsAt: termFields.firstMonthWindowEndsAt,
        },
        updatedAt: now,
    }, { merge: true });

    const ownerPatch = ownerLifecyclePatch(contractId, authEmail, termFields, now, paymentVerified);
    batch.set(runtimeDb.collection("users").doc(request.auth.uid), ownerPatch, { merge: true });
    batch.set(runtimeDb.collection("owners").doc(request.auth.uid), ownerPatch, { merge: true });

    batch.set(runtimeDb.collection("audit_logs").doc(), {
        actorId: request.auth.uid,
        actorRole: request.auth.token?.role || "owner",
        action: "OWNER_SIGN_CONTRACT",
        targetType: "contracts",
        targetId: contractId,
        metadata: { previousStatus: status, nextStatus, contractTermMonths: OWNER_CONTRACT_TERM_MONTHS, termSummary: termFields.termSummary, authEmail, contractEmails: emailCandidates(contractData), paymentVerified },
        createdAt: now,
    });

    await batch.commit();
    return { contractId, status: nextStatus, ownerSigned: true, paymentVerified, dashboardUnlocked: paymentVerified, contractTermMonths: OWNER_CONTRACT_TERM_MONTHS, termSummary: termFields.termSummary };
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

    const contractRef = contractId ? runtimeDb.collection("contracts").doc(contractId) : null;
    const contractSnap = contractRef ? await contractRef.get() : null;
    const contractData = contractSnap?.exists ? (contractSnap.data() || {}) : {};

    if (!ownerUid) {
        ownerUid = String(contractData.ownerUid || contractData.ownerId || "").trim();
    }

    const intakeId = String(payment.intakeId || contractData.intakeId || "").trim();
    let intakeData: Record<string, any> = {};
    if (intakeId) {
        const intakeSnap = await runtimeDb.collection("intake_submissions").doc(intakeId).get();
        if (intakeSnap.exists) {
            intakeData = intakeSnap.data() || {};
        }
    } else if (ownerUid) {
        const intakeQuery = await runtimeDb.collection("intake_submissions")
            .where("ownerUid", "==", ownerUid)
            .limit(1)
            .get();
        if (!intakeQuery.empty) {
            intakeData = intakeQuery.docs[0].data() || {};
        }
    }

    const amountReceived = Number(request.data?.amountReceived ?? payment.amount ?? payment.amountReceived ?? 0);
    const annualContractValue = Number(request.data?.annualContractValue ?? contractData.annualContractValue ?? contractData.annualValue ?? intakeData.annualContractValue ?? intakeData.portfolioSummary?.estimatedACV ?? 0);
    const mobilizationAmount = Number(request.data?.mobilizationAmount ?? contractData.mobilizationAmount ?? contractData.depositAmount ?? payment.mobilizationAmount ?? Math.round(annualContractValue * 0.15));
    const remainingBalance = Number(request.data?.remainingBalance ?? Math.max(annualContractValue - amountReceived, 0));
    const paymentPlan = String(request.data?.paymentPlan ?? contractData.paymentPlan ?? intakeData.paymentPlan ?? payment.paymentPlan ?? "ANNUAL").trim().toUpperCase();
    const paymentReferenceId = String(request.data?.paymentReferenceId ?? request.data?.paymentId ?? payment.reference ?? payment.paymentReferenceId ?? payment.id ?? "").trim();

    const approvedAtDate = new Date();
    const approvedAt = admin.firestore.Timestamp.fromDate(approvedAtDate);
    const effectiveDate = asDate(request.data?.effectiveFrom || contractData.effectiveFrom || contractData.validFrom || payment.effectiveFrom || approvedAtDate) || approvedAtDate;
    const termFields = termFieldsFromStart(effectiveDate);
    const adminUid = request.auth?.uid || "admin";

    const approvalPatch = buildOwnerCommercialApprovalPatch({
      requestData: request.data || {},
      payment,
      contractData,
      intakeData,
      amountReceived,
      annualContractValue,
      mobilizationAmount,
      remainingBalance,
      paymentPlan,
      paymentReferenceId,
      termFields,
      approvedAt,
      approvedAtIso: approvedAtDate.toISOString(),
      now,
      adminUid,
    });

    const batch = runtimeDb.batch();
    batch.set(paymentRef, approvalPatch.paymentPatch, { merge: true });

    if (contractRef) {
        batch.set(contractRef, {
            ...approvalPatch.contractPatch,
            adminApproved: true,
            adminApprovedAt: now,
            adminApprovedBy: adminUid,
            paymentVerified: true,
            paymentVerifiedAt: now,
            dashboardUnlocked: true,
            activationStatus: "ACTIVE",
            status: "ACTIVE",
        }, { merge: true });
    }

    if (ownerUid) {
        const ownerActivationPatch = {
            adminApproved: true,
            adminApprovedAt: now,
            adminApprovedBy: adminUid,
            paymentVerified: true,
            paymentVerifiedAt: now,
            dashboardUnlocked: true,
            dashboardLocked: false,
            activeContractId: contractId || null,
            latestActivationContractId: contractId || null,
            activationStatus: "ACTIVE",
            contractSignatureStatus: "OWNER_SIGNED",
            status: "ACTIVE",
            updatedAt: now,
        };

        batch.set(runtimeDb.collection("users").doc(ownerUid), ownerActivationPatch, { merge: true });
        batch.set(runtimeDb.collection("owners").doc(ownerUid), ownerActivationPatch, { merge: true });
    }

    batch.set(runtimeDb.collection("audit_logs").doc(), {
        actorId: request.auth?.uid || "admin",
        actorRole: request.auth?.token?.role || "admin",
        action: "VERIFY_OWNER_PAYMENT_TRANSACTION",
        targetType: collectionName,
        targetId: paymentId,
        metadata: {
            ownerUid,
            contractId,
            ...approvalPatch.auditMetadata,
        },
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
            ownerUid = String(contractData.ownerUid || contractData.ownerId || "").trim();
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
export const adminApprovePayment = verifyOwnerPaymentTransaction;
export const adminRejectPayment = rejectOwnerPaymentTransaction;

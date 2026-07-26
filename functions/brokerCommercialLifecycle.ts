import * as admin from "firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import { onDocumentWritten } from "firebase-functions/v2/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { createBrokerCommissionForContract } from "./brokerCommissions";

if (!admin.apps.length) admin.initializeApp();

const db = admin.firestore();
const ADMIN_ROLES = new Set(["admin", "super_admin", "ceo", "finance_admin", "operations_admin"]);
const LEASE_MS = 60_000;
const text = (value: unknown, max = 500) => String(value ?? "").trim().slice(0, max);
const lower = (value: unknown, max = 200) => text(value, max).toLowerCase();
const upper = (value: unknown, max = 120) => text(value, max).toUpperCase();

type Attribution = {
  brokerId: string;
  brokerUid: string;
  brokerName: string;
  brokerCode: string;
  brokerEmail: string;
  leadId: string;
  sourceLeadId: string;
  attributionId: string;
  linkedLeadName: string;
  ownerUid: string;
  ownerEmail: string;
  intakeId: string;
};

function roleOf(token: Record<string, unknown> = {}) {
  const role = lower(token.role || token.userRole || token.primaryRole);
  if (role) return role;
  if (token.ceo === true) return "ceo";
  if (token.superAdmin === true || token.super_admin === true) return "super_admin";
  if (token.admin === true || token.isAdmin === true) return "admin";
  return "";
}

function attributionFields(value: FirebaseFirestore.DocumentData): Attribution {
  return {
    brokerId: text(value.brokerId || value.brokerUid, 180),
    brokerUid: text(value.brokerUid || value.brokerId, 180),
    brokerName: text(value.brokerName, 200),
    brokerCode: text(value.brokerCode, 120),
    brokerEmail: lower(value.brokerEmail, 320),
    leadId: text(value.leadId || value.sourceLeadId, 180),
    sourceLeadId: text(value.sourceLeadId || value.leadId, 180),
    attributionId: text(value.attributionId, 320),
    linkedLeadName: text(value.linkedLeadName || value.leadName, 240),
    ownerUid: text(value.ownerUid, 180),
    ownerEmail: lower(value.ownerEmail, 320),
    intakeId: text(value.intakeId, 180),
  };
}

function contractAttribution(attribution: Attribution) {
  return {
    brokerId: attribution.brokerId,
    brokerUid: attribution.brokerUid,
    brokerName: attribution.brokerName,
    brokerCode: attribution.brokerCode,
    brokerEmail: attribution.brokerEmail,
    brokerLeadId: attribution.leadId,
    sourceLeadId: attribution.sourceLeadId,
    attributionId: attribution.attributionId,
    linkedLeadName: attribution.linkedLeadName,
  };
}

function isContractBound(contract: FirebaseFirestore.DocumentData, attribution: Attribution) {
  return text(contract.brokerId || contract.brokerUid, 180) === attribution.brokerId &&
    text(contract.sourceLeadId || contract.brokerLeadId, 180) === attribution.leadId &&
    text(contract.attributionId, 320) === attribution.attributionId;
}

async function requireOwner(auth: any) {
  if (!auth?.uid) throw new HttpsError("unauthenticated", "Owner login required.");
  const [record, profileSnap] = await Promise.all([
    admin.auth().getUser(auth.uid),
    db.collection("users").doc(auth.uid).get(),
  ]);
  const profile = profileSnap.data() || {};
  const role = lower(record.customClaims?.role || record.customClaims?.userRole || profile.role || profile.userRole);
  if (record.disabled || role !== "owner") throw new HttpsError("permission-denied", "Owner authority is required.");
  if (!record.emailVerified || !record.email) throw new HttpsError("failed-precondition", "A verified Owner email is required.");
  return { uid: auth.uid, email: lower(record.email) };
}

async function requireAdmin(auth: any) {
  if (!auth?.uid) throw new HttpsError("unauthenticated", "Admin login required.");
  const token = auth.token || {};
  const role = roleOf(token);
  const authorized = token.admin === true || token.isAdmin === true || token.ceo === true ||
    token.superAdmin === true || token.super_admin === true || ADMIN_ROLES.has(role);
  if (!authorized || token.suspended === true) throw new HttpsError("permission-denied", "Admin authority is required.");
  const record = await admin.auth().getUser(auth.uid);
  if (record.disabled || !record.emailVerified) throw new HttpsError("permission-denied", "Admin account is not active and verified.");
  return { uid: auth.uid };
}

async function acquireLease(ref: FirebaseFirestore.DocumentReference) {
  return db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists) throw new HttpsError("not-found", "Broker attribution binding was not found.");
    const value = snapshot.data() || {};
    const leaseUntil = value.reconciliationLeaseUntil?.toMillis?.() || 0;
    if (upper(value.reconciliationState) === "RECONCILING" && leaseUntil > Date.now()) return false;
    transaction.set(ref, {
      reconciliationState: "RECONCILING",
      reconciliationLeaseUntil: admin.firestore.Timestamp.fromMillis(Date.now() + LEASE_MS),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    return true;
  });
}

async function reconcileConversion(intakeId: string, actorId: string) {
  const attributionRef = db.collection("broker_attributed_onboardings").doc(intakeId);
  const contractRef = db.collection("contracts").doc(intakeId);
  const commissionRef = db.collection("broker_commissions").doc(`commission_${intakeId}`);
  const leaseAcquired = await acquireLease(attributionRef);

  if (!leaseAcquired) {
    const existing = await commissionRef.get();
    if (existing.exists) {
      const value = existing.data() || {};
      return {
        status: "COMMISSION_CREATED",
        intakeId,
        commissionId: existing.id,
        brokerId: text(value.brokerId, 180),
        amount: Number(value.amount || 0),
        commissionStatus: text(value.status),
        idempotent: true,
      };
    }
    return { status: "RECONCILIATION_IN_PROGRESS", intakeId, idempotent: true };
  }

  try {
    const [attributionSnap, contractSnap, beforeCommission] = await Promise.all([
      attributionRef.get(),
      contractRef.get(),
      commissionRef.get(),
    ]);
    if (!contractSnap.exists) throw new HttpsError("failed-precondition", "Owner contract has not been created yet.");
    const attribution = attributionFields(attributionSnap.data() || {});
    const contract = contractSnap.data() || {};
    if (!attribution.brokerId || !attribution.leadId || !attribution.ownerUid) {
      throw new HttpsError("failed-precondition", "Broker attribution binding is incomplete.");
    }

    if (!isContractBound(contract, attribution)) {
      await contractRef.set({
        ...contractAttribution(attribution),
        brokerAttributionBoundAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
    }

    if (upper(contract.status) !== "ACTIVE") {
      await attributionRef.set({
        lifecycleStatus: "OWNER_ONBOARDING_LINKED",
        contractId: intakeId,
        reconciliationState: "WAITING_FOR_ACTIVE_CONTRACT",
        reconciliationLeaseUntil: FieldValue.delete(),
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
      return { status: "LINKED_PENDING_ACTIVATION", intakeId, commissionId: null, idempotent: true };
    }

    const enrichedContract = { ...contract, ...contractAttribution(attribution) };
    const result = await createBrokerCommissionForContract(intakeId, enrichedContract, {
      annualContractValue: Number(contract.quoteSnapshot?.annualContractValue || contract.annualContractValue || 0),
    });
    if (!result) throw new HttpsError("failed-precondition", "Active contract did not resolve a Broker commission.");

    const now = FieldValue.serverTimestamp();
    const batch = db.batch();
    batch.set(commissionRef, {
      brokerEmail: attribution.brokerEmail,
      brokerLeadId: attribution.leadId,
      sourceLeadId: attribution.sourceLeadId,
      attributionId: attribution.attributionId,
      linkedLeadName: attribution.linkedLeadName,
      ownerUid: attribution.ownerUid,
      ownerEmail: attribution.ownerEmail,
      intakeId,
      commissionLockKey: `commission_${intakeId}`,
      commissionLocked: true,
      commercialLifecycleStatus: "COMMISSION_CREATED_FROM_ACTIVATED_OWNER_CONTRACT",
      updatedAt: now,
    }, { merge: true });
    batch.set(db.collection("brokerLeads").doc(attribution.leadId), {
      status: "converted",
      lifecycleStatus: "LEAD_CONVERTED_CONTRACT_ACTIVE",
      ownerUid: attribution.ownerUid,
      ownerEmail: attribution.ownerEmail,
      intakeId,
      contractId: intakeId,
      commissionId: result.commissionId,
      commissionAmount: result.amount,
      convertedAt: now,
      updatedAt: now,
    }, { merge: true });
    batch.set(attributionRef, {
      lifecycleStatus: "COMMISSION_CREATED",
      contractId: intakeId,
      commissionId: result.commissionId,
      commissionAmount: result.amount,
      reconciledBy: actorId,
      reconciledAt: now,
      reconciliationState: "COMPLETED",
      reconciliationLeaseUntil: FieldValue.delete(),
      updatedAt: now,
    }, { merge: true });
    batch.set(db.collection("audit_logs").doc(`broker_conversion_${intakeId}`), {
      action: "BROKER_LEAD_CONVERTED_TO_ACTIVE_CONTRACT_COMMISSION",
      actorId,
      actorRole: actorId === "BROKER_ATTRIBUTION_TRIGGER" ? "system" : "admin",
      targetType: "brokerLeads",
      targetId: attribution.leadId,
      brokerId: attribution.brokerId,
      ownerUid: attribution.ownerUid,
      intakeId,
      contractId: intakeId,
      commissionId: result.commissionId,
      amount: result.amount,
      currency: "AED",
      idempotentReplay: beforeCommission.exists,
      trustLevel: "SERVER_AUTHORITATIVE",
      updatedAt: now,
      createdAt: now,
    }, { merge: true });
    await batch.commit();

    return {
      status: "COMMISSION_CREATED",
      intakeId,
      leadId: attribution.leadId,
      commissionId: result.commissionId,
      brokerId: result.brokerId,
      amount: result.amount,
      commissionStatus: result.status,
      idempotent: beforeCommission.exists,
    };
  } catch (error) {
    await attributionRef.set({
      reconciliationState: "FAILED",
      reconciliationLeaseUntil: FieldValue.delete(),
      reconciliationErrorCode: error instanceof HttpsError ? error.code : "internal",
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true }).catch(() => undefined);
    throw error;
  }
}

export const linkBrokerLeadToOwnerOnboarding = onCall(
  { cors: true, region: "europe-west3", enforceAppCheck: true },
  async (request) => {
    const owner = await requireOwner(request.auth);
    const leadId = text(request.data?.leadId, 180);
    const intakeId = text(request.data?.intakeId, 180);
    if (!leadId || !intakeId) throw new HttpsError("invalid-argument", "leadId and intakeId are required.");

    const leadRef = db.collection("brokerLeads").doc(leadId);
    const attributionRef = db.collection("broker_attributed_onboardings").doc(intakeId);
    const contractRef = db.collection("contracts").doc(intakeId);
    let idempotent = false;

    await db.runTransaction(async (transaction) => {
      const leadSnap = await transaction.get(leadRef);
      if (!leadSnap.exists) throw new HttpsError("not-found", "Broker lead was not found.");
      const lead = leadSnap.data() || {};
      const leadEmail = lower(lead.email, 320);
      const brokerId = text(lead.brokerId || lead.brokerUid, 180);
      if (!leadEmail || leadEmail !== owner.email) {
        throw new HttpsError("permission-denied", "The Broker lead email does not match the authenticated Owner.");
      }
      if (!brokerId) throw new HttpsError("failed-precondition", "Broker lead attribution is incomplete.");
      if (upper(lead.status) === "REJECTED") throw new HttpsError("failed-precondition", "Rejected Broker leads cannot be converted.");
      if (lead.ownerUid && text(lead.ownerUid, 180) !== owner.uid) {
        throw new HttpsError("already-exists", "This Broker lead is already bound to another Owner.");
      }

      const brokerRef = db.collection("users").doc(brokerId);
      const [brokerSnap, existingSnap, contractSnap] = await Promise.all([
        transaction.get(brokerRef),
        transaction.get(attributionRef),
        transaction.get(contractRef),
      ]);
      const broker = brokerSnap.data() || {};
      if (!brokerSnap.exists || lower(broker.role || broker.userRole) !== "broker" || ["suspended", "disabled", "rejected"].includes(lower(broker.status))) {
        throw new HttpsError("failed-precondition", "The attributed Broker account is not active.");
      }
      if (existingSnap.exists) {
        const existing = attributionFields(existingSnap.data() || {});
        if (existing.leadId !== leadId || existing.ownerUid !== owner.uid) {
          throw new HttpsError("already-exists", "This Owner onboarding already has a different Broker attribution.");
        }
        idempotent = true;
      }

      const now = FieldValue.serverTimestamp();
      const attribution: Attribution = {
        brokerId,
        brokerUid: brokerId,
        brokerName: text(lead.brokerName || broker.displayName || broker.name || "Broker", 200),
        brokerCode: text(lead.brokerCode || broker.brokerCode || broker.affiliateCode, 120) || `BIN-${brokerId.slice(0, 8).toUpperCase()}`,
        brokerEmail: lower(lead.brokerEmail || broker.email, 320),
        leadId,
        sourceLeadId: leadId,
        attributionId: text(lead.attributionId, 320) || `broker_lead_${brokerId}_${leadId}`,
        linkedLeadName: text(lead.leadName, 240),
        ownerUid: owner.uid,
        ownerEmail: owner.email,
        intakeId,
      };
      transaction.set(attributionRef, {
        ...attribution,
        lifecycleStatus: contractSnap.exists ? "OWNER_ONBOARDING_LINKED" : "OWNER_ACQUISITION_LINKED",
        idempotencyKey: `${leadId}:${owner.uid}:${intakeId}`,
        createdAt: existingSnap.exists ? existingSnap.data()?.createdAt || now : now,
        updatedAt: now,
      }, { merge: true });
      transaction.set(leadRef, {
        ownerUid: owner.uid,
        ownerEmail: owner.email,
        intakeId,
        status: upper(lead.status) === "CONVERTED" ? "converted" : "negotiation",
        lifecycleStatus: contractSnap.exists ? "LEAD_LINKED_TO_OWNER_ONBOARDING" : "LEAD_OWNER_ACQUISITION_STARTED",
        attributionLocked: true,
        updatedAt: now,
      }, { merge: true });
      if (contractSnap.exists) {
        transaction.set(contractRef, {
          ...contractAttribution(attribution),
          brokerAttributionBoundAt: now,
          updatedAt: now,
        }, { merge: true });
      }
      transaction.set(db.collection("audit_logs").doc(`broker_attribution_${intakeId}`), {
        action: "BROKER_LEAD_LINKED_TO_OWNER_ONBOARDING",
        actorId: owner.uid,
        actorRole: "owner",
        targetType: "brokerLeads",
        targetId: leadId,
        brokerId,
        ownerUid: owner.uid,
        intakeId,
        attributionId: attribution.attributionId,
        idempotentReplay: idempotent,
        trustLevel: "SERVER_AUTHORITATIVE",
        updatedAt: now,
        createdAt: now,
      }, { merge: true });
    });

    const contractSnap = await contractRef.get();
    const contract = contractSnap.data() || {};
    if (contractSnap.exists && upper(contract.status) === "ACTIVE") {
      const reconciled = await reconcileConversion(intakeId, owner.uid);
      return { status: "SUCCESS", leadId, intakeId, idempotent, reconciled };
    }
    return { status: "SUCCESS", leadId, intakeId, idempotent, reconciliation: "PENDING_CONTRACT_ACTIVATION" };
  },
);

export const reconcileBrokerCommercialConversion = onCall(
  { cors: true, region: "europe-west3", enforceAppCheck: true },
  async (request) => {
    const actor = await requireAdmin(request.auth);
    const intakeId = text(request.data?.intakeId || request.data?.contractId, 180);
    if (!intakeId) throw new HttpsError("invalid-argument", "intakeId or contractId is required.");
    return reconcileConversion(intakeId, actor.uid);
  },
);

export const reconcileBrokerAttributionOnContractWrite = onDocumentWritten(
  { document: "contracts/{contractId}", region: "europe-west3" },
  async (event) => {
    const contract = event.data?.after.exists ? event.data.after.data() || {} : null;
    if (!contract) return;
    const contractId = text(event.params.contractId, 180);
    const attributionSnap = await db.collection("broker_attributed_onboardings").doc(contractId).get();
    if (!attributionSnap.exists) return;
    const attribution = attributionFields(attributionSnap.data() || {});
    if (!attribution.brokerId || !attribution.leadId) return;
    if (upper(contract.status) === "ACTIVE") {
      if (isContractBound(contract, attribution) && contract.commissionGenerated === true) return;
      await reconcileConversion(contractId, "BROKER_ATTRIBUTION_TRIGGER");
      return;
    }
    if (isContractBound(contract, attribution)) return;
    await db.collection("contracts").doc(contractId).set({
      ...contractAttribution(attribution),
      brokerAttributionBoundAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
  },
);

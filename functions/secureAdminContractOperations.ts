import { createHash, randomUUID } from "node:crypto";
import * as admin from "firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";

if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();

const ADMIN_ROLES = new Set([
  "admin",
  "super_admin",
  "ceo",
  "manager",
  "operations_admin",
  "finance_admin",
  "account_manager",
  "operations_manager",
]);
const CLOSURE_REASONS = new Set([
  "OWNER_REQUEST",
  "NON_PAYMENT",
  "BREACH_OF_TERMS",
  "ADMIN_CORRECTION",
  "OTHER",
]);
const TERMINAL_CONTRACT_STATES = new Set(["CLOSED", "CANCELLED", "EXPIRED", "TERMINATED"]);

const text = (value: unknown, max = 1000) => String(value ?? "").trim().slice(0, max);
const upper = (value: unknown) => text(value, 100).toUpperCase().replace(/[\s-]+/g, "_");
const roleOf = (token: any) => text(token?.role || token?.userRole || token?.primaryRole, 80).toLowerCase();
const secondFactorOf = (token: any) => text(token?.firebase?.sign_in_second_factor || token?.sign_in_second_factor, 120);
const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");

async function requireMfaAdmin(auth: any) {
  if (!auth?.uid) throw new HttpsError("unauthenticated", "Admin login required.");
  const token = auth.token || {};
  const role = roleOf(token);
  const hasAdminAuthority =
    token.admin === true ||
    token.isAdmin === true ||
    token.super_admin === true ||
    token.superAdmin === true ||
    token.ceo === true ||
    ADMIN_ROLES.has(role);
  if (!hasAdminAuthority || token.suspended === true) {
    throw new HttpsError("permission-denied", "Approved Admin authority is required.");
  }

  const [userRecord, profileSnap] = await Promise.all([
    admin.auth().getUser(auth.uid),
    db.collection("users").doc(auth.uid).get(),
  ]);
  const profile = profileSnap.data() || {};
  if (
    userRecord.disabled ||
    profile.suspended === true ||
    ["suspended", "disabled", "rejected", "inactive"].includes(text(profile.status, 80).toLowerCase())
  ) {
    throw new HttpsError("permission-denied", "This Admin account is not active.");
  }
  if ((userRecord.multiFactor?.enrolledFactors || []).length <= 0) {
    throw new HttpsError("failed-precondition", "Admin MFA enrollment is required before closing a contract.");
  }
  if (!secondFactorOf(token)) {
    throw new HttpsError("permission-denied", "A verified Admin second-factor sign-in is required.");
  }
  return { uid: auth.uid, role: role || "admin", email: userRecord.email || null };
}

export const adminCloseContract = onCall(
  { cors: true, region: "europe-west3", enforceAppCheck: true, timeoutSeconds: 540, memory: "1GiB" },
  async (request) => {
    const actor = await requireMfaAdmin(request.auth);
    const contractId = text(request.data?.contractId, 180);
    const reason = upper(request.data?.reason);
    const note = text(request.data?.note, 1200);
    if (!contractId || !/^[A-Za-z0-9_-]{1,180}$/.test(contractId)) {
      throw new HttpsError("invalid-argument", "A valid contractId is required.");
    }
    if (!CLOSURE_REASONS.has(reason)) {
      throw new HttpsError("invalid-argument", "The contract closure reason is not supported.");
    }
    if (note.length < 8) {
      throw new HttpsError("invalid-argument", "An Admin closure note of at least 8 characters is required.");
    }

    const contractRef = db.collection("contracts").doc(contractId);
    const contractSnap = await contractRef.get();
    if (!contractSnap.exists) throw new HttpsError("not-found", "Contract not found.");
    const initialContract = contractSnap.data() || {};
    const initialStatus = upper(initialContract.contractStatus || initialContract.status || initialContract.activationStatus);
    if (initialStatus === "CLOSED") {
      return {
        status: "SUCCESS",
        contractId,
        idempotent: true,
        ownerLocked: false,
        renewalRecordsClosed: 0,
        propertiesDisabled: 0,
      };
    }
    if (TERMINAL_CONTRACT_STATES.has(initialStatus)) {
      throw new HttpsError("failed-precondition", `Contract is already in terminal state ${initialStatus}.`);
    }

    const operationId = `contract_close_${randomUUID().replace(/-/g, "")}`;
    const [renewalSnap, propertySnap] = await Promise.all([
      db.collection("contract_renewal_watch").where("contractId", "==", contractId).get(),
      db.collection("properties").where("contractId", "==", contractId).get(),
    ]);

    const bulkWriter = db.bulkWriter();
    let permanentWriteFailureMessage = "";
    bulkWriter.onWriteError((error) => {
      if (error.failedAttempts < 3) return true;
      permanentWriteFailureMessage = error.message;
      return false;
    });
    const stagedAt = FieldValue.serverTimestamp();
    for (const renewal of renewalSnap.docs) {
      bulkWriter.set(renewal.ref, {
        status: "CLOSED",
        renewalStatus: "TERMINATED",
        completed: true,
        closureReason: reason,
        closureOperationId: operationId,
        closedBy: actor.uid,
        closedAt: stagedAt,
        updatedAt: stagedAt,
      }, { merge: true });
    }
    for (const property of propertySnap.docs) {
      bulkWriter.set(property.ref, {
        contractStatus: "CLOSED",
        activationState: "CONTRACT_CLOSED",
        dispatchReady: false,
        closureOperationId: operationId,
        contractClosedAt: stagedAt,
        updatedAt: stagedAt,
      }, { merge: true });
    }
    try {
      await bulkWriter.close();
    } catch (error) {
      const message = permanentWriteFailureMessage || (error instanceof Error ? error.message : "dependent write failure");
      throw new HttpsError("internal", `Contract dependencies could not be closed safely: ${message}`);
    }
    if (permanentWriteFailureMessage) {
      throw new HttpsError("internal", `Contract dependencies could not be closed safely: ${permanentWriteFailureMessage}`);
    }

    const auditRef = db.collection("audit_logs").doc();
    const result = await db.runTransaction(async (transaction) => {
      const freshContractSnap = await transaction.get(contractRef);
      if (!freshContractSnap.exists) throw new HttpsError("not-found", "Contract disappeared during closure.");
      const contract = freshContractSnap.data() || {};
      const currentStatus = upper(contract.contractStatus || contract.status || contract.activationStatus);
      if (currentStatus === "CLOSED") {
        return {
          status: "SUCCESS",
          contractId,
          idempotent: true,
          ownerLocked: false,
          renewalRecordsClosed: renewalSnap.size,
          propertiesDisabled: propertySnap.size,
        };
      }
      if (TERMINAL_CONTRACT_STATES.has(currentStatus)) {
        throw new HttpsError("failed-precondition", `Contract changed to terminal state ${currentStatus} during closure.`);
      }

      const ownerUid = text(contract.ownerUid || contract.ownerId || contract.userId, 180);
      const ownerRef = ownerUid ? db.collection("users").doc(ownerUid) : null;
      const ownerSnap = ownerRef ? await transaction.get(ownerRef) : null;
      const ownerProfile = ownerSnap?.data() || {};
      const ownerLocked = Boolean(ownerRef && ownerSnap?.exists && text(ownerProfile.activeContractId, 180) === contractId);
      const now = FieldValue.serverTimestamp();

      transaction.update(contractRef, {
        status: "CLOSED",
        contractStatus: "CLOSED",
        activationStatus: "CLOSED",
        renewalStatus: "TERMINATED",
        closureReason: reason,
        closureNote: note,
        closureOperationId: operationId,
        closedBy: actor.uid,
        closedByRole: actor.role,
        closedAt: now,
        updatedAt: now,
      });

      if (ownerLocked && ownerRef) {
        transaction.set(ownerRef, {
          dashboardUnlocked: false,
          dashboardLocked: true,
          activationState: "CONTRACT_CLOSED",
          activeContractStatus: "CLOSED",
          contractClosedAt: now,
          updatedAt: now,
        }, { merge: true });
      }

      if (ownerUid) {
        transaction.set(db.collection("notifications").doc(), {
          userId: ownerUid,
          role: "owner",
          type: "CONTRACT_CLOSED",
          title: "Contract closed by BIN GROUP Admin",
          body: "Your contract has been closed. Open the Owner Contract Center for the recorded status and contact BIN GROUP for next steps.",
          link: "/owner/contracts",
          contractId,
          read: false,
          status: "PENDING",
          createdAt: now,
          updatedAt: now,
        });
      }

      transaction.create(auditRef, {
        action: "ADMIN_CLOSE_CONTRACT_WITH_MFA",
        actorId: actor.uid,
        actorEmail: actor.email,
        actorRole: actor.role,
        targetType: "contracts",
        targetId: contractId,
        before: { status: currentStatus || "UNKNOWN" },
        after: { status: "CLOSED", ownerDashboardLocked: ownerLocked },
        reason,
        noteHash: sha256(note),
        noteLength: note.length,
        closureOperationId: operationId,
        renewalRecordsClosed: renewalSnap.size,
        propertiesDisabled: propertySnap.size,
        mfaVerified: true,
        sensitiveValuesExcluded: true,
        createdAt: now,
      });

      return {
        status: "SUCCESS",
        contractId,
        idempotent: false,
        ownerLocked,
        renewalRecordsClosed: renewalSnap.size,
        propertiesDisabled: propertySnap.size,
      };
    });

    return result;
  },
);

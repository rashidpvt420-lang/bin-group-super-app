import { createHash } from "node:crypto";
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
  { cors: true, region: "europe-west3", enforceAppCheck: true },
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
    const renewalQuery = db.collection("contract_renewal_watch").where("contractId", "==", contractId).limit(100);
    const propertyQuery = db.collection("properties").where("contractId", "==", contractId).limit(100);
    const auditRef = db.collection("audit_logs").doc();

    const result = await db.runTransaction(async (transaction) => {
      const [contractSnap, renewalSnap, propertySnap] = await Promise.all([
        transaction.get(contractRef),
        transaction.get(renewalQuery),
        transaction.get(propertyQuery),
      ]);
      if (!contractSnap.exists) throw new HttpsError("not-found", "Contract not found.");
      const contract = contractSnap.data() || {};
      const currentStatus = upper(contract.contractStatus || contract.status || contract.activationStatus);
      if (currentStatus === "CLOSED") {
        return {
          status: "SUCCESS",
          contractId,
          idempotent: true,
          ownerLocked: false,
          renewalRecordsClosed: 0,
          propertiesDisabled: 0,
        };
      }
      if (TERMINAL_CONTRACT_STATES.has(currentStatus)) {
        throw new HttpsError("failed-precondition", `Contract is already in terminal state ${currentStatus}.`);
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
        closedBy: actor.uid,
        closedByRole: actor.role,
        closedAt: now,
        updatedAt: now,
      });

      for (const renewal of renewalSnap.docs) {
        transaction.set(renewal.ref, {
          status: "CLOSED",
          renewalStatus: "TERMINATED",
          completed: true,
          closureReason: reason,
          closedBy: actor.uid,
          closedAt: now,
          updatedAt: now,
        }, { merge: true });
      }

      for (const property of propertySnap.docs) {
        transaction.set(property.ref, {
          contractStatus: "CLOSED",
          activationState: "CONTRACT_CLOSED",
          dispatchReady: false,
          contractClosedAt: now,
          updatedAt: now,
        }, { merge: true });
      }

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

import * as admin from "firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { requireMfaFinanceAdminActor } from "./financeAdminMfa";

if (!admin.apps.length) admin.initializeApp();

const db = admin.firestore();
const PENDING_STATES = new Set(["PENDING", "PENDING_ADMIN_REVIEW", "REQUESTED"]);
const PHASE1_PAYOUT_METHODS = new Set(["CASH", "CHEQUE"]);
const text = (value: unknown, max = 500) => String(value ?? "").trim().slice(0, max);
const upper = (value: unknown, max = 120) => text(value, max).toUpperCase();
const lower = (value: unknown, max = 120) => text(value, max).toLowerCase();

function roleOf(claims: Record<string, unknown> = {}) {
  return lower(claims.role || claims.userRole || claims.primaryRole);
}

function requestState(data: FirebaseFirestore.DocumentData) {
  return upper(data.status || data.approvalStatus || data.paymentStatus);
}

export const adminReviewBrokerPayoutRequest = onCall(
  { cors: true, region: "europe-west3", enforceAppCheck: true },
  async (request) => {
    const financeActor = await requireMfaFinanceAdminActor(request);
    const live = ((await admin.auth().getUser(financeActor.uid)).customClaims || {}) as Record<string, unknown>;
    const actor = { uid: financeActor.uid, email: financeActor.email, role: roleOf(live) };
    const requestId = text(request.data?.requestId, 180);
    const action = upper(request.data?.action, 40);
    const reason = text(request.data?.reason || request.data?.reviewReason, 1000);
    const paymentReference = text(request.data?.paymentReference, 240);
    const paymentMethod = upper(request.data?.paymentMethod || request.data?.method, 20);

    if (!requestId) throw new HttpsError("invalid-argument", "requestId is required.");
    if (!["APPROVE", "REJECT", "MARK_PAID"].includes(action)) {
      throw new HttpsError("invalid-argument", "action must be APPROVE, REJECT or MARK_PAID.");
    }
    if (action === "REJECT" && reason.length < 8) {
      throw new HttpsError("invalid-argument", "A clear payout rejection reason of at least 8 characters is required.");
    }
    if (action === "MARK_PAID" && paymentReference.length < 4) {
      throw new HttpsError("invalid-argument", "A payment reference is required before marking a payout paid.");
    }

    const payoutRef = db.collection("broker_payout_requests").doc(requestId);
    const auditRef = db.collection("audit_logs").doc();
    const now = FieldValue.serverTimestamp();
    let idempotent = false;
    let brokerId = "";
    let commissionCount = 0;
    let amount = 0;

    await db.runTransaction(async (transaction) => {
      const payoutSnap = await transaction.get(payoutRef);
      if (!payoutSnap.exists) throw new HttpsError("not-found", "Broker payout request not found.");
      const payout = payoutSnap.data() || {};
      brokerId = text(payout.brokerId || payout.brokerUid, 180);
      const commissionIds = Array.isArray(payout.commissionIds)
        ? [...new Set(payout.commissionIds.map((value: unknown) => text(value, 180)).filter(Boolean))]
        : [];
      commissionCount = commissionIds.length;
      amount = Number(payout.amount || 0);
      if (!brokerId || !commissionIds.length || !Number.isFinite(amount) || amount <= 0) {
        throw new HttpsError("failed-precondition", "Payout request bindings are incomplete.");
      }
      const requesterId = text(payout.requestedBy || payout.brokerId || payout.brokerUid, 180);
      if (requesterId && requesterId === actor.uid) {
        throw new HttpsError("permission-denied", "Segregation of duties: the payout requester cannot approve, reject, or mark paid their own payout.");
      }
      if (action === "MARK_PAID") {
        const method = paymentMethod || upper(payout.paymentMethod || payout.method, 20);
        if (!PHASE1_PAYOUT_METHODS.has(method)) {
          throw new HttpsError("invalid-argument", "Phase 1 payout settlement accepts Cash or Cheque only.");
        }
      }

      const commissionRefs = commissionIds.map((id) => db.collection("broker_commissions").doc(id));
      const commissionSnaps = await Promise.all(commissionRefs.map((ref) => transaction.get(ref)));
      const invalidCommission = commissionSnaps.find((snapshot) => {
        if (!snapshot.exists) return true;
        const data = snapshot.data() || {};
        return text(data.brokerId || data.brokerUid, 180) !== brokerId ||
          (text(data.payoutRequestId, 180) && text(data.payoutRequestId, 180) !== requestId);
      });
      if (invalidCommission) {
        throw new HttpsError("failed-precondition", "A commission no longer matches this Broker payout request.");
      }

      const voidCommission = commissionSnaps.find((snapshot) => {
        const data = snapshot.data() || {};
        const status = upper(data.status || data.commissionStatus || data.payoutStatus || data.settlementStatus);
        return data.voided === true || data.isVoid === true || Boolean(text(data.voidReason)) ||
          status.includes("VOID") || status.includes("CANCEL");
      });
      if (voidCommission) {
        throw new HttpsError("failed-precondition", "VOID or cancelled commissions cannot be settled.");
      }

      const state = requestState(payout);
      const notificationRef = db.collection("notifications").doc(
        "broker_payout_" + requestId + "_" + action.toLowerCase(),
      );
      if (action === "APPROVE") {
        if (["APPROVED", "PAID"].includes(state)) {
          idempotent = true;
          return;
        }
        if (!PENDING_STATES.has(state)) {
          throw new HttpsError("failed-precondition", `Payout request cannot be approved from ${state || "UNKNOWN"}.`);
        }
        transaction.set(payoutRef, {
          status: "APPROVED",
          approvalStatus: "APPROVED",
          paymentStatus: "APPROVED",
          reviewedBy: actor.uid,
          reviewedByEmail: actor.email,
          reviewedByRole: actor.role,
          reviewedAt: now,
          approvedBy: actor.uid,
          approvedAt: now,
          reviewReason: reason || null,
          updatedAt: now,
        }, { merge: true });
        commissionSnaps.forEach((snapshot) => transaction.set(snapshot.ref, {
          payoutStatus: "APPROVED",
          payoutRequestId: requestId,
          payoutApprovedAt: now,
          payoutApprovedBy: actor.uid,
          updatedAt: now,
        }, { merge: true }));
      } else if (action === "REJECT") {
        if (state === "REJECTED") {
          idempotent = true;
          return;
        }
        if (!PENDING_STATES.has(state)) {
          throw new HttpsError("failed-precondition", `Payout request cannot be rejected from ${state || "UNKNOWN"}.`);
        }
        transaction.set(payoutRef, {
          status: "REJECTED",
          approvalStatus: "REJECTED",
          paymentStatus: "REJECTED",
          reviewedBy: actor.uid,
          reviewedByEmail: actor.email,
          reviewedByRole: actor.role,
          reviewedAt: now,
          rejectedBy: actor.uid,
          rejectedAt: now,
          reviewReason: reason,
          updatedAt: now,
        }, { merge: true });
        commissionSnaps.forEach((snapshot) => transaction.set(snapshot.ref, {
          payoutStatus: "AVAILABLE",
          payoutRequestId: FieldValue.delete(),
          payoutRequestedAt: FieldValue.delete(),
          payoutRejectedAt: now,
          payoutRejectedBy: actor.uid,
          payoutRejectionReason: reason,
          updatedAt: now,
        }, { merge: true }));
      } else {
        if (state === "PAID") {
          if (text(payout.paymentReference, 240) && text(payout.paymentReference, 240) !== paymentReference) {
            throw new HttpsError("already-exists", "This payout was already marked paid with a different reference.");
          }
          idempotent = true;
          return;
        }
        if (state !== "APPROVED") {
          throw new HttpsError("failed-precondition", "Only an approved payout request can be marked paid.");
        }
        const settledMethod = paymentMethod || upper(payout.paymentMethod || payout.method, 20);
        transaction.set(payoutRef, {
          status: "PAID",
          approvalStatus: "APPROVED",
          paymentStatus: "PAID",
          paymentReference,
          paymentMethod: settledMethod,
          paidBy: actor.uid,
          paidByEmail: actor.email,
          paidAt: now,
          updatedAt: now,
        }, { merge: true });
        commissionSnaps.forEach((snapshot) => transaction.set(snapshot.ref, {
          status: "PAID",
          payoutStatus: "PAID",
          payoutRequestId: requestId,
          paymentReference,
          paidAt: now,
          paidBy: actor.uid,
          updatedAt: now,
        }, { merge: true }));
      }

      transaction.set(auditRef, {
        action: `ADMIN_BROKER_PAYOUT_${action}`,
        actorId: actor.uid,
        actorEmail: actor.email,
        actorRole: actor.role,
        targetType: "broker_payout_requests",
        targetId: requestId,
        brokerId,
        commissionIds,
        commissionCount,
        amount,
        currency: text(payout.currency, 12) || "AED",
        reason: action === "REJECT" ? reason : null,
        paymentReference: action === "MARK_PAID" ? paymentReference : null,
        source: "ADMIN_REVIEW_BROKER_PAYOUT_REQUEST_CALLABLE",
        trustLevel: "SERVER_AUTHORITATIVE",
        sensitiveValuesExcluded: true,
        createdAt: now,
      });
      transaction.set(notificationRef, {
        recipientId: brokerId,
        userId: brokerId,
        recipientRole: "broker",
        type: action === "APPROVE"
          ? "BROKER_PAYOUT_APPROVED"
          : action === "REJECT"
            ? "BROKER_PAYOUT_REJECTED"
            : "BROKER_PAYOUT_PAID",
        title: action === "APPROVE"
          ? "Payout approved"
          : action === "REJECT"
            ? "Payout rejected"
            : "Payout paid",
        body: action === "APPROVE"
          ? "Your Broker payout request was approved and is awaiting payment settlement."
          : action === "REJECT"
            ? "Your Broker payout request was rejected. Review the payout details before submitting a new request."
            : "Your Broker payout has been marked paid. Open Commissions to review the settlement reference.",
        link: "/broker/commissions",
        read: false,
        createdAt: now,
      }, { merge: true });
    });

    return {
      status: "SUCCESS",
      requestId,
      action,
      brokerId,
      amount,
      commissionCount,
      idempotent,
      hardLaunchClaim: false,
    };
  },
);

import type * as FirebaseFirestore from "firebase-admin/firestore";
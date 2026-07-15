import { FieldValue } from "firebase-admin/firestore";
import * as admin from "firebase-admin";
import { HttpsError, onCall } from "firebase-functions/v2/https";

if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();

const ADMIN_ROLES = new Set([
  "admin",
  "super_admin",
  "operations_admin",
  "operations_manager",
  "dispatcher",
]);
const CLOSED_STATUSES = new Set(["COMPLETED", "CLOSED", "CANCELLED", "REJECTED"]);
const ACTIVE_STATUSES = new Set(["ACCEPTED", "EN_ROUTE", "ARRIVED", "IN_PROGRESS"]);

function role(value: unknown) {
  return String(value || "").trim().toLowerCase();
}

function text(value: unknown, max = 180) {
  return String(value || "").trim().slice(0, max);
}

function requireDispatcher(auth: any) {
  if (!auth?.uid) throw new HttpsError("unauthenticated", "Dispatcher login required.");
  const token = auth.token || {};
  const callerRole = role(token.role || token.userRole || token.primaryRole);
  const permissions = token.permissions || {};
  if (
    token.admin === true ||
    token.isAdmin === true ||
    ADMIN_ROLES.has(callerRole) ||
    permissions.canDispatchJobs === true
  ) return;
  throw new HttpsError("permission-denied", "Dispatch permission is required.");
}

function isApprovedTechnician(
  user: FirebaseFirestore.DocumentData,
  technician: FirebaseFirestore.DocumentData,
  userExists: boolean,
  technicianExists: boolean,
) {
  const profiles = [
    ...(userExists ? [user] : []),
    ...(technicianExists ? [technician] : []),
  ];
  if (!profiles.length) return false;
  if (userExists && role(user.role) !== "technician") return false;
  if (profiles.some((profile) =>
    profile.suspended === true ||
    ["suspended", "rejected", "disabled", "inactive"].includes(role(profile.status))
  )) return false;
  return profiles.some((profile) =>
    ["active", "approved"].includes(role(profile.status)) ||
    role(profile.approvalStatus) === "approved"
  );
}

export const adminAssignTechnician = onCall(
  { cors: true, region: "europe-west3", enforceAppCheck: true },
  async (request) => {
    requireDispatcher(request.auth);
    const ticketId = text(request.data?.ticketId, 160);
    const technicianId = text(request.data?.technicianId, 160);
    const reassignmentReason = text(request.data?.reassignmentReason, 500);
    if (!ticketId || !technicianId) {
      throw new HttpsError("invalid-argument", "ticketId and technicianId are required.");
    }

    const ticketRef = db.collection("maintenanceTickets").doc(ticketId);
    const userRef = db.collection("users").doc(technicianId);
    const technicianRef = db.collection("technicians").doc(technicianId);
    const auditRef = db.collection("audit_logs").doc();
    const now = FieldValue.serverTimestamp();
    let idempotent = false;

    await db.runTransaction(async (transaction) => {
      const [ticketSnap, userSnap, technicianSnap] = await Promise.all([
        transaction.get(ticketRef),
        transaction.get(userRef),
        transaction.get(technicianRef),
      ]);
      if (!ticketSnap.exists) throw new HttpsError("not-found", "Ticket not found.");
      if (!userSnap.exists && !technicianSnap.exists) {
        throw new HttpsError("not-found", "Technician profile not found.");
      }

      const ticket = ticketSnap.data() || {};
      const user = userSnap.data() || {};
      const technician = technicianSnap.data() || {};
      if (!isApprovedTechnician(user, technician, userSnap.exists, technicianSnap.exists)) {
        throw new HttpsError("failed-precondition", "Only an approved, active technician can receive a mission.");
      }
      if (!text(ticket.propertyId) || !text(ticket.unitId || ticket.unitNumber || ticket.unit)) {
        throw new HttpsError("failed-precondition", "Ticket must be linked to a property and unit before dispatch.");
      }

      const currentStatus = text(ticket.status, 60).toUpperCase();
      if (CLOSED_STATUSES.has(currentStatus)) {
        throw new HttpsError("failed-precondition", "Closed or cancelled tickets cannot be dispatched.");
      }
      const previousTechnicianId = text(
        ticket.assignedTechnicianId || ticket.technicianId || ticket.techId,
        160,
      );
      if (previousTechnicianId === technicianId) {
        idempotent = true;
        return;
      }
      const isReassignment = Boolean(previousTechnicianId && previousTechnicianId !== technicianId);
      if (isReassignment && ACTIVE_STATUSES.has(currentStatus) && reassignmentReason.length < 8) {
        throw new HttpsError(
          "failed-precondition",
          "An audited reassignment reason is required for an accepted or active mission.",
        );
      }
      const newCapacityProfile = userSnap.exists ? user : technician;
      const currentJobCount = Number(newCapacityProfile.currentJobCount || 0);
      const maxConcurrentJobs = Number(newCapacityProfile.maxConcurrentJobs || 3);
      if (currentJobCount >= maxConcurrentJobs) {
        throw new HttpsError("resource-exhausted", "Technician has reached the concurrent mission limit.");
      }
      const previousUserRef = isReassignment
        ? db.collection("users").doc(previousTechnicianId)
        : null;
      const previousUserSnap = previousUserRef
        ? await transaction.get(previousUserRef)
        : null;

      transaction.set(ticketRef, {
        assignedTechnicianId: technicianId,
        technicianId,
        assignedTechnicianName: text(
          technician.displayName || technician.name || user.displayName || user.name || "Technician",
          180,
        ),
        status: "ASSIGNED",
        technicianStatus: "ASSIGNED",
        dispatchStatus: "ASSIGNED",
        trackingStatus: "TECHNICIAN_ASSIGNED",
        assignedAt: now,
        assignedBy: request.auth!.uid,
        reassignmentReason: isReassignment ? reassignmentReason : null,
        updatedAt: now,
      }, { merge: true });
      transaction.set(userSnap.exists ? userRef : technicianRef, {
        currentJobCount: currentJobCount + 1,
        updatedAt: now,
      }, { merge: true });
      if (previousUserRef && previousUserSnap?.exists) {
        transaction.set(previousUserRef, {
          currentJobCount: Math.max(0, Number(previousUserSnap.data()?.currentJobCount || 0) - 1),
          updatedAt: now,
        }, { merge: true });
      }
      transaction.set(auditRef, {
        action: isReassignment ? "ADMIN_REASSIGN_TECHNICIAN" : "ADMIN_ASSIGN_TECHNICIAN",
        actorId: request.auth!.uid,
        actorRole: role(
          request.auth!.token?.role ||
          request.auth!.token?.userRole ||
          request.auth!.token?.primaryRole ||
          "dispatcher",
        ),
        ticketId,
        technicianId,
        previousTechnicianId: previousTechnicianId || null,
        reassignmentReason: isReassignment ? reassignmentReason : null,
        createdAt: now,
      });
    });

    return { ok: true, ticketId, technicianId, status: "ASSIGNED", idempotent };
  },
);

const DISPUTE_ACTIONS = new Set(["request_revisit", "approve_credit", "dismiss"]);
const STANDARD_SLA_CREDIT_AED = 50;

export const adminResolveTicketDispute = onCall(
  { cors: true, region: "europe-west3", enforceAppCheck: true },
  async (request) => {
    requireDispatcher(request.auth);
    const ticketId = text(request.data?.ticketId, 160);
    const action = text(request.data?.action, 60).toLowerCase();
    const note = text(request.data?.note, 1000);
    if (!ticketId || !DISPUTE_ACTIONS.has(action) || note.length < 8) {
      throw new HttpsError(
        "invalid-argument",
        "A valid dispute action and an audited resolution note are required.",
      );
    }

    const ticketRef = db.collection("maintenanceTickets").doc(ticketId);
    const revisitRef = db.collection("maintenanceTickets").doc(`revisit_${ticketId}`);
    const creditRef = db.collection("payment_transactions").doc(`sla_credit_${ticketId}`);
    const auditRef = db.collection("audit_logs").doc(`ticket_dispute_${ticketId}_${action}`);
    const now = FieldValue.serverTimestamp();
    let idempotent = false;

    await db.runTransaction(async (transaction) => {
      const [ticketSnap, revisitSnap, creditSnap] = await Promise.all([
        transaction.get(ticketRef),
        transaction.get(revisitRef),
        transaction.get(creditRef),
      ]);
      if (!ticketSnap.exists) throw new HttpsError("not-found", "Disputed ticket not found.");
      const ticket = ticketSnap.data() || {};
      if (
        ticket.adminReviewStatus === "RESOLVED" &&
        text(ticket.disputeResolutionAction, 60).toLowerCase() === action
      ) {
        idempotent = true;
        return;
      }
      if (
        ticket.requiresAdminReview !== true ||
        text(ticket.adminReviewStatus, 80).toUpperCase() !== "PENDING_DISPUTE_REVIEW"
      ) {
        throw new HttpsError("failed-precondition", "Ticket is not awaiting dispute review.");
      }

      const status = action === "request_revisit"
        ? "DISPUTED_REVISIT_REQUIRED"
        : action === "approve_credit"
          ? "CLOSED_WITH_CREDIT"
          : "CLOSED";
      transaction.set(ticketRef, {
        status,
        adminReviewStatus: "RESOLVED",
        requiresAdminReview: false,
        disputeResolutionAction: action,
        disputeResolutionNote: note,
        disputeResolvedAt: now,
        disputeResolvedBy: request.auth!.uid,
        updatedAt: now,
      }, { merge: true });

      if (action === "request_revisit" && !revisitSnap.exists) {
        transaction.create(revisitRef, {
          parentId: ticketId,
          tenantId: ticket.tenantId || null,
          tenantUid: ticket.tenantUid || null,
          ownerId: ticket.ownerId || ticket.ownerUid || null,
          ownerUid: ticket.ownerUid || ticket.ownerId || null,
          propertyId: ticket.propertyId || null,
          unitId: ticket.unitId || null,
          unitNumber: ticket.unitNumber || null,
          title: `REVISIT: ${text(ticket.title, 180) || "Disputed Job"}`,
          description: `Admin revisit dispatch. Reason: ${note}`,
          status: "OPEN",
          priority: "HIGH",
          source: "ADMIN_DISPUTE_REVISIT",
          createdAt: now,
          updatedAt: now,
        });
      }

      if (action === "approve_credit") {
        const ownerId = text(ticket.ownerId || ticket.ownerUid, 160);
        if (!ownerId) {
          throw new HttpsError("failed-precondition", "SLA credit requires a ticket bound to an owner.");
        }
        if (!creditSnap.exists) {
          transaction.create(creditRef, {
            paymentId: creditRef.id,
            ownerId,
            ownerUid: ownerId,
            ticketId,
            recordType: "SLA_CREDIT",
            transactionType: "SLA_CREDIT",
            amount: STANDARD_SLA_CREDIT_AED,
            currency: "AED",
            description: `SLA credit for disputed ticket ${ticketId}`,
            status: "APPROVED",
            paymentStatus: "APPROVED",
            verificationState: "ADMIN_VERIFIED",
            approved: true,
            paymentVerified: true,
            createdBy: request.auth!.uid,
            createdAt: now,
            updatedAt: now,
          });
        }
      }

      transaction.set(auditRef, {
        action: "ADMIN_RESOLVE_TICKET_DISPUTE",
        actorId: request.auth!.uid,
        actorRole: role(
          request.auth!.token?.role ||
          request.auth!.token?.userRole ||
          request.auth!.token?.primaryRole ||
          "dispatcher",
        ),
        ticketId,
        resolutionAction: action,
        resolutionNote: note,
        slaCreditAmount: action === "approve_credit" ? STANDARD_SLA_CREDIT_AED : 0,
        createdAt: now,
      }, { merge: false });
    });

    return {
      ok: true,
      ticketId,
      action,
      idempotent,
      slaCreditAmount: action === "approve_credit" ? STANDARD_SLA_CREDIT_AED : 0,
    };
  },
);

const EMERGENCY_ACTIONS = new Set(["respond", "resolve"]);

export const adminUpdateEmergencyTicket = onCall(
  { cors: true, region: "europe-west3", enforceAppCheck: true },
  async (request) => {
    requireDispatcher(request.auth);
    const ticketId = text(request.data?.ticketId, 160);
    const action = text(request.data?.action, 40).toLowerCase();
    if (!ticketId || !EMERGENCY_ACTIONS.has(action)) {
      throw new HttpsError("invalid-argument", "A valid emergency ticket and action are required.");
    }

    const ticketRef = db.collection("maintenanceTickets").doc(ticketId);
    const auditRef = db.collection("audit_logs").doc(`emergency_${ticketId}_${action}`);
    const now = FieldValue.serverTimestamp();
    let idempotent = false;

    await db.runTransaction(async (transaction) => {
      const ticketSnap = await transaction.get(ticketRef);
      if (!ticketSnap.exists) throw new HttpsError("not-found", "Emergency ticket not found.");
      const ticket = ticketSnap.data() || {};
      const emergencyMarker = [
        ticket.priority,
        ticket.urgency,
        ticket.category,
        ticket.requestType,
        ticket.sosStatus,
      ].map((value) => text(value, 80).toUpperCase());
      if (!emergencyMarker.some((value) => ["EMERGENCY", "URGENT", "SOS", "HIGH"].includes(value))) {
        throw new HttpsError("failed-precondition", "Ticket is not marked as an emergency.");
      }

      const targetStatus = action === "respond" ? "RESPONDED" : "RESOLVED";
      if (
        text(ticket.status, 80).toUpperCase() === targetStatus &&
        text(ticket.sosStatus, 80).toUpperCase() === targetStatus
      ) {
        idempotent = true;
        return;
      }
      if (CLOSED_STATUSES.has(text(ticket.status, 80).toUpperCase())) {
        throw new HttpsError("failed-precondition", "Closed emergency tickets cannot be changed.");
      }
      if (action === "resolve" && text(ticket.sosStatus, 80).toUpperCase() !== "RESPONDED") {
        throw new HttpsError("failed-precondition", "An emergency must be acknowledged before it is resolved.");
      }

      transaction.set(ticketRef, {
        status: targetStatus,
        sosStatus: targetStatus,
        ...(action === "respond"
          ? { respondedAt: now, respondedBy: request.auth!.uid }
          : { resolvedAt: now, resolvedBy: request.auth!.uid }),
        updatedAt: now,
      }, { merge: true });
      transaction.set(auditRef, {
        action: action === "respond" ? "ADMIN_RESPOND_EMERGENCY" : "ADMIN_RESOLVE_EMERGENCY",
        actorId: request.auth!.uid,
        actorRole: role(
          request.auth!.token?.role ||
          request.auth!.token?.userRole ||
          request.auth!.token?.primaryRole ||
          "dispatcher",
        ),
        targetType: "maintenanceTickets",
        targetId: ticketId,
        createdAt: now,
      }, { merge: false });
    });

    return { ok: true, ticketId, status: action === "respond" ? "RESPONDED" : "RESOLVED", idempotent };
  },
);

const WHATSAPP_TRIAGE_ACTIONS = new Set(["convert", "close"]);

export const adminProcessWhatsAppIntake = onCall(
  { cors: true, region: "europe-west3", enforceAppCheck: true },
  async (request) => {
    requireDispatcher(request.auth);
    const intakeId = text(request.data?.intakeId, 160);
    const action = text(request.data?.action, 40).toLowerCase();
    if (!intakeId || !WHATSAPP_TRIAGE_ACTIONS.has(action)) {
      throw new HttpsError("invalid-argument", "A valid WhatsApp intake and triage action are required.");
    }

    const intakeRef = db.collection("communication_intake").doc(intakeId);
    const ticketRef = db.collection("maintenanceTickets").doc(`whatsapp_${intakeId}`);
    const ledgerRef = db.collection("maintenance_ledger").doc(`whatsapp_${intakeId}_${action}`);
    const governanceRef = db.collection("data_governance_events").doc(`whatsapp_${intakeId}`);
    const auditRef = db.collection("audit_logs").doc(`whatsapp_triage_${intakeId}_${action}`);
    const now = FieldValue.serverTimestamp();
    let idempotent = false;

    await db.runTransaction(async (transaction) => {
      const intakeSnap = await transaction.get(intakeRef);
      if (!intakeSnap.exists) throw new HttpsError("not-found", "WhatsApp intake not found.");
      const intake = intakeSnap.data() || {};
      if (text(intake.channel || intake.sourceChannel, 60).toLowerCase() !== "whatsapp") {
        throw new HttpsError("failed-precondition", "Only WhatsApp intake records may use this triage workflow.");
      }

      if (action === "close") {
        if (text(intake.status, 80).toLowerCase() === "closed_no_action") {
          idempotent = true;
          return;
        }
        if (text(intake.ticketId, 180)) {
          throw new HttpsError("failed-precondition", "An intake already converted to a ticket cannot be closed as no-action.");
        }
        transaction.set(intakeRef, {
          status: "closed_no_action",
          humanApprovedBy: request.auth!.uid,
          updatedAt: now,
        }, { merge: true });
        transaction.set(ledgerRef, {
          source: "admin_whatsapp_triage",
          ledgerEvent: "WHATSAPP_INTAKE_CLOSED_NO_ACTION",
          intakeId,
          status: "closed_no_action",
          createdAt: now,
        }, { merge: false });
      } else {
        const form = request.data?.form || {};
        const propertyId = text(form.propertyId, 160);
        const ownerId = text(form.ownerId, 160);
        const unitId = text(form.unitId, 160);
        const tenantId = text(form.tenantId, 160);
        const technicianId = text(form.technicianId, 160);
        const category = text(form.category, 100);
        const urgency = text(form.urgency, 40).toLowerCase();
        const title = text(form.title, 180);
        const scope = text(form.scope, 2000);
        if (!propertyId || !ownerId || !title || scope.length < 5) {
          throw new HttpsError("invalid-argument", "Property, owner, title, and service scope are required.");
        }
        if (!["emergency", "high", "normal"].includes(urgency)) {
          throw new HttpsError("invalid-argument", "Unsupported WhatsApp triage urgency.");
        }
        if (text(intake.ticketId, 180)) {
          if (text(intake.ticketId, 180) !== ticketRef.id) {
            throw new HttpsError("already-exists", "Intake is already bound to another ticket.");
          }
          idempotent = true;
          return;
        }

        const propertyRef = db.collection("properties").doc(propertyId);
        const propertySnap = await transaction.get(propertyRef);
        if (!propertySnap.exists) throw new HttpsError("failed-precondition", "Bound property does not exist.");
        const property = propertySnap.data() || {};
        if (text(property.ownerId || property.ownerUid, 160) !== ownerId) {
          throw new HttpsError("failed-precondition", "Property and owner binding do not match.");
        }

        if (technicianId) {
          const [userSnap, technicianSnap] = await Promise.all([
            transaction.get(db.collection("users").doc(technicianId)),
            transaction.get(db.collection("technicians").doc(technicianId)),
          ]);
          if (!isApprovedTechnician(
            userSnap.data() || {},
            technicianSnap.data() || {},
            userSnap.exists,
            technicianSnap.exists,
          )) {
            throw new HttpsError("failed-precondition", "Assigned technician is not approved and active.");
          }
        }

        transaction.create(ticketRef, {
          source: "whatsapp_triage",
          sourceChannel: "whatsapp",
          intakeId,
          waId: text(intake.waId, 120),
          contactName: text(intake.contactName, 180),
          title,
          description: scope,
          standardScope: scope,
          category,
          trade: category,
          urgency,
          priority: urgency,
          status: technicianId ? "ASSIGNED" : "OPEN",
          propertyId,
          unitId: unitId || null,
          tenantId: tenantId || null,
          ownerId,
          ownerUid: ownerId,
          assignedTechnicianId: technicianId || null,
          technicianId: technicianId || null,
          humanApprovedBy: request.auth!.uid,
          approvalState: "triaged",
          createdAt: now,
          updatedAt: now,
        });
        transaction.set(ledgerRef, {
          source: "admin_whatsapp_triage",
          ledgerEvent: "WHATSAPP_INTAKE_CONVERTED_TO_TICKET",
          intakeId,
          ticketId: ticketRef.id,
          ownerId,
          propertyId,
          category,
          urgency,
          status: "ticket_created",
          createdAt: now,
        }, { merge: false });
        transaction.set(governanceRef, {
          source: "admin_whatsapp_triage",
          dataCategory: "whatsapp_chat_and_property_maintenance_evidence",
          lawfulBasis: "service_request_and_contract_operations",
          retentionClass: "maintenance_evidence_standard",
          roleAccessPolicy: ["admin", "owner", "assigned_technician"],
          subjectRef: text(intake.waId, 120) || intakeId,
          ticketId: ticketRef.id,
          createdAt: now,
        }, { merge: false });
        transaction.set(intakeRef, {
          status: technicianId ? "ticket_dispatched" : "ticket_created_pending_dispatch",
          ticketId: ticketRef.id,
          ticketDraftId: ticketRef.id,
          propertyId,
          unitId: unitId || null,
          tenantId: tenantId || null,
          ownerId,
          category,
          urgency,
          standardScope: scope,
          humanApprovedBy: request.auth!.uid,
          updatedAt: now,
        }, { merge: true });
      }

      transaction.set(auditRef, {
        action: action === "convert" ? "ADMIN_CONVERT_WHATSAPP_INTAKE" : "ADMIN_CLOSE_WHATSAPP_INTAKE",
        actorId: request.auth!.uid,
        actorRole: role(
          request.auth!.token?.role ||
          request.auth!.token?.userRole ||
          request.auth!.token?.primaryRole ||
          "dispatcher",
        ),
        targetType: "communication_intake",
        targetId: intakeId,
        ticketId: action === "convert" ? ticketRef.id : null,
        createdAt: now,
      }, { merge: false });
    });

    return { ok: true, intakeId, ticketId: action === "convert" ? ticketRef.id : null, action, idempotent };
  },
);

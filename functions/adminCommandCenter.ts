import { HttpsError, onCall } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";

if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();

const ADMIN_ROLES = new Set(["admin", "super_admin", "ceo"]);
const closedStates = new Set(["RESOLVED", "CLOSED", "COMPLETED", "COMPLETE", "CANCELLED", "CANCELED", "REJECTED"]);
const clean = (value: unknown) => String(value ?? "").trim();
const upper = (value: unknown) => clean(value).toUpperCase();

function isAdmin(token: Record<string, any>) {
  const role = clean(token.role || token.userRole || token.primaryRole).toLowerCase();
  return token.suspended !== true && (
    ADMIN_ROLES.has(role) || token.admin === true || token.isAdmin === true || token.super_admin === true || token.superAdmin === true || token.ceo === true
  );
}
async function requireAdmin(request: any) {
  if (!request.auth?.uid) throw new HttpsError("unauthenticated", "Admin authentication required.");
  if (!isAdmin(request.auth.token || {})) throw new HttpsError("permission-denied", "Founder/Admin authority is required for Command Center metrics.");
  const actor = await admin.auth().getUser(request.auth.uid);
  if (actor.disabled) throw new HttpsError("permission-denied", "Disabled Admin accounts cannot read Command Center metrics.");
}
function dateFrom(value: any): Date | null {
  if (!value) return null;
  if (typeof value.toDate === "function") return value.toDate();
  if (typeof value.toMillis === "function") return new Date(value.toMillis());
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}
function firstDate(data: any, keys: string[]) {
  for (const key of keys) {
    const date = dateFrom(data?.[key]);
    if (date) return date;
  }
  return null;
}
function ticketOpen(data: any) {
  return !closedStates.has(upper(data?.status || data?.ticketStatus || data?.sosStatus));
}
function ticketText(data: any) {
  return [data?.type, data?.category, data?.priority, data?.severity, data?.issueType, data?.title, data?.description]
    .map((value) => clean(value).toLowerCase()).join(" ");
}
function isEmergency(data: any) {
  const priority = upper(data?.priority || data?.severity);
  const text = ticketText(data);
  return data?.emergency === true || data?.isEmergency === true || ["EMERGENCY", "CRITICAL", "SOS"].includes(priority) || text.includes("emergency") || text.includes("critical");
}
function isSos(data: any) {
  const text = ticketText(data);
  return data?.isSOS === true || data?.sos === true || upper(data?.priority) === "SOS" || text.includes("sos");
}
function isComplaint(data: any) {
  const text = ticketText(data);
  return data?.isComplaint === true || text.includes("complaint") || text.includes("complain");
}
function isOverdue(data: any, now: Date) {
  if (!ticketOpen(data)) return false;
  const deadline = firstDate(data, ["slaDeadline", "slaDeadlineAt", "resolutionDeadline", "responseDeadline", "dueAt", "deadline", "targetResolutionAt"]);
  return Boolean(deadline && deadline.getTime() < now.getTime());
}
function expiresWithin(data: any, now: Date, days: number) {
  const expiry = firstDate(data, ["endDate", "contractEndDate", "expiryDate", "expiresAt", "validUntil"]);
  if (!expiry) return false;
  const delta = expiry.getTime() - now.getTime();
  return delta >= 0 && delta <= days * 86400000;
}
function securityRecentCritical(data: any, now: Date) {
  const created = firstDate(data, ["createdAt", "timestamp", "updatedAt"]);
  if (!created || now.getTime() - created.getTime() > 86400000) return false;
  const severity = upper(data?.severity);
  return severity === "CRITICAL" || severity === "HIGH" || upper(data?.type) === "BOT_DETECTION";
}

export const adminGetCommandCenterSummary = onCall({ region: "europe-west3", cors: true, enforceAppCheck: true }, async (request) => {
  await requireAdmin(request);
  const now = new Date();
  const [ticketsSnap, techSnap, contractsSnap, ownersSnap, mailSnap, securitySnap] = await Promise.all([
    db.collection("maintenanceTickets").limit(2500).get(),
    db.collection("technicians").limit(1000).get(),
    db.collection("contracts").limit(1500).get(),
    db.collection("owners").limit(1500).get(),
    db.collection("mail").limit(1000).get(),
    db.collection("security_audit_logs").limit(1000).get(),
  ]);
  const tickets = ticketsSnap.docs.map((doc) => doc.data());
  const technicians = techSnap.docs.map((doc) => doc.data());
  const contracts = contractsSnap.docs.map((doc) => doc.data());
  const owners = ownersSnap.docs.map((doc) => doc.data());
  const mail = mailSnap.docs.map((doc) => doc.data());
  const security = securitySnap.docs.map((doc) => doc.data());

  const openEmergencyTickets = tickets.filter((ticket) => ticketOpen(ticket) && isEmergency(ticket)).length;
  const unresolvedSos = tickets.filter((ticket) => ticketOpen(ticket) && isSos(ticket)).length;
  const overdueSla = tickets.filter((ticket) => isOverdue(ticket, now)).length;
  const tenantComplaints = tickets.filter((ticket) => ticketOpen(ticket) && isComplaint(ticket)).length;
  const techniciansOnDuty = technicians.filter((tech) => tech.onDuty === true && upper(tech.status) !== "OFFBOARDED").length;
  const techniciansUnavailable = technicians.filter((tech) => upper(tech.status) !== "OFFBOARDED" && tech.available === false).length;
  const contractsExpiring = contracts.filter((contract) => {
    const status = upper(contract.status);
    return !closedStates.has(status) && expiresWithin(contract, now, 45);
  }).length;
  const ownerActivationsPending = owners.filter((owner) => {
    const status = upper(owner.status || owner.onboardingStatus);
    return !closedStates.has(status) && (owner.adminApproved !== true || owner.dashboardUnlocked !== true || owner.paymentVerified !== true);
  }).length;
  const failedNotifications = mail.filter((entry) => upper(entry?.delivery?.state || entry?.status) === "ERROR").length;
  const securityAlerts24h = security.filter((entry) => securityRecentCritical(entry, now)).length;
  const complianceAttention = contractsExpiring + securityAlerts24h + owners.filter((owner) => upper(owner.complianceStatus) === "PENDING" || upper(owner.complianceStatus) === "FAILED").length;

  return {
    success: true,
    generatedAt: now.toISOString(),
    counts: {
      openEmergencyTickets, overdueSla, techniciansOnDuty, techniciansUnavailable,
      contractsExpiring, ownerActivationsPending, tenantComplaints, unresolvedSos,
      failedNotifications, securityAlerts24h, complianceAttention,
    },
    coverage: {
      maintenanceTickets: ticketsSnap.size,
      technicians: techSnap.size,
      contracts: contractsSnap.size,
      owners: ownersSnap.size,
      mail: mailSnap.size,
      securityAuditLogs: securitySnap.size,
      note: "Counts are live from canonical collections. SLA overdue requires an explicit deadline field; compliance attention is an aggregate of expiring contracts, critical security signals, and owner compliance flags.",
    },
  };
});

import { onCall, HttpsError } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import * as admin from "firebase-admin";
import { generateContractPDF } from "./pdfEngine";

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

const RENEWAL_MILESTONES = [120, 90, 60, 45, 30, 14, 7, 3, 1, 0] as const;
const DAY_MS = 24 * 60 * 60 * 1000;

type RenewalRole = "owner" | "tenant" | "admin" | "broker" | "technician";
type RenewalSource = "contracts" | "leases" | "tenant_ledger" | "propertyPassports";

type RenewalRecord = {
  sourceCollection: RenewalSource;
  sourceId: string;
  contractId: string;
  leaseId: string;
  propertyId: string;
  propertyName: string;
  unitId: string;
  unitNumber: string;
  ownerId: string;
  ownerEmail: string;
  tenantId: string;
  tenantEmail: string;
  brokerId: string;
  brokerEmail: string;
  technicianId: string;
  expiryAt: Date;
  daysRemaining: number;
  milestoneDays: number;
  status: string;
  renewalStatus: string;
};

function toDate(value: any): Date | null {
  if (!value) return null;
  if (typeof value.toDate === "function") return value.toDate();
  if (value.seconds) return new Date(value.seconds * 1000);
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

function safeString(value: any, fallback = "") {
  const text = String(value ?? "").trim();
  return text || fallback;
}

function normalizeEmail(value: any) {
  return safeString(value).toLowerCase();
}

function daysUntil(date: Date, now = new Date()) {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const end = new Date(date);
  end.setHours(0, 0, 0, 0);
  return Math.ceil((end.getTime() - start.getTime()) / DAY_MS);
}

function milestoneFor(daysRemaining: number) {
  return RENEWAL_MILESTONES.find((days) => daysRemaining <= days) ?? null;
}

function expiryDateFrom(data: any): Date | null {
  return toDate(
    data.contractEndDate ||
    data.endDate ||
    data.validTo ||
    data.expiryDate ||
    data.expiresAt ||
    data.leaseEndDate ||
    data.leaseEnd ||
    data.renewalDueAt ||
    data.nextRenewalDate
  );
}

function isClosedRenewal(data: any) {
  const value = safeString(data.renewalStatus || data.status || data.contractStatus).toUpperCase();
  return ["RENEWED", "CANCELLED", "TERMINATED", "EXPIRED_CLOSED", "ARCHIVED"].some((word) => value.includes(word));
}

function normalizeRecord(sourceCollection: RenewalSource, sourceId: string, data: any): RenewalRecord | null {
  const expiryAt = expiryDateFrom(data);
  if (!expiryAt || isClosedRenewal(data)) return null;
  const daysRemaining = daysUntil(expiryAt);
  const milestoneDays = milestoneFor(daysRemaining);
  if (milestoneDays === null || daysRemaining < -30) return null;

  return {
    sourceCollection,
    sourceId,
    contractId: safeString(data.contractId || (sourceCollection === "contracts" ? sourceId : "")),
    leaseId: safeString(data.leaseId || (sourceCollection === "leases" ? sourceId : "")),
    propertyId: safeString(data.propertyId || data.primaryPropertyId),
    propertyName: safeString(data.propertyName || data.assetName || data.address, "Property"),
    unitId: safeString(data.unitId),
    unitNumber: safeString(data.unitNumber || data.unit, "—"),
    ownerId: safeString(data.ownerId || data.ownerUid || data.userId),
    ownerEmail: normalizeEmail(data.ownerEmail),
    tenantId: safeString(data.tenantId || data.tenantUid),
    tenantEmail: normalizeEmail(data.tenantEmail || data.email),
    brokerId: safeString(data.brokerId || data.brokerUid || data.broughtByUid),
    brokerEmail: normalizeEmail(data.brokerEmail || data.broughtByEmail),
    technicianId: safeString(data.technicianId || data.assignedTechnicianId),
    expiryAt,
    daysRemaining,
    milestoneDays,
    status: safeString(data.status || data.contractStatus || data.leaseStatus, "ACTIVE"),
    renewalStatus: safeString(data.renewalStatus, daysRemaining < 0 ? "EXPIRED_REVIEW" : "RENEWAL_WATCH"),
  };
}

async function userIdsByEmail(email: string) {
  if (!email) return [] as string[];
  const snap = await db.collection("users").where("email", "==", email).limit(5).get();
  return snap.docs.map((doc) => doc.id);
}

async function resolveRecipients(record: RenewalRecord) {
  const roles: Array<{ role: RenewalRole; ids: string[]; email?: string; link: string }> = [
    { role: "owner", ids: record.ownerId ? [record.ownerId] : await userIdsByEmail(record.ownerEmail), email: record.ownerEmail, link: "/owner/contracts" },
    { role: "tenant", ids: record.tenantId ? [record.tenantId] : await userIdsByEmail(record.tenantEmail), email: record.tenantEmail, link: "/tenant/documents" },
    { role: "broker", ids: record.brokerId ? [record.brokerId] : await userIdsByEmail(record.brokerEmail), email: record.brokerEmail, link: "/broker/attribution" },
  ];

  if (record.technicianId) roles.push({ role: "technician", ids: [record.technicianId], link: "/technician/dashboard" });

  const admins = await db.collection("users")
    .where("role", "in", ["admin", "super_admin", "ceo", "operations_admin", "account_manager"])
    .limit(25)
    .get();
  roles.push({ role: "admin", ids: admins.docs.map((doc) => doc.id), link: "/dashboard" });

  return roles;
}

function renewalId(record: RenewalRecord) {
  return `${record.sourceCollection}_${record.sourceId}_${record.milestoneDays}d`;
}

function titleFor(record: RenewalRecord) {
  if (record.daysRemaining < 0) return "Contract expiry action overdue";
  if (record.daysRemaining === 0) return "Contract expires today";
  return `Contract renewal due in ${record.daysRemaining} day${record.daysRemaining === 1 ? "" : "s"}`;
}

function bodyFor(record: RenewalRecord, role: RenewalRole) {
  const base = `${record.propertyName}${record.unitNumber !== "—" ? ` · Unit ${record.unitNumber}` : ""} expires on ${record.expiryAt.toLocaleDateString("en-GB")}.`;
  if (role === "tenant") return `${base} Please review renewal, rent terms, required documents, and move-out/renewal options before expiry.`;
  if (role === "owner") return `${base} Review tenant renewal status, rent collection, contract PDF, and approval actions.`;
  if (role === "broker") return `${base} Broker attribution stays visible only when the renewed or new contract is linked to your referral chain.`;
  if (role === "technician") return `${base} Prepare any handover, preventive maintenance, or inspection task connected to this renewal.`;
  return `${base} Admin must verify renewal status, documents, notices, PDF generation, and profile notifications.`;
}

async function createNotification(record: RenewalRecord, role: RenewalRole, userId: string, link: string) {
  const notificationRef = db.collection("notifications").doc(`${renewalId(record)}_${role}_${userId}`);
  await notificationRef.set({
    userId,
    role,
    title: titleFor(record),
    body: bodyFor(record, role),
    type: "CONTRACT_RENEWAL_REMINDER",
    link,
    read: false,
    status: "PENDING",
    milestoneDays: record.milestoneDays,
    daysRemaining: record.daysRemaining,
    contractId: record.contractId,
    leaseId: record.leaseId,
    propertyId: record.propertyId,
    propertyName: record.propertyName,
    unitId: record.unitId,
    unitNumber: record.unitNumber,
    sourceCollection: record.sourceCollection,
    sourceId: record.sourceId,
    expiryAt: admin.firestore.Timestamp.fromDate(record.expiryAt),
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    source: "CONTRACT_RENEWAL_PDF_SYSTEM",
  }, { merge: true });
}

async function createEmailOutbox(record: RenewalRecord, role: RenewalRole, email: string) {
  if (!email) return;
  const outboxRef = db.collection("mail").doc(`${renewalId(record)}_${role}_${email.replace(/[^a-z0-9]/gi, "_")}`);
  await outboxRef.set({
    to: email,
    message: {
      subject: `[BIN GROUP] ${titleFor(record)}`,
      html: `<p>${bodyFor(record, role)}</p><p><strong>Property:</strong> ${record.propertyName}</p><p><strong>Expiry:</strong> ${record.expiryAt.toLocaleDateString("en-GB")}</p>`,
    },
    type: "CONTRACT_RENEWAL_REMINDER",
    status: "PENDING",
    contractId: record.contractId,
    leaseId: record.leaseId,
    propertyId: record.propertyId,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });
}

async function createRenewalPdfRecord(record: RenewalRecord) {
  const pdfRecordId = `renewal_${record.sourceCollection}_${record.sourceId}`;
  const pdfRef = db.collection("document_generation_requests").doc(pdfRecordId);

  let pdfUrl = "";
  if (record.contractId) {
    try {
      pdfUrl = await generateContractPDF({
        contractId: record.contractId,
        propertyId: record.propertyId,
        propertyName: record.propertyName,
        ownerId: record.ownerId,
        tenantId: record.tenantId,
        expiryAt: record.expiryAt.toISOString(),
        documentPurpose: "RENEWAL_NOTICE",
      } as any);
    } catch (error) {
      console.error("Renewal PDF generation failed", record.contractId, error);
    }
  }

  await pdfRef.set({
    type: "CONTRACT_RENEWAL_NOTICE_PDF",
    status: pdfUrl ? "GENERATED" : "PENDING_GENERATION",
    pdfUrl: pdfUrl || null,
    contractId: record.contractId,
    leaseId: record.leaseId,
    propertyId: record.propertyId,
    propertyName: record.propertyName,
    unitId: record.unitId,
    unitNumber: record.unitNumber,
    ownerId: record.ownerId,
    tenantId: record.tenantId,
    brokerId: record.brokerId,
    expiryAt: admin.firestore.Timestamp.fromDate(record.expiryAt),
    daysRemaining: record.daysRemaining,
    milestoneDays: record.milestoneDays,
    generatedAt: pdfUrl ? admin.firestore.FieldValue.serverTimestamp() : null,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    source: "CONTRACT_RENEWAL_PDF_SYSTEM",
  }, { merge: true });

  return { pdfRecordId, pdfUrl };
}

async function processRenewalRecord(record: RenewalRecord) {
  const renewalRef = db.collection("contract_renewal_watch").doc(renewalId(record));
  const existing = await renewalRef.get();
  if (existing.exists && existing.data()?.completed === true) {
    return { skipped: true, reason: "already_completed" };
  }

  const { pdfRecordId, pdfUrl } = await createRenewalPdfRecord(record);
  const recipients = await resolveRecipients(record);
  let notificationCount = 0;
  for (const recipient of recipients) {
    for (const id of recipient.ids) {
      if (!id) continue;
      await createNotification(record, recipient.role, id, recipient.link);
      notificationCount += 1;
    }
    if (recipient.email) await createEmailOutbox(record, recipient.role, recipient.email);
  }

  await renewalRef.set({
    ...record,
    expiryAt: admin.firestore.Timestamp.fromDate(record.expiryAt),
    pdfRecordId,
    pdfUrl: pdfUrl || null,
    notificationCount,
    completed: true,
    processedAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });

  await db.collection("audit_logs").add({
    actorId: "CONTRACT_RENEWAL_PDF_SYSTEM",
    actorRole: "system",
    action: "CONTRACT_RENEWAL_MILESTONE_PROCESSED",
    targetType: record.sourceCollection,
    targetId: record.sourceId,
    metadata: {
      contractId: record.contractId,
      leaseId: record.leaseId,
      propertyId: record.propertyId,
      milestoneDays: record.milestoneDays,
      daysRemaining: record.daysRemaining,
      notificationCount,
      pdfRecordId,
      pdfGenerated: Boolean(pdfUrl),
    },
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  return { skipped: false, notificationCount, pdfRecordId, pdfUrl };
}

async function collectRenewalRecords() {
  const output: RenewalRecord[] = [];
  const collections: RenewalSource[] = ["contracts", "leases", "tenant_ledger", "propertyPassports"];
  for (const collectionName of collections) {
    const snap = await db.collection(collectionName).limit(1500).get();
    snap.forEach((doc) => {
      const normalized = normalizeRecord(collectionName, doc.id, doc.data());
      if (normalized) output.push(normalized);
    });
  }
  return output;
}

export const runContractRenewalWatch = onSchedule("every 24 hours", async () => {
  const records = await collectRenewalRecords();
  let processed = 0;
  let skipped = 0;
  for (const record of records) {
    const result = await processRenewalRecord(record);
    if (result.skipped) skipped += 1;
    else processed += 1;
  }
  await db.collection("system_health").doc("contractRenewals").set({
    status: "READY",
    processed,
    skipped,
    scanned: records.length,
    milestones: RENEWAL_MILESTONES,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });
});

export const rebuildContractRenewalWatch = onCall({ cors: true }, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Auth required.");
  const role = safeString(request.auth.token?.role || request.auth.token?.userRole || request.auth.token?.primaryRole).toLowerCase();
  const adminAllowed = request.auth.token?.admin === true || ["admin", "super_admin", "ceo", "operations_admin", "account_manager"].includes(role);
  if (!adminAllowed) throw new HttpsError("permission-denied", "Admin access required.");

  const records = await collectRenewalRecords();
  const results = [] as any[];
  for (const record of records) {
    results.push({ id: renewalId(record), ...(await processRenewalRecord(record)) });
  }
  return { status: "SUCCESS", scanned: records.length, processed: results.filter((r) => !r.skipped).length, results };
});

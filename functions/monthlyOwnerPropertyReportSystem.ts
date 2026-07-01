import { onCall, HttpsError } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import * as admin from "firebase-admin";
import { getStorage } from "firebase-admin/storage";
import PDFDocument from "pdfkit";

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

type OwnerReportProperty = {
  propertyId: string;
  propertyName: string;
  address: string;
  emirate: string;
  unitCount: number;
  rentDue: number;
  rentPaid: number;
  rentBalance: number;
  collectionRate: number;
  completedMaintenance: any[];
  pendingMaintenance: any[];
  maintenanceCost: number;
};

type OwnerReportPayload = {
  ownerId: string;
  ownerEmail: string;
  ownerName: string;
  periodKey: string;
  periodStart: Date;
  periodEnd: Date;
  contracts: any[];
  properties: OwnerReportProperty[];
  totals: {
    propertyCount: number;
    rentDue: number;
    rentPaid: number;
    rentBalance: number;
    collectionRate: number;
    completedMaintenance: number;
    pendingMaintenance: number;
    maintenanceCost: number;
  };
};

function safeString(value: any, fallback = "") {
  const text = String(value ?? "").trim();
  return text || fallback;
}

function money(value: any) {
  const amount = Number(value || 0);
  return `AED ${amount.toLocaleString("en-AE", { maximumFractionDigits: 0 })}`;
}

function toDate(value: any): Date | null {
  if (!value) return null;
  if (typeof value.toDate === "function") return value.toDate();
  if (value.seconds) return new Date(value.seconds * 1000);
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

function previousMonthWindow(now = new Date()) {
  const periodStart = new Date(now.getFullYear(), now.getMonth() - 1, 1, 0, 0, 0, 0);
  const periodEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
  const periodKey = `${periodStart.getFullYear()}-${String(periodStart.getMonth() + 1).padStart(2, "0")}`;
  return { periodStart, periodEnd, periodKey };
}

function isActiveContract(contract: any) {
  const status = safeString(contract.status || contract.contractStatus || contract.activationStatus).toLowerCase();
  if (!status) return true;
  return !["cancelled", "canceled", "terminated", "expired", "rejected", "archived"].some((word) => status.includes(word));
}

function includesMaintenanceAndPropertyManagement(contract: any) {
  const values = [
    contract.contractMode,
    contract.contractType,
    contract.planType,
    contract.packageName,
    contract.planName,
    contract.servicePlan?.id,
    contract.servicePlan?.name,
    ...(Array.isArray(contract.coverage) ? contract.coverage : []),
    ...(Array.isArray(contract.inclusions) ? contract.inclusions : []),
  ].map((value) => safeString(value).toLowerCase()).join(" ");

  const maintenance = contract.maintenanceIncluded === true || values.includes("maintenance") || values.includes("fm") || values.includes("facility");
  const propertyManagement = contract.propertyManagementIncluded === true || values.includes("property management") || values.includes("pm") || values.includes("tenant") || values.includes("rent");
  const hybrid = values.includes("hybrid") || values.includes("combined") || values.includes("full") || values.includes("maintenance + property") || values.includes("maintenance and property");
  return isActiveContract(contract) && (hybrid || (maintenance && propertyManagement));
}

function isCompletedTicket(ticket: any) {
  const status = safeString(ticket.status).toLowerCase();
  return ["completed", "closed", "resolved", "approved"].some((word) => status.includes(word));
}

function isPendingTicket(ticket: any) {
  const status = safeString(ticket.status).toLowerCase();
  if (!status) return true;
  return !isCompletedTicket(ticket) && !["cancelled", "canceled", "rejected", "archived"].some((word) => status.includes(word));
}

function numberFrom(...values: any[]) {
  for (const value of values) {
    const numberValue = Number(value);
    if (Number.isFinite(numberValue)) return numberValue;
  }
  return 0;
}

async function logAudit(data: Record<string, any>) {
  await db.collection("audit_logs").add({
    ...data,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });
}

async function getOwnerProfile(ownerId: string, contract: any) {
  const [userDoc, ownerDoc] = await Promise.all([
    ownerId ? db.collection("users").doc(ownerId).get() : Promise.resolve(null as any),
    ownerId ? db.collection("owners").doc(ownerId).get() : Promise.resolve(null as any),
  ]);
  const user = userDoc?.exists ? userDoc.data() : {};
  const owner = ownerDoc?.exists ? ownerDoc.data() : {};
  return {
    ownerId,
    ownerEmail: safeString(owner?.email || user?.email || contract.ownerEmail || contract.email),
    ownerName: safeString(owner?.displayName || owner?.name || user?.displayName || user?.name || contract.ownerName, "Property Owner"),
  };
}

async function getContractProperties(ownerId: string, contracts: any[]) {
  const propertyIds = new Set<string>();
  contracts.forEach((contract) => {
    if (contract.propertyId) propertyIds.add(String(contract.propertyId));
    if (Array.isArray(contract.propertyIds)) contract.propertyIds.forEach((id: any) => id && propertyIds.add(String(id)));
  });

  const byId = new Map<string, any>();
  for (const propertyId of propertyIds) {
    const [propertyDoc, passportDoc] = await Promise.all([
      db.collection("properties").doc(propertyId).get(),
      db.collection("propertyPassports").doc(propertyId).get(),
    ]);
    const propertyData = propertyDoc.exists ? propertyDoc.data() : {};
    const passportData = passportDoc.exists ? passportDoc.data() : {};
    byId.set(propertyId, { id: propertyId, ...passportData, ...propertyData });
  }

  if (byId.size === 0 && ownerId) {
    const snap = await db.collection("properties").where("ownerId", "==", ownerId).limit(250).get();
    snap.forEach((doc) => byId.set(doc.id, { id: doc.id, ...doc.data() }));
  }

  return [...byId.values()];
}

async function aggregateRent(propertyId: string) {
  let rentDue = 0;
  let rentPaid = 0;
  let rentBalance = 0;

  const ledgerSnap = await db.collection("tenant_ledger").where("propertyId", "==", propertyId).limit(500).get();
  ledgerSnap.forEach((doc) => {
    const data = doc.data();
    rentDue += numberFrom(data.rentDue, data.totalRentDue, data.dueAmount, data.expectedRent, data.monthlyRent);
    rentPaid += numberFrom(data.rentPaid, data.totalRentPaid, data.paidAmount, data.amountPaid, data.collectedAmount);
    rentBalance += numberFrom(data.balance, data.outstandingBalance, data.balanceAmount, data.remainingBalance);
  });

  if (rentBalance === 0) rentBalance = Math.max(rentDue - rentPaid, 0);
  const collectionRate = rentDue > 0 ? Math.round((rentPaid / rentDue) * 1000) / 10 : 100;
  return { rentDue, rentPaid, rentBalance, collectionRate };
}

async function aggregateMaintenance(propertyId: string, periodStart: Date, periodEnd: Date) {
  const completedMaintenance: any[] = [];
  const pendingMaintenance: any[] = [];
  let maintenanceCost = 0;

  const snap = await db.collection("maintenanceTickets").where("propertyId", "==", propertyId).limit(500).get();
  snap.forEach((doc) => {
    const data = doc.data();
    const completedAt = toDate(data.completedAt || data.resolvedAt || data.closedAt || data.updatedAt);
    const createdAt = toDate(data.createdAt);
    const row = {
      ticketId: doc.id,
      title: safeString(data.title || data.issueType || data.category || data.complaintCategory, "Maintenance ticket"),
      status: safeString(data.status, "OPEN"),
      priority: safeString(data.priority, "NORMAL"),
      technicianName: safeString(data.assignedTechnicianName || data.technicianName, "Not assigned"),
      cost: numberFrom(data.finalCost, data.actualCost, data.estimatedCost, data.cost),
      createdAt,
      completedAt,
    };

    if (isCompletedTicket(data) && completedAt && completedAt >= periodStart && completedAt <= periodEnd) {
      completedMaintenance.push(row);
      maintenanceCost += row.cost;
    } else if (isPendingTicket(data)) {
      pendingMaintenance.push(row);
      maintenanceCost += row.cost;
    }
  });

  return { completedMaintenance, pendingMaintenance, maintenanceCost };
}

function drawLine(doc: PDFKit.PDFDocument) {
  doc.moveDown(0.2);
  doc.strokeColor("#E5E7EB").lineWidth(1).moveTo(50, doc.y).lineTo(545, doc.y).stroke();
  doc.moveDown(0.5);
}

function drawPropertySection(doc: PDFKit.PDFDocument, property: OwnerReportProperty) {
  if (doc.y > 660) doc.addPage();
  doc.fillColor("#111827").fontSize(14).text(property.propertyName);
  doc.fillColor("#6B7280").fontSize(9).text(`${property.address || "Address not recorded"} · ${property.emirate || "UAE"}`);
  doc.moveDown(0.5);
  doc.fillColor("#111827").fontSize(9).text(`Units: ${property.unitCount} | Rent due: ${money(property.rentDue)} | Paid: ${money(property.rentPaid)} | Balance: ${money(property.rentBalance)} | Collection: ${property.collectionRate}%`);
  doc.text(`Maintenance completed this month: ${property.completedMaintenance.length} | Pending: ${property.pendingMaintenance.length} | Cost/Estimate: ${money(property.maintenanceCost)}`);
  doc.moveDown(0.4);

  doc.fillColor("#065F46").fontSize(10).text("Fixed / completed maintenance");
  if (!property.completedMaintenance.length) {
    doc.fillColor("#6B7280").fontSize(8).text("No completed maintenance recorded for this period.");
  } else {
    property.completedMaintenance.slice(0, 12).forEach((ticket) => {
      if (doc.y > 735) doc.addPage();
      doc.fillColor("#111827").fontSize(8).text(`• ${ticket.title} · ${ticket.status} · ${ticket.technicianName} · ${money(ticket.cost)}`);
    });
  }

  doc.moveDown(0.35);
  doc.fillColor("#92400E").fontSize(10).text("Pending maintenance");
  if (!property.pendingMaintenance.length) {
    doc.fillColor("#6B7280").fontSize(8).text("No pending maintenance at month close.");
  } else {
    property.pendingMaintenance.slice(0, 12).forEach((ticket) => {
      if (doc.y > 735) doc.addPage();
      doc.fillColor("#111827").fontSize(8).text(`• ${ticket.title} · ${ticket.status} · ${ticket.priority} · ${ticket.technicianName}`);
    });
  }
  drawLine(doc);
}

async function saveReportPdf(payload: OwnerReportPayload) {
  const doc = new PDFDocument({ margin: 50, size: "A4", info: { Title: "Monthly Owner Property Report", Author: "BIN GROUP Super App" } });
  const chunks: Buffer[] = [];
  doc.on("data", (chunk: Buffer) => chunks.push(chunk));

  const completion = new Promise<Buffer>((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });

  doc.fillColor("#C6A75E").fontSize(22).text("BIN GROUP", { align: "center" });
  doc.fillColor("#111827").fontSize(13).text("Monthly Owner Property Report", { align: "center" });
  doc.fillColor("#6B7280").fontSize(9).text(`Period: ${payload.periodKey} | Owner: ${payload.ownerName}`, { align: "center" });
  drawLine(doc);

  doc.fillColor("#111827").fontSize(11).text("Portfolio summary");
  doc.fontSize(9).text(`Properties: ${payload.totals.propertyCount}`);
  doc.text(`Rent due: ${money(payload.totals.rentDue)} | Rent paid: ${money(payload.totals.rentPaid)} | Balance: ${money(payload.totals.rentBalance)} | Collection: ${payload.totals.collectionRate}%`);
  doc.text(`Maintenance fixed: ${payload.totals.completedMaintenance} | Pending: ${payload.totals.pendingMaintenance} | Cost/Estimate: ${money(payload.totals.maintenanceCost)}`);
  drawLine(doc);

  payload.properties.forEach((property) => drawPropertySection(doc, property));

  doc.fillColor("#6B7280").fontSize(8).text("Generated automatically by BIN GROUP Super App. This report is based on system records available at generation time.", { align: "center" });
  doc.end();

  const buffer = await completion;
  const storagePath = `owner_reports/${payload.ownerId}/${payload.periodKey}/monthly-property-report.pdf`;
  const file = getStorage().bucket().file(storagePath);
  await file.save(buffer, {
    contentType: "application/pdf",
    metadata: {
      metadata: {
        ownerId: payload.ownerId,
        ownerEmail: payload.ownerEmail,
        periodKey: payload.periodKey,
        documentType: "monthly_owner_property_report",
      },
    },
  });
  const [signedUrl] = await file.getSignedUrl({ action: "read", expires: "03-09-2491" });
  return { storagePath, signedUrl };
}

async function buildOwnerReport(ownerId: string, contracts: any[], periodStart: Date, periodEnd: Date, periodKey: string): Promise<OwnerReportPayload | null> {
  const profile = await getOwnerProfile(ownerId, contracts[0] || {});
  if (!profile.ownerEmail) return null;

  const propertyRecords = await getContractProperties(ownerId, contracts);
  const properties: OwnerReportProperty[] = [];

  for (const property of propertyRecords) {
    const propertyId = safeString(property.propertyId || property.id || property.passportId);
    if (!propertyId) continue;
    const [rent, maintenance] = await Promise.all([
      aggregateRent(propertyId),
      aggregateMaintenance(propertyId, periodStart, periodEnd),
    ]);
    properties.push({
      propertyId,
      propertyName: safeString(property.propertyName || property.name || property.assetName || property.address, "Property"),
      address: safeString(property.address || property.addressLine || property.location?.address),
      emirate: safeString(property.emirate || property.city || property.zone, "UAE"),
      unitCount: numberFrom(property.units, property.totalUnits, property.unitCount),
      rentDue: rent.rentDue,
      rentPaid: rent.rentPaid,
      rentBalance: rent.rentBalance,
      collectionRate: rent.collectionRate,
      completedMaintenance: maintenance.completedMaintenance,
      pendingMaintenance: maintenance.pendingMaintenance,
      maintenanceCost: maintenance.maintenanceCost,
    });
  }

  const totals = properties.reduce((acc, property) => {
    acc.rentDue += property.rentDue;
    acc.rentPaid += property.rentPaid;
    acc.rentBalance += property.rentBalance;
    acc.completedMaintenance += property.completedMaintenance.length;
    acc.pendingMaintenance += property.pendingMaintenance.length;
    acc.maintenanceCost += property.maintenanceCost;
    return acc;
  }, { propertyCount: properties.length, rentDue: 0, rentPaid: 0, rentBalance: 0, collectionRate: 100, completedMaintenance: 0, pendingMaintenance: 0, maintenanceCost: 0 });
  totals.collectionRate = totals.rentDue > 0 ? Math.round((totals.rentPaid / totals.rentDue) * 1000) / 10 : 100;

  return { ...profile, periodKey, periodStart, periodEnd, contracts, properties, totals };
}

async function queueOwnerReportEmail(payload: OwnerReportPayload, report: { storagePath: string; signedUrl: string }) {
  const mailId = `owner_monthly_report_${payload.ownerId}_${payload.periodKey}`;
  await db.collection("mail").doc(mailId).set({
    to: payload.ownerEmail,
    message: {
      subject: `[BIN GROUP] Monthly Property Report - ${payload.periodKey}`,
      html: `<p>Dear ${payload.ownerName},</p><p>Your monthly property report for ${payload.periodKey} is ready.</p><p>Rent paid: <strong>${money(payload.totals.rentPaid)}</strong><br/>Balance: <strong>${money(payload.totals.rentBalance)}</strong><br/>Maintenance fixed: <strong>${payload.totals.completedMaintenance}</strong><br/>Pending maintenance: <strong>${payload.totals.pendingMaintenance}</strong></p><p><a href="${report.signedUrl}">Download PDF report</a></p>`,
      attachments: [{ filename: `BIN-GROUP-owner-property-report-${payload.periodKey}.pdf`, path: report.storagePath, contentType: "application/pdf" }],
    },
    type: "MONTHLY_OWNER_PROPERTY_REPORT",
    status: "PENDING",
    ownerId: payload.ownerId,
    periodKey: payload.periodKey,
    reportUrl: report.signedUrl,
    storagePath: report.storagePath,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });
}

async function processOwnerReport(ownerId: string, contracts: any[], periodStart: Date, periodEnd: Date, periodKey: string) {
  const reportId = `${ownerId}_${periodKey}`;
  const reportRef = db.collection("owner_property_reports").doc(reportId);
  const existing = await reportRef.get();
  if (existing.exists && existing.data()?.emailQueued === true) return { ownerId, skipped: true };

  const payload = await buildOwnerReport(ownerId, contracts, periodStart, periodEnd, periodKey);
  if (!payload) return { ownerId, skipped: true, reason: "missing_owner_email" };

  const pdf = await saveReportPdf(payload);
  await queueOwnerReportEmail(payload, pdf);

  await reportRef.set({
    ownerId: payload.ownerId,
    ownerEmail: payload.ownerEmail,
    ownerName: payload.ownerName,
    periodKey,
    periodStart: admin.firestore.Timestamp.fromDate(periodStart),
    periodEnd: admin.firestore.Timestamp.fromDate(periodEnd),
    propertyCount: payload.totals.propertyCount,
    rentDue: payload.totals.rentDue,
    rentPaid: payload.totals.rentPaid,
    rentBalance: payload.totals.rentBalance,
    collectionRate: payload.totals.collectionRate,
    completedMaintenance: payload.totals.completedMaintenance,
    pendingMaintenance: payload.totals.pendingMaintenance,
    maintenanceCost: payload.totals.maintenanceCost,
    storagePath: pdf.storagePath,
    reportUrl: pdf.signedUrl,
    emailQueued: true,
    status: "EMAIL_QUEUED",
    source: "MONTHLY_OWNER_PROPERTY_REPORT_SYSTEM",
    generatedAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });

  await db.collection("document_generation_requests").doc(`owner_monthly_report_${reportId}`).set({
    type: "MONTHLY_OWNER_PROPERTY_REPORT_PDF",
    status: "GENERATED",
    ownerId: payload.ownerId,
    ownerEmail: payload.ownerEmail,
    periodKey,
    storagePath: pdf.storagePath,
    pdfUrl: pdf.signedUrl,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });

  await logAudit({
    actorId: "MONTHLY_OWNER_PROPERTY_REPORT_SYSTEM",
    actorRole: "system",
    action: "MONTHLY_OWNER_PROPERTY_REPORT_EMAIL_QUEUED",
    targetType: "owner_property_reports",
    targetId: reportId,
    metadata: { ownerId: payload.ownerId, periodKey, propertyCount: payload.totals.propertyCount, storagePath: pdf.storagePath },
  });

  return { ownerId, skipped: false, reportId, reportUrl: pdf.signedUrl };
}

async function collectEligibleOwnerContracts() {
  const snap = await db.collection("contracts").limit(2500).get();
  const grouped = new Map<string, any[]>();
  snap.forEach((doc) => {
    const data: any = { id: doc.id, contractId: doc.id, ...doc.data() };
    if (!includesMaintenanceAndPropertyManagement(data)) return;
    const ownerId = safeString(data.ownerId || data.ownerUid || data.userId || data.createdBy);
    if (!ownerId) return;
    const list = grouped.get(ownerId) || [];
    list.push(data);
    grouped.set(ownerId, list);
  });
  return grouped;
}

export const sendMonthlyOwnerPropertyReports = onSchedule({ schedule: "0 8 1 * *", timeZone: "Asia/Dubai" }, async () => {
  const { periodStart, periodEnd, periodKey } = previousMonthWindow();
  const eligible = await collectEligibleOwnerContracts();
  let processed = 0;
  let skipped = 0;
  for (const [ownerId, contracts] of eligible.entries()) {
    const result = await processOwnerReport(ownerId, contracts, periodStart, periodEnd, periodKey);
    if (result.skipped) skipped += 1;
    else processed += 1;
  }
  await db.collection("system_health").doc("monthlyOwnerReports").set({
    status: "READY",
    periodKey,
    eligibleOwners: eligible.size,
    processed,
    skipped,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });
});

export const rebuildMonthlyOwnerPropertyReports = onCall({ cors: true }, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Auth required.");
  const role = safeString(request.auth.token?.role || request.auth.token?.userRole || request.auth.token?.primaryRole).toLowerCase();
  const adminAllowed = request.auth.token?.admin === true || ["admin", "super_admin", "ceo", "operations_admin", "account_manager"].includes(role);
  if (!adminAllowed) throw new HttpsError("permission-denied", "Admin access required.");

  const requestedPeriod = safeString(request.data?.periodKey);
  let window = previousMonthWindow();
  if (/^\d{4}-\d{2}$/.test(requestedPeriod)) {
    const [year, month] = requestedPeriod.split("-").map(Number);
    window = {
      periodKey: requestedPeriod,
      periodStart: new Date(year, month - 1, 1, 0, 0, 0, 0),
      periodEnd: new Date(year, month, 0, 23, 59, 59, 999),
    };
  }

  const eligible = await collectEligibleOwnerContracts();
  const ownerFilter = safeString(request.data?.ownerId);
  const results: any[] = [];
  for (const [ownerId, contracts] of eligible.entries()) {
    if (ownerFilter && ownerFilter !== ownerId) continue;
    results.push(await processOwnerReport(ownerId, contracts, window.periodStart, window.periodEnd, window.periodKey));
  }

  return { status: "SUCCESS", periodKey: window.periodKey, eligibleOwners: eligible.size, processed: results.filter((r) => !r.skipped).length, results };
});

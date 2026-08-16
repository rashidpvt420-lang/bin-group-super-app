import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import { getStorage } from "firebase-admin/storage";
import { createHash, randomUUID } from "node:crypto";
import PDFDocument from "pdfkit";

const FUNCTION_REGION = "europe-west3";
const SECURE_CALLABLE_OPTIONS = {
  region: FUNCTION_REGION,
  cors: true,
  enforceAppCheck: true,
} as const;
const PUBLIC_CALLABLE_OPTIONS = {
  region: FUNCTION_REGION,
  cors: true,
} as const;

const ensureDb = () => {
  if (!admin.apps.length) {
    admin.initializeApp();
  }
  return admin.firestore();
};

const text = (value: unknown) => String(value ?? "").trim();
const upper = (value: unknown) => text(value).toUpperCase();

function callerRole(token: Record<string, unknown>): string {
  return text(token.role || token.userRole || token.primaryRole).toLowerCase();
}

function isCeoOrAdmin(token: Record<string, unknown>): boolean {
  const role = callerRole(token);
  return token.admin === true || token.super_admin === true ||
    ["admin", "super_admin", "ceo"].includes(role);
}

async function assertActiveAccount(uid: string, token: Record<string, unknown>) {
  const user = await admin.auth().getUser(uid);
  if (user.disabled || token.suspended === true || user.customClaims?.suspended === true) {
    throw new HttpsError("permission-denied", "This staff account is disabled or suspended.");
  }
}

function asDate(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date && Number.isFinite(value.getTime())) return value;
  if (typeof value === "object" && value !== null) {
    const maybe = value as { toDate?: () => Date; seconds?: number; _seconds?: number };
    if (typeof maybe.toDate === "function") {
      const date = maybe.toDate();
      return Number.isFinite(date.getTime()) ? date : null;
    }
    const seconds = maybe.seconds ?? maybe._seconds;
    if (Number.isFinite(Number(seconds))) {
      const date = new Date(Number(seconds) * 1000);
      return Number.isFinite(date.getTime()) ? date : null;
    }
  }
  if (typeof value === "number" || typeof value === "string") {
    const date = new Date(value);
    return Number.isFinite(date.getTime()) ? date : null;
  }
  return null;
}

function currentMonthKey(date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Dubai",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  if (!year || !month) throw new HttpsError("internal", "Unable to resolve company-local month.");
  return `${year}-${month}`;
}

function monthBounds(monthPeriod: string) {
  if (!/^\d{4}-\d{2}$/.test(monthPeriod)) {
    throw new HttpsError("invalid-argument", "monthPeriod must use YYYY-MM format.");
  }
  const [yearText, monthText] = monthPeriod.split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    throw new HttpsError("invalid-argument", "Invalid monthPeriod.");
  }
  const start = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0));
  const end = new Date(Date.UTC(year, month, 1, 0, 0, 0));
  return { start, end };
}

function canReadAttendance(token: Record<string, unknown>, callerUid: string, targetUid: string): boolean {
  if (callerUid === targetUid || isCeoOrAdmin(token)) return true;
  return ["hr_admin", "hr_manager", "operations_manager"].includes(callerRole(token));
}

function canReadOvertime(token: Record<string, unknown>, callerUid: string, targetUid: string): boolean {
  if (callerUid === targetUid || isCeoOrAdmin(token)) return true;
  return ["hr_admin", "hr_manager", "operations_manager", "finance_manager", "payroll_admin"].includes(callerRole(token));
}

function canReadPayslip(token: Record<string, unknown>, callerUid: string, targetUid: string): boolean {
  if (callerUid === targetUid || isCeoOrAdmin(token)) return true;
  return ["hr_admin", "finance_manager", "payroll_admin"].includes(callerRole(token));
}

async function loadStaffIdentity(db: FirebaseFirestore.Firestore, uid: string) {
  const snap = await db.collection("users").doc(uid).get();
  const data = snap.data() || {};
  return {
    uid,
    staffId: text(data.staffId || data.employeeId) || uid,
    displayName: text(data.displayName || data.name || data.email) || "Staff Member",
  };
}

function money(value: unknown, currency = "AED"): string {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return "Not recorded";
  return `${currency} ${amount.toLocaleString("en-AE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

async function buildPdfBuffer(title: string, lines: Array<{ label: string; value: string }>): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 48, info: { Title: title } });
    const chunks: Buffer[] = [];

    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("error", reject);
    doc.on("end", () => resolve(Buffer.concat(chunks)));

    doc.fontSize(18).text("BIN GROUP", { align: "center" });
    doc.moveDown(0.4);
    doc.fontSize(14).text(title, { align: "center" });
    doc.moveDown(1);

    for (const line of lines) {
      doc.fontSize(9).fillColor("#6B7280").text(line.label);
      doc.fontSize(11).fillColor("#111827").text(line.value || "Not recorded");
      doc.moveDown(0.55);
    }

    doc.moveDown(1);
    doc.fontSize(8).fillColor("#6B7280").text(
      "This report was generated from authorized BIN GROUP system records. Verification uses the report ID and SHA-256 digest.",
      { align: "left" },
    );
    doc.end();
  });
}

async function persistPdfReport(
  db: FirebaseFirestore.Firestore,
  args: {
    reportId: string;
    reportType: string;
    staffUid: string;
    generatedBy: string;
    generatedAt: string;
    monthPeriod: string;
    buffer: Buffer;
  },
) {
  const hash = createHash("sha256").update(args.buffer).digest("hex");
  const storagePath = `staff-reports/${args.staffUid}/${args.reportId}.pdf`;
  const file = getStorage().bucket().file(storagePath);

  await file.save(args.buffer, {
    resumable: false,
    contentType: "application/pdf",
    metadata: {
      cacheControl: "private, max-age=0, no-store",
      metadata: {
        reportId: args.reportId,
        sha256Hash: hash,
      },
    },
  });

  await db.collection("pdf_reports").doc(args.reportId).set({
    reportId: args.reportId,
    reportType: args.reportType,
    staffUid: args.staffUid,
    generatedBy: args.generatedBy,
    generatedAt: args.generatedAt,
    monthPeriod: args.monthPeriod,
    sha256Hash: hash,
    storagePath,
    version: 1,
    status: "ISSUED",
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  return hash;
}

/**
 * Real attendance PDF generated from staff_shifts; no hardcoded hours/rates.
 */
export const generateStaffAttendancePdf = onCall(SECURE_CALLABLE_OPTIONS, async (request) => {
  if (!request.auth?.uid) {
    throw new HttpsError("unauthenticated", "Authentication required for attendance report.");
  }

  const callerUid = request.auth.uid;
  const token = request.auth.token || {};
  const db = ensureDb();
  const targetStaffUid = text(request.data?.staffUid) || callerUid;
  const monthPeriod = text(request.data?.monthPeriod) || currentMonthKey();
  const { start, end } = monthBounds(monthPeriod);

  await assertActiveAccount(callerUid, token);

  if (!canReadAttendance(token, callerUid, targetStaffUid)) {
    throw new HttpsError("permission-denied", "Not authorized to generate this attendance report.");
  }

  const identity = await loadStaffIdentity(db, targetStaffUid);
  const shiftsSnap = await db.collection("staff_shifts")
    .where("staffId", "==", targetStaffUid)
    .limit(400)
    .get();

  let totalShifts = 0;
  let completedShifts = 0;
  let lateShifts = 0;
  let totalHours = 0;

  for (const shift of shiftsSnap.docs) {
    const data = shift.data() || {};
    const shiftDate = text(data.shiftDate);
    const basisDate = asDate(data.clockInTime) || (shiftDate ? new Date(`${shiftDate}T00:00:00Z`) : null);
    if (!basisDate || basisDate < start || basisDate >= end) continue;

    totalShifts += 1;
    if (upper(data.status) === "COMPLETED") completedShifts += 1;
    if (data.late === true || upper(data.attendanceStatus) === "LATE") lateShifts += 1;

    const clockIn = asDate(data.clockInTime);
    const clockOut = asDate(data.clockOutTime);
    if (clockIn && clockOut && clockOut > clockIn) {
      totalHours += (clockOut.getTime() - clockIn.getTime()) / 3_600_000;
    }
  }

  const onTimeRate = totalShifts > 0 ? Math.max(0, ((totalShifts - lateShifts) / totalShifts) * 100) : null;
  const generatedAt = new Date().toISOString();
  const reportId = `ATT_${randomUUID()}`;

  const buffer = await buildPdfBuffer("Staff Attendance Summary", [
    { label: "Employee", value: `${identity.displayName} (${identity.staffId})` },
    { label: "Period", value: monthPeriod },
    { label: "Shifts recorded", value: String(totalShifts) },
    { label: "Completed shifts", value: String(completedShifts) },
    { label: "Hours worked", value: totalHours.toFixed(2) },
    { label: "Late shifts", value: String(lateShifts) },
    { label: "On-time rate", value: onTimeRate === null ? "No shifts recorded" : `${onTimeRate.toFixed(1)}%` },
    { label: "Generated at", value: generatedAt },
    { label: "Report ID", value: reportId },
  ]);

  const hash = await persistPdfReport(db, {
    reportId,
    reportType: "STAFF_ATTENDANCE_SUMMARY",
    staffUid: targetStaffUid,
    generatedBy: callerUid,
    generatedAt,
    monthPeriod,
    buffer,
  });

  return {
    success: true,
    reportId,
    reportType: "STAFF_ATTENDANCE_SUMMARY",
    generatedAt,
    monthPeriod,
    sha256Hash: hash,
  };
});

/**
 * Overtime PDF generated from approved staff_request_trackers.
 */
export const generateStaffOvertimePdf = onCall(SECURE_CALLABLE_OPTIONS, async (request) => {
  if (!request.auth?.uid) {
    throw new HttpsError("unauthenticated", "Authentication required.");
  }

  const callerUid = request.auth.uid;
  const token = request.auth.token || {};
  const db = ensureDb();
  const targetStaffUid = text(request.data?.staffUid) || callerUid;
  const monthPeriod = text(request.data?.monthPeriod) || currentMonthKey();
  const { start, end } = monthBounds(monthPeriod);

  await assertActiveAccount(callerUid, token);

  if (!canReadOvertime(token, callerUid, targetStaffUid)) {
    throw new HttpsError("permission-denied", "Not authorized to generate this overtime report.");
  }

  const identity = await loadStaffIdentity(db, targetStaffUid);
  const trackersSnap = await db.collection("staff_request_trackers")
    .where("staffId", "==", targetStaffUid)
    .limit(400)
    .get();

  let approvedClaims = 0;
  let approvedMinutes = 0;
  let approvedPay = 0;
  let payRecords = 0;

  for (const tracker of trackersSnap.docs) {
    const data = tracker.data() || {};
    if (upper(data.requestType) !== "OVERTIME_CLAIM") continue;
    const basisDate = asDate(data.approvedAt) || asDate(data.updatedAt) || asDate(data.createdAt);
    if (!basisDate || basisDate < start || basisDate >= end) continue;
    if (!["APPROVED", "PAYROLL_INCLUDED", "PAID"].includes(upper(data.status))) continue;

    approvedClaims += 1;
    const minutes = Number(data.approvedMinutes);
    if (Number.isFinite(minutes) && minutes > 0) approvedMinutes += Math.round(minutes);

    const pay = Number(data.approvedPayAmount);
    if (Number.isFinite(pay) && pay >= 0) {
      approvedPay += pay;
      payRecords += 1;
    }
  }

  const generatedAt = new Date().toISOString();
  const reportId = `OT_${randomUUID()}`;
  const buffer = await buildPdfBuffer("Staff Overtime Verification", [
    { label: "Employee", value: `${identity.displayName} (${identity.staffId})` },
    { label: "Period", value: monthPeriod },
    { label: "Approved overtime claims", value: String(approvedClaims) },
    { label: "Approved overtime minutes", value: String(approvedMinutes) },
    { label: "Approved overtime hours", value: (approvedMinutes / 60).toFixed(2) },
    { label: "Approved overtime pay", value: payRecords > 0 ? money(approvedPay) : "Not calculated in approved records" },
    { label: "Generated at", value: generatedAt },
    { label: "Report ID", value: reportId },
  ]);

  const hash = await persistPdfReport(db, {
    reportId,
    reportType: "STAFF_OVERTIME_VERIFICATION",
    staffUid: targetStaffUid,
    generatedBy: callerUid,
    generatedAt,
    monthPeriod,
    buffer,
  });

  return {
    success: true,
    reportId,
    reportType: "STAFF_OVERTIME_VERIFICATION",
    generatedAt,
    monthPeriod,
    sha256Hash: hash,
  };
});

/**
 * Payslip PDF generated from canonical payroll_entries. Missing payroll data fails closed.
 */
export const generateStaffPayslipPdf = onCall(SECURE_CALLABLE_OPTIONS, async (request) => {
  if (!request.auth?.uid) {
    throw new HttpsError("unauthenticated", "Authentication required.");
  }

  const callerUid = request.auth.uid;
  const token = request.auth.token || {};
  const db = ensureDb();
  const targetStaffUid = text(request.data?.staffUid) || callerUid;
  const monthPeriod = text(request.data?.monthPeriod) || currentMonthKey();

  monthBounds(monthPeriod);
  await assertActiveAccount(callerUid, token);

  if (!canReadPayslip(token, callerUid, targetStaffUid)) {
    throw new HttpsError("permission-denied", "Not authorized to generate this payslip.");
  }

  const identity = await loadStaffIdentity(db, targetStaffUid);
  const payrollSnap = await db.collection("payroll_entries")
    .where("technicianId", "==", targetStaffUid)
    .limit(100)
    .get();

  const payrollDoc = payrollSnap.docs.find((doc) => {
    const data = doc.data() || {};
    return text(data.month || data.payPeriod) === monthPeriod;
  });

  if (!payrollDoc) {
    throw new HttpsError("not-found", `No canonical payroll entry exists for ${monthPeriod}.`);
  }

  const payroll = payrollDoc.data() || {};
  const currency = text(payroll.currency) || "AED";
  const generatedAt = new Date().toISOString();
  const reportId = `PAY_${randomUUID()}`;

  const baseSalary = Number(payroll.baseSalary);
  const grossSalary = Number(payroll.grossSalary);
  const netSalary = Number(payroll.netSalary);
  const allowances = Number(payroll.allowances);
  const overtimePay = Number(payroll.overtimePay);

  const buffer = await buildPdfBuffer("Staff Payslip", [
    { label: "Employee", value: `${identity.displayName} (${identity.staffId})` },
    { label: "Pay period", value: monthPeriod },
    { label: "Payroll status", value: text(payroll.status) || "Not recorded" },
    { label: "Base salary", value: money(baseSalary, currency) },
    { label: "Allowances", value: money(allowances, currency) },
    { label: "Overtime pay", value: money(overtimePay, currency) },
    { label: "Gross salary", value: money(grossSalary, currency) },
    { label: "Net salary", value: money(netSalary, currency) },
    { label: "Payment reference", value: text(payroll.paymentReference) || "Not recorded" },
    { label: "Generated at", value: generatedAt },
    { label: "Report ID", value: reportId },
  ]);

  const hash = await persistPdfReport(db, {
    reportId,
    reportType: "STAFF_DIGITAL_PAYSLIP",
    staffUid: targetStaffUid,
    generatedBy: callerUid,
    generatedAt,
    monthPeriod,
    buffer,
  });

  return {
    success: true,
    reportId,
    reportType: "STAFF_DIGITAL_PAYSLIP",
    generatedAt,
    monthPeriod,
    sha256Hash: hash,
  };
});

/**
 * Public integrity verifier. It returns only non-sensitive issuance metadata.
 */
export const verifyReportPdfHash = onCall(PUBLIC_CALLABLE_OPTIONS, async (request) => {
  const db = ensureDb();
  const reportId = text(request.data?.reportId);
  const providedHash = text(request.data?.sha256Hash).toLowerCase();

  if (!/^[A-Za-z0-9_-]{8,160}$/.test(reportId) || !/^[a-f0-9]{64}$/.test(providedHash)) {
    throw new HttpsError("invalid-argument", "A valid report ID and SHA-256 digest are required.");
  }

  const reportSnap = await db.collection("pdf_reports").doc(reportId).get();
  if (!reportSnap.exists) {
    return { verified: false, reason: "Report not found." };
  }

  const report = reportSnap.data() || {};
  const storedHash = text(report.sha256Hash).toLowerCase();
  const verified = storedHash.length === 64 && storedHash === providedHash;

  return {
    verified,
    reportId,
    reportType: text(report.reportType) || "UNKNOWN",
    generatedAt: text(report.generatedAt) || null,
    version: Number(report.version) || 1,
    status: text(report.status) || "ISSUED",
    reason: verified ? "SHA-256 digest matches the issued report." : "SHA-256 digest mismatch.",
  };
});

import type * as FirebaseFirestore from "firebase-admin/firestore";

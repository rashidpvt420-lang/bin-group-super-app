import * as admin from "firebase-admin";
import { onDocumentWritten } from "firebase-functions/v2/firestore";
import { onSchedule } from "firebase-functions/v2/scheduler";

if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();
const PAGE_SIZE = 200;

function firstPositiveAmount(...values: unknown[]) {
  for (const value of values) {
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  return 0;
}

function canonicalPayrollEntry(id: string, data: FirebaseFirestore.DocumentData) {
  const technicianId = String(data.techId || data.technicianId || data.staffId || data.uid || "").trim();
  if (!technicianId) return null;
  // Net pay is the employee-facing amount. Fall back through the legacy aliases
  // accepted by payroll settlement and provisioning without turning valid records
  // into AED 0 simply because they predate the canonical `amount` field.
  const amount = firstPositiveAmount(
    data.netSalary,
    data.netPay,
    data.amount,
    data.grossSalary,
    data.baseSalary,
  );
  return {
    payrollId: String(data.payrollId || id),
    technicianId,
    techId: technicianId,
    technicianName: String(data.techName || data.technicianName || data.displayName || "Technician"),
    month: String(data.month || data.payPeriod || ""),
    amount,
    netSalary: firstPositiveAmount(data.netSalary, data.netPay, amount),
    grossSalary: firstPositiveAmount(data.grossSalary, data.amount, data.baseSalary, amount),
    baseSalary: firstPositiveAmount(data.baseSalary, data.amount, amount),
    currency: String(data.currency || "AED"),
    status: String(data.status || "pending"),
    paymentReference: data.paymentReference || null,
    paidAt: data.paidAt || null,
    payslipUrl: data.payslipUrl || null,
    sourceCollection: "payroll",
    sourceDocumentId: id,
    createdAt: data.createdAt || admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };
}

export const mirrorCanonicalPayrollEntry = onDocumentWritten(
  { document: "payroll/{payrollId}", region: "europe-west3" },
  async (event) => {
    const mirrorRef = db.collection("payroll_entries").doc(event.params.payrollId);
    if (!event.data?.after.exists) {
      await mirrorRef.delete().catch(() => undefined);
      return;
    }
    const entry = canonicalPayrollEntry(event.params.payrollId, event.data.after.data() || {});
    if (!entry) {
      console.error(`[payroll-compatibility] payroll/${event.params.payrollId} has no Technician UID; mirror removed`);
      await mirrorRef.delete().catch(() => undefined);
      return;
    }
    await mirrorRef.set(entry, { merge: true });
  },
);

export const backfillTechnicianPayrollEntries = onSchedule(
  {
    schedule: "every day 02:20",
    timeZone: "Asia/Dubai",
    region: "europe-west3",
    timeoutSeconds: 300,
    memory: "256MiB",
  },
  async () => {
    let cursor: FirebaseFirestore.QueryDocumentSnapshot | null = null;
    let scanned = 0;
    let mirrored = 0;
    let invalid = 0;

    do {
      let payrollQuery: FirebaseFirestore.Query = db.collection("payroll")
        .orderBy(admin.firestore.FieldPath.documentId())
        .limit(PAGE_SIZE);
      if (cursor) payrollQuery = payrollQuery.startAfter(cursor);
      const snapshot = await payrollQuery.get();
      if (snapshot.empty) break;

      const batch = db.batch();
      for (const payrollDoc of snapshot.docs) {
        scanned += 1;
        const entry = canonicalPayrollEntry(payrollDoc.id, payrollDoc.data());
        const mirrorRef = db.collection("payroll_entries").doc(payrollDoc.id);
        if (!entry) {
          invalid += 1;
          batch.delete(mirrorRef);
          continue;
        }
        mirrored += 1;
        batch.set(mirrorRef, entry, { merge: true });
      }
      await batch.commit();
      cursor = snapshot.docs[snapshot.docs.length - 1] || null;
      if (snapshot.size < PAGE_SIZE) break;
    } while (cursor);

    console.log(`[payroll-compatibility] scanned=${scanned} mirrored=${mirrored} invalid=${invalid}`);
  },
);

import type * as FirebaseFirestore from "firebase-admin/firestore";
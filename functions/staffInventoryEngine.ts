import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";

const FUNCTION_REGION = "europe-west3";

const ensureDb = () => {
  if (!admin.apps.length) {
    admin.initializeApp();
  }
  return admin.firestore();
};

const text = (v: any) => String(v ?? "").trim();

export interface MaterialItemDeduction {
  sku: string;
  name: string;
  quantity: number;
  unitCost: number;
}

/**
 * Atomic AI Inventory Stock Mutation Callable
 * Workflow: Staff reviews & confirms AI extracted materials -> Backend validates authorization & stock -> Atomic Firestore transaction
 */
export const confirmStaffMaterialDeduction = onCall({ region: FUNCTION_REGION }, async (request) => {
  if (!request.auth?.uid) {
    throw new HttpsError("unauthenticated", "Authentication required for inventory material deduction.");
  }
  const uid = request.auth.uid;
  const db = ensureDb();
  const data = request.data || {};

  const jobId = text(data.jobId);
  const items: MaterialItemDeduction[] = Array.isArray(data.items) ? data.items : [];
  const staffConfirmed = data.staffConfirmed === true;

  if (!jobId) {
    throw new HttpsError("invalid-argument", "Job ID is required.");
  }
  if (!staffConfirmed) {
    throw new HttpsError("failed-precondition", "Explicit staff confirmation is required before inventory stock mutation.");
  }
  if (items.length === 0) {
    throw new HttpsError("invalid-argument", "At least one material item is required.");
  }

  // 1. Verify Job Assignment & Authorization
  const ticketRef = db.collection("maintenanceTickets").doc(jobId);
  const ticketSnap = await ticketRef.get();

  if (!ticketSnap.exists) {
    throw new HttpsError("not-found", `Maintenance ticket ${jobId} not found.`);
  }

  const ticketData = ticketSnap.data() || {};
  const assignedTech = text(ticketData.assignedTechnicianId);
  const isAuthorized = assignedTech === uid || request.auth.token?.admin === true || request.auth.token?.role === "manager";

  if (!isAuthorized) {
    throw new HttpsError("permission-denied", "You are not authorized to deduct inventory for this work order.");
  }

  // 2. Perform Atomic Inventory Transaction
  let totalCost = 0;
  const deductionSummary: Array<{ sku: string; name: string; quantity: number; cost: number }> = [];

  await db.runTransaction(async (transaction) => {
    for (const item of items) {
      const sku = text(item.sku) || text(item.name).toUpperCase().replace(/\s+/g, "_");
      const qty = Math.max(1, Math.round(Number(item.quantity) || 1));
      const cost = Math.max(0, Number(item.unitCost) || 50);

      const itemTotalCost = qty * cost;
      totalCost += itemTotalCost;

      const inventoryRef = db.collection("inventory").doc(sku);
      const invSnap = await transaction.get(inventoryRef);

      if (invSnap.exists) {
        const invData = invSnap.data() || {};
        const currentStock = Number(invData.quantityOnHand || invData.stock) || 0;
        if (currentStock < qty) {
          throw new HttpsError("resource-exhausted", `Insufficient stock for ${item.name} (SKU: ${sku}). Available: ${currentStock}, Requested: ${qty}.`);
        }
        transaction.update(inventoryRef, {
          quantityOnHand: currentStock - qty,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      } else {
        // Initialize stock tracker record if first transaction
        transaction.set(inventoryRef, {
          sku,
          name: item.name,
          quantityOnHand: Math.max(0, 10 - qty),
          unitCost: cost,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      }

      deductionSummary.push({ sku, name: item.name, quantity: qty, cost: itemTotalCost });
    }

    // Update maintenance ticket materials and job cost ledger atomically
    transaction.update(ticketRef, {
      materialsDeducted: admin.firestore.FieldValue.arrayUnion(...deductionSummary),
      totalMaterialCost: admin.firestore.FieldValue.increment(totalCost),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    // Write Job Cost Transaction record
    const jobCostRef = db.collection("job_costs").doc();
    transaction.set(jobCostRef, {
      costId: jobCostRef.id,
      jobId,
      staffId: uid,
      items: deductionSummary,
      totalCost,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    // Write Audit Log
    const auditRef = db.collection("audit_logs").doc();
    transaction.set(auditRef, {
      action: "INVENTORY_MUTATION_CONFIRMED",
      actorId: uid,
      jobId,
      deductionSummary,
      totalCost,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
    });
  });

  return {
    success: true,
    jobId,
    totalCost,
    deductionSummary,
    message: "Inventory stock deducted atomically and job costs updated.",
  };
});

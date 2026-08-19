import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";

const FUNCTION_REGION = "europe-west3";
const CALLABLE_OPTIONS = {
  region: FUNCTION_REGION,
  cors: true,
  enforceAppCheck: true,
} as const;

const ensureDb = () => {
  if (!admin.apps.length) {
    admin.initializeApp();
  }
  return admin.firestore();
};

const text = (value: unknown) => String(value ?? "").trim();

function callerRole(token: Record<string, unknown>): string {
  return text(token.role || token.userRole || token.primaryRole).toLowerCase();
}

function isInventoryAuthority(token: Record<string, unknown>): boolean {
  const role = callerRole(token);
  return token.admin === true || token.super_admin === true ||
    ["admin", "super_admin", "ceo", "inventory_manager", "warehouse_manager", "operations_manager"].includes(role);
}

function assignedTechnicianUid(data: Record<string, unknown>): string {
  return text(
    data.assignedTechnicianId ||
    data.technicianId ||
    data.assignedTechId ||
    data.technicianUid ||
    data.techId,
  );
}

async function assertActiveAccount(uid: string, token: Record<string, unknown>) {
  const user = await admin.auth().getUser(uid);
  if (user.disabled || token.suspended === true || user.customClaims?.suspended === true) {
    throw new HttpsError("permission-denied", "This staff account is disabled or suspended.");
  }
}

interface MaterialRequestItem {
  sku: string;
  quantity: number;
}

interface DeductionSummaryItem {
  sku: string;
  name: string;
  quantity: number;
  unitCost: number;
  cost: number;
}

function normalizeItems(value: unknown): MaterialRequestItem[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new HttpsError("invalid-argument", "At least one inventory item is required.");
  }
  if (value.length > 50) {
    throw new HttpsError("invalid-argument", "A single confirmation cannot contain more than 50 inventory items.");
  }

  const normalized = value.map((raw) => {
    const item = (raw || {}) as Record<string, unknown>;
    const sku = text(item.sku);
    const quantity = Number(item.quantity);

    if (!sku || sku.length > 120) {
      throw new HttpsError("invalid-argument", "Every material item requires a valid SKU.");
    }
    if (!Number.isInteger(quantity) || quantity <= 0 || quantity > 1000) {
      throw new HttpsError("invalid-argument", `Quantity for SKU ${sku} must be a positive integer.`);
    }

    return { sku, quantity };
  });

  const seen = new Set<string>();
  for (const item of normalized) {
    if (seen.has(item.sku)) {
      throw new HttpsError("invalid-argument", `Duplicate SKU ${item.sku} in one confirmation request.`);
    }
    seen.add(item.sku);
  }

  return normalized;
}

/**
 * Staff-confirmed inventory mutation.
 * AI/client input proposes SKU + quantity only. Stock and unit cost are authoritative server data.
 * A required confirmationId makes retries idempotent.
 */
export const confirmStaffMaterialDeduction = onCall(CALLABLE_OPTIONS, async (request) => {
  if (!request.auth?.uid) {
    throw new HttpsError("unauthenticated", "Authentication required for inventory material deduction.");
  }

  const uid = request.auth.uid;
  const token = request.auth.token || {};
  const db = ensureDb();
  const data = request.data || {};
  const jobId = text(data.jobId);
  const confirmationId = text(data.confirmationId);
  const staffConfirmed = data.staffConfirmed === true;
  const items = normalizeItems(data.items);

  await assertActiveAccount(uid, token);

  if (!jobId) {
    throw new HttpsError("invalid-argument", "Job ID is required.");
  }
  if (!/^[A-Za-z0-9_-]{8,128}$/.test(confirmationId)) {
    throw new HttpsError("invalid-argument", "A stable confirmationId (8-128 safe characters) is required for idempotency.");
  }
  if (!staffConfirmed) {
    throw new HttpsError("failed-precondition", "Explicit staff confirmation is required before inventory mutation.");
  }

  const ticketRef = db.collection("maintenanceTickets").doc(jobId);
  const confirmationRef = db.collection("staff_inventory_confirmations").doc(confirmationId);
  const jobCostRef = db.collection("job_costs").doc(`INV_${confirmationId}`);
  const auditRef = db.collection("audit_logs").doc(`INV_${confirmationId}`);

  let totalCost = 0;
  let deductionSummary: DeductionSummaryItem[] = [];
  let replayed = false;

  await db.runTransaction(async (transaction) => {
    const existingConfirmation = await transaction.get(confirmationRef);
    if (existingConfirmation.exists) {
      const existing = existingConfirmation.data() || {};
      if (existing.staffId !== uid || existing.jobId !== jobId) {
        throw new HttpsError("permission-denied", "confirmationId is already bound to a different staff/job context.");
      }

      replayed = true;
      totalCost = Number(existing.totalCost) || 0;
      deductionSummary = Array.isArray(existing.items) ? existing.items as DeductionSummaryItem[] : [];
      return;
    }

    const ticketSnap = await transaction.get(ticketRef);
    if (!ticketSnap.exists) {
      throw new HttpsError("not-found", `Maintenance ticket ${jobId} not found.`);
    }

    const ticketData = ticketSnap.data() || {};
    const assignedTech = assignedTechnicianUid(ticketData);
    const authorized = assignedTech === uid || isInventoryAuthority(token);
    if (!authorized) {
      throw new HttpsError("permission-denied", "Caller is not authorized to consume inventory for this work order.");
    }

    const ticketStatus = text(ticketData.status).toUpperCase();
    if (!["IN_PROGRESS", "ARRIVED", "COMPLETED"].includes(ticketStatus)) {
      throw new HttpsError("failed-precondition", `Inventory cannot be consumed for a work order in status ${ticketStatus || "UNKNOWN"}.`);
    }

    const inventoryReads: Array<{
      ref: FirebaseFirestore.DocumentReference;
      sku: string;
      quantity: number;
      data: FirebaseFirestore.DocumentData;
    }> = [];

    for (const item of items) {
      const inventoryRef = db.collection("inventory").doc(item.sku);
      const inventorySnap = await transaction.get(inventoryRef);

      if (!inventorySnap.exists) {
        throw new HttpsError("not-found", `Inventory SKU ${item.sku} does not exist. Stock records may not be invented during consumption.`);
      }

      inventoryReads.push({
        ref: inventoryRef,
        sku: item.sku,
        quantity: item.quantity,
        data: inventorySnap.data() || {},
      });
    }

    const nextSummary: DeductionSummaryItem[] = [];
    let nextTotalCost = 0;

    for (const inventoryItem of inventoryReads) {
      const currentStock = Number(
        inventoryItem.data.quantityOnHand ??
        inventoryItem.data.stock ??
        inventoryItem.data.availableQuantity,
      );
      if (!Number.isFinite(currentStock) || currentStock < 0) {
        throw new HttpsError("failed-precondition", `Inventory SKU ${inventoryItem.sku} has an invalid authoritative stock balance.`);
      }
      if (currentStock < inventoryItem.quantity) {
        throw new HttpsError(
          "resource-exhausted",
          `Insufficient stock for SKU ${inventoryItem.sku}. Available: ${currentStock}, requested: ${inventoryItem.quantity}.`,
        );
      }

      const unitCost = Number(
        inventoryItem.data.unitCost ??
        inventoryItem.data.averageCost ??
        inventoryItem.data.currentUnitCost,
      );
      if (!Number.isFinite(unitCost) || unitCost < 0) {
        throw new HttpsError("failed-precondition", `Inventory SKU ${inventoryItem.sku} has no valid server-side unit cost.`);
      }

      const itemCost = unitCost * inventoryItem.quantity;
      nextTotalCost += itemCost;
      nextSummary.push({
        sku: inventoryItem.sku,
        name: text(inventoryItem.data.name) || inventoryItem.sku,
        quantity: inventoryItem.quantity,
        unitCost,
        cost: itemCost,
      });

      transaction.update(inventoryItem.ref, {
        quantityOnHand: currentStock - inventoryItem.quantity,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }

    const timestamp = admin.firestore.FieldValue.serverTimestamp();

    transaction.set(ticketRef, {
      materialsDeducted: admin.firestore.FieldValue.arrayUnion(...nextSummary),
      totalMaterialCost: admin.firestore.FieldValue.increment(nextTotalCost),
      updatedAt: timestamp,
    }, { merge: true });

    transaction.set(jobCostRef, {
      costId: jobCostRef.id,
      source: "INVENTORY_CONFIRMATION",
      confirmationId,
      jobId,
      staffId: uid,
      items: nextSummary,
      totalCost: nextTotalCost,
      createdAt: timestamp,
    });

    transaction.set(auditRef, {
      action: "INVENTORY_MUTATION_CONFIRMED",
      actorUid: uid,
      actorRole: callerRole(token),
      confirmationId,
      jobId,
      items: nextSummary,
      totalCost: nextTotalCost,
      timestamp,
    });

    transaction.set(confirmationRef, {
      confirmationId,
      staffId: uid,
      jobId,
      items: nextSummary,
      totalCost: nextTotalCost,
      status: "COMMITTED",
      createdAt: timestamp,
    });

    totalCost = nextTotalCost;
    deductionSummary = nextSummary;
  });

  return {
    success: true,
    jobId,
    confirmationId,
    replayed,
    totalCost,
    deductionSummary,
    message: replayed
      ? "Inventory confirmation already committed; no stock was deducted twice."
      : "Inventory stock deducted once using authoritative balances and costs.",
  };
});

import type * as FirebaseFirestore from "firebase-admin/firestore";

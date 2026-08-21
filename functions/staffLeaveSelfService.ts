import { HttpsError, onCall } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";

if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();

const STAFF_ROLES = new Set([
  "technician", "manager", "operations_admin", "hr_admin", "support_admin", "hr_staff", "hr_manager",
  "finance_staff", "dispatcher", "admin_assistant", "account_manager", "operations_manager", "finance_admin",
]);

const clean = (value: unknown) => String(value ?? "").trim();
const roleFromToken = (token: Record<string, any>) => clean(token.role || token.userRole || token.primaryRole).toLowerCase();

function serialize(value: any) {
  if (!value) return null;
  if (typeof value.toDate === "function") return value.toDate().toISOString();
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null;
}

export const getMyStaffLeaveRequests = onCall({ region: "europe-west3", cors: true, enforceAppCheck: true }, async (request) => {
  if (!request.auth?.uid) throw new HttpsError("unauthenticated", "Staff authentication required.");
  if (request.auth.token?.suspended === true) throw new HttpsError("permission-denied", "Suspended accounts cannot access leave self-service.");
  const role = roleFromToken(request.auth.token || {});
  if (!STAFF_ROLES.has(role)) throw new HttpsError("permission-denied", "Staff identity required.");
  const authUser = await admin.auth().getUser(request.auth.uid);
  if (authUser.disabled) throw new HttpsError("permission-denied", "Disabled accounts cannot access leave self-service.");

  const snap = await db.collection("staff_leave_requests")
    .where("staffId", "==", request.auth.uid)
    .orderBy("createdAt", "desc")
    .limit(100)
    .get();

  return {
    success: true,
    requests: snap.docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        leaveType: data.leaveType || "OTHER",
        startDate: data.startDate || null,
        endDate: data.endDate || null,
        totalDays: data.totalDays || 0,
        reason: data.reason || "",
        evidencePath: data.evidencePath || null,
        status: data.status || "PENDING",
        decisionNote: data.decisionNote || null,
        createdAt: serialize(data.createdAt),
        decidedAt: serialize(data.decidedAt),
      };
    }),
  };
});

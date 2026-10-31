// Production Control Center aggregate. A scheduled job (and an MFA-gated Admin refresh callable) computes
// counts with Firestore count() aggregates, money with the reviewed Admin ledger maths, and real health
// probes, then writes one server-only document: system_health/control_center_summary. The Admin page reads
// that single document instead of scanning whole collections in the browser.
import * as admin from "firebase-admin";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import { requirePrivilegedMfaSession } from "./adminMfaSession";
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { summarizeControlCentreMoney } = require("./shared/controlCentreMoney.js");

if (!admin.apps.length) admin.initializeApp();

const smtpUser = defineSecret("SMTP_USER");
const smtpPass = defineSecret("SMTP_PASS");

export const CONTROL_CENTER_SUMMARY_PATH = "system_health/control_center_summary";
export const CONTROL_CENTER_PAGE_SIZE = 500;
export const CONTROL_CENTER_MAX_ROWS = 20000;
const OPEN_TICKET_EXCLUDED = ["COMPLETED", "RESOLVED", "CLOSED"];

type HealthStatus = "operational" | "degraded" | "down" | "not_configured";
type HealthCheck = { status: HealthStatus; latencyMs: number | null; detail: string; checkedAt: string };

const db = () => admin.firestore();
const now = () => new Date().toISOString();

async function streamRows(collection: string, maxRows = CONTROL_CENTER_MAX_ROWS) {
  const rows: admin.firestore.DocumentData[] = [];
  let cursor: admin.firestore.QueryDocumentSnapshot | null = null;
  for (;;) {
    let q = db().collection(collection).orderBy(admin.firestore.FieldPath.documentId()).limit(CONTROL_CENTER_PAGE_SIZE);
    if (cursor) q = q.startAfter(cursor);
    const snap = await q.get();
    snap.docs.forEach((doc) => rows.push(doc.data()));
    if (snap.size < CONTROL_CENTER_PAGE_SIZE) return { rows, truncated: false };
    if (rows.length >= maxRows) return { rows: rows.slice(0, maxRows), truncated: true };
    cursor = snap.docs[snap.docs.length - 1];
  }
}

const count = async (q: admin.firestore.Query) => (await q.count().get()).data().count;

export async function checkFirestoreHealth(): Promise<HealthCheck> {
  const started = Date.now();
  try {
    const ref = db().doc("system_health/control_center_probe");
    const token = `${started}-${Math.random().toString(36).slice(2)}`;
    await ref.set({ token, at: admin.firestore.FieldValue.serverTimestamp() });
    const read = await ref.get();
    const latencyMs = Date.now() - started;
    if (read.get("token") !== token) return { status: "degraded", latencyMs, detail: "Probe read-back mismatch", checkedAt: now() };
    return { status: latencyMs > 3000 ? "degraded" : "operational", latencyMs, detail: "Write/read probe succeeded", checkedAt: now() };
  } catch (error: any) {
    return { status: "down", latencyMs: Date.now() - started, detail: `Probe failed: ${String(error?.code || error?.message || error).slice(0, 120)}`, checkedAt: now() };
  }
}

export async function checkSmtpHealth(): Promise<HealthCheck> {
  const started = Date.now();
  let user = "";
  let pass = "";
  try { user = smtpUser.value() || process.env.SMTP_USER || ""; pass = smtpPass.value() || process.env.SMTP_PASS || ""; } catch { /* secret unavailable */ }
  if (!user || !pass) return { status: "not_configured", latencyMs: null, detail: "SMTP_USER/SMTP_PASS not available to the job", checkedAt: now() };
  try {
    const nodemailer = await import("nodemailer");
    const port = Number(process.env.SMTP_PORT || 465);
    const transport = nodemailer.createTransport({ host: process.env.SMTP_HOST || "smtp.sendgrid.net", port, secure: port === 465, auth: { user, pass }, connectionTimeout: 8000 });
    await transport.verify();
    transport.close();
    return { status: "operational", latencyMs: Date.now() - started, detail: "SMTP login verified (no mail sent)", checkedAt: now() };
  } catch (error: any) {
    return { status: "down", latencyMs: Date.now() - started, detail: `SMTP verify failed: ${String(error?.code || error?.message || error).slice(0, 120)}`, checkedAt: now() };
  }
}

export async function checkMailQueueHealth(): Promise<HealthCheck> {
  const started = Date.now();
  try {
    const since = admin.firestore.Timestamp.fromMillis(Date.now() - 24 * 60 * 60 * 1000);
    const failed = await count(db().collection("mail").where("delivery.state", "==", "ERROR").where("delivery.attemptedAt", ">=", since));
    return { status: failed > 0 ? "degraded" : "operational", latencyMs: Date.now() - started, detail: `${failed} failed mail deliveries in the last 24h`, checkedAt: now() };
  } catch (error: any) {
    return { status: "degraded", latencyMs: Date.now() - started, detail: `Mail queue check unavailable: ${String(error?.code || error?.message || error).slice(0, 120)}`, checkedAt: now() };
  }
}

export async function buildControlCenterSummary() {
  const startedAt = Date.now();
  const [firestore, smtp, mailQueue] = await Promise.all([checkFirestoreHealth(), checkSmtpHealth(), checkMailQueueHealth()]);

  const [totalProperties, totalTenants, failedInvites, openTickets] = await Promise.all([
    count(db().collection("propertyPassports")),
    count(db().collection("users").where("role", "==", "tenant")),
    count(db().collection("tenant_invitations").where("status", "==", "failed")),
    count(db().collection("maintenanceTickets").where("status", "not-in", OPEN_TICKET_EXCLUDED)),
  ]);
  const unitsAgg = await db().collection("propertyPassports").aggregate({ units: admin.firestore.AggregateField.sum("totalUnits") }).get();
  const totalUnits = Number(unitsAgg.data().units || 0);

  const payments = await streamRows("payment_transactions");
  const contracts = await streamRows("contracts");
  const money = summarizeControlCentreMoney(payments.rows, contracts.rows, { paymentsTruncated: payments.truncated });
  const projectedAnnualRent = contracts.truncated ? null : money.projectedAnnualRent;

  return {
    schemaVersion: 1,
    generatedAt: admin.firestore.FieldValue.serverTimestamp(),
    generatedAtIso: now(),
    durationMs: Date.now() - startedAt,
    metrics: {
      totalProperties, totalUnits, totalTenants, failedInvites, openTickets,
      totalAnnualRent: projectedAnnualRent,
      totalCollected: money.collected,
      totalOutstanding: money.outstanding,
      paymentsScanned: payments.rows.length,
      contractsScanned: contracts.rows.length,
      paymentsTruncated: payments.truncated,
      contractsTruncated: contracts.truncated,
    },
    health: {
      firestore,
      smtp,
      mailQueue,
      functions: { status: "operational", latencyMs: null, detail: "Summary job completed", checkedAt: now() } as HealthCheck,
    },
  };
}

export async function writeControlCenterSummary() {
  const summary = await buildControlCenterSummary();
  await db().doc(CONTROL_CENTER_SUMMARY_PATH).set(summary);
  return summary;
}

export const scheduledControlCenterSummary = onSchedule(
  { schedule: "every 15 minutes", timeZone: "Asia/Dubai", secrets: [smtpUser, smtpPass], timeoutSeconds: 300, memory: "512MiB" },
  async () => { await writeControlCenterSummary(); },
);

export const adminRefreshControlCenterSummary = onCall(
  { cors: true, region: "europe-west3", enforceAppCheck: true, secrets: [smtpUser, smtpPass], timeoutSeconds: 300, memory: "512MiB" },
  async (request) => {
    const token = request.auth?.token as Record<string, any> | undefined;
    if (!request.auth || !token) throw new HttpsError("unauthenticated", "Sign in required.");
    const isAdmin = token.admin === true || token.super_admin === true || token.ceo === true || token.role === "admin" || token.role === "super_admin";
    if (!isAdmin) throw new HttpsError("permission-denied", "Admin access required.");
    await requirePrivilegedMfaSession(request.auth);
    const ref = db().doc(CONTROL_CENTER_SUMMARY_PATH);
    const existing = await ref.get();
    const lastIso = existing.get("generatedAtIso");
    if (lastIso && Date.now() - Date.parse(lastIso) < 60_000) {
      throw new HttpsError("resource-exhausted", "Summary was refreshed less than a minute ago.");
    }
    const summary = await writeControlCenterSummary();
    return { ok: true, generatedAtIso: summary.generatedAtIso };
  },
);

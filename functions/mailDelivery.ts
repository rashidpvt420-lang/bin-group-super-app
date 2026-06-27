import { FieldValue } from "firebase-admin/firestore";
import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { onCall, HttpsError } from "firebase-functions/v2/https";
const defineSecret = (name: string) => ({ value: () => process.env[name] || "" });
import * as admin from "firebase-admin";
import * as nodemailer from "nodemailer";

if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();

const smtpUser = defineSecret("SMTP_USER");
const smtpPass = defineSecret("SMTP_PASS");

const ADMIN_ROLES = new Set(["admin", "super_admin", "ceo", "manager", "operations_admin", "finance_admin"]);

function asText(value: unknown, fallback = "") {
  const out = String(value ?? "").trim();
  return out || fallback;
}

function asList(value: unknown): string[] | undefined {
  if (!value) return undefined;
  if (Array.isArray(value)) return value.map((entry) => asText(entry)).filter(Boolean);
  const text = asText(value);
  return text ? text.split(",").map((entry) => entry.trim()).filter(Boolean) : undefined;
}

function stripHtml(html: string) {
  return html.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function assertAdmin(auth: any) {
  if (!auth) throw new HttpsError("unauthenticated", "Admin authentication required.");
  const token = auth.token || {};
  const tokenRole = asText(token.role || token.userRole || token.primaryRole).toLowerCase();
  if (token.admin === true || token.isAdmin === true || token.superAdmin === true || token.super_admin === true || ADMIN_ROLES.has(tokenRole)) return;
  const userSnap = await db.collection("users").doc(auth.uid).get();
  const user = userSnap.data() || {};
  const userRole = asText(user.role || user.userRole || user.primaryRole).toLowerCase();
  if (user.admin === true || user.isAdmin === true || user.superAdmin === true || user.super_admin === true || ADMIN_ROLES.has(userRole)) return;
  throw new HttpsError("permission-denied", "Admin access required.");
}

function createTransporter() {
  const user = smtpUser.value() || process.env.SMTP_USER || "";
  const pass = smtpPass.value() || process.env.SMTP_PASS || "";
  if (!user || !pass) throw new Error("SMTP_USER/SMTP_PASS secrets are not configured.");
  const port = Number(process.env.SMTP_PORT || 465);
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST || "smtp.sendgrid.net",
    port,
    secure: port === 465,
    auth: { user, pass },
  });
}

async function deliverMail(mailId: string, data: any) {
  const ref = db.collection("mail").doc(mailId);
  const message = data?.message || {};
  const to = asList(data?.to);
  const cc = asList(data?.cc);
  const bcc = asList(data?.bcc);
  const subject = asText(message.subject || data?.subject, "BIN GROUP notification");
  const html = asText(message.html || data?.html || message.text || data?.text);
  const text = asText(message.text || data?.text || stripHtml(html));
  const from = asText(message.from || data?.from || process.env.MAIL_FROM || process.env.SMTP_FROM, "BIN GROUP <ceo@bin-groups.com>");
  const replyTo = asText(message.replyTo || message.reply_to || data?.replyTo || data?.reply_to || process.env.MAIL_REPLY_TO || process.env.SMTP_REPLY_TO, "BIN GROUP Admin <ceo@bin-groups.com>");

  if (!to?.length) {
    await ref.set({ delivery: { state: "ERROR", error: "Missing recipient email", attemptedAt: FieldValue.serverTimestamp(), provider: "cloud_function_smtp" } }, { merge: true });
    return { skipped: true, reason: "missing_recipient" };
  }

  const currentState = asText(data?.delivery?.state).toUpperCase();
  if (currentState === "SUCCESS") return { skipped: true, reason: "already_delivered" };

  await ref.set({ delivery: { state: "PROCESSING", provider: "cloud_function_smtp", attemptedAt: FieldValue.serverTimestamp() } }, { merge: true });

  try {
    const info = await createTransporter().sendMail({ from, replyTo, to, cc, bcc, subject, html: html || undefined, text: text || undefined });
    await ref.set({
      delivery: {
        state: "SUCCESS",
        provider: "cloud_function_smtp",
        messageId: info.messageId || "",
        accepted: info.accepted || [],
        rejected: info.rejected || [],
        from,
        replyTo,
        deliveredAt: FieldValue.serverTimestamp(),
      },
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    return { delivered: true, messageId: info.messageId || "" };
  } catch (error: any) {
    await ref.set({
      delivery: {
        state: "ERROR",
        provider: "cloud_function_smtp",
        error: error?.message || "SMTP delivery failed",
        failedAt: FieldValue.serverTimestamp(),
      },
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    throw error;
  }
}

export const sendQueuedMailOnCreate = onDocumentCreated({ document: "mail/{mailId}" }, async (event) => {
  const snap = event.data;
  if (!snap) return;
  await deliverMail(event.params.mailId, snap.data() || {});
});

export const adminRetryMailDelivery = onCall({ cors: true }, async (request) => {
  await assertAdmin(request.auth);
  const user = smtpUser.value() || process.env.SMTP_USER || "";
  const pass = smtpPass.value() || process.env.SMTP_PASS || "";
  if (!user || !pass) {
    throw new HttpsError("failed-precondition", "SMTP email service is not configured. Configure SMTP_USER and SMTP_PASS.");
  }
  const mailId = asText(request.data?.mailId);
  const limit = Math.min(Number(request.data?.limit || 10), 50);
  const results: any[] = [];

  if (mailId) {
    const snap = await db.collection("mail").doc(mailId).get();
    if (!snap.exists) throw new HttpsError("not-found", "Mail document not found.");
    const result = await deliverMail(mailId, snap.data() || {});
    return { status: "DONE", results: [{ mailId, ...result }] };
  }

  const query = await db.collection("mail").orderBy("createdAt", "desc").limit(limit).get();
  for (const doc of query.docs) {
    const state = asText(doc.data()?.delivery?.state).toUpperCase();
    if (state === "SUCCESS") continue;
    try {
      const result = await deliverMail(doc.id, doc.data());
      results.push({ mailId: doc.id, ...result });
    } catch (error: any) {
      results.push({ mailId: doc.id, delivered: false, error: error?.message || "SMTP delivery failed" });
    }
  }

  return { status: "DONE", results };
});

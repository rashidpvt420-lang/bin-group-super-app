import * as crypto from "crypto";
import { defineSecret } from "firebase-functions/params";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import { requirePrivilegedMfaSession } from "./adminMfaSession";
import {
  PaintingRuleError, assertPaintingTransition, buildPaintingQuote, normaliseCostSheet,
  normaliseMeasurements, normalisePermits, normaliseScope, DEFAULT_MIN_GROSS_MARGIN_PCT,
} from "./projects/paintingProject";

const db = () => admin.firestore();
const asHttps = (e: unknown) => (e instanceof PaintingRuleError ? new HttpsError("failed-precondition", e.message) : e);
const isAdmin = (auth: any) => auth?.token?.admin === true || auth?.token?.role === "admin";

/** Owner requests a one-time painting project for a property they own. */
export const ownerRequestPaintingProject = onCall(
  { cors: true, region: "europe-west3", enforceAppCheck: true },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError("unauthenticated", "Sign in required.");
    try {
      const scope = normaliseScope(request.data?.scope);
      const propertyId = String(request.data?.propertyId ?? "").slice(0, 240);
      if (!propertyId) throw new HttpsError("invalid-argument", "propertyId is required.");
      const prop = await db().collection("properties").doc(propertyId).get();
      if (!prop.exists || prop.get("ownerId") !== uid) throw new HttpsError("permission-denied", "Not your property.");
      const measurements = request.data?.measurements ? normaliseMeasurements(request.data.measurements) : null;
      const ref = db().collection("painting_projects").doc();
      await ref.set({
        ownerId: uid, propertyId, scope, billing: "ONE_TIME", status: "REQUESTED",
        ownerMeasurements: measurements, createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      return { projectId: ref.id, status: "REQUESTED" };
    } catch (e) { throw asHttps(e); }
  },
);

/** Admin issues (or re-issues as a variation) a quote; minimum gross margin enforced here. */
export const adminIssuePaintingQuote = onCall(
  { cors: true, region: "europe-west3", enforceAppCheck: true },
  async (request) => {
    if (!isAdmin(request.auth)) throw new HttpsError("permission-denied", "Admin only.");
    await requirePrivilegedMfaSession(request.auth);
    const projectId = String(request.data?.projectId ?? "").slice(0, 240);
    if (!projectId) throw new HttpsError("invalid-argument", "projectId is required.");
    try {
      const ref = db().collection("painting_projects").doc(projectId);
      const cfg = await db().collection("platform_config").doc("painting").get();
      const minMarginPct = Number(cfg.get("minGrossMarginPct") ?? DEFAULT_MIN_GROSS_MARGIN_PCT);
      return await db().runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        if (!snap.exists) throw new HttpsError("not-found", "Project not found.");
        const from = snap.get("status");
        const scope = normaliseScope(snap.get("scope"));
        const survey = normaliseMeasurements(request.data?.surveyMeasurements);
        const permits = normalisePermits(request.data?.permits, scope);
        const costSheet = normaliseCostSheet(request.data?.costSheet);
        const quote = buildPaintingQuote({ costSheet, priceAed: request.data?.priceAed, minMarginPct, permits });
        const version = Number(snap.get("quoteVersion") ?? 0) + 1;
        const actor = { kind: "ADMIN" as const, uid: request.auth!.uid };
        if (from === "REQUESTED") assertPaintingTransition("REQUESTED", "SURVEYED", actor);
        else assertPaintingTransition(from, "QUOTED", actor);
        tx.set(ref.collection("quotes").doc(`v${version}`), {
          version, costSheet, survey, permits, ...quote, isVariation: version > 1,
          issuedBy: actor.uid, issuedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        tx.update(ref, {
          status: "QUOTED", quoteVersion: version, approvedQuoteVersion: null,
          survey, permits, updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        tx.set(db().collection("audit_logs").doc(), {
          action: "PAINTING_QUOTE_ISSUED", projectId, version, priceAed: quote.priceAed,
          grossMarginPct: quote.grossMarginPct, actorUid: actor.uid, at: admin.firestore.FieldValue.serverTimestamp(),
        });
        return { projectId, quoteVersion: version, ...quote };
      });
    } catch (e) { throw asHttps(e); }
  },
);

// ---------------------------------------------------------------------------
// Owner OTP approval, work order, photos, warranty. Every write below runs in a
// Cloud Function; firestore.rules deny all browser writes to painting_projects
// and system_secrets/painting_approval_otps (scripts/harden-painting-projects-rules.mjs).
// ---------------------------------------------------------------------------

const paintingSmtpUser = defineSecret("SMTP_USER");
const paintingSmtpPass = defineSecret("SMTP_PASS");
const paintingOtpPepper = defineSecret("OWNER_CONTRACT_OTP_PEPPER");

export const PAINTING_OTP_ALGORITHM = "HMAC_SHA256_PAINTING_APPROVAL_V1";
const PAINTING_OTP_TTL_MINUTES = 10;
const PAINTING_OTP_MAX_ATTEMPTS = 5;
const PAINTING_OTP_MAX_REQUESTS_PER_HOUR = 5;
const PAINTING_BRANDED_FROM = "BIN GROUP <ceo@bin-groups.com>";
const PAINTING_PHOTO_KINDS = ["BEFORE", "AFTER"] as const;
const MAX_PHOTOS_PER_KIND = 40;

const paintingOtps = () => db().collection("system_secrets").doc("painting_approval_otps").collection("otps");
const ts = () => admin.firestore.FieldValue.serverTimestamp();
const idArg = (v: unknown, field: string) => {
  const s = String(v ?? "").trim();
  if (!s || s.length > 240 || s.includes("/")) throw new HttpsError("invalid-argument", `${field} is required.`);
  return s;
};

function paintingPepper() {
  let secret = "";
  try { secret = paintingOtpPepper.value(); } catch { secret = ""; }
  secret = secret || process.env.OWNER_CONTRACT_OTP_PEPPER || "";
  if (secret.length < 32) throw new HttpsError("failed-precondition", "Painting approval OTP is not securely configured.");
  return secret;
}

export function paintingOtpDigest(a: { otpId: string; uid: string; projectId: string; quoteVersion: number; otp: string; salt: string; pepper: string }) {
  const payload = [PAINTING_OTP_ALGORITHM, a.otpId, a.uid, a.projectId, String(a.quoteVersion), a.otp, a.salt].join("\n");
  return crypto.createHmac("sha256", a.pepper).update(payload).digest("hex");
}

function hexEqual(expected: string, submitted: string) {
  if (!/^[a-f0-9]{64}$/i.test(expected) || !/^[a-f0-9]{64}$/i.test(submitted)) return false;
  return crypto.timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(submitted, "hex"));
}

async function sendPaintingOtpEmail(to: string, otp: string, projectId: string, quoteVersion: number, priceAed: number) {
  const user = (() => { try { return paintingSmtpUser.value(); } catch { return ""; } })() || process.env.SMTP_USER || "";
  const pass = (() => { try { return paintingSmtpPass.value(); } catch { return ""; } })() || process.env.SMTP_PASS || "";
  if (!user || !pass) throw new HttpsError("failed-precondition", "Email service is not configured. The approval code cannot be delivered.");
  const nodemailer = await import("nodemailer");
  const port = Number(process.env.SMTP_PORT || 465);
  const transport = nodemailer.createTransport({ host: process.env.SMTP_HOST || "smtp.sendgrid.net", port, secure: port === 465, auth: { user, pass } });
  const text = `BIN GROUP painting quote approval code: ${otp}. Quote v${quoteVersion}, AED ${priceAed}. Expires in ${PAINTING_OTP_TTL_MINUTES} minutes. Reference: ${projectId}. Do not share this code.\n` +
    `رمز الموافقة على عرض الدهان: ${otp}. ينتهي خلال ${PAINTING_OTP_TTL_MINUTES} دقائق. لا تشارك هذا الرمز.`;
  await transport.sendMail({ from: PAINTING_BRANDED_FROM, replyTo: PAINTING_BRANDED_FROM, to, subject: "BIN GROUP painting quote approval code", text });
}

async function loadOwnedProject(uid: string, projectId: string) {
  const snap = await db().collection("painting_projects").doc(projectId).get();
  if (!snap.exists || snap.get("ownerId") !== uid) throw new HttpsError("permission-denied", "Not your project.");
  return snap;
}

/** Owner asks for an OTP bound to the current quote version. */
export const ownerRequestPaintingApprovalOtp = onCall(
  { cors: true, region: "europe-west3", enforceAppCheck: true, secrets: [paintingSmtpUser, paintingSmtpPass, paintingOtpPepper] },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError("unauthenticated", "Sign in required.");
    const email = String(request.auth?.token?.email ?? "").toLowerCase();
    if (!email || request.auth?.token?.email_verified !== true) throw new HttpsError("failed-precondition", "A verified email is required.");
    const projectId = idArg(request.data?.projectId, "projectId");
    const pepper = paintingPepper();
    const snap = await loadOwnedProject(uid, projectId);
    if (snap.get("status") !== "QUOTED") throw new HttpsError("failed-precondition", "There is no quote awaiting approval.");
    const quoteVersion = Number(snap.get("quoteVersion") ?? 0);
    if (!Number.isInteger(quoteVersion) || quoteVersion < 1) throw new HttpsError("failed-precondition", "No quote issued.");
    const quote = await snap.ref.collection("quotes").doc(`v${quoteVersion}`).get();
    if (!quote.exists) throw new HttpsError("failed-precondition", "Quote not found.");
    const hourAgo = admin.firestore.Timestamp.fromMillis(Date.now() - 3600_000);
    const recent = await paintingOtps().where("uid", "==", uid).where("requestedAt", ">=", hourAgo).count().get();
    if (recent.data().count >= PAINTING_OTP_MAX_REQUESTS_PER_HOUR) throw new HttpsError("resource-exhausted", "Too many codes requested. Try again later.");
    const otp = String(crypto.randomInt(100000, 1000000));
    const salt = crypto.randomBytes(16).toString("hex");
    const ref = paintingOtps().doc();
    await ref.set({
      uid, projectId, quoteVersion, salt, algorithm: PAINTING_OTP_ALGORITHM,
      digest: paintingOtpDigest({ otpId: ref.id, uid, projectId, quoteVersion, otp, salt, pepper }),
      attempts: 0, status: "PENDING", requestedAt: admin.firestore.Timestamp.now(),
      expiresAt: admin.firestore.Timestamp.fromMillis(Date.now() + PAINTING_OTP_TTL_MINUTES * 60_000),
    });
    try {
      await sendPaintingOtpEmail(email, otp, projectId, quoteVersion, Number(quote.get("priceAed")));
    } catch (e) {
      await ref.update({ status: "DELIVERY_FAILED" });
      throw e instanceof HttpsError ? e : new HttpsError("unavailable", "The approval code could not be emailed.");
    }
    return { otpId: ref.id, quoteVersion, expiresInMinutes: PAINTING_OTP_TTL_MINUTES };
  },
);

/** Owner approves the exact quote version with the emailed OTP. */
export const ownerApprovePaintingQuote = onCall(
  { cors: true, region: "europe-west3", enforceAppCheck: true, secrets: [paintingOtpPepper] },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError("unauthenticated", "Sign in required.");
    const projectId = idArg(request.data?.projectId, "projectId");
    const otpId = idArg(request.data?.otpId, "otpId");
    const quoteVersion = Number(request.data?.quoteVersion);
    const code = String(request.data?.otp ?? "").trim();
    if (!/^\d{6}$/.test(code)) throw new HttpsError("invalid-argument", "Enter the 6-digit code.");
    const pepper = paintingPepper();
    const pRef = db().collection("painting_projects").doc(projectId);
    const oRef = paintingOtps().doc(otpId);
    const outcome = await db().runTransaction(async (tx) => {
      const [p, o] = await Promise.all([tx.get(pRef), tx.get(oRef)]);
      if (!p.exists || p.get("ownerId") !== uid) throw new HttpsError("permission-denied", "Not your project.");
      if (!o.exists || o.get("uid") !== uid || o.get("projectId") !== projectId) throw new HttpsError("permission-denied", "Invalid approval code.");
      if (o.get("status") !== "PENDING") throw new HttpsError("failed-precondition", "This code is no longer valid. Request a new one.");
      if (o.get("expiresAt")?.toMillis?.() < Date.now()) { tx.update(oRef, { status: "EXPIRED" }); return { error: "deadline-exceeded" as const }; }
      const attempts = Number(o.get("attempts") ?? 0);
      if (attempts >= PAINTING_OTP_MAX_ATTEMPTS) { tx.update(oRef, { status: "LOCKED" }); return { error: "resource-exhausted" as const }; }
      const boundVersion = Number(o.get("quoteVersion"));
      if (boundVersion !== quoteVersion || Number(p.get("quoteVersion")) !== quoteVersion) {
        tx.update(oRef, { status: "SUPERSEDED" });
        return { error: "aborted" as const };
      }
      const digest = paintingOtpDigest({ otpId, uid, projectId, quoteVersion, otp: code, salt: String(o.get("salt")), pepper });
      if (!hexEqual(String(o.get("digest")), digest)) {
        tx.update(oRef, { attempts: attempts + 1, ...(attempts + 1 >= PAINTING_OTP_MAX_ATTEMPTS ? { status: "LOCKED" } : {}) });
        return { error: "permission-denied" as const };
      }
      try {
        assertPaintingTransition(p.get("status"), "OWNER_APPROVED", { kind: "OWNER", uid }, { otpVerified: true });
      } catch (e) { throw asHttps(e); }
      tx.update(oRef, { status: "CONSUMED", consumedAt: ts(), attempts: attempts + 1 });
      tx.update(pRef, { status: "OWNER_APPROVED", approvedQuoteVersion: quoteVersion, ownerApprovedAt: ts(), ownerApprovalOtpId: otpId, updatedAt: ts() });
      tx.set(db().collection("audit_logs").doc(), { action: "PAINTING_QUOTE_OWNER_APPROVED", projectId, quoteVersion, otpId, actorUid: uid, at: ts() });
      return { ok: true as const };
    });
    if ("error" in outcome) {
      const msg: Record<string, string> = {
        "deadline-exceeded": "The code has expired. Request a new one.",
        "resource-exhausted": "Too many wrong attempts. Request a new code.",
        aborted: "The quote changed. Review the new quote and request a new code.",
        "permission-denied": "Incorrect code.",
      };
      throw new HttpsError(outcome.error as any, msg[outcome.error as string]);
    }
    return { projectId, status: "OWNER_APPROVED", approvedQuoteVersion: quoteVersion };
  },
);

/** Owner cancels before work starts. */
export const ownerCancelPaintingProject = onCall(
  { cors: true, region: "europe-west3", enforceAppCheck: true },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError("unauthenticated", "Sign in required.");
    const projectId = idArg(request.data?.projectId, "projectId");
    const reason = String(request.data?.reason ?? "").trim().slice(0, 1000);
    const ref = db().collection("painting_projects").doc(projectId);
    await db().runTransaction(async (tx) => {
      const p = await tx.get(ref);
      if (!p.exists || p.get("ownerId") !== uid) throw new HttpsError("permission-denied", "Not your project.");
      try { assertPaintingTransition(p.get("status"), "CANCELLED", { kind: "OWNER", uid }); } catch (e) { throw asHttps(e); }
      tx.update(ref, { status: "CANCELLED", cancelledBy: "OWNER", cancelReason: reason || null, cancelledAt: ts(), updatedAt: ts() });
      tx.set(db().collection("audit_logs").doc(), { action: "PAINTING_PROJECT_CANCELLED", projectId, actorUid: uid, by: "OWNER", at: ts() });
    });
    return { projectId, status: "CANCELLED" };
  },
);

async function requirePaintingAdmin(auth: any) {
  if (!isAdmin(auth)) throw new HttpsError("permission-denied", "Admin only.");
  await requirePrivilegedMfaSession(auth);
  return auth.uid as string;
}

/** Admin records BEFORE/AFTER photo Storage paths (no download URLs) after uploading them. */
export const adminRecordPaintingPhotos = onCall(
  { cors: true, region: "europe-west3", enforceAppCheck: true },
  async (request) => {
    const actorUid = await requirePaintingAdmin(request.auth);
    const projectId = idArg(request.data?.projectId, "projectId");
    const kind = String(request.data?.kind ?? "").toUpperCase() as (typeof PAINTING_PHOTO_KINDS)[number];
    if (!PAINTING_PHOTO_KINDS.includes(kind)) throw new HttpsError("invalid-argument", "kind must be BEFORE or AFTER.");
    const raw: unknown[] = Array.isArray(request.data?.paths) ? request.data.paths : [];
    if (raw.length < 1 || raw.length > MAX_PHOTOS_PER_KIND) throw new HttpsError("invalid-argument", `Provide 1-${MAX_PHOTOS_PER_KIND} photo paths.`);
    const prefix = `painting-projects/${projectId}/${kind.toLowerCase()}/`;
    const paths = [...new Set(raw.map((v) => String(v ?? "").trim()))];
    for (const p of paths) {
      if (!p.startsWith(prefix) || p.includes("..") || /[?#]/.test(p) || /^https?:/i.test(p) || p.length > 500) {
        throw new HttpsError("invalid-argument", `Photo paths must be Storage paths under ${prefix}`);
      }
    }
    const bucket = admin.storage().bucket();
    const exists = await Promise.all(paths.map((p) => bucket.file(p).exists().then(([e]) => e)));
    if (exists.some((e) => !e)) throw new HttpsError("failed-precondition", "One or more photos were not found in Storage.");
    const ref = db().collection("painting_projects").doc(projectId);
    const field = kind === "BEFORE" ? "beforePhotoPaths" : "afterPhotoPaths";
    const result = await db().runTransaction(async (tx) => {
      const p = await tx.get(ref);
      if (!p.exists) throw new HttpsError("not-found", "Project not found.");
      const status = p.get("status");
      const allowed = kind === "BEFORE" ? ["OWNER_APPROVED", "WORK_ORDER_OPEN"] : ["WORK_ORDER_OPEN"];
      if (!allowed.includes(status)) throw new HttpsError("failed-precondition", `${kind} photos cannot be recorded while ${status}.`);
      const merged = [...new Set([...(p.get(field) ?? []), ...paths])].slice(0, MAX_PHOTOS_PER_KIND);
      tx.update(ref, { [field]: merged, updatedAt: ts() });
      tx.set(db().collection("audit_logs").doc(), { action: `PAINTING_${kind}_PHOTOS_RECORDED`, projectId, count: paths.length, actorUid, at: ts() });
      return merged.length;
    });
    return { projectId, kind, count: result };
  },
);

/** Admin opens the work order: owner-approved current quote + at least one BEFORE photo. */
export const adminOpenPaintingWorkOrder = onCall(
  { cors: true, region: "europe-west3", enforceAppCheck: true },
  async (request) => {
    const actorUid = await requirePaintingAdmin(request.auth);
    const projectId = idArg(request.data?.projectId, "projectId");
    const ref = db().collection("painting_projects").doc(projectId);
    return db().runTransaction(async (tx) => {
      const p = await tx.get(ref);
      if (!p.exists) throw new HttpsError("not-found", "Project not found.");
      const v = Number(p.get("quoteVersion"));
      if (Number(p.get("approvedQuoteVersion")) !== v) throw new HttpsError("failed-precondition", "The current quote is not owner-approved.");
      try {
        assertPaintingTransition(p.get("status"), "WORK_ORDER_OPEN", { kind: "ADMIN", uid: actorUid }, { beforePhotos: (p.get("beforePhotoPaths") ?? []).length });
      } catch (e) { throw asHttps(e); }
      const scheduledStart = request.data?.scheduledStart ? String(request.data.scheduledStart).slice(0, 40) : null;
      tx.update(ref, { status: "WORK_ORDER_OPEN", workOrder: { quoteVersion: v, openedBy: actorUid, openedAt: ts(), scheduledStart }, updatedAt: ts() });
      tx.set(db().collection("audit_logs").doc(), { action: "PAINTING_WORK_ORDER_OPENED", projectId, quoteVersion: v, actorUid, at: ts() });
      return { projectId, status: "WORK_ORDER_OPEN", quoteVersion: v };
    });
  },
);

/** Admin completes the job: at least one AFTER photo. */
export const adminCompletePaintingProject = onCall(
  { cors: true, region: "europe-west3", enforceAppCheck: true },
  async (request) => {
    const actorUid = await requirePaintingAdmin(request.auth);
    const projectId = idArg(request.data?.projectId, "projectId");
    const ref = db().collection("painting_projects").doc(projectId);
    return db().runTransaction(async (tx) => {
      const p = await tx.get(ref);
      if (!p.exists) throw new HttpsError("not-found", "Project not found.");
      try {
        assertPaintingTransition(p.get("status"), "COMPLETED", { kind: "ADMIN", uid: actorUid }, { afterPhotos: (p.get("afterPhotoPaths") ?? []).length });
      } catch (e) { throw asHttps(e); }
      tx.update(ref, { status: "COMPLETED", completedAt: ts(), completedBy: actorUid, updatedAt: ts() });
      tx.set(db().collection("audit_logs").doc(), { action: "PAINTING_PROJECT_COMPLETED", projectId, actorUid, at: ts() });
      return { projectId, status: "COMPLETED" };
    });
  },
);

/** Admin issues the warranty (1-60 months) on a completed job. */
export const adminIssuePaintingWarranty = onCall(
  { cors: true, region: "europe-west3", enforceAppCheck: true },
  async (request) => {
    const actorUid = await requirePaintingAdmin(request.auth);
    const projectId = idArg(request.data?.projectId, "projectId");
    const months = Number(request.data?.months);
    if (!Number.isInteger(months) || months < 1 || months > 60) throw new HttpsError("invalid-argument", "Warranty must be 1-60 whole months.");
    const terms = String(request.data?.terms ?? "").trim().slice(0, 2000);
    const ref = db().collection("painting_projects").doc(projectId);
    return db().runTransaction(async (tx) => {
      const p = await tx.get(ref);
      if (!p.exists) throw new HttpsError("not-found", "Project not found.");
      try { assertPaintingTransition(p.get("status"), "WARRANTY_ACTIVE", { kind: "ADMIN", uid: actorUid }); } catch (e) { throw asHttps(e); }
      const start = new Date();
      const end = new Date(start); end.setUTCMonth(end.getUTCMonth() + months);
      tx.update(ref, {
        status: "WARRANTY_ACTIVE",
        warranty: { months, terms: terms || null, startsAt: admin.firestore.Timestamp.fromDate(start), endsAt: admin.firestore.Timestamp.fromDate(end), issuedBy: actorUid },
        updatedAt: ts(),
      });
      tx.set(db().collection("audit_logs").doc(), { action: "PAINTING_WARRANTY_ISSUED", projectId, months, actorUid, at: ts() });
      return { projectId, status: "WARRANTY_ACTIVE", warrantyEndsAt: end.toISOString() };
    });
  },
);

/** Admin cancels (e.g. permit refused). */
export const adminCancelPaintingProject = onCall(
  { cors: true, region: "europe-west3", enforceAppCheck: true },
  async (request) => {
    const actorUid = await requirePaintingAdmin(request.auth);
    const projectId = idArg(request.data?.projectId, "projectId");
    const reason = String(request.data?.reason ?? "").trim();
    if (reason.length < 8) throw new HttpsError("invalid-argument", "A reason of at least 8 characters is required.");
    const ref = db().collection("painting_projects").doc(projectId);
    await db().runTransaction(async (tx) => {
      const p = await tx.get(ref);
      if (!p.exists) throw new HttpsError("not-found", "Project not found.");
      try { assertPaintingTransition(p.get("status"), "CANCELLED", { kind: "ADMIN", uid: actorUid }); } catch (e) { throw asHttps(e); }
      tx.update(ref, { status: "CANCELLED", cancelledBy: "ADMIN", cancelReason: reason.slice(0, 1000), cancelledAt: ts(), updatedAt: ts() });
      tx.set(db().collection("audit_logs").doc(), { action: "PAINTING_PROJECT_CANCELLED", projectId, actorUid, by: "ADMIN", at: ts() });
    });
    return { projectId, status: "CANCELLED" };
  },
);

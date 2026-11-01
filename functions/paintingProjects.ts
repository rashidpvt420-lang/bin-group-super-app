import * as crypto from "crypto";
import { defineSecret } from "firebase-functions/params";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import { requirePrivilegedMfaSession } from "./adminMfaSession";
import { requirePaintingFinanceApprover } from "./paintingFinanceApprover";
import {
  PaintingRuleError, assertPaintingTransition, buildPaintingQuote,
  normaliseMeasurements, normalisePermits, normaliseScope, TARGET_GROSS_MARGIN_PCT,
  HARD_MIN_GROSS_MARGIN_PCT, assertRequiredCostLines, assertStageGate, normaliseRate, reservePosition,
  WARRANTY_MONTHS, LINE_CATEGORIES, PaintingRate, normaliseAreas, summariseAreas, normaliseCostLines, costSheetFromLines,
  ownerQuoteLines, normaliseBillingPlan, billingSchedule, BILLING_STAGES, BillingStage,
  normalisePaymentMethod, COST_CATEGORIES, costTracking, requireIdempotencyKey, PaintingMeasurements, PaintingArea,
} from "./projects/paintingProject";

const db = () => admin.firestore();
const asHttps = (e: unknown) => (e instanceof PaintingRuleError ? new HttpsError("failed-precondition", e.message) : e);
const isAdmin = (auth: any) => auth?.token?.admin === true || auth?.token?.role === "admin";
const AI_ROLES = new Set(["ai", "ai_agent", "bot", "assistant", "automation", "service_agent"]);
/** AI / automation identities can never approve, assign, price or decide payments on painting projects. */
function rejectAiActor(auth: any) {
  const t = auth?.token || {};
  const role = String(t.role || t.userRole || t.primaryRole || "").toLowerCase();
  if (t.ai === true || t.isAi === true || t.automation === true || AI_ROLES.has(role)) {
    throw new HttpsError("permission-denied", "Automated or AI actors cannot act on painting projects. A person must do this.");
  }
}
const OWNER_UPLOAD_ROOT = "painting-owner-uploads";
async function assertStoragePathsExist(paths: string[]) {
  if (paths.length === 0) return;
  const bucket = admin.storage().bucket();
  const exists = await Promise.all(paths.map((p) => bucket.file(p).exists().then(([e]) => e)));
  if (exists.some((e) => !e)) throw new HttpsError("failed-precondition", "One or more photos were not found in Storage.");
}
/** Derives the aggregate survey measurement from a per-area breakdown. */
function measurementsFromAreas(areas: PaintingArea[], raw: any): PaintingMeasurements {
  const sum = summariseAreas(areas);
  return normaliseMeasurements({
    wallAreaSqm: sum.wallAreaSqm, ceilingAreaSqm: sum.ceilingAreaSqm, condition: sum.worstCondition,
    doorsCount: raw?.doorsCount ?? 0, woodworkLinearM: raw?.woodworkLinearM ?? 0, coats: raw?.coats ?? 2,
    paintGrade: raw?.paintGrade ?? "STANDARD", photoPaths: areas.flatMap((a) => a.photoPaths).slice(0, 40),
  });
}
function normaliseBillingPlanSafe(raw: any) {
  try { return normaliseBillingPlan(raw); } catch { return normaliseBillingPlan({}); }
}
async function paintingConfig() {
  const cfg = await db().collection("platform_config").doc("painting").get();
  const configured = Number(cfg.get("minGrossMarginPct"));
  const target = Number(cfg.get("targetGrossMarginPct"));
  // Blocking floor: configurable upward only, never below the hard 20%. Target defaults to 35%.
  const minMarginPct = Math.max(Number.isFinite(configured) ? configured : HARD_MIN_GROSS_MARGIN_PCT, HARD_MIN_GROSS_MARGIN_PCT);
  const targetMarginPct = Math.max(Number.isFinite(target) ? target : TARGET_GROSS_MARGIN_PCT, minMarginPct);
  // Billing split is fixed policy (40/30/30); platform_config cannot change it.
  const billingPlan = normaliseBillingPlan({});
  return { minMarginPct, targetMarginPct, billingPlan };
}

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
      const ownerAreas = normaliseAreas(request.data?.areas, `${OWNER_UPLOAD_ROOT}/${uid}/`);
      if (scope === "FULL_BUILDING" && prop.get("propertyType") && !/building|tower|villa_compound|compound/i.test(String(prop.get("propertyType")))) {
        throw new HttpsError("failed-precondition", "Full-building painting is only available for a building you own.");
      }
      await assertStoragePathsExist(ownerAreas.flatMap((a) => a.photoPaths));
      const measurements = request.data?.measurements ? normaliseMeasurements(request.data.measurements)
        : ownerAreas.length ? measurementsFromAreas(ownerAreas, request.data?.measurementsExtra) : null;
      const rawRequestId = request.data?.requestId;
      const requestId = rawRequestId === undefined || rawRequestId === null ? null : String(rawRequestId);
      if (requestId !== null && !/^[A-Za-z0-9_-]{8,64}$/.test(requestId)) {
        throw new HttpsError("invalid-argument", "requestId must be 8-64 letters, digits, '-' or '_'.");
      }
      const record = {
        ownerId: uid, propertyId, scope, billing: "ONE_TIME", status: "REQUESTED",
        ownerMeasurements: measurements, ownerAreas, ownerAreaSummary: ownerAreas.length ? summariseAreas(ownerAreas) : null,
        ownerNotes: request.data?.notes ? String(request.data.notes).slice(0, 2000) : null,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      };
      if (requestId === null) {
        // Legacy clients without an idempotency key (kept for rollout compatibility).
        const ref = db().collection("painting_projects").doc();
        await ref.set(record);
        return { projectId: ref.id, status: "REQUESTED" };
      }
      // Idempotent: one project per (owner, requestId); retries and double-clicks return the same project.
      const ref = db().collection("painting_projects").doc(`${uid}_${requestId}`);
      return await db().runTransaction(async (tx) => {
        const existing = await tx.get(ref);
        if (existing.exists) {
          if (existing.get("ownerId") !== uid) throw new HttpsError("permission-denied", "Not your request.");
          return { projectId: ref.id, status: existing.get("status"), idempotent: true };
        }
        tx.create(ref, { ...record, requestId });
        return { projectId: ref.id, status: "REQUESTED", idempotent: false };
      });
    } catch (e) { throw asHttps(e); }
  },
);

/** Admin issues (or re-issues as a variation) a quote; minimum gross margin enforced here. */
export const adminIssuePaintingQuote = onCall(
  { cors: true, region: "europe-west3", enforceAppCheck: true },
  async (request) => {
    rejectAiActor(request.auth);
    if (!isAdmin(request.auth)) throw new HttpsError("permission-denied", "Admin only.");
    await requirePrivilegedMfaSession(request.auth);
    const projectId = String(request.data?.projectId ?? "").slice(0, 240);
    if (!projectId || projectId.includes("/")) throw new HttpsError("invalid-argument", "projectId is required.");
    try {
      const requestId = request.data?.requestId === undefined ? null : requireIdempotencyKey(request.data.requestId);
      const ref = db().collection("painting_projects").doc(projectId);
      const { minMarginPct, targetMarginPct, billingPlan } = await paintingConfig();
      const surveyAreas = normaliseAreas(request.data?.surveyAreas, `painting-projects/${projectId}/survey/`);
      await assertStoragePathsExist(surveyAreas.flatMap((a) => a.photoPaths));
      // Itemised AED cost lines are mandatory; lines priced from the rate book must match the current rate.
      if (!Array.isArray(request.data?.lines) || request.data.lines.length === 0) throw new HttpsError("invalid-argument", "Itemised AED cost lines are required to quote.");
      const rateIds = [...new Set((request.data.lines as any[]).map((l) => (l?.rateId ? String(l.rateId) : "")).filter(Boolean))];
      if (rateIds.some((r) => r.includes("/") || r.length > 120)) throw new HttpsError("invalid-argument", "Invalid rateId.");
      const rateSnaps = await Promise.all(rateIds.map((r) => db().collection("painting_rates").doc(r).get()));
      const rates: Record<string, PaintingRate> = {};
      for (const r of rateSnaps) if (r.exists) rates[r.id] = { rateId: r.id, category: r.get("category"), unit: r.get("unit"), rateAed: Number(r.get("rateAed")), currency: String(r.get("currency")), version: Number(r.get("version")) };
      const lines = normaliseCostLines(request.data.lines, rates);
      return await db().runTransaction(async (tx) => {
        const idemRef = requestId ? ref.collection("idempotency").doc(`quote_${requestId}`) : null;
        const [snap, idem] = await Promise.all([tx.get(ref), idemRef ? tx.get(idemRef) : Promise.resolve(null)]);
        if (!snap.exists) throw new HttpsError("not-found", "Project not found.");
        if (idem?.exists) return { ...(idem.get("result") as object), idempotent: true };
        const from = snap.get("status");
        const scope = normaliseScope(snap.get("scope"));
        const survey = request.data?.surveyMeasurements ? normaliseMeasurements(request.data.surveyMeasurements)
          : surveyAreas.length ? measurementsFromAreas(surveyAreas, request.data?.surveyExtra) : null;
        // Quotes are priced from the site survey only, never from the owner's own estimate.
        if (!survey) throw new HttpsError("invalid-argument", "Site-survey measurements or survey areas are required to quote.");
        const permits = normalisePermits(request.data?.permits, scope);
        assertRequiredCostLines(lines, scope, permits);
        const costSheet = costSheetFromLines(lines);
        // No override: request fields cannot lower the floor; only platform_config can raise it.
        const quote = buildPaintingQuote({ costSheet, priceAed: request.data?.priceAed, minMarginPct, targetMarginPct, belowTargetReason: request.data?.belowTargetReason, permits });
        const version = Number(snap.get("quoteVersion") ?? 0) + 1;
        const actor = { kind: "ADMIN" as const, uid: request.auth!.uid };
        if (from === "REQUESTED") assertPaintingTransition("REQUESTED", "SURVEYED", actor);
        else assertPaintingTransition(from, "QUOTED", actor);
        const schedule = billingSchedule(quote.priceAed, billingPlan);
        // Owner-readable quote: itemised price lines, permits, survey summary and payment stages.
        // Internal cost, lines and margin go to internal_quotes (Admin-only).
        tx.set(ref.collection("quotes").doc(`v${version}`), {
          version, priceAed: quote.priceAed, billing: "ONE_TIME", isVariation: version > 1,
          lines: ownerQuoteLines(costSheet, quote.priceAed), permits,
          surveySummary: surveyAreas.length ? summariseAreas(surveyAreas) : { wallAreaSqm: survey.wallAreaSqm, ceilingAreaSqm: survey.ceilingAreaSqm, worstCondition: survey.condition },
          surveyAreas, billingPlan, billingSchedule: schedule, paymentMethods: ["CASH", "CHEQUE"],
          issuedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        tx.set(ref.collection("internal_quotes").doc(`v${version}`), {
          version, costSheet, costLines: lines, survey, permits, ...quote, isVariation: version > 1,
          issuedBy: actor.uid, issuedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        tx.update(ref, {
          status: "QUOTED", quoteVersion: version, approvedQuoteVersion: null,
          survey, permits, surveyAreas, updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        tx.set(db().collection("audit_logs").doc(), {
          action: "PAINTING_QUOTE_ISSUED", projectId, version, priceAed: quote.priceAed,
          grossMarginPct: quote.grossMarginPct, belowTarget: quote.belowTarget, belowTargetReason: quote.belowTargetReason, actorUid: actor.uid, at: admin.firestore.FieldValue.serverTimestamp(),
        });
        const result = { projectId, quoteVersion: version, ...quote };
        if (idemRef) tx.create(idemRef, { action: "QUOTE", actorUid: actor.uid, result, at: admin.firestore.FieldValue.serverTimestamp() });
        return result;
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
    rejectAiActor(request.auth);
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
    rejectAiActor(request.auth);
    const projectId = idArg(request.data?.projectId, "projectId");
    const otpId = idArg(request.data?.otpId, "otpId");
    const quoteVersion = Number(request.data?.quoteVersion);
    const code = String(request.data?.otp ?? "").trim();
    if (!/^\d{6}$/.test(code)) throw new HttpsError("invalid-argument", "Enter the 6-digit code.");
    const pepper = paintingPepper();
    const pRef = db().collection("painting_projects").doc(projectId);
    const oRef = paintingOtps().doc(otpId);
    const outcome = await db().runTransaction(async (tx) => {
      const [p, o, q, iq] = await Promise.all([tx.get(pRef), tx.get(oRef), tx.get(pRef.collection("quotes").doc(`v${quoteVersion}`)), tx.get(pRef.collection("internal_quotes").doc(`v${quoteVersion}`))]);
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
      const approvedPriceAed = Number(q.exists ? q.get("priceAed") : NaN);
      if (!Number.isFinite(approvedPriceAed) || approvedPriceAed <= 0) throw new HttpsError("failed-precondition", "Quote not found.");
      const plan = normaliseBillingPlanSafe(q.get("billingPlan"));
      // Reserves are held separately on their own ledger records; they are never part of cost.
      const held = { contingencyReserveAed: Number(iq.get("contingencyReserveAed") ?? 0), warrantyReserveAed: Number(iq.get("warrantyReserveAed") ?? 0) };
      const quotedDirectCostAed = Number(iq.get("directCostAed") ?? 0);
      tx.update(pRef, {
        status: "OWNER_APPROVED", approvedQuoteVersion: quoteVersion, ownerApprovedAt: ts(), ownerApprovalOtpId: otpId,
        approvedPriceAed, billingPlan: plan, billingSchedule: billingSchedule(approvedPriceAed, plan),
        quotedDirectCostAed, reserves: reservePosition(held, quotedDirectCostAed, 0), updatedAt: ts(),
      });
      tx.set(pRef.collection("reserve_ledger").doc(`v${quoteVersion}_CONTINGENCY_HOLD`), { reserve: "CONTINGENCY", entry: "HOLD", amountAed: held.contingencyReserveAed, quoteVersion, at: ts() });
      tx.set(pRef.collection("reserve_ledger").doc(`v${quoteVersion}_WARRANTY_HOLD`), { reserve: "WARRANTY", entry: "HOLD", amountAed: held.warrantyReserveAed, quoteVersion, at: ts() });
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
    rejectAiActor(request.auth);
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
  rejectAiActor(auth);
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
      if (!p.get("contractor")?.name) throw new HttpsError("failed-precondition", "Assign a contractor before opening the work order.");
      if (p.get("payments")?.DEPOSIT?.status !== "PAID") throw new HttpsError("failed-precondition", "The deposit must be approved by Finance before work starts.");
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

/** Owner accepts the documented completed work. Required before the FINAL invoice and the warranty. */
export const ownerAcceptPaintingCompletion = onCall(
  { cors: true, region: "europe-west3", enforceAppCheck: true },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError("unauthenticated", "Sign in required.");
    rejectAiActor(request.auth);
    const projectId = idArg(request.data?.projectId, "projectId");
    const note = short(request.data?.note, 1000);
    const ref = db().collection("painting_projects").doc(projectId);
    return db().runTransaction(async (tx) => {
      const p = await tx.get(ref);
      if (!p.exists || p.get("ownerId") !== uid) throw new HttpsError("permission-denied", "Not your project.");
      const existing = p.get("completionAcceptance");
      if (existing?.acceptedBy) return { projectId, accepted: true, idempotent: true };
      if (p.get("status") !== "COMPLETED" || !p.get("completedAt")) throw new HttpsError("failed-precondition", "The work has not been documented as complete yet.");
      tx.update(ref, { completionAcceptance: { acceptedBy: uid, acceptedAt: ts(), note: note || null }, updatedAt: ts() });
      tx.set(db().collection("audit_logs").doc(), { action: "PAINTING_COMPLETION_ACCEPTED", projectId, actorUid: uid, at: ts() });
      return { projectId, accepted: true, idempotent: false };
    });
  },
);

/** Owner rejects the documented completed work (written reason, optional own photos). Blocks FINAL; idempotent. */
export const ownerRejectPaintingCompletion = onCall(
  { cors: true, region: "europe-west3", enforceAppCheck: true },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError("unauthenticated", "Sign in required.");
    rejectAiActor(request.auth);
    const projectId = idArg(request.data?.projectId, "projectId");
    const requestId = idemKey(request.data?.requestId);
    const reason = short(request.data?.reason, 1000);
    if (reason.length < 8) throw new HttpsError("invalid-argument", "Please describe what needs fixing (at least 8 characters).");
    const raw: unknown[] = Array.isArray(request.data?.photoPaths) ? request.data.photoPaths : [];
    if (raw.length > 10) throw new HttpsError("invalid-argument", "Attach at most 10 photos.");
    const prefix = `${OWNER_UPLOAD_ROOT}/${uid}/${projectId}/`;
    const photoPaths = [...new Set(raw.map((v) => String(v ?? "").trim()))];
    for (const ph of photoPaths) {
      if (!ph.startsWith(prefix) || ph.includes("..") || /[?#]/.test(ph) || /:\/\//.test(ph) || ph.length > 400) throw new HttpsError("invalid-argument", "Photos must be your own uploads for this project.");
    }
    await assertStoragePathsExist(photoPaths);
    const ref = db().collection("painting_projects").doc(projectId);
    const idemRef = ref.collection("idempotency").doc(`reject_completion_${uid}_${requestId}`);
    return db().runTransaction(async (tx) => {
      const [p, idem] = await Promise.all([tx.get(ref), tx.get(idemRef)]);
      if (idem.exists) return { ...(idem.get("result") as object), idempotent: true };
      if (!p.exists || p.get("ownerId") !== uid) throw new HttpsError("permission-denied", "Not your project.");
      if (p.get("completionAcceptance")?.acceptedBy) throw new HttpsError("failed-precondition", "You have already accepted this work.");
      if (!p.get("completedAt")) throw new HttpsError("failed-precondition", "The work has not been documented as complete yet.");
      try { assertPaintingTransition(p.get("status"), "REWORK_REQUIRED", { kind: "OWNER", uid }); } catch (e) { throw asHttps(e); }
      const round = Number(p.get("reworkRound") ?? 0) + 1;
      const rejection = { round, rejectedBy: uid, rejectedAt: ts(), reason, photoPaths };
      tx.update(ref, { status: "REWORK_REQUIRED", reworkRound: round, completionRejection: rejection, [`completionReviews.R${round}`]: { rejection }, updatedAt: ts() });
      tx.set(db().collection("audit_logs").doc(), { action: "PAINTING_COMPLETION_REJECTED", projectId, round, photoCount: photoPaths.length, actorUid: uid, at: ts() });
      const result = { projectId, status: "REWORK_REQUIRED", round };
      tx.create(idemRef, { action: "REJECT_COMPLETION", actorUid: uid, result, at: ts() });
      return result;
    });
  },
);

/** Admin records the rework milestone (photos + note) after an owner rejection; returns the project to COMPLETED. */
export const adminRecordPaintingReworkMilestone = onCall(
  { cors: true, region: "europe-west3", enforceAppCheck: true },
  async (request) => {
    const actorUid = await requirePaintingAdmin(request.auth);
    const projectId = idArg(request.data?.projectId, "projectId");
    const note = short(request.data?.note, 1000);
    if (note.length < 8) throw new HttpsError("invalid-argument", "A rework note of at least 8 characters is required.");
    const raw: unknown[] = Array.isArray(request.data?.photoPaths) ? request.data.photoPaths : [];
    if (raw.length < 1 || raw.length > 20) throw new HttpsError("invalid-argument", "Provide 1-20 rework photo paths.");
    const prefix = `painting-projects/${projectId}/rework/`;
    const photoPaths = [...new Set(raw.map((v) => String(v ?? "").trim()))];
    for (const ph of photoPaths) {
      if (!ph.startsWith(prefix) || ph.includes("..") || /[?#]/.test(ph) || /^https?:/i.test(ph) || ph.length > 500) throw new HttpsError("invalid-argument", `Photo paths must be Storage paths under ${prefix}`);
    }
    await assertStoragePathsExist(photoPaths);
    const ref = db().collection("painting_projects").doc(projectId);
    return db().runTransaction(async (tx) => {
      const p = await tx.get(ref);
      if (!p.exists) throw new HttpsError("not-found", "Project not found.");
      const round = Number(p.get("reworkRound") ?? 0);
      if (round > 0 && p.get(`completionReviews.R${round}.rework.recordedBy`)) return { projectId, status: p.get("status"), round, idempotent: true };
      try { assertPaintingTransition(p.get("status"), "COMPLETED", { kind: "ADMIN", uid: actorUid }, { reworkRecorded: true, afterPhotos: (p.get("afterPhotoPaths") ?? []).length }); } catch (e) { throw asHttps(e); }
      const rework = { round, note, photoPaths, recordedBy: actorUid, recordedAt: ts() };
      tx.update(ref, { status: "COMPLETED", [`completionReviews.R${round}.rework`]: rework, reworkCompletedAt: ts(), updatedAt: ts() });
      tx.set(db().collection("audit_logs").doc(), { action: "PAINTING_REWORK_MILESTONE_RECORDED", projectId, round, photoCount: photoPaths.length, actorUid, at: ts() });
      return { projectId, status: "COMPLETED", round, idempotent: false };
    });
  },
);

/**
 * Finance review queue (finance_manager / finance_controller, MFA). Returns invoices, proofs and the
 * minimum project context only: never costs, margin, reserves, contractor or rate data.
 */
export const financeListPaintingInvoices = onCall(
  { cors: true, region: "europe-west3", enforceAppCheck: true },
  async (request) => {
    rejectAiActor(request.auth);
    await requirePaintingFinanceApprover(request);
    const snap = await db().collection("painting_projects").where("approvedQuoteVersion", ">=", 1).limit(200).get();
    const items = await Promise.all(snap.docs.map(async (d) => {
      const inv = await d.ref.collection("invoices").get();
      if (inv.empty) return null;
      const m = d.get("milestones")?.PROGRESS;
      return {
        projectId: d.id, propertyId: d.get("propertyId") ?? null, scope: d.get("scope") ?? null, status: d.get("status"),
        approvedPriceAed: d.get("approvedPriceAed") ?? null, billingSchedule: d.get("billingSchedule") ?? null,
        progressMilestone: m?.recordedBy ? { percentComplete: m.percentComplete, photoCount: (m.photoPaths ?? []).length } : null,
        completionDocumented: !!d.get("completedAt"), completionAccepted: !!d.get("completionAcceptance")?.acceptedBy,
        reworkRequired: d.get("status") === "REWORK_REQUIRED",
        invoices: inv.docs.map((i) => {
          const pr = i.get("proof");
          return {
            stage: i.get("stage"), amountAed: i.get("amountAed"), currency: i.get("currency") ?? "AED", status: i.get("status"),
            issuedBy: i.get("issuedBy") ?? null,
            proof: pr ? { method: pr.method, proofPath: pr.proofPath, chequeNo: pr.chequeNo ?? null, bank: pr.bank ?? null, chequeDate: pr.chequeDate ?? null } : null,
            rejectionReason: i.get("rejection")?.reason ?? null,
          };
        }),
      };
    }));
    return { projects: items.filter(Boolean) };
  },
);

/** Admin records the progress milestone (photo evidence + note). Gates the PROGRESS invoice. */
export const adminRecordPaintingProgressMilestone = onCall(
  { cors: true, region: "europe-west3", enforceAppCheck: true },
  async (request) => {
    const actorUid = await requirePaintingAdmin(request.auth);
    const projectId = idArg(request.data?.projectId, "projectId");
    const percentComplete = Number(request.data?.percentComplete);
    if (!Number.isInteger(percentComplete) || percentComplete < 10 || percentComplete > 95) throw new HttpsError("invalid-argument", "percentComplete must be a whole number from 10 to 95.");
    const note = short(request.data?.note, 1000);
    if (note.length < 8) throw new HttpsError("invalid-argument", "A milestone note of at least 8 characters is required.");
    const raw: unknown[] = Array.isArray(request.data?.photoPaths) ? request.data.photoPaths : [];
    if (raw.length < 1 || raw.length > 20) throw new HttpsError("invalid-argument", "Provide 1-20 progress photo paths.");
    const prefix = `painting-projects/${projectId}/progress/`;
    const photoPaths = [...new Set(raw.map((v) => String(v ?? "").trim()))];
    for (const ph of photoPaths) {
      if (!ph.startsWith(prefix) || ph.includes("..") || /[?#]/.test(ph) || /^https?:/i.test(ph) || ph.length > 500) throw new HttpsError("invalid-argument", `Photo paths must be Storage paths under ${prefix}`);
    }
    await assertStoragePathsExist(photoPaths);
    const ref = db().collection("painting_projects").doc(projectId);
    return db().runTransaction(async (tx) => {
      const p = await tx.get(ref);
      if (!p.exists) throw new HttpsError("not-found", "Project not found.");
      if (p.get("milestones")?.PROGRESS?.recordedBy) return { projectId, milestone: "PROGRESS", idempotent: true };
      if (p.get("status") !== "WORK_ORDER_OPEN") throw new HttpsError("failed-precondition", "The progress milestone can be recorded only while work is in progress.");
      tx.update(ref, { "milestones.PROGRESS": { percentComplete, note, photoPaths, recordedBy: actorUid, recordedAt: ts() }, updatedAt: ts() });
      tx.set(db().collection("audit_logs").doc(), { action: "PAINTING_PROGRESS_MILESTONE_RECORDED", projectId, percentComplete, photoCount: photoPaths.length, actorUid, at: ts() });
      return { projectId, milestone: "PROGRESS", idempotent: false };
    });
  },
);

/** Admin creates or changes an AED rate. Every change appends a history record (who / when / old / new). */
export const adminSetPaintingRate = onCall(
  { cors: true, region: "europe-west3", enforceAppCheck: true },
  async (request) => {
    const actorUid = await requirePaintingAdmin(request.auth);
    const rateId = String(request.data?.rateId ?? "").trim();
    if (!/^[A-Za-z0-9_-]{3,60}$/.test(rateId)) throw new HttpsError("invalid-argument", "rateId must be 3-60 letters, digits, '-' or '_'.");
    let rate: ReturnType<typeof normaliseRate>;
    try { rate = normaliseRate(request.data); } catch (e) { throw asHttps(e); }
    if (!(LINE_CATEGORIES as readonly string[]).includes(rate.category)) throw new HttpsError("invalid-argument", "Unknown category.");
    const ref = db().collection("painting_rates").doc(rateId);
    return db().runTransaction(async (tx) => {
      const cur = await tx.get(ref);
      const version = Number(cur.exists ? cur.get("version") : 0) + 1;
      const previous = cur.exists ? { rateAed: cur.get("rateAed"), unit: cur.get("unit"), category: cur.get("category"), label: cur.get("label") } : null;
      tx.set(ref, { ...rate, version, updatedBy: actorUid, updatedAt: ts(), ...(cur.exists ? {} : { createdBy: actorUid, createdAt: ts() }) }, { merge: true });
      // Append-only: tx.create fails if this version already exists.
      tx.create(ref.collection("history").doc(`v${version}`), { ...rate, version, previous, changedBy: actorUid, changedAt: ts() });
      tx.set(db().collection("audit_logs").doc(), { action: "PAINTING_RATE_SET", rateId, version, rateAed: rate.rateAed, previousRateAed: previous?.rateAed ?? null, actorUid, at: ts() });
      return { rateId, version, ...rate };
    });
  },
);

/** Admin issues the 12-month warranty, starting at the owner's documented completion acceptance. */
export const adminIssuePaintingWarranty = onCall(
  { cors: true, region: "europe-west3", enforceAppCheck: true },
  async (request) => {
    const actorUid = await requirePaintingAdmin(request.auth);
    const projectId = idArg(request.data?.projectId, "projectId");
    const months = request.data?.months === undefined ? WARRANTY_MONTHS : Number(request.data.months);
    if (months !== WARRANTY_MONTHS) throw new HttpsError("invalid-argument", `The painting warranty is fixed at ${WARRANTY_MONTHS} months.`);
    const terms = String(request.data?.terms ?? "").trim().slice(0, 2000);
    const ref = db().collection("painting_projects").doc(projectId);
    return db().runTransaction(async (tx) => {
      const p = await tx.get(ref);
      if (!p.exists) throw new HttpsError("not-found", "Project not found.");
      try { assertPaintingTransition(p.get("status"), "WARRANTY_ACTIVE", { kind: "ADMIN", uid: actorUid }); } catch (e) { throw asHttps(e); }
      const pays = p.get("payments") ?? {};
      if (pays.FINAL?.status !== "PAID" || Object.values(pays).some((x: any) => x?.status !== "PAID")) {
        throw new HttpsError("failed-precondition", "All painting invoices, including the final one, must be paid before the warranty is issued.");
      }
      const acceptedAt = p.get("completionAcceptance")?.acceptedAt;
      if (!p.get("completionAcceptance")?.acceptedBy || typeof acceptedAt?.toDate !== "function") {
        throw new HttpsError("failed-precondition", "The owner must accept the completed work before the warranty starts.");
      }
      // Warranty runs from the documented completion-and-acceptance timestamp, not from issue time.
      const start: Date = acceptedAt.toDate();
      const end = new Date(start); end.setUTCMonth(end.getUTCMonth() + months);
      tx.update(ref, {
        status: "WARRANTY_ACTIVE",
        warranty: { months, terms: terms || null, startsAt: admin.firestore.Timestamp.fromDate(start), endsAt: admin.firestore.Timestamp.fromDate(end), issuedBy: actorUid },
        updatedAt: ts(),
      });
      tx.set(db().collection("audit_logs").doc(), { action: "PAINTING_WARRANTY_ISSUED", projectId, months, actorUid, at: ts() });
      return { projectId, status: "WARRANTY_ACTIVE", months, warrantyStartsAt: start.toISOString(), warrantyEndsAt: end.toISOString() };
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

// ---------------------------------------------------------------------------
// Step 3: contractor, cost tracking and staged cash/cheque billing.
// Every mutating call takes a requestId; a replay returns the first result.
// ---------------------------------------------------------------------------

const MONEY = (v: unknown, field: string, max = 5_000_000) => {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0 || n > max) throw new HttpsError("invalid-argument", `${field} must be a positive amount.`);
  return Math.round(n * 100) / 100;
};
const short = (v: unknown, max: number) => String(v ?? "").trim().slice(0, max);
function idemKey(v: unknown) { try { return requireIdempotencyKey(v); } catch (e) { throw asHttps(e); } }
function stageArg(v: unknown): BillingStage {
  const s = String(v ?? "").toUpperCase();
  if (!(BILLING_STAGES as readonly string[]).includes(s)) throw new HttpsError("invalid-argument", "stage must be DEPOSIT, PROGRESS or FINAL.");
  return s as BillingStage;
}

/** Admin assigns (or re-assigns before work starts) the painting contractor. */
export const adminAssignPaintingContractor = onCall(
  { cors: true, region: "europe-west3", enforceAppCheck: true },
  async (request) => {
    const actorUid = await requirePaintingAdmin(request.auth);
    const projectId = idArg(request.data?.projectId, "projectId");
    const requestId = idemKey(request.data?.requestId);
    const name = short(request.data?.name, 160);
    if (name.length < 2) throw new HttpsError("invalid-argument", "Contractor name is required.");
    const contractor = {
      name, tradeLicenseNo: short(request.data?.tradeLicenseNo, 60) || null, phone: short(request.data?.phone, 30) || null,
      contractorId: request.data?.contractorId ? idArg(request.data.contractorId, "contractorId") : null,
      agreedCostAed: request.data?.agreedCostAed === undefined ? null : MONEY(request.data.agreedCostAed, "agreedCostAed"),
      assignedBy: actorUid, assignedAt: ts(),
    };
    const ref = db().collection("painting_projects").doc(projectId);
    const idemRef = ref.collection("idempotency").doc(`contractor_${requestId}`);
    return db().runTransaction(async (tx) => {
      const [p, idem] = await Promise.all([tx.get(ref), tx.get(idemRef)]);
      if (idem.exists) return { ...(idem.get("result") as object), idempotent: true };
      if (!p.exists) throw new HttpsError("not-found", "Project not found.");
      if (!["QUOTED", "OWNER_APPROVED"].includes(p.get("status"))) throw new HttpsError("failed-precondition", "A contractor can only be assigned before the work order opens.");
      tx.update(ref, { contractor, updatedAt: ts() });
      tx.set(db().collection("audit_logs").doc(), { action: "PAINTING_CONTRACTOR_ASSIGNED", projectId, contractorName: name, actorUid, at: ts() });
      const result = { projectId, contractorName: name };
      tx.create(idemRef, { action: "CONTRACTOR", actorUid, result, at: ts() });
      return result;
    });
  });

/** Admin records an actual cost line; keeps a running actual-vs-quoted margin. */
export const adminRecordPaintingCost = onCall(
  { cors: true, region: "europe-west3", enforceAppCheck: true },
  async (request) => {
    const actorUid = await requirePaintingAdmin(request.auth);
    const projectId = idArg(request.data?.projectId, "projectId");
    const requestId = idemKey(request.data?.requestId);
    const category = String(request.data?.category ?? "").toUpperCase();
    if (!(COST_CATEGORIES as readonly string[]).includes(category)) throw new HttpsError("invalid-argument", `category must be one of ${COST_CATEGORIES.join(", ")}.`);
    const amountAed = MONEY(request.data?.amountAed, "amountAed");
    const description = short(request.data?.description, 300);
    if (description.length < 3) throw new HttpsError("invalid-argument", "A description is required.");
    const ref = db().collection("painting_projects").doc(projectId);
    const idemRef = ref.collection("idempotency").doc(`cost_${requestId}`);
    return db().runTransaction(async (tx) => {
      const [p, idem] = await Promise.all([tx.get(ref), tx.get(idemRef)]);
      if (idem.exists) return { ...(idem.get("result") as object), idempotent: true };
      if (!p.exists) throw new HttpsError("not-found", "Project not found.");
      if (!["OWNER_APPROVED", "WORK_ORDER_OPEN", "COMPLETED", "WARRANTY_ACTIVE"].includes(p.get("status"))) {
        throw new HttpsError("failed-precondition", "Costs can be recorded only on an approved project.");
      }
      const v = Number(p.get("approvedQuoteVersion"));
      const iq = await tx.get(ref.collection("internal_quotes").doc(`v${v}`));
      // Compare actual costs with the quoted DIRECT cost only; reserves are tracked on their own ledger.
      const quotedCostAed = Number(iq.get("directCostAed") ?? 0);
      const actualCostAed = Math.round((Number(p.get("costs")?.actualCostAed ?? 0) + amountAed) * 100) / 100;
      const tracking = costTracking(Number(p.get("approvedPriceAed") ?? 0), quotedCostAed, actualCostAed);
      const held = { contingencyReserveAed: Number(iq.get("contingencyReserveAed") ?? 0), warrantyReserveAed: Number(iq.get("warrantyReserveAed") ?? 0) };
      const before = reservePosition(held, quotedCostAed, Number(p.get("costs")?.actualCostAed ?? 0));
      const reserves = reservePosition(held, quotedCostAed, actualCostAed);
      const draw = Math.round((reserves.contingencyUsedAed - before.contingencyUsedAed) * 100) / 100;
      if (draw > 0) tx.create(ref.collection("reserve_ledger").doc(`draw_${requestId}`), { reserve: "CONTINGENCY", entry: "DRAW", amountAed: draw, costId: requestId, at: ts() });
      const costRef = ref.collection("costs").doc(requestId);
      tx.create(costRef, { category, amountAed, description, vendor: short(request.data?.vendor, 160) || null, recordedBy: actorUid, recordedAt: ts() });
      tx.update(ref, { costs: tracking, reserves, updatedAt: ts() });
      tx.set(db().collection("audit_logs").doc(), { action: "PAINTING_COST_RECORDED", projectId, category, amountAed, actorUid, at: ts() });
      const result = { projectId, costId: costRef.id, ...tracking, reserves };
      tx.create(idemRef, { action: "COST", actorUid, result, at: ts() });
      return result;
    });
  });

/** Admin issues a stage invoice (deposit / progress / final). Cash or cheque only. */
export const adminIssuePaintingInvoice = onCall(
  { cors: true, region: "europe-west3", enforceAppCheck: true },
  async (request) => {
    const actorUid = await requirePaintingAdmin(request.auth);
    const projectId = idArg(request.data?.projectId, "projectId");
    const requestId = idemKey(request.data?.requestId);
    const stage = stageArg(request.data?.stage);
    const ref = db().collection("painting_projects").doc(projectId);
    const invRef = ref.collection("invoices").doc(stage);
    const idemRef = ref.collection("idempotency").doc(`invoice_${requestId}`);
    return db().runTransaction(async (tx) => {
      const [p, inv, idem] = await Promise.all([tx.get(ref), tx.get(invRef), tx.get(idemRef)]);
      if (idem.exists) return { ...(idem.get("result") as object), idempotent: true };
      if (!p.exists) throw new HttpsError("not-found", "Project not found.");
      if (inv.exists) throw new HttpsError("already-exists", `The ${stage} invoice was already issued.`);
      const payments = p.get("payments") ?? {};
      try { assertStageGate(stage, p.data() as any); } catch (e) { throw asHttps(e); }
      const price = Number(p.get("approvedPriceAed"));
      const schedule = p.get("billingSchedule") as Record<BillingStage, number> | undefined;
      if (!Number.isFinite(price) || !schedule) throw new HttpsError("failed-precondition", "The project has no approved price.");
      let amountAed = Number(schedule[stage]);
      if (stage === "FINAL") {
        // Final absorbs any approved variation, so the stages always add up to the approved price.
        const issued = (["DEPOSIT", "PROGRESS"] as BillingStage[]).reduce((s, k) => s + Number(payments[k]?.amountAed ?? 0), 0);
        amountAed = Math.round((price - issued) * 100) / 100;
      }
      if (!(amountAed > 0)) throw new HttpsError("failed-precondition", `Nothing is due for the ${stage} stage.`);
      tx.create(invRef, {
        stage, amountAed, currency: "AED", ownerId: p.get("ownerId"), status: "ISSUED", paymentMethods: ["CASH", "CHEQUE"],
        quoteVersion: Number(p.get("approvedQuoteVersion")), issuedBy: actorUid, issuedAt: ts(),
      });
      tx.update(ref, { [`payments.${stage}`]: { status: "ISSUED", amountAed }, updatedAt: ts() });
      tx.set(db().collection("audit_logs").doc(), { action: "PAINTING_INVOICE_ISSUED", projectId, stage, amountAed, actorUid, at: ts() });
      const result = { projectId, stage, amountAed };
      tx.create(idemRef, { action: "INVOICE", actorUid, result, at: ts() });
      return result;
    });
  });

/** Owner submits cash-receipt or cheque proof for a stage invoice. Finance must approve it. */
export const ownerSubmitPaintingPaymentProof = onCall(
  { cors: true, region: "europe-west3", enforceAppCheck: true },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError("unauthenticated", "Sign in required.");
    rejectAiActor(request.auth);
    const projectId = idArg(request.data?.projectId, "projectId");
    const requestId = idemKey(request.data?.requestId);
    const stage = stageArg(request.data?.stage);
    let method: string;
    try { method = normalisePaymentMethod(request.data?.method); } catch (e) { throw asHttps(e); }
    const proofPath = String(request.data?.proofPath ?? "");
    const prefix = `${OWNER_UPLOAD_ROOT}/${uid}/`;
    if (!proofPath.startsWith(prefix) || proofPath.includes("..") || /[?#]|:\/\//.test(proofPath) || proofPath.length > 400) {
      throw new HttpsError("invalid-argument", "Upload the receipt or cheque photo first.");
    }
    const cheque = method === "CHEQUE" ? {
      chequeNo: short(request.data?.chequeNo, 30), bank: short(request.data?.bank, 80), chequeDate: short(request.data?.chequeDate, 10),
    } : null;
    if (cheque && (!/^[A-Za-z0-9-]{3,30}$/.test(cheque.chequeNo) || cheque.bank.length < 2 || !/^\d{4}-\d{2}-\d{2}$/.test(cheque.chequeDate))) {
      throw new HttpsError("invalid-argument", "Cheque number, bank and date (YYYY-MM-DD) are required.");
    }
    await assertStoragePathsExist([proofPath]);
    const ref = db().collection("painting_projects").doc(projectId);
    const invRef = ref.collection("invoices").doc(stage);
    const idemRef = ref.collection("idempotency").doc(`proof_${uid}_${requestId}`);
    return db().runTransaction(async (tx) => {
      const [p, inv, idem] = await Promise.all([tx.get(ref), tx.get(invRef), tx.get(idemRef)]);
      if (idem.exists) return { ...(idem.get("result") as object), idempotent: true };
      if (!p.exists || p.get("ownerId") !== uid) throw new HttpsError("permission-denied", "Not your project.");
      if (!inv.exists) throw new HttpsError("failed-precondition", "There is no invoice for this stage yet.");
      if (!["ISSUED", "REJECTED"].includes(inv.get("status"))) throw new HttpsError("failed-precondition", "Payment proof was already submitted for this invoice.");
      const proof = { method, proofPath, ...(cheque ?? {}), submittedBy: uid, submittedAt: ts() };
      tx.update(invRef, { status: "PROOF_SUBMITTED", proof, rejection: null });
      tx.update(ref, { [`payments.${stage}.status`]: "PROOF_SUBMITTED", updatedAt: ts() });
      tx.set(db().collection("audit_logs").doc(), { action: "PAINTING_PAYMENT_PROOF_SUBMITTED", projectId, stage, method, actorUid: uid, at: ts() });
      const result = { projectId, stage, status: "PROOF_SUBMITTED" };
      tx.create(idemRef, { action: "PROOF", actorUid: uid, result, at: ts() });
      return result;
    });
  });

/** Finance admin (MFA) approves or rejects a submitted cash/cheque proof. Never automatic. */
export const financeDecidePaintingPayment = onCall(
  { cors: true, region: "europe-west3", enforceAppCheck: true },
  async (request) => {
    rejectAiActor(request.auth);
    const actor = await requirePaintingFinanceApprover(request);
    const projectId = idArg(request.data?.projectId, "projectId");
    const requestId = idemKey(request.data?.requestId);
    const stage = stageArg(request.data?.stage);
    const decision = String(request.data?.decision ?? "").toUpperCase();
    if (!["APPROVE", "REJECT"].includes(decision)) throw new HttpsError("invalid-argument", "decision must be APPROVE or REJECT.");
    const note = short(request.data?.note, 500);
    if (decision === "REJECT" && note.length < 8) throw new HttpsError("invalid-argument", "A rejection reason of at least 8 characters is required.");
    const ref = db().collection("painting_projects").doc(projectId);
    const invRef = ref.collection("invoices").doc(stage);
    const idemRef = ref.collection("idempotency").doc(`finance_${requestId}`);
    return db().runTransaction(async (tx) => {
      const [p, inv, idem] = await Promise.all([tx.get(ref), tx.get(invRef), tx.get(idemRef)]);
      if (idem.exists) return { ...(idem.get("result") as object), idempotent: true };
      if (!p.exists || !inv.exists) throw new HttpsError("not-found", "Invoice not found.");
      if (inv.get("status") !== "PROOF_SUBMITTED") throw new HttpsError("failed-precondition", "There is no payment proof waiting for a decision.");
      if (inv.get("issuedBy") === actor.uid) throw new HttpsError("permission-denied", "The person who issued the invoice cannot approve its payment.");
      // Release re-checks the milestone gate (status may have moved on, so only paid stages + milestones).
      if (decision === "APPROVE") { try { assertStageGate(stage, p.data() as any, { checkStatus: false }); } catch (e) { throw asHttps(e); } }
      const status = decision === "APPROVE" ? "PAID" : "REJECTED";
      tx.update(invRef, decision === "APPROVE"
        ? { status, paidAt: ts(), decidedBy: actor.uid, decisionNote: note || null }
        : { status, rejection: { reason: note, by: actor.uid, at: ts() } });
      tx.update(ref, { [`payments.${stage}.status`]: status, updatedAt: ts() });
      tx.set(db().collection("audit_logs").doc(), { action: `PAINTING_PAYMENT_${status}`, projectId, stage, amountAed: inv.get("amountAed"), method: inv.get("proof")?.method, actorUid: actor.uid, at: ts() });
      const result = { projectId, stage, status };
      tx.create(idemRef, { action: "FINANCE", actorUid: actor.uid, result, at: ts() });
      return result;
    });
  });

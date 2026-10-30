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

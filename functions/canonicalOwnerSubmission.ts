import * as admin from "firebase-admin";
import type * as FirebaseFirestore from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { submitOwnerInspectionFirstOnboarding as legacySubmitOwnerInspectionFirstOnboarding } from "./inspectionFirstOwnerOnboarding";
import {
  buildPropertyIdentities,
  PROPERTY_IDENTITY_VERSION,
  type PropertyIdentity,
} from "./propertyIdentity";

if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();

const OWNER_WORKFLOW_VERSION = "OWNER_FIVE_PAGE_INSPECTION_FIRST_V1";
const MAX_PROPERTIES = 100;

type PlainRecord = Record<string, any>;

const text = (value: unknown, max = 500) => String(value ?? "").trim().slice(0, max);
const lower = (value: unknown, max = 500) => text(value, max).toLowerCase();
const record = (value: unknown): PlainRecord => (
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as PlainRecord
    : {}
);
const safeId = (value: unknown, fallback: string) => text(value, 240)
  .replace(/[^A-Za-z0-9_-]/g, "_")
  .replace(/_+/g, "_")
  .slice(0, 160) || fallback;

function finiteCoordinate(value: unknown, minimum: number, maximum: number): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= minimum && parsed <= maximum ? parsed : null;
}

function requiredPropertyIdentities(property: PlainRecord) {
  const identities = buildPropertyIdentities(property);
  if (!identities.length) {
    throw new HttpsError(
      "failed-precondition",
      "Every property requires a stable address, map location, place identifier, unit reference, or title-deed reference.",
    );
  }
  return identities;
}

async function requireVerifiedOwner(request: any) {
  if (!request.auth?.uid) throw new HttpsError("unauthenticated", "Owner authentication required.");
  const token = request.auth.token || {};
  const role = lower(token.role || token.userRole || token.primaryRole, 80);
  if (role !== "owner" || token.email_verified !== true || token.suspended === true) {
    throw new HttpsError("permission-denied", "A verified, active Owner account is required.");
  }
  const user = await admin.auth().getUser(request.auth.uid);
  if (user.disabled || !user.emailVerified) {
    throw new HttpsError("permission-denied", "The Owner account is not active and verified.");
  }
  return request.auth.uid as string;
}

async function assertNoExistingCanonicalProperty(
  property: PlainRecord,
  propertyId: string,
  identities: PropertyIdentity[],
) {
  const geo = record(property.submittedGeo || property.geo || property.location);
  const point = record(geo.point);
  const lat = finiteCoordinate(geo.lat ?? geo.latitude ?? point.latitude ?? property.lat ?? property.latitude, -90, 90);
  const address = text(geo.address || property.address || property.propertyAddress, 500);
  const lookups: Array<Promise<FirebaseFirestore.QuerySnapshot>> = [];

  if (lat !== null) {
    lookups.push(db.collection("properties").where("submittedGeo.lat", "==", lat).limit(50).get());
    lookups.push(db.collection("properties").where("geo.lat", "==", lat).limit(50).get());
  }
  if (address) {
    lookups.push(db.collection("properties").where("address", "==", address).limit(50).get());
    lookups.push(db.collection("properties").where("submittedGeo.address", "==", address).limit(50).get());
    lookups.push(db.collection("properties").where("geo.address", "==", address).limit(50).get());
  }
  if (!lookups.length) return;

  const requestedKeys = new Set(identities.map((identity) => identity.raw));
  const snapshots = await Promise.all(lookups);
  const seen = new Set<string>();
  for (const snapshot of snapshots) {
    for (const document of snapshot.docs) {
      if (document.id === propertyId || seen.has(document.id)) continue;
      seen.add(document.id);
      const existingKeys = buildPropertyIdentities(document.data()).map((identity) => identity.raw);
      if (existingKeys.some((key) => requestedKeys.has(key))) {
        throw new HttpsError(
          "already-exists",
          "This property already exists in BIN GROUP or is already being onboarded.",
        );
      }
    }
  }
}

async function claimPropertyIdentities(args: {
  ownerUid: string;
  intakeId: string;
  properties: PlainRecord[];
}) {
  const claims = args.properties.map((property, index) => {
    const propertyId = safeId(`${args.intakeId}_property_${index + 1}`, `owner_${args.ownerUid}_property_${index + 1}`);
    return { propertyId, identities: requiredPropertyIdentities(property), property };
  });

  const payloadKeys = new Map<string, string>();
  for (const claim of claims) {
    for (const identity of claim.identities) {
      const priorPropertyId = payloadKeys.get(identity.hash);
      if (priorPropertyId && priorPropertyId !== claim.propertyId) {
        throw new HttpsError(
          "already-exists",
          "The same property appears more than once in this onboarding submission.",
        );
      }
      payloadKeys.set(identity.hash, claim.propertyId);
    }
  }

  await Promise.all(claims.map((claim) =>
    assertNoExistingCanonicalProperty(claim.property, claim.propertyId, claim.identities),
  ));

  const createdClaimIds = await db.runTransaction(async (transaction) => {
    const refs = claims.flatMap((claim) => claim.identities.map((identity) => ({
      claim,
      identity,
      ref: db.collection("property_identity_registry").doc(identity.hash),
    })));
    const snapshots = await Promise.all(refs.map(({ ref }) => transaction.get(ref)));
    const created: string[] = [];
    snapshots.forEach((snapshot, index) => {
      const { claim, identity, ref } = refs[index];
      if (snapshot.exists) {
        const existing = snapshot.data() || {};
        const sameBinding =
          text(existing.ownerUid) === args.ownerUid &&
          text(existing.intakeId) === args.intakeId &&
          text(existing.propertyId) === claim.propertyId;
        if (!sameBinding) {
          throw new HttpsError(
            "already-exists",
            "This property already exists in BIN GROUP or is already being onboarded.",
          );
        }
        return;
      }
      transaction.create(ref, {
        identityVersion: PROPERTY_IDENTITY_VERSION,
        identityKind: identity.kind,
        identityHash: identity.hash,
        ownerUid: args.ownerUid,
        intakeId: args.intakeId,
        propertyId: claim.propertyId,
        workflowVersion: OWNER_WORKFLOW_VERSION,
        state: "CLAIMED",
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      created.push(ref.id);
    });
    return created;
  });

  return createdClaimIds;
}

async function releaseNewClaims(claimIds: string[], ownerUid: string, intakeId: string) {
  if (!claimIds.length) return;
  try {
    await db.runTransaction(async (transaction) => {
      const refs = claimIds.map((claimId) => db.collection("property_identity_registry").doc(claimId));
      const snapshots = await Promise.all(refs.map((ref) => transaction.get(ref)));
      snapshots.forEach((snapshot, index) => {
        const data = snapshot.data() || {};
        if (
          snapshot.exists &&
          text(data.ownerUid) === ownerUid &&
          text(data.intakeId) === intakeId &&
          text(data.state) === "CLAIMED"
        ) {
          transaction.delete(refs[index]);
        }
      });
    });
  } catch (cleanupError) {
    await db.collection("audit_logs").add({
      action: "OWNER_PROPERTY_IDENTITY_CLAIM_CLEANUP_FAILED",
      ownerUid,
      intakeId,
      claimIds,
      errorName: cleanupError instanceof Error ? cleanupError.name : "UNKNOWN",
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  }
}

export const submitOwnerInspectionFirstOnboarding = onCall(
  { cors: true, enforceAppCheck: true },
  async (request) => {
    const ownerUid = await requireVerifiedOwner(request);
    const data = record(request.data);
    const intakeId = safeId(data.intakeId || data.onboardingSessionId, `owner_${ownerUid}`);
    const properties = Array.isArray(data.properties)
      ? data.properties.map((property: unknown) => record(property))
      : [];
    if (!properties.length || properties.length > MAX_PROPERTIES) {
      throw new HttpsError("invalid-argument", "One to 100 properties are required.");
    }

    const createdClaimIds = await claimPropertyIdentities({ ownerUid, intakeId, properties });
    const runner = (legacySubmitOwnerInspectionFirstOnboarding as any).run;
    if (typeof runner !== "function") {
      await releaseNewClaims(createdClaimIds, ownerUid, intakeId);
      throw new HttpsError("internal", "The protected Owner onboarding handler is unavailable.");
    }

    try {
      const result = await runner(request);
      return {
        ...(result || {}),
        propertyIdentityVersion: PROPERTY_IDENTITY_VERSION,
      };
    } catch (error) {
      await releaseNewClaims(createdClaimIds, ownerUid, intakeId);
      throw error;
    }
  },
);

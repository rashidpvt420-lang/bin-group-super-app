import { onCall, HttpsError } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import * as admin from "firebase-admin";
import * as crypto from "crypto";

if (!admin.apps.length) admin.initializeApp();

const db = admin.firestore();
const QR_SIGNING_SECRET = defineSecret("QR_SIGNING_SECRET");
const MAX_GATE_PASS_MS = 24 * 60 * 60 * 1000;
const MAX_PARKING_PASS_MS = 7 * 24 * 60 * 60 * 1000;
const PASS_TYPES = new Set(["visitor", "contractor", "delivery", "visitor_parking"]);

function text(value: unknown, max = 160) {
  return String(value || "").trim().slice(0, max);
}

function tokenRole(auth: any) {
  return text(auth?.token?.role || auth?.token?.userRole || auth?.token?.primaryRole, 60).toLowerCase();
}

async function assertTenantResidence(auth: any, propertyId: string, unitId: string) {
  if (!auth?.uid) throw new HttpsError("unauthenticated", "User must be authenticated.");
  if (auth.token?.suspended === true || auth.token?.email_verified !== true) {
    throw new HttpsError("permission-denied", "A verified, active tenant account is required.");
  }

  const [authUser, userSnap, unitSnap] = await Promise.all([
    admin.auth().getUser(auth.uid),
    db.collection("users").doc(auth.uid).get(),
    db.collection("units").doc(unitId).get(),
  ]);
  const user = userSnap.data() || {};
  const unit = unitSnap.data() || {};
  const role = tokenRole(auth) || text(user.role, 60).toLowerCase();
  const verifiedEmail = auth.token?.email_verified === true
    ? text(auth.token?.email, 320).toLowerCase()
    : "";
  const unitBoundToTenant = [unit.tenantId, unit.tenantUid, unit.currentTenantId]
    .some((value) => text(value) === auth.uid) ||
    (Boolean(verifiedEmail) && text(unit.tenantEmail, 320).toLowerCase() === verifiedEmail);
  if (
    authUser.disabled ||
    role !== "tenant" ||
    ["suspended", "disabled", "rejected"].includes(text(user.status, 60).toLowerCase())
  ) {
    throw new HttpsError("permission-denied", "An active tenant account is required.");
  }
  if (
    !unitSnap.exists ||
    text(unit.propertyId) !== propertyId ||
    !unitBoundToTenant
  ) {
    throw new HttpsError("permission-denied", "The selected unit is not bound to this tenant and property.");
  }
  return { user, unit };
}

function getQrSecret() {
  const secret = QR_SIGNING_SECRET.value();
  if (!secret) {
    throw new HttpsError("failed-precondition", "QR signing secret is not configured.");
  }
  return secret;
}

export const generateSignedQrPass = onCall({ cors: true, secrets: [QR_SIGNING_SECRET] }, async (request) => {
  const QR_SECRET = getQrSecret();
  const tenantId = request.auth?.uid || "";
  const propertyId = text(request.data?.propertyId);
  const unitId = text(request.data?.unitId);
  const type = text(request.data?.type, 40).toLowerCase();
  const name = text(request.data?.name, 120);
  const validFrom = Number(request.data?.validFrom);
  const validUntil = Number(request.data?.validUntil);
  if (!propertyId || !unitId || !PASS_TYPES.has(type) || name.length < 2) {
    throw new HttpsError("invalid-argument", "A valid property, unit, pass type, and visitor name are required.");
  }
  if (
    !Number.isFinite(validFrom) ||
    !Number.isFinite(validUntil) ||
    validFrom < Date.now() - 5 * 60 * 1000 ||
    validUntil <= Math.max(Date.now(), validFrom)
  ) {
    throw new HttpsError("invalid-argument", "Pass validity must be a current, future time range.");
  }
  const maxDuration = type === "visitor_parking" ? MAX_PARKING_PASS_MS : MAX_GATE_PASS_MS;
  if (validUntil - validFrom > maxDuration) {
    throw new HttpsError("invalid-argument", "Requested pass validity exceeds the allowed duration.");
  }
  await assertTenantResidence(request.auth, propertyId, unitId);

  const passId = db.collection("gatePasses").doc().id;
  const payloadStr = JSON.stringify({
    passId,
    tenantId,
    propertyId,
    unitId,
    type,
    name,
    validFrom,
    validUntil
  });
  
  const hmac = crypto.createHmac("sha256", QR_SECRET);
  hmac.update(payloadStr);
  const signature = hmac.digest("hex");
  const token = Buffer.from(`${payloadStr}|${signature}`).toString("base64url");

  const collectionName = type === "visitor_parking" ? "visitorParkingRequests" : "gatePasses";
  const status = type === "visitor_parking" ? "pending" : "active";
  const now = admin.firestore.FieldValue.serverTimestamp();
  const record: Record<string, unknown> = {
    passId,
    qrToken: token,
    propertyId,
    unitId,
    tenantUid: tenantId,
    tenantName: text(request.auth?.token?.name, 160) || "Resident",
    visitorName: name,
    type,
    status,
    validFrom: admin.firestore.Timestamp.fromMillis(validFrom),
    validUntil: admin.firestore.Timestamp.fromMillis(validUntil),
    issuedBy: tenantId,
    issuedByFunction: "generateSignedQrPass",
    createdAt: now,
    updatedAt: now,
  };
  if (type === "visitor_parking") {
    const vehiclePlate = text(request.data?.vehiclePlate, 40).toUpperCase();
    if (vehiclePlate.length < 2) {
      throw new HttpsError("invalid-argument", "Vehicle plate is required for visitor parking.");
    }
    record.vehiclePlate = vehiclePlate;
    record.visitStartAt = new Date(validFrom).toISOString();
    record.visitEndAt = new Date(validUntil).toISOString();
    record.passCode = `VP-${crypto.randomInt(100000, 1000000)}`;
  } else {
    record.visitorPhone = text(request.data?.visitorPhone, 40);
    record.visitorType = type;
    record.duration = Math.ceil((validUntil - validFrom) / (60 * 60 * 1000));
  }

  const batch = db.batch();
  batch.create(db.collection(collectionName).doc(passId), record);
  batch.create(db.collection("audit_logs").doc(), {
    actorId: tenantId,
    actorRole: "tenant",
    action: type === "visitor_parking" ? "TENANT_VISITOR_PARKING_REQUESTED" : "TENANT_GATE_PASS_CREATED",
    targetType: collectionName,
    targetId: passId,
    metadata: { propertyId, unitId, type, validUntil },
    createdAt: now,
  });
  await batch.commit();

  return { passId, token, status };
});

export const cancelSignedQrPass = onCall({ cors: true }, async (request) => {
  if (!request.auth?.uid) throw new HttpsError("unauthenticated", "User must be authenticated.");
  const passId = text(request.data?.passId);
  const collectionName = text(request.data?.collectionName);
  if (!passId || !["gatePasses", "visitorParkingRequests"].includes(collectionName)) {
    throw new HttpsError("invalid-argument", "A valid pass and pass type are required.");
  }
  const ref = db.collection(collectionName).doc(passId);
  await db.runTransaction(async (transaction) => {
    const snap = await transaction.get(ref);
    if (!snap.exists) throw new HttpsError("not-found", "Pass not found.");
    const pass = snap.data() || {};
    if (text(pass.tenantUid) !== request.auth!.uid) {
      throw new HttpsError("permission-denied", "This pass belongs to another tenant.");
    }
    if (["cancelled", "revoked", "expired", "rejected"].includes(text(pass.status).toLowerCase())) return;
    transaction.set(ref, {
      status: collectionName === "gatePasses" ? "revoked" : "cancelled",
      revokedAt: admin.firestore.FieldValue.serverTimestamp(),
      revokedBy: request.auth!.uid,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
  });
  return { success: true, passId };
});

export const verifyQrPass = onCall({ cors: true, secrets: [QR_SIGNING_SECRET] }, async (request) => {
  const QR_SECRET = getQrSecret();
  const { token } = request.data;
  if (!token) throw new HttpsError("invalid-argument", "Missing token.");

  try {
    const decoded = Buffer.from(token, "base64url").toString("utf-8");
    const separator = decoded.lastIndexOf("|");
    if (separator <= 0) throw new HttpsError("invalid-argument", "Malformed pass token.");
    const payloadStr = decoded.slice(0, separator);
    const signature = decoded.slice(separator + 1);
    const hmac = crypto.createHmac("sha256", QR_SECRET);
    hmac.update(payloadStr);
    const expectedSignature = hmac.digest("hex");
    if (
      !/^[a-f0-9]{64}$/.test(signature) ||
      !crypto.timingSafeEqual(Buffer.from(signature, "hex"), Buffer.from(expectedSignature, "hex"))
    ) {
      throw new HttpsError("permission-denied", "Invalid pass signature.");
    }

    const payload = JSON.parse(payloadStr);
    if (
      !payload?.passId ||
      !payload?.tenantId ||
      !payload?.propertyId ||
      !payload?.unitId ||
      !PASS_TYPES.has(text(payload.type, 40).toLowerCase()) ||
      !Number.isFinite(Number(payload.validFrom)) ||
      !Number.isFinite(Number(payload.validUntil))
    ) {
      throw new HttpsError("invalid-argument", "Pass payload is incomplete.");
    }
    if (Date.now() < Number(payload.validFrom) || Date.now() > Number(payload.validUntil)) {
      throw new HttpsError("failed-precondition", "Pass has expired.");
    }

    const collectionName = payload.type === "visitor_parking" ? "visitorParkingRequests" : "gatePasses";
    const passSnap = await db.collection(collectionName).doc(payload.passId).get();
    if (!passSnap.exists) {
      throw new HttpsError("not-found", "Pass record not found.");
    }
    const passDoc = passSnap.data() || {};
    const status = text(passDoc.status).toLowerCase();
    const requiredStatus = payload.type === "visitor_parking" ? "approved" : "active";
    if (status !== requiredStatus) {
      throw new HttpsError("failed-precondition", `Pass is not active (Status: ${status}).`);
    }
    if (
      passDoc.passId !== payload.passId ||
      passDoc.qrToken !== token ||
      passDoc.issuedByFunction !== "generateSignedQrPass" ||
      passDoc.tenantUid !== payload.tenantId ||
      passDoc.propertyId !== payload.propertyId ||
      passDoc.unitId !== payload.unitId ||
      passDoc.revokedAt ||
      passDoc.deleted ||
      passDoc.rejectedAt
    ) {
      throw new HttpsError("failed-precondition", "Pass has been revoked or deleted.");
    }

    // Payload Enrichment
    let propertyName = "Unknown Property";
    let unitName = "***";

    if (payload.propertyId && payload.propertyId !== "default_prop") {
      try {
        const propSnap = await db.collection("properties").doc(payload.propertyId).get();
        if (propSnap.exists) {
          propertyName = propSnap.data()?.name || propSnap.data()?.title || "Property";
        }
      } catch(e) {}
    }

    if (payload.unitId && payload.unitId !== "default_unit") {
      try {
        const unitSnap = await db.collection("units").doc(payload.unitId).get();
        if (unitSnap.exists) {
          const uData = unitSnap.data();
          unitName = uData?.unitNumber || uData?.name || "***";
        }
      } catch(e) {}
    }

    return { 
      valid: true, 
      payload: {
        passId: payload.passId,
        type: payload.type,
        name: payload.name,
        validFrom: payload.validFrom,
        validUntil: payload.validUntil,
        propertyName,
        unitName
      } 
    };
  } catch (err: any) {
    if (err instanceof HttpsError) throw err;
    throw new HttpsError("invalid-argument", "Pass verification failed.");
  }
});

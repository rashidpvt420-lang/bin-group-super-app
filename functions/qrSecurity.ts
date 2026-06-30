import { onCall, HttpsError } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import * as admin from "firebase-admin";
import * as crypto from "crypto";

const db = admin.firestore();
const QR_SIGNING_SECRET = defineSecret("QR_SIGNING_SECRET");

function getQrSecret() {
  const secret = QR_SIGNING_SECRET.value();
  if (!secret) {
    throw new HttpsError("failed-precondition", "QR signing secret is not configured.");
  }
  return secret;
}

export const generateSignedQrPass = onCall({ cors: true, secrets: [QR_SIGNING_SECRET] }, async (request) => {
  const QR_SECRET = getQrSecret();
  if (!request.auth?.uid) {
    throw new HttpsError("unauthenticated", "User must be authenticated.");
  }
  
  const tenantId = request.auth.uid;
  const { propertyId, unitId, type, name, validFrom, validUntil } = request.data;
  
  if (!propertyId || !type || !validUntil) {
    throw new HttpsError("invalid-argument", "Missing required fields.");
  }

  const passId = db.collection("temp").doc().id; 
  
  // Create payload
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
  
  // Sign payload
  const hmac = crypto.createHmac("sha256", QR_SECRET);
  hmac.update(payloadStr);
  const signature = hmac.digest("hex");
  
  const token = Buffer.from(`${payloadStr}|${signature}`).toString("base64url");

  return { passId, token, signature };
});

export const verifyQrPass = onCall({ cors: true, secrets: [QR_SIGNING_SECRET] }, async (request) => {
  const QR_SECRET = getQrSecret();
  const { token } = request.data;
  if (!token) throw new HttpsError("invalid-argument", "Missing token.");

  try {
    const decoded = Buffer.from(token, "base64url").toString("utf-8");
    const [payloadStr, signature] = decoded.split("|");
    
    const hmac = crypto.createHmac("sha256", QR_SECRET);
    hmac.update(payloadStr);
    const expectedSignature = hmac.digest("hex");
    
    if (signature !== expectedSignature) {
      throw new HttpsError("permission-denied", "Invalid pass signature.");
    }

    const payload = JSON.parse(payloadStr);
    
    if (Date.now() > payload.validUntil) {
      throw new HttpsError("failed-precondition", "Pass has expired.");
    }
    
    // Live Status Check
    let passDoc: admin.firestore.DocumentData | null = null;
    
    const gatePassSnap = await db.collection("gatePasses").where("passId", "==", payload.passId).limit(1).get();
    if (!gatePassSnap.empty) {
      passDoc = gatePassSnap.docs[0].data();
    } else {
      const parkingSnap = await db.collection("visitorParkingRequests").where("passId", "==", payload.passId).limit(1).get();
      if (!parkingSnap.empty) {
        passDoc = parkingSnap.docs[0].data();
      }
    }

    if (!passDoc) {
      throw new HttpsError("not-found", "Pass record not found.");
    }

    const status = String(passDoc.status || "active").toLowerCase();
    if (status !== "active" && status !== "approved") {
      throw new HttpsError("failed-precondition", `Pass is not active (Status: ${status}).`);
    }
    if (passDoc.revokedAt || passDoc.deleted || passDoc.rejectedAt) {
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
    throw new HttpsError("invalid-argument", `Pass verification failed: ${err.message}`);
  }
});

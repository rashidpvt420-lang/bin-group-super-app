import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import * as crypto from "crypto";

const db = admin.firestore();
const ts = admin.firestore.FieldValue.serverTimestamp;

const QR_SECRET = process.env.QR_SIGNING_SECRET || "fallback_dev_secret_key_change_in_prod";

export const generateSignedQrPass = onCall({ cors: true }, async (request) => {
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

export const verifyQrPass = onCall({ cors: true }, async (request) => {
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
    
    return { valid: true, payload };
  } catch (err: any) {
    throw new HttpsError("invalid-argument", `Pass verification failed: ${err.message}`);
  }
});

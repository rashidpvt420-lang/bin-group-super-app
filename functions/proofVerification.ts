import * as admin from "firebase-admin";
import * as crypto from "crypto";
import { HttpsError, onCall } from "firebase-functions/v2/https";

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();
const WINDOW_MS = 60 * 1000;
const MAX_REQUESTS_PER_WINDOW = 20;

function normalizeHash(value: unknown) {
  const hash = String(value || "").trim().toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(hash)) {
    throw new HttpsError("invalid-argument", "A valid proof hash is required.");
  }
  return hash;
}

function proofCollection(value: unknown) {
  const type = String(value || "invoice").trim().toLowerCase();
  if (type === "contract") return "contract_registry";
  if (type === "invoice") return "invoice_registry";
  throw new HttpsError("invalid-argument", "Unsupported proof type.");
}

function callerKey(request: any) {
  const uid = request.auth?.uid ? `uid:${request.auth.uid}` : "";
  const ip = String(request.rawRequest?.ip || request.rawRequest?.headers?.["x-forwarded-for"] || "unknown")
    .split(",")[0]
    .trim()
    .slice(0, 80);
  const ua = String(request.rawRequest?.headers?.["user-agent"] || "unknown").slice(0, 160);
  return crypto.createHash("sha256").update(`${uid}|${ip}|${ua}`).digest("hex");
}

async function assertRateLimit(request: any, customDb = db) {
  const key = callerKey(request);
  const ref = customDb.collection("publicProofVerificationRateLimits").doc(key);
  const nowMs = Date.now();
  await customDb.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const data = snap.data() || {};
    const windowStartedAtMs = Number(data.windowStartedAtMs || 0);
    const inSameWindow = Number.isFinite(windowStartedAtMs) && nowMs - windowStartedAtMs < WINDOW_MS;
    const count = inSameWindow ? Number(data.count || 0) : 0;
    if (count >= MAX_REQUESTS_PER_WINDOW) {
      throw new HttpsError("resource-exhausted", "Too many verification attempts. Try again shortly.");
    }
    tx.set(ref, {
      count: count + 1,
      windowStartedAtMs: inSameWindow ? windowStartedAtMs : nowMs,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
  });
}

export async function runVerifyPublicProof(data: any, auth: any, rawRequest: any, customDb = db) {
  await assertRateLimit({ auth, rawRequest }, customDb);
  const hash = normalizeHash(data?.hash);
  const collectionName = proofCollection(data?.type);
  const snap = await customDb.collection(collectionName).doc(hash).get();
  return { verified: snap.exists === true };
}

export const verifyPublicProof = onCall(
  { cors: true, region: "europe-west3", enforceAppCheck: true },
  async (request) => {
    return runVerifyPublicProof(request.data, request.auth, request.rawRequest);
  },
);


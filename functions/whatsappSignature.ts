import * as crypto from "crypto";
import type { Request } from "firebase-functions/v2/https";

/**
 * Verifies Meta's X-Hub-Signature-256 HMAC on an inbound WhatsApp Cloud API webhook.
 * Fails closed when WHATSAPP_APP_SECRET is unavailable. Production traffic
 * must never bypass provider authentication because configuration is missing.
 */
export function verifyWhatsAppSignature(req: Request, appSecret: string | undefined): boolean {
  if (!appSecret) {
    console.error("WhatsApp webhook: WHATSAPP_APP_SECRET is not configured.");
    return false;
  }

  const header = req.headers["x-hub-signature-256"];
  const signatureHeader = Array.isArray(header) ? header[0] : header;
  if (!signatureHeader || !signatureHeader.startsWith("sha256=")) return false;

  const expectedHex = crypto.createHmac("sha256", appSecret).update(req.rawBody).digest("hex");
  const providedHex = signatureHeader.slice("sha256=".length);

  const expectedBuf = Buffer.from(expectedHex, "hex");
  const providedBuf = Buffer.from(providedHex, "hex");
  if (expectedBuf.length !== providedBuf.length) return false;

  return crypto.timingSafeEqual(expectedBuf, providedBuf);
}

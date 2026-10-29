// Official BIN GROUP seal, signatory block, verification QR and issued-document registry.
//
// Only server code adds the seal: the client never receives a "stamp" capability, it can only
// download a document the server rendered and registered. Every issued document gets an id and the
// SHA-256 of its exact bytes in `issued_document_registry` (server-only, deny-all in Firestore rules).
// A public page can confirm an id + file hash through `verifyIssuedDocument`, which returns no
// personal data.
//
// SWAPPING IN THE REAL STAMP / SIGNATORY (small config + asset change):
//   1. Put the transparent PNG at functions/assets/company-stamp/<file>.png
//   2. Set COMPANY_SEAL_CONFIG.stampImageFile to that file name.
//   3. Set COMPANY_SEAL_CONFIG.signatoryName / signatoryTitle (and the Arabic fields).
// Until then a drawn text seal marked "Digitally issued" is used.
import * as admin from "firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { randomUUID } from "crypto";
import * as fs from "fs";
import * as path from "path";
import qrcode from "qrcode-generator";

if (!admin.apps.length) admin.initializeApp();

export const COMPANY_SEAL_CONFIG = {
    companyName: "BIN GROUP L.L.C - S.P.C",
    sealHeadline: "BIN GROUP",
    sealLabel: "Digitally issued",
    sealLabelAr: "صادر رقمياً",
    /** File name inside functions/assets/company-stamp/, or null to use the drawn text seal. */
    stampImageFile: null as string | null,
    signatoryName: "Authorised Signatory (name to be confirmed)",
    signatoryTitle: "For and on behalf of BIN GROUP L.L.C - S.P.C",
    signatoryNameAr: "المفوض بالتوقيع",
    signatoryTitleAr: "نيابة عن مجموعة بن",
    verifyBaseUrl: "https://bin-groups.com/verify/document",
};

export const ISSUED_DOCUMENT_REGISTRY = "issued_document_registry";
export const ISSUED_DOCUMENT_ID_PATTERN = /^(stmt|ctr)_[a-f0-9]{32}$/;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;

const SEAL_GOLD = "#B08D3C";
const SEAL_INK = "#111827";
const SEAL_MUTED = "#6B7280";

export type IssuedDocumentType = "money_statement" | "owner_service_agreement";

export function newIssuedDocumentId(prefix: "stmt" | "ctr"): string {
    // crypto.randomUUID is cryptographically random (not a guessable pseudo-random id).
    return `${prefix}_${randomUUID().replace(/-/g, "")}`;
}

export function verificationUrl(documentId: string): string {
    return `${COMPANY_SEAL_CONFIG.verifyBaseUrl}/${encodeURIComponent(documentId)}`;
}

function stampImagePath(): string | null {
    const file = COMPANY_SEAL_CONFIG.stampImageFile;
    if (!file) return null;
    const candidate = path.join(__dirname, "..", "assets", "company-stamp", path.basename(file));
    return fs.existsSync(candidate) ? candidate : null;
}

type BidiWriter = (doc: any, text: string, x?: number | null, y?: number | null, options?: Record<string, any>) => void;

/**
 * Draws the company seal (real stamp image when configured, otherwise a text seal) and the
 * authorised-signatory block. Occupies roughly 190 x 125 pt starting at (x, y).
 */
export function drawCompanySeal(doc: any, x: number, y: number, opts: { documentId: string; issuedAtIso: string; writeBidi?: BidiWriter }) {
    const imagePath = stampImagePath();
    const cx = x + 95;
    const cy = y + 42;
    if (imagePath) {
        doc.image(imagePath, cx - 40, cy - 40, { fit: [80, 80], align: "center", valign: "center" });
    } else {
        doc.save();
        doc.lineWidth(1.6).strokeColor(SEAL_GOLD).circle(cx, cy, 40).stroke();
        doc.lineWidth(0.6).circle(cx, cy, 35).stroke();
        doc.fillColor(SEAL_GOLD).fontSize(9).text(COMPANY_SEAL_CONFIG.sealHeadline, cx - 34, cy - 20, { width: 68, align: "center", lineBreak: false });
        doc.fontSize(6.5).text(COMPANY_SEAL_CONFIG.sealLabel.toUpperCase(), cx - 34, cy - 7, { width: 68, align: "center", lineBreak: false });
        if (opts.writeBidi) {
            doc.fontSize(7);
            opts.writeBidi(doc, COMPANY_SEAL_CONFIG.sealLabelAr, cx - 34, cy + 2, { width: 68, align: "center" });
        }
        doc.fontSize(5.5).text(opts.issuedAtIso.slice(0, 10), cx - 34, cy + 16, { width: 68, align: "center", lineBreak: false });
        doc.restore();
    }
    const lineY = y + 92;
    doc.strokeColor("#9CA3AF").lineWidth(0.8).moveTo(x, lineY).lineTo(x + 190, lineY).stroke();
    doc.fillColor(SEAL_INK).fontSize(8).text(COMPANY_SEAL_CONFIG.signatoryName, x, lineY + 4, { width: 190, lineBreak: false });
    doc.fillColor(SEAL_MUTED).fontSize(7).text(COMPANY_SEAL_CONFIG.signatoryTitle, x, lineY + 15, { width: 190, lineBreak: false });
    if (opts.writeBidi) {
        doc.fontSize(7);
        opts.writeBidi(doc, `${COMPANY_SEAL_CONFIG.signatoryNameAr} - ${COMPANY_SEAL_CONFIG.signatoryTitleAr}`, x, lineY + 25, { width: 190, align: "right" });
    }
}

/** Draws a QR code of `text` as vector squares at (x, y) with the given side length. */
export function drawVerificationQr(doc: any, text: string, x: number, y: number, size: number) {
    const qr = qrcode(0, "M");
    qr.addData(text);
    qr.make();
    const count = qr.getModuleCount();
    const cell = size / count;
    doc.save();
    doc.rect(x - 2, y - 2, size + 4, size + 4).fill("#FFFFFF");
    doc.fillColor("#000000");
    for (let r = 0; r < count; r += 1) {
        for (let c = 0; c < count; c += 1) {
            if (qr.isDark(r, c)) doc.rect(x + c * cell, y + r * cell, cell + 0.05, cell + 0.05);
        }
    }
    doc.fill();
    doc.restore();
}

export type IssuedDocumentRecord = {
    documentId: string;
    documentType: IssuedDocumentType;
    subjectUid: string;
    sha256: string;
    byteLength: number;
    format: "pdf" | "csv";
    issuedAtIso: string;
    periodFrom?: string;
    periodTo?: string;
    sourceRef?: string;
    rowCount?: number;
};

export async function registerIssuedDocument(record: IssuedDocumentRecord) {
    if (!ISSUED_DOCUMENT_ID_PATTERN.test(record.documentId)) throw new Error("Invalid issued document id.");
    if (!SHA256_PATTERN.test(record.sha256)) throw new Error("Invalid document hash.");
    await admin.firestore().collection(ISSUED_DOCUMENT_REGISTRY).doc(record.documentId).create({
        ...record,
        issuer: COMPANY_SEAL_CONFIG.companyName,
        sealMode: COMPANY_SEAL_CONFIG.stampImageFile ? "stamp_image" : "text_seal",
        signatoryName: COMPANY_SEAL_CONFIG.signatoryName,
        status: "issued",
        createdAt: FieldValue.serverTimestamp(),
    });
}

const PUBLIC_TYPE_LABEL: Record<string, string> = {
    money_statement: "Statement of account",
    owner_service_agreement: "Owner service agreement",
};

/**
 * Public verification. Requires App Check (real app/site), not sign-in, so a bank or tenant can
 * check a printed document. Returns only issuer, type, issue date, period and whether the hash
 * matches; never names, uids, amounts or storage paths.
 */
export const verifyIssuedDocument = onCall({ cors: true, enforceAppCheck: true, region: "europe-west3", timeoutSeconds: 15 }, async (request) => {
    const documentId = String(request.data?.documentId || "").trim().toLowerCase();
    const sha256 = String(request.data?.sha256 || "").trim().toLowerCase();
    if (!ISSUED_DOCUMENT_ID_PATTERN.test(documentId)) throw new HttpsError("invalid-argument", "Enter a valid document ID.");
    if (sha256 && !SHA256_PATTERN.test(sha256)) throw new HttpsError("invalid-argument", "Invalid file fingerprint.");
    const snap = await admin.firestore().collection(ISSUED_DOCUMENT_REGISTRY).doc(documentId).get();
    if (!snap.exists) return { found: false, documentId };
    const data = snap.data() || {};
    return {
        found: true,
        documentId,
        issuer: String(data.issuer || COMPANY_SEAL_CONFIG.companyName),
        documentType: PUBLIC_TYPE_LABEL[String(data.documentType)] || "Document",
        format: data.format === "csv" ? "csv" : "pdf",
        issuedAt: String(data.issuedAtIso || ""),
        periodFrom: data.periodFrom ? String(data.periodFrom) : null,
        periodTo: data.periodTo ? String(data.periodTo) : null,
        status: String(data.status || "issued"),
        hashChecked: Boolean(sha256),
        hashMatches: sha256 ? sha256 === String(data.sha256 || "") : null,
    };
});

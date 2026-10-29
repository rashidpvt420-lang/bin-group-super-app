// Official money statements (PDF / CSV, English or Arabic) for the signed-in user's own records.
//
// Security model:
//   - enforceAppCheck + signed in + active (not disabled / suspended) account.
//   - The subject is ALWAYS request.auth.uid. Any uid / account / email in the request is ignored,
//     so nobody (including admins) can pull another user's statement through this callable.
//   - Every query filters on a uid-owned field; nothing scans other users' data.
//   - The file is returned to the caller directly (not stored); only its SHA-256 and non-sensitive
//     metadata are written to the server-only issued_document_registry for public verification.
import * as admin from "firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { createHash } from "crypto";
import { bidiText, getCairoFont, loadPdfKit } from "./pdfEngine";
import {
    COMPANY_SEAL_CONFIG, drawCompanySeal, drawVerificationQr, newIssuedDocumentId, registerIssuedDocument, verificationUrl,
} from "./companySeal";
import {
    MAX_STATEMENT_ROWS, STATEMENT_LABELS, StatementLanguage, StatementRow, StatementSourceRecord,
    buildStatementRows, parseStatementRange, statementCsv, statementTotals,
} from "./moneyStatementCore";

if (!admin.apps.length) admin.initializeApp();

const DAILY_LIMIT = 20;
const PER_QUERY_LIMIT = 1000;

/** Collection + uid-owned field pairs. Every pair is scoped to the caller's uid. */
export const STATEMENT_SOURCES: Array<{ collection: string; field: string }> = [
    { collection: "invoices", field: "ownerId" },
    { collection: "invoices", field: "payerId" },
    { collection: "payment_transactions", field: "ownerId" },
    { collection: "payment_transactions", field: "tenantId" },
    { collection: "payment_transactions", field: "payerId" },
    { collection: "transactions", field: "ownerId" },
    { collection: "transactions", field: "techId" },
    { collection: "payment_collection_records", field: "payerUid" },
    { collection: "payroll_entries", field: "technicianId" },
    { collection: "broker_commissions", field: "brokerId" },
    { collection: "broker_payout_requests", field: "brokerId" },
];

async function assertActiveAccount(uid: string, token: Record<string, unknown>) {
    const user = await admin.auth().getUser(uid);
    if (user.disabled || token.suspended === true || user.customClaims?.suspended === true) {
        throw new HttpsError("permission-denied", "This account is disabled or suspended.");
    }
    return user;
}

async function consumeDailyQuota(uid: string, today: string) {
    const ref = admin.firestore().collection("money_statement_rate_limits").doc(uid);
    await admin.firestore().runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        const data = snap.data() || {};
        const count = data.day === today ? Number(data.count || 0) : 0;
        if (count >= DAILY_LIMIT) throw new HttpsError("resource-exhausted", "Daily statement limit reached. Try again tomorrow.");
        tx.set(ref, { day: today, count: count + 1, updatedAt: FieldValue.serverTimestamp() });
    });
}

async function loadOwnRecords(uid: string) {
    const db = admin.firestore();
    const records: StatementSourceRecord[] = [];
    for (const source of STATEMENT_SOURCES) {
        const snap = await db.collection(source.collection).where(source.field, "==", uid).limit(PER_QUERY_LIMIT).get();
        snap.forEach((d) => records.push({ collection: source.collection, id: d.id, data: d.data() || {} }));
    }
    const voids: Record<string, Record<string, any>> = {};
    const collectionIds = records.filter((r) => r.collection === "payment_collection_records").map((r) => r.id);
    for (let i = 0; i < collectionIds.length; i += 100) {
        const refs = collectionIds.slice(i, i + 100).map((id) => db.collection("payment_collection_voids").doc(id));
        if (!refs.length) continue;
        const snaps = await db.getAll(...refs);
        for (const s of snaps) {
            // A void counts only when it belongs to the same payer.
            if (s.exists && s.data()?.payerUid === uid) voids[s.id] = s.data() || {};
        }
    }
    return { records, voids };
}

function money(n: number) {
    return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export async function renderStatementPdf(rows: StatementRow[], meta: {
    documentId: string; holder: string; role: string; from: string; to: string; issuedAtIso: string; language: StatementLanguage;
}): Promise<Buffer> {
    const PDFDocument = await loadPdfKit();
    const font = await getCairoFont();
    const L = STATEMENT_LABELS[meta.language];
    const totals = statementTotals(rows);
    const url = verificationUrl(meta.documentId);
    return new Promise<Buffer>((resolve, reject) => {
        const doc = new (PDFDocument as any)({ margin: 40, size: "A4", info: { Title: `BIN GROUP ${STATEMENT_LABELS.en.title} ${meta.documentId}`, Author: COMPANY_SEAL_CONFIG.companyName } });
        const chunks: Buffer[] = [];
        doc.on("data", (c: Buffer) => chunks.push(c));
        doc.on("error", reject);
        doc.on("end", () => resolve(Buffer.concat(chunks)));
        doc.registerFont("Cairo", font);
        doc.font("Cairo");
        const write = (text: string, x: number, y: number, options: Record<string, any> = {}) => bidiText(doc, text, x, y, options);

        doc.fillColor("#C6A75E").fontSize(18).text(COMPANY_SEAL_CONFIG.companyName, 40, 40, { width: 515, align: "center" });
        doc.fillColor("#111827").fontSize(12);
        write(`${STATEMENT_LABELS.en.title} / ${STATEMENT_LABELS.ar.title}`, 40, 66, { width: 515, align: "center" });
        doc.fontSize(9).fillColor("#374151");
        const metaLines: Array<[string, string]> = [
            [L.statementId, meta.documentId],
            [L.holder, meta.holder],
            [L.role, meta.role],
            [L.period, `${meta.from} - ${meta.to}`],
            [L.generated, `${meta.issuedAtIso} (UTC)`],
        ];
        let y = 96;
        for (const [label, value] of metaLines) {
            write(`${label}: ${value}`, 40, y, { width: 400, align: meta.language === "ar" ? "right" : "left" });
            y += 14;
        }
        drawVerificationQr(doc, url, 480, 92, 72);

        y = Math.max(y, 170) + 6;
        doc.fontSize(9).fillColor("#111827");
        const summary: Array<[string, string]> = [
            [L.moneyIn, `${L.currency} ${money(totals.moneyIn)}`],
            [L.moneyOut, `${L.currency} ${money(totals.moneyOut)}`],
            [L.net, `${L.currency} ${money(totals.net)}`],
            [L.invoiced, `${L.currency} ${money(totals.invoiced)}`],
            [L.voided, String(totals.voidedCount)],
        ];
        summary.forEach(([label, value], i) => {
            const x = 40 + i * 103;
            doc.rect(x, y, 99, 34).strokeColor("#E5E7EB").stroke();
            doc.fontSize(7).fillColor("#6B7280");
            write(label, x + 4, y + 4, { width: 91 });
            doc.fontSize(9).fillColor("#111827");
            write(value, x + 4, y + 17, { width: 91 });
        });
        y += 46;

        const cols = [
            { key: "date", label: L.date, x: 40, w: 62 },
            { key: "description", label: L.description, x: 104, w: 165 },
            { key: "reference", label: L.reference, x: 271, w: 92 },
            { key: "status", label: L.status, x: 365, w: 55 },
            { key: "in", label: L.moneyIn, x: 422, w: 66 },
            { key: "out", label: L.moneyOut, x: 490, w: 65 },
        ];
        const header = () => {
            doc.rect(40, y, 515, 16).fill("#F3F4F6");
            doc.fillColor("#111827").fontSize(7.5);
            for (const c of cols) write(c.label, c.x + 2, y + 3, { width: c.w - 4 });
            y += 18;
        };
        header();
        if (!rows.length) {
            doc.fontSize(9).fillColor("#6B7280");
            write(L.empty, 40, y + 4, { width: 515, align: "center" });
            y += 24;
        }
        for (const row of rows) {
            if (y > 740) { doc.addPage(); y = 40; header(); }
            const amount = money(row.amount);
            const values: Record<string, string> = {
                date: row.date,
                description: row.description,
                reference: row.reference,
                status: row.status,
                in: row.direction === "in" ? amount : row.direction === "info" ? `(${amount})` : "",
                out: row.direction === "out" ? amount : "",
            };
            doc.fontSize(7).fillColor(row.voided ? "#9CA3AF" : "#111827");
            for (const c of cols) {
                if (c.key === "description") write(values.description.slice(0, 42), c.x + 2, y, { width: c.w - 4, lineBreak: false });
                else doc.text(values[c.key], c.x + 2, y, { width: c.w - 4, height: 11, ellipsis: true, lineBreak: false });
            }
            if (row.voided) doc.moveTo(c0(cols), y + 4).lineTo(555, y + 4).strokeColor("#9CA3AF").lineWidth(0.4).stroke();
            y += 13;
        }

        if (y > 600) { doc.addPage(); y = 40; }
        y += 10;
        doc.fontSize(7).fillColor("#6B7280");
        write(L.note, 40, y, { width: 515 });
        y = Math.max(doc.y, y + 12) + 8;
        drawCompanySeal(doc, 365, y, { documentId: meta.documentId, issuedAtIso: meta.issuedAtIso, writeBidi: bidiText });
        drawVerificationQr(doc, url, 40, y + 4, 80);
        doc.fontSize(7).fillColor("#374151");
        write(`${L.verify}:`, 130, y + 10, { width: 220 });
        doc.text(url, 130, y + 22, { width: 220 });
        doc.text(`${L.statementId}: ${meta.documentId}`, 130, y + 46, { width: 220 });
        doc.end();
    });
}

function c0(cols: Array<{ x: number }>) { return cols[0].x; }

export const generateMyMoneyStatement = onCall({ cors: true, enforceAppCheck: true, region: "europe-west3", timeoutSeconds: 60, memory: "512MiB" }, async (request) => {
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError("unauthenticated", "Sign in to download your statement.");
    const token = (request.auth?.token || {}) as Record<string, unknown>;
    const user = await assertActiveAccount(uid, token);

    const format = request.data?.format === "csv" ? "csv" : "pdf";
    const language: StatementLanguage = request.data?.language === "ar" ? "ar" : "en";
    let range;
    try {
        range = parseStatementRange(request.data?.from, request.data?.to);
    } catch (err: any) {
        throw new HttpsError("invalid-argument", String(err?.message || "Invalid period."));
    }

    const issuedAt = new Date();
    await consumeDailyQuota(uid, issuedAt.toISOString().slice(0, 10));

    const { records, voids } = await loadOwnRecords(uid);
    const rows = buildStatementRows(uid, records, voids, range);
    if (rows.length > MAX_STATEMENT_ROWS) throw new HttpsError("failed-precondition", "Too many records for one statement. Choose a shorter period.");

    const documentId = newIssuedDocumentId("stmt");
    const issuedAtIso = issuedAt.toISOString().replace(/\.\d{3}Z$/, "Z");
    const holder = String(user.displayName || token.name || user.email || "Account holder").slice(0, 80);
    const role = String(token.role || user.customClaims?.role || "member").slice(0, 30);
    const meta = { documentId, holder, role, from: range.from, to: range.to, issuedAtIso, language };

    const bytes = format === "csv"
        ? Buffer.from(statementCsv(rows, { ...meta, verifyUrl: verificationUrl(documentId) }), "utf8")
        : await renderStatementPdf(rows, meta);
    const sha256 = createHash("sha256").update(bytes).digest("hex");

    await registerIssuedDocument({
        documentId, documentType: "money_statement", subjectUid: uid, sha256, byteLength: bytes.length, format,
        issuedAtIso, periodFrom: range.from, periodTo: range.to, rowCount: rows.length,
    });

    const totals = statementTotals(rows);
    return {
        documentId,
        format,
        fileName: `BIN-GROUP-statement-${range.from}-to-${range.to}-${documentId}.${format}`,
        contentType: format === "csv" ? "text/csv;charset=utf-8" : "application/pdf",
        base64: bytes.toString("base64"),
        sha256,
        verifyUrl: verificationUrl(documentId),
        totals,
    };
});

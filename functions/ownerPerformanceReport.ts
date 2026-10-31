/**
 * Monthly owner performance report (PDF, EN or AR).
 * Subject is always the signed-in owner (request.auth.uid); no other uid is accepted.
 * Data: the owner's own money records, units, and maintenance tickets for properties the owner owns.
 * Nothing is estimated: empty sections say so. The PDF hash is stored in issued_document_registry
 * so the QR code verifies it, the same way money statements work.
 */
import * as admin from "firebase-admin";
import { FieldPath, FieldValue } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { createHash } from "crypto";
import { bidiText, getCairoFont, loadPdfKit } from "./pdfEngine";
import { COMPANY_SEAL_CONFIG, drawCompanySeal, drawVerificationQr, newIssuedDocumentId, registerIssuedDocument, verificationUrl } from "./companySeal";
import { StatementSourceRecord } from "./moneyStatementCore";
import { REPORT_LABELS, ReportLanguage, TicketRecord, UnitRecord, buildOwnerReport, parseReportMonth } from "./ownerPerformanceReportCore";

if (!admin.apps.length) admin.initializeApp();

const DAILY_LIMIT = 10;
const PER_QUERY_LIMIT = 1000;
const MAX_PROPERTIES = 300;

/** Only owner-side money fields, all equal to the caller's uid. */
export const OWNER_REPORT_MONEY_SOURCES: Array<{ collection: string; field: string }> = [
    { collection: "invoices", field: "ownerId" },
    { collection: "invoices", field: "payerId" },
    { collection: "payment_transactions", field: "ownerId" },
    { collection: "payment_transactions", field: "payerId" },
    { collection: "transactions", field: "ownerId" },
    { collection: "payment_collection_records", field: "payerUid" },
];

async function assertActiveOwner(auth: any) {
    if (!auth?.uid) throw new HttpsError("unauthenticated", "Sign in to download your report.");
    const role = String(auth.token?.role || auth.token?.userRole || auth.token?.primaryRole || "").toLowerCase();
    const user = await admin.auth().getUser(auth.uid);
    if (role !== "owner" || user.disabled || auth.token?.suspended === true || user.customClaims?.suspended === true) {
        throw new HttpsError("permission-denied", "An active owner account is required.");
    }
    return user;
}

async function consumeDailyQuota(uid: string, today: string) {
    const ref = admin.firestore().collection("owner_report_rate_limits").doc(uid);
    await admin.firestore().runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        const data = snap.data() || {};
        const count = data.day === today ? Number(data.count || 0) : 0;
        if (count >= DAILY_LIMIT) throw new HttpsError("resource-exhausted", "Daily report limit reached. Try again tomorrow.");
        tx.set(ref, { day: today, count: count + 1, updatedAt: FieldValue.serverTimestamp() });
    });
}

async function queryAll(collection: string, field: string, value: string) {
    const db = admin.firestore();
    const out: admin.firestore.QueryDocumentSnapshot[] = [];
    let last: admin.firestore.QueryDocumentSnapshot | undefined;
    for (;;) {
        let q = db.collection(collection).where(field, "==", value).orderBy(FieldPath.documentId()).limit(PER_QUERY_LIMIT);
        if (last) q = q.startAfter(last);
        const snap = await q.get();
        out.push(...snap.docs);
        if (snap.size < PER_QUERY_LIMIT) break;
        last = snap.docs[snap.docs.length - 1];
    }
    return out;
}

export async function loadOwnerReportData(uid: string) {
    const db = admin.firestore();
    const moneyRecords: StatementSourceRecord[] = [];
    for (const s of OWNER_REPORT_MONEY_SOURCES) {
        for (const d of await queryAll(s.collection, s.field, uid)) moneyRecords.push({ collection: s.collection, id: d.id, data: d.data() || {} });
    }
    const voids: Record<string, Record<string, any>> = {};
    const pcr = moneyRecords.filter((r) => r.collection === "payment_collection_records").map((r) => r.id);
    for (let i = 0; i < pcr.length; i += 100) {
        const snaps = await db.getAll(...pcr.slice(i, i + 100).map((id) => db.collection("payment_collection_voids").doc(id)));
        for (const s of snaps) if (s.exists && s.data()?.payerUid === uid) voids[s.id] = s.data() || {};
    }

    const properties = (await queryAll("properties", "ownerId", uid)).slice(0, MAX_PROPERTIES);
    const propertyIds = properties.map((p) => p.id);

    const unitMap = new Map<string, UnitRecord>();
    for (const d of await queryAll("units", "ownerId", uid)) unitMap.set(d.id, { id: d.id, data: d.data() || {} });
    const ticketMap = new Map<string, TicketRecord>();
    for (const d of await queryAll("maintenanceTickets", "ownerId", uid)) ticketMap.set(d.id, { id: d.id, data: d.data() || {} });
    for (let i = 0; i < propertyIds.length; i += 30) {
        const chunk = propertyIds.slice(i, i + 30);
        const [units, tickets] = await Promise.all([
            db.collection("units").where("propertyId", "in", chunk).limit(PER_QUERY_LIMIT).get(),
            db.collection("maintenanceTickets").where("propertyId", "in", chunk).limit(PER_QUERY_LIMIT).get(),
        ]);
        // Rows found by propertyId must also not name a different owner.
        const mine = (data: any) => !data?.ownerId || data.ownerId === uid;
        units.forEach((d) => { if (mine(d.data())) unitMap.set(d.id, { id: d.id, data: d.data() || {} }); });
        tickets.forEach((d) => { if (mine(d.data())) ticketMap.set(d.id, { id: d.id, data: d.data() || {} }); });
    }
    return { moneyRecords, voids, units: [...unitMap.values()], tickets: [...ticketMap.values()], propertyCount: properties.length };
}

const money = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export async function renderOwnerReportPdf(report: ReturnType<typeof buildOwnerReport>, meta: {
    documentId: string; holder: string; month: string; issuedAtIso: string; language: ReportLanguage;
}): Promise<Buffer> {
    const PDFDocument = await loadPdfKit();
    const font = await getCairoFont();
    const L = REPORT_LABELS[meta.language];
    const rtl = meta.language === "ar";
    const url = verificationUrl(meta.documentId);
    return new Promise<Buffer>((resolve, reject) => {
        const doc = new (PDFDocument as any)({ margin: 40, size: "A4", info: { Title: `BIN GROUP ${REPORT_LABELS.en.title} ${meta.month} ${meta.documentId}`, Author: COMPANY_SEAL_CONFIG.companyName } });
        const chunks: Buffer[] = [];
        doc.on("data", (c: Buffer) => chunks.push(c));
        doc.on("error", reject);
        doc.on("end", () => resolve(Buffer.concat(chunks)));
        doc.registerFont("Cairo", font);
        doc.font("Cairo");
        const write = (t: string, x: number, yy: number, o: Record<string, any> = {}) => bidiText(doc, t, x, yy, o);
        const align = rtl ? "right" : "left";
        let y = 40;
        const ensure = (h: number) => { if (y + h > 760) { doc.addPage(); y = 40; } };
        const heading = (t: string) => { ensure(40); y += 8; doc.fontSize(11).fillColor("#111827"); write(t, 40, y, { width: 515, align }); y += 18; };
        const empty = (t: string) => { doc.fontSize(9).fillColor("#4B5563"); write(t, 40, y, { width: 515, align }); y += 16; };

        doc.fillColor("#8A6D1F").fontSize(18).text(COMPANY_SEAL_CONFIG.companyName, 40, y, { width: 515, align: "center" });
        y += 26;
        doc.fillColor("#111827").fontSize(12);
        write(`${REPORT_LABELS.en.title} / ${REPORT_LABELS.ar.title}`, 40, y, { width: 515, align: "center" });
        y += 28;
        doc.fontSize(9).fillColor("#374151");
        for (const [k, v] of [[L.reportId, meta.documentId], [L.owner, meta.holder], [L.month, meta.month], [L.generated, `${meta.issuedAtIso} (UTC)`], [L.properties, String(report.propertyCount)]]) {
            write(`${k}: ${v}`, 40, y, { width: 400, align }); y += 14;
        }
        drawVerificationQr(doc, url, 480, 80, 72);
        y = Math.max(y, 160) + 6;

        const boxes: Array<[string, string]> = [
            [L.income, `${L.currency} ${money(report.income.total)}`],
            [L.costs, `${L.currency} ${money(report.costs.total)}`],
            [L.net, `${L.currency} ${money(report.net)}`],
            [L.rate, report.occupancy.ratePct == null ? L.notRecorded : `${report.occupancy.ratePct}%`],
            [L.repairCost, `${L.currency} ${money(report.repairs.recordedCostTotal)}`],
        ];
        boxes.forEach(([k, v], i) => {
            const x = 40 + i * 103;
            doc.rect(x, y, 99, 38).strokeColor("#D1D5DB").stroke();
            doc.fontSize(7).fillColor("#4B5563"); write(k, x + 4, y + 4, { width: 91 });
            doc.fontSize(9).fillColor("#111827"); write(v, x + 4, y + 21, { width: 91 });
        });
        y += 48;

        const table = (rows: Array<{ date: string; description: string; reference: string; amount: string }>, emptyText: string) => {
            if (!rows.length) return empty(emptyText);
            const cols = [{ k: "date", l: L.date, x: 40, w: 70 }, { k: "description", l: L.description, x: 112, w: 220 }, { k: "reference", l: L.reference, x: 334, w: 130 }, { k: "amount", l: L.amount, x: 466, w: 89 }];
            const header = () => { doc.rect(40, y, 515, 16).fill("#F3F4F6"); doc.fillColor("#111827").fontSize(7.5); for (const c of cols) write(c.l, c.x + 2, y + 3, { width: c.w - 4 }); y += 18; };
            header();
            for (const r of rows) {
                if (y > 750) { doc.addPage(); y = 40; header(); }
                doc.fontSize(7).fillColor("#111827");
                for (const c of cols) write(String((r as any)[c.k]).slice(0, 60), c.x + 2, y, { width: c.w - 4, lineBreak: false });
                y += 13;
            }
        };
        heading(L.income);
        table(report.income.rows.map((r) => ({ date: r.date, description: r.description, reference: r.reference, amount: money(r.amount) })), L.incomeEmpty);
        heading(L.costs);
        table(report.costs.rows.map((r) => ({ date: r.date, description: r.description, reference: r.reference, amount: money(r.amount) })), L.costsEmpty);

        heading(L.occupancy);
        const o = report.occupancy;
        if (!o.total) empty(L.unitsEmpty);
        else { doc.fontSize(9).fillColor("#111827"); write(`${L.occupied}: ${o.occupied}   ${L.vacant}: ${o.vacant}   ${L.unknown}: ${o.unknown}   ${L.rate}: ${o.ratePct == null ? L.notRecorded : o.ratePct + "%"}`, 40, y, { width: 515, align }); y += 16; }

        heading(L.repairs);
        const rp = report.repairs;
        doc.fontSize(9).fillColor("#111827");
        write(`${L.opened}: ${rp.opened}   ${L.completed}: ${rp.completed}   ${L.open}: ${rp.open}`, 40, y, { width: 515, align }); y += 16;
        table(rp.rows.map((r) => ({ date: r.date, description: `${r.title} (${r.status})`, reference: r.id, amount: r.cost == null ? L.notRecorded : money(r.cost) })), L.repairsEmpty);

        ensure(150);
        y += 10;
        doc.fontSize(7).fillColor("#4B5563"); write(L.note, 40, y, { width: 515, align });
        y = Math.max(doc.y, y + 12) + 8;
        drawCompanySeal(doc, 365, y, { documentId: meta.documentId, issuedAtIso: meta.issuedAtIso, writeBidi: bidiText });
        drawVerificationQr(doc, url, 40, y + 4, 80);
        doc.fontSize(7).fillColor("#374151");
        write(`${L.verify}:`, 130, y + 10, { width: 220 });
        doc.text(url, 130, y + 22, { width: 220 });
        doc.text(`${L.reportId}: ${meta.documentId}`, 130, y + 46, { width: 220 });
        doc.text("Made in UAE", 40, 800, { width: 515, align: "center" });
        doc.end();
    });
}

export const generateMyOwnerPerformanceReport = onCall({ cors: true, enforceAppCheck: true, region: "europe-west3", timeoutSeconds: 60, memory: "512MiB" }, async (request) => {
    const user = await assertActiveOwner(request.auth);
    const uid = request.auth!.uid;
    const language: ReportLanguage = request.data?.language === "ar" ? "ar" : "en";
    let range;
    try { range = parseReportMonth(request.data?.month); } catch (err: any) { throw new HttpsError("invalid-argument", String(err?.message || "Invalid month.")); }

    const issuedAt = new Date();
    await consumeDailyQuota(uid, issuedAt.toISOString().slice(0, 10));
    const data = await loadOwnerReportData(uid);
    const report = buildOwnerReport(uid, data, range);

    const documentId = newIssuedDocumentId("rpt");
    const issuedAtIso = issuedAt.toISOString().replace(/\.\d{3}Z$/, "Z");
    const holder = String(user.displayName || user.email || "Owner").slice(0, 80);
    const bytes = await renderOwnerReportPdf(report, { documentId, holder, month: range.month, issuedAtIso, language });
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    await registerIssuedDocument({
        documentId, documentType: "owner_performance_report", subjectUid: uid, sha256, byteLength: bytes.length, format: "pdf",
        issuedAtIso, periodFrom: range.from, periodTo: range.to, rowCount: report.income.rows.length + report.costs.rows.length + report.repairs.rows.length,
    });
    return {
        documentId, month: range.month, language,
        fileName: `BIN-GROUP-owner-report-${range.month}-${language}-${documentId}.pdf`,
        contentType: "application/pdf",
        base64: bytes.toString("base64"),
        sha256,
        verifyUrl: verificationUrl(documentId),
        summary: {
            income: report.income.total, costs: report.costs.total, net: report.net,
            occupancy: report.occupancy, repairs: { opened: report.repairs.opened, completed: report.repairs.completed, open: report.repairs.open, recordedCostTotal: report.repairs.recordedCostTotal },
            hasAnyData: report.hasAnyData,
        },
    };
});

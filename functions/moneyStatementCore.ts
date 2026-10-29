// Pure helpers for money statements (no Firebase imports, unit-testable with --experimental-strip-types).

export type StatementLanguage = "en" | "ar";
export type StatementFormat = "pdf" | "csv";
export type StatementDirection = "in" | "out" | "info";

export type StatementSourceRecord = { collection: string; id: string; data: Record<string, any> };

export type StatementRow = {
    date: string; // YYYY-MM-DD (Asia/Dubai)
    section: StatementSection;
    collection: string;
    reference: string;
    description: string;
    status: string;
    direction: StatementDirection;
    amount: number;
    voided: boolean;
};

export type StatementSection = "invoices" | "payments" | "cash_cheque" | "payouts" | "earnings" | "commissions";

export const MAX_STATEMENT_DAYS = 366;
export const MAX_STATEMENT_ROWS = 2000;

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

export function dubaiDate(value: Date): string {
    return new Date(value.getTime() + 4 * 3600 * 1000).toISOString().slice(0, 10);
}

export function parseStatementRange(fromRaw: unknown, toRaw: unknown, now: Date = new Date()) {
    const from = String(fromRaw || "").trim();
    const to = String(toRaw || "").trim();
    if (!DATE_ONLY.test(from) || !DATE_ONLY.test(to)) throw new Error("Dates must be YYYY-MM-DD.");
    const fromMs = Date.parse(`${from}T00:00:00+04:00`);
    const toMs = Date.parse(`${to}T23:59:59.999+04:00`);
    if (!Number.isFinite(fromMs) || !Number.isFinite(toMs)) throw new Error("Invalid date.");
    if (fromMs > toMs) throw new Error("Start date must be before end date.");
    if ((toMs - fromMs) / 86400000 > MAX_STATEMENT_DAYS) throw new Error(`Choose a period of at most ${MAX_STATEMENT_DAYS} days.`);
    if (fromMs > now.getTime()) throw new Error("Start date is in the future.");
    return { from, to, fromMs, toMs };
}

export function toMillis(value: any): number | null {
    if (value == null || value === "") return null;
    if (typeof value === "number") return Number.isFinite(value) ? (value < 1e12 ? value * 1000 : value) : null;
    if (value instanceof Date) return value.getTime();
    if (typeof value.toMillis === "function") return value.toMillis();
    if (typeof value._seconds === "number") return value._seconds * 1000;
    if (typeof value.seconds === "number") return value.seconds * 1000;
    if (typeof value === "string") {
        const parsed = Date.parse(DATE_ONLY.test(value) ? `${value}T12:00:00+04:00` : value);
        return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
}

export function amountOf(data: Record<string, any>): number {
    for (const key of ["amount", "amountAed", "totalAmount", "total", "netAmount", "netPay", "commissionAmount", "requestedAmount"]) {
        const n = Number(data?.[key]);
        if (Number.isFinite(n) && data?.[key] !== null && data?.[key] !== "") return Math.round(n * 100) / 100;
    }
    return 0;
}

function recordDateMs(data: Record<string, any>): number | null {
    for (const key of ["paidAt", "collectedOn", "approvedAt", "issuedAt", "issueDate", "paidOn", "completedAt", "createdAt", "dueDate", "requestedAt", "date"]) {
        const ms = toMillis(data?.[key]);
        if (ms != null) return ms;
    }
    return null;
}

const SECTION_BY_COLLECTION: Record<string, StatementSection> = {
    invoices: "invoices",
    payment_transactions: "payments",
    transactions: "payments",
    payment_collection_records: "cash_cheque",
    payroll_entries: "earnings",
    broker_commissions: "commissions",
    broker_payout_requests: "payouts",
    payouts: "payouts",
};

function directionFor(collection: string, data: Record<string, any>, uid: string): StatementDirection {
    if (collection === "invoices") return "info";
    if (collection === "payroll_entries" || collection === "broker_commissions") return "in";
    if (collection === "broker_payout_requests" || collection === "payouts") return "in";
    if (collection === "payment_collection_records") return data.payerUid === uid ? "out" : "in";
    if (collection === "payment_transactions" || collection === "transactions") {
        const payer = data.payerId || data.tenantId || data.payerUid;
        if (payer === uid) return "out";
        if (data.techId === uid || data.ownerId === uid) return "in";
    }
    return "info";
}

function clean(value: any, max = 80): string {
    return String(value ?? "").replace(/[\r\n\t]+/g, " ").trim().slice(0, max);
}

/**
 * Builds statement rows from the caller's own records. `voids` maps payment_collection_records id
 * -> void document; voided records stay on the statement with status "void" and count zero.
 */
export function buildStatementRows(
    uid: string,
    records: StatementSourceRecord[],
    voids: Record<string, Record<string, any>>,
    range: { fromMs: number; toMs: number },
): StatementRow[] {
    const seen = new Set<string>();
    const rows: StatementRow[] = [];
    for (const record of records) {
        const key = `${record.collection}/${record.id}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const ms = recordDateMs(record.data);
        if (ms == null || ms < range.fromMs || ms > range.toMs) continue;
        const voidDoc = record.collection === "payment_collection_records" ? voids[record.id] : undefined;
        const rawStatus = clean(record.data.status || record.data.displayStatus || record.data.state || "recorded", 40).toLowerCase();
        const voided = Boolean(voidDoc) || rawStatus === "void" || rawStatus === "voided";
        const method = clean(record.data.method || record.data.paymentMethod || "", 20);
        const description = clean(
            record.data.description || record.data.title || record.data.memo || record.data.serviceType || record.data.type ||
            [SECTION_BY_COLLECTION[record.collection] || record.collection, method].filter(Boolean).join(" "),
        );
        rows.push({
            date: dubaiDate(new Date(ms)),
            section: SECTION_BY_COLLECTION[record.collection] || "payments",
            collection: record.collection,
            reference: clean(record.data.invoiceNumber || record.data.receiptNumber || record.data.chequeNumber || record.id, 40),
            description,
            status: voided ? "void" : rawStatus,
            direction: directionFor(record.collection, record.data, uid),
            amount: amountOf(record.data),
            voided,
        });
    }
    rows.sort((a, b) => (a.date === b.date ? a.reference.localeCompare(b.reference) : a.date.localeCompare(b.date)));
    return rows;
}

const SETTLED = new Set(["paid", "completed", "succeeded", "success", "settled", "approved", "collected", "received", "confirmed", "recorded", "processed"]);

export function statementTotals(rows: StatementRow[]) {
    let moneyIn = 0;
    let moneyOut = 0;
    let invoiced = 0;
    let voidedCount = 0;
    for (const row of rows) {
        if (row.voided) { voidedCount += 1; continue; }
        if (row.direction === "info") { invoiced += row.amount; continue; }
        if (!SETTLED.has(row.status)) continue;
        if (row.direction === "in") moneyIn += row.amount;
        else moneyOut += row.amount;
    }
    const r = (n: number) => Math.round(n * 100) / 100;
    return { moneyIn: r(moneyIn), moneyOut: r(moneyOut), net: r(moneyIn - moneyOut), invoiced: r(invoiced), voidedCount, rowCount: rows.length };
}

export const STATEMENT_LABELS: Record<StatementLanguage, Record<string, string>> = {
    en: {
        title: "Statement of Account", period: "Period", holder: "Account holder", role: "Role", generated: "Generated",
        statementId: "Statement ID", date: "Date", description: "Description", reference: "Reference", status: "Status",
        moneyIn: "Money in", moneyOut: "Money out", invoiced: "Invoiced", net: "Net", voided: "Voided entries",
        empty: "No records in this period.", verify: "Verify this statement at", currency: "AED",
        note: "Voided cash/cheque records are listed as void and excluded from totals. Totals include settled items only.",
    },
    ar: {
        title: "كشف حساب", period: "الفترة", holder: "صاحب الحساب", role: "الدور", generated: "تاريخ الإصدار",
        statementId: "رقم الكشف", date: "التاريخ", description: "الوصف", reference: "المرجع", status: "الحالة",
        moneyIn: "المبالغ الواردة", moneyOut: "المبالغ الصادرة", invoiced: "الفواتير", net: "الصافي", voided: "قيود ملغاة",
        empty: "لا توجد سجلات في هذه الفترة.", verify: "تحقق من هذا الكشف عبر", currency: "درهم",
        note: "تظهر سجلات النقد والشيكات الملغاة بحالة ملغى ولا تدخل في المجاميع. تشمل المجاميع البنود المسددة فقط.",
    },
};

function csvCell(value: unknown): string {
    let text = String(value ?? "");
    // Spreadsheet formula-injection guard.
    if (/^[=+\-@\t\r]/.test(text) && !/^-?\d+(\.\d+)?$/.test(text)) text = `'${text}`;
    return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function statementCsv(
    rows: StatementRow[],
    meta: { documentId: string; holder: string; role: string; from: string; to: string; issuedAtIso: string; verifyUrl: string; language: StatementLanguage },
): string {
    const L = STATEMENT_LABELS[meta.language];
    const totals = statementTotals(rows);
    const lines: string[] = [];
    const push = (cells: unknown[]) => lines.push(cells.map(csvCell).join(","));
    push(["BIN GROUP L.L.C - S.P.C", L.title]);
    push([L.statementId, meta.documentId]);
    push([L.holder, meta.holder]);
    push([L.role, meta.role]);
    push([L.period, `${meta.from} - ${meta.to}`]);
    push([L.generated, meta.issuedAtIso]);
    push([L.verify, meta.verifyUrl]);
    push([]);
    push([L.date, "section", L.description, L.reference, L.status, L.moneyIn, L.moneyOut, L.invoiced]);
    for (const row of rows) {
        const fixed = row.amount.toFixed(2);
        push([
            row.date, row.section, row.description, row.reference, row.status,
            row.direction === "in" ? fixed : "", row.direction === "out" ? fixed : "", row.direction === "info" ? fixed : "",
        ]);
    }
    push([]);
    push([L.moneyIn, totals.moneyIn.toFixed(2), L.currency]);
    push([L.moneyOut, totals.moneyOut.toFixed(2), L.currency]);
    push([L.net, totals.net.toFixed(2), L.currency]);
    push([L.invoiced, totals.invoiced.toFixed(2), L.currency]);
    push([L.voided, totals.voidedCount]);
    push([L.note]);
    return `\uFEFF${lines.join("\r\n")}\r\n`;
}

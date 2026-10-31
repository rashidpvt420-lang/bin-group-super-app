// Pure helpers for the monthly owner performance report (no Firebase imports).
// Every number comes from the owner's own records passed in; nothing is estimated or invented.
import { StatementRow, StatementSourceRecord, buildStatementRows, statementTotals, toMillis } from "./moneyStatementCore";

export type ReportLanguage = "en" | "ar";
export type UnitRecord = { id: string; data: Record<string, any> };
export type TicketRecord = { id: string; data: Record<string, any> };

export function parseReportMonth(raw: unknown, now: Date = new Date()) {
    const month = String(raw ?? "").trim();
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Error("Month must be YYYY-MM.");
    const [y, m] = month.split("-").map(Number);
    const fromMs = Date.parse(`${month}-01T00:00:00+04:00`);
    const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const to = `${month}-${String(lastDay).padStart(2, "0")}`;
    const toMs = Date.parse(`${to}T23:59:59.999+04:00`);
    if (fromMs > now.getTime()) throw new Error("That month has not started yet.");
    if (y < 2020) throw new Error("Month is too far in the past.");
    return { month, from: `${month}-01`, to, fromMs, toMs };
}

const SETTLED = new Set(["paid", "completed", "succeeded", "success", "settled", "approved", "collected", "received", "confirmed", "recorded", "processed"]);
const isSettled = (r: StatementRow) => !r.voided && SETTLED.has(r.status);

export function occupancyOf(units: UnitRecord[]) {
    let occupied = 0; let vacant = 0; let unknown = 0;
    for (const u of units) {
        const s = String(u.data.occupancyStatus ?? u.data.status ?? "").toLowerCase();
        if (s === "occupied" || s === "rented" || s === "leased") occupied += 1;
        else if (s === "vacant" || s === "available" || s === "empty") vacant += 1;
        else if (u.data.tenantId || u.data.currentTenantId) occupied += 1;
        else unknown += 1;
    }
    const known = occupied + vacant;
    return { total: units.length, occupied, vacant, unknown, ratePct: known > 0 ? Math.round((occupied / known) * 1000) / 10 : null };
}

const DONE = ["completed", "closed", "resolved", "approved"];
const DROPPED = ["cancelled", "canceled", "rejected", "archived"];
function recordedCost(d: Record<string, any>): number | null {
    for (const k of ["finalCost", "actualCost", "finalAmount", "invoiceAmount"]) {
        const n = Number(d?.[k]);
        if (d?.[k] !== undefined && d?.[k] !== null && d?.[k] !== "" && Number.isFinite(n)) return Math.round(n * 100) / 100;
    }
    return null; // estimates are never shown as costs
}

export function repairHistory(tickets: TicketRecord[], range: { fromMs: number; toMs: number }) {
    const rows: Array<{ id: string; date: string; title: string; status: string; state: "completed" | "open" | "cancelled"; cost: number | null }> = [];
    const seen = new Set<string>();
    for (const t of tickets) {
        if (seen.has(t.id)) continue;
        seen.add(t.id);
        const d = t.data;
        const created = toMillis(d.createdAt);
        const done = toMillis(d.completedAt ?? d.resolvedAt ?? d.closedAt);
        const inRange = (ms: number | null) => ms != null && ms >= range.fromMs && ms <= range.toMs;
        if (!inRange(created) && !inRange(done)) continue;
        const status = String(d.status ?? "OPEN").slice(0, 40);
        const low = status.toLowerCase();
        const state = DONE.some((w) => low.includes(w)) ? "completed" : DROPPED.some((w) => low.includes(w)) ? "cancelled" : "open";
        const ms = inRange(done) ? done! : created!;
        rows.push({
            id: t.id,
            date: new Date(ms + 4 * 3600 * 1000).toISOString().slice(0, 10),
            title: String(d.title || d.serviceLabel || d.issueType || d.category || d.complaintCategory || "Maintenance").replace(/[\r\n\t]+/g, " ").slice(0, 60),
            status, state, cost: state === "completed" ? recordedCost(d) : null,
        });
    }
    rows.sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
    const completed = rows.filter((r) => r.state === "completed");
    const recordedCostTotal = Math.round(completed.reduce((s, r) => s + (r.cost ?? 0), 0) * 100) / 100;
    return { rows, opened: rows.filter((r) => r.state !== "cancelled").length, completed: completed.length, open: rows.filter((r) => r.state === "open").length, recordedCostTotal };
}

export function buildOwnerReport(uid: string, input: {
    moneyRecords: StatementSourceRecord[]; voids: Record<string, Record<string, any>>; units: UnitRecord[]; tickets: TicketRecord[];
    propertyCount: number;
}, range: { fromMs: number; toMs: number }) {
    const rows = buildStatementRows(uid, input.moneyRecords, input.voids, range);
    const income = rows.filter((r) => r.direction === "in" && isSettled(r));
    const costs = rows.filter((r) => r.direction === "out" && isSettled(r));
    const totals = statementTotals(rows);
    return {
        propertyCount: input.propertyCount,
        income: { total: totals.moneyIn, rows: income },
        costs: { total: totals.moneyOut, rows: costs },
        net: totals.net,
        invoiced: totals.invoiced,
        voidedCount: totals.voidedCount,
        occupancy: occupancyOf(input.units),
        repairs: repairHistory(input.tickets, range),
        hasAnyData: rows.length > 0 || input.units.length > 0 || input.tickets.length > 0,
    };
}

export const REPORT_LABELS: Record<ReportLanguage, Record<string, string>> = {
    en: {
        title: "Monthly Owner Performance Report", month: "Month", owner: "Owner", generated: "Generated", reportId: "Report ID",
        properties: "Properties", income: "Rental income received", costs: "Costs paid", net: "Net", invoiced: "Invoiced to you",
        occupancy: "Occupancy (units, as of generation)", occupied: "Occupied", vacant: "Vacant", unknown: "Status not recorded", rate: "Occupancy rate",
        repairs: "Repair history this month", opened: "Requests", completed: "Completed", open: "Still open", repairCost: "Recorded repair cost",
        date: "Date", description: "Description", reference: "Reference", amount: "Amount (AED)", status: "Status", cost: "Cost (AED)",
        incomeEmpty: "No rental income recorded for this month.", costsEmpty: "No costs paid this month.",
        unitsEmpty: "No units are recorded on your account.", repairsEmpty: "No repair requests this month.",
        notRecorded: "Not recorded", currency: "AED", verify: "Verify this report at",
        note: "Only records on your BIN GROUP account are included. Totals count settled items only; voided cash/cheque entries are excluded. Repair costs show only final recorded amounts, never estimates.",
    },
    ar: {
        title: "التقرير الشهري لأداء المالك", month: "الشهر", owner: "المالك", generated: "تاريخ الإصدار", reportId: "رقم التقرير",
        properties: "العقارات", income: "إيرادات الإيجار المستلمة", costs: "التكاليف المدفوعة", net: "الصافي", invoiced: "فواتير صادرة لك",
        occupancy: "الإشغال (الوحدات، عند الإصدار)", occupied: "مشغولة", vacant: "شاغرة", unknown: "الحالة غير مسجلة", rate: "نسبة الإشغال",
        repairs: "سجل الإصلاحات لهذا الشهر", opened: "الطلبات", completed: "مكتملة", open: "مفتوحة", repairCost: "تكلفة الإصلاح المسجلة",
        date: "التاريخ", description: "الوصف", reference: "المرجع", amount: "المبلغ (درهم)", status: "الحالة", cost: "التكلفة (درهم)",
        incomeEmpty: "لا توجد إيرادات إيجار مسجلة لهذا الشهر.", costsEmpty: "لا توجد تكاليف مدفوعة هذا الشهر.",
        unitsEmpty: "لا توجد وحدات مسجلة في حسابك.", repairsEmpty: "لا توجد طلبات إصلاح هذا الشهر.",
        notRecorded: "غير مسجل", currency: "درهم", verify: "تحقق من هذا التقرير عبر",
        note: "يشمل التقرير السجلات الموجودة في حسابك لدى بن جروب فقط. تحتسب المجاميع البنود المسددة فقط وتستبعد قيود النقد/الشيكات الملغاة. تظهر تكاليف الإصلاح بالمبالغ النهائية المسجلة فقط وليس التقديرات.",
    },
};

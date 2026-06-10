import { onCall, HttpsError } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import OpenAI from "openai";

const OPENAI_API_KEY = defineSecret("OPENAI_API_KEY");
const GEMINI_API_KEY = defineSecret("GEMINI_API_KEY");

type SovereignRole = "owner" | "tenant" | "technician" | "broker" | "admin" | "unknown";
type TruthHealthBand = "VERIFIED" | "WATCHLIST" | "AT_RISK" | "CRITICAL";

type PropertyTruthLedgerSnapshot = {
    maintenanceCreditScore: number;
    healthBand: TruthHealthBand;
    openMissionCount: number;
    slaBreachCount: number;
    repeatDefectCount: number;
    proofCoveragePct: number;
    propertyCount: number;
    autopilotMode: "READY" | "WATCH" | "LOCKED";
    evidenceProtocol: string;
    nextBestAction: string;
    insufficientData: boolean;
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const toNumber = (value: unknown, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const asArray = (value: unknown): any[] => Array.isArray(value) ? value : [];
const lower = (value: unknown) => String(value ?? "").toLowerCase();
const hasNumber = (value: unknown) => Number.isFinite(Number(value));

function collectTickets(context: any): any[] {
    const tickets = [
        ...asArray(context?.tickets),
        ...asArray(context?.activeTickets),
        ...asArray(context?.serviceTickets),
        ...asArray(context?.activeDispatches),
        ...asArray(context?.missions),
    ];
    const seen = new Set<string>();
    return tickets.filter((ticket, index) => {
        const id = String(ticket?.id ?? ticket?.ticketId ?? ticket?.missionId ?? index);
        if (seen.has(id)) return false;
        seen.add(id);
        return true;
    });
}

function isOpen(ticket: any): boolean {
    const status = lower(ticket?.status || ticket?.state || ticket?.missionStatus);
    return !["closed", "complete", "completed", "resolved", "verified", "cancelled", "canceled"].includes(status);
}

function hasProof(ticket: any): boolean {
    const before = ticket?.beforePhoto || ticket?.beforePhotoUrl || ticket?.beforeImage || ticket?.evidence?.before || ticket?.photos?.before;
    const after = ticket?.afterPhoto || ticket?.afterPhotoUrl || ticket?.afterImage || ticket?.evidence?.after || ticket?.photos?.after;
    const location = ticket?.gpsCheckIn || ticket?.arrivalGps || ticket?.locationProof || ticket?.evidence?.gps || ticket?.technicianLocation;
    return Boolean((before && after) || ticket?.proofComplete === true || (ticket?.evidenceComplete === true && location));
}

function isSlaBreach(ticket: any): boolean {
    const status = lower(ticket?.slaStatus || ticket?.sla || ticket?.breachStatus);
    return status.includes("breach") || ticket?.slaBreached === true || ticket?.isSlaBreached === true || ticket?.breached === true;
}

function isRepeatDefect(ticket: any): boolean {
    return ticket?.repeat === true || ticket?.isRepeat === true || ticket?.recurring === true || toNumber(ticket?.repeatCount) > 1 || lower(ticket?.flags).includes("repeat");
}

function hasOperationalSignal(context: any = {}): boolean {
    const tickets = collectTickets(context);
    const properties = asArray(context?.properties || context?.assets || context?.portfolio);
    return tickets.length > 0 || properties.length > 0 ||
        hasNumber(context?.propertyCount) ||
        hasNumber(context?.stats?.openTickets) || hasNumber(context?.openMissionCount) ||
        hasNumber(context?.stats?.slaBreaches) || hasNumber(context?.slaBreachCount) ||
        hasNumber(context?.stats?.repeatDefects) || hasNumber(context?.repeatDefectCount) ||
        hasNumber(context?.proofCoveragePct) || hasNumber(context?.stats?.proofCoveragePct) ||
        hasNumber(context?.bpiAverage) || hasNumber(context?.buildingPerformanceIndex) || hasNumber(context?.healthScore);
}

function proofCoverage(context: any, closedTickets: any[]): number {
    if (closedTickets.length) return Math.round((closedTickets.filter(hasProof).length / closedTickets.length) * 100);
    if (hasNumber(context?.proofCoveragePct)) return toNumber(context.proofCoveragePct, 0);
    if (hasNumber(context?.stats?.proofCoveragePct)) return toNumber(context.stats.proofCoveragePct, 0);
    return 0;
}

function bpiScore(context: any): number {
    if (hasNumber(context?.bpiAverage)) return toNumber(context.bpiAverage, 0);
    if (hasNumber(context?.buildingPerformanceIndex)) return toNumber(context.buildingPerformanceIndex, 0);
    if (hasNumber(context?.healthScore)) return toNumber(context.healthScore, 0);
    return 0;
}

function healthBand(score: number): TruthHealthBand {
    if (score >= 86) return "VERIFIED";
    if (score >= 72) return "WATCHLIST";
    if (score >= 55) return "AT_RISK";
    return "CRITICAL";
}

function buildPropertyTruthLedger(context: any = {}): PropertyTruthLedgerSnapshot {
    const tickets = collectTickets(context);
    const properties = asArray(context?.properties || context?.assets || context?.portfolio);
    const hasData = hasOperationalSignal(context);
    const openMissionCount = hasData ? toNumber(context?.stats?.openTickets ?? context?.openMissionCount, tickets.filter(isOpen).length) : 0;
    const slaBreachCount = hasData ? toNumber(context?.stats?.slaBreaches ?? context?.slaBreachCount, tickets.filter(isSlaBreach).length) : 0;
    const repeatDefectCount = hasData ? toNumber(context?.stats?.repeatDefects ?? context?.repeatDefectCount, tickets.filter(isRepeatDefect).length) : 0;
    const closedTickets = tickets.filter((ticket) => !isOpen(ticket));
    const proofCoveragePct = hasData ? proofCoverage(context, closedTickets) : 0;
    const score = hasData ? Math.round(35 + clamp(bpiScore(context), 0, 100) * 0.3 + clamp(proofCoveragePct, 0, 100) * 0.2 - slaBreachCount * 7 - repeatDefectCount * 5 - openMissionCount * 1.5) : 0;
    const maintenanceCreditScore = clamp(score, 0, 100);
    const insufficientData = !hasData;
    const band = insufficientData ? "CRITICAL" : healthBand(maintenanceCreditScore);
    const autopilotMode = insufficientData || band === "CRITICAL" ? "LOCKED" : band === "AT_RISK" ? "WATCH" : "READY";
    const nextBestAction = insufficientData
        ? "Collect live property, ticket, SLA, location, photo, and verification records before assigning a trusted health score."
        : slaBreachCount > 0
            ? "Review SLA breach causes and issue owner-visible service credit decision."
            : repeatDefectCount > 0
                ? "Escalate repeat defects into root-cause inspection before another temporary repair."
                : proofCoveragePct < 90
                    ? "Enforce No-Photo, No-Location, No-Close proof before technician closeout."
                    : "Activate Owner Silent Mode for low-risk repairs under the owner-approved threshold.";

    return {
        maintenanceCreditScore,
        healthBand: band,
        openMissionCount,
        slaBreachCount,
        repeatDefectCount,
        proofCoveragePct: clamp(proofCoveragePct, 0, 100),
        propertyCount: properties.length || toNumber(context?.propertyCount, 0),
        autopilotMode,
        evidenceProtocol: "No-Photo, No-Location, No-Close",
        nextBestAction,
        insufficientData,
    };
}

function safeRole(value: unknown): SovereignRole {
    const role = lower(value) as SovereignRole;
    return ["owner", "tenant", "technician", "broker", "admin", "unknown"].includes(role) ? role : "unknown";
}

function sanitizePageContext(context: any) {
    return {
        properties: asArray(context?.properties || context?.assets || context?.portfolio).slice(0, 20).map((property) => ({
            id: String(property?.id || property?.propertyId || ""),
            type: String(property?.type || property?.propertyType || ""),
            units: toNumber(property?.units || property?.numberOfUnits || property?.totalUnits, 0),
            healthScore: toNumber(property?.healthScore || property?.bpi || property?.buildingPerformanceIndex, 0),
        })),
        tickets: collectTickets(context).slice(0, 30).map((ticket) => ({
            id: String(ticket?.id || ticket?.ticketId || ""),
            status: String(ticket?.status || ticket?.state || ""),
            category: String(ticket?.category || ticket?.trade || ticket?.type || ""),
            priority: String(ticket?.priority || ticket?.severity || ""),
            slaStatus: String(ticket?.slaStatus || ticket?.sla || ""),
            proofComplete: ticket?.proofComplete === true || ticket?.evidenceComplete === true,
            repeatCount: toNumber(ticket?.repeatCount, 0),
        })),
        stats: context?.stats || {},
        bpiAverage: hasNumber(context?.bpiAverage ?? context?.buildingPerformanceIndex ?? context?.healthScore) ? toNumber(context?.bpiAverage ?? context?.buildingPerformanceIndex ?? context?.healthScore, 0) : undefined,
        proofCoveragePct: hasNumber(context?.proofCoveragePct ?? context?.stats?.proofCoveragePct) ? toNumber(context?.proofCoveragePct ?? context?.stats?.proofCoveragePct, 0) : undefined,
        propertyCount: hasNumber(context?.propertyCount) ? toNumber(context.propertyCount, 0) : undefined,
    };
}

function deterministicAnswer(role: SovereignRole, text: string, context: any, fallbackSummary?: string) {
    const snapshot = buildPropertyTruthLedger(context);
    const question = lower(text);
    const ledger = snapshot.insufficientData
        ? `INSUFFICIENT DATA. Maintenance Credit Score ${snapshot.maintenanceCreditScore}/100 (${snapshot.healthBand}), Autopilot ${snapshot.autopilotMode}.`
        : `Maintenance Credit Score ${snapshot.maintenanceCreditScore}/100 (${snapshot.healthBand}), open missions ${snapshot.openMissionCount}, SLA breaches ${snapshot.slaBreachCount}, repeat defects ${snapshot.repeatDefectCount}, proof coverage ${snapshot.proofCoveragePct}%, Autopilot ${snapshot.autopilotMode}.`;

    if (question.includes("score") || question.includes("truth") || question.includes("ledger")) return `Property Truth Ledger: ${ledger} Next action: ${snapshot.nextBestAction}`;
    if (question.includes("autopilot") || question.includes("silent")) return `AI Property Autopilot is ${snapshot.autopilotMode}. Next action: ${snapshot.nextBestAction}`;
    if (question.includes("passport")) return "Verified Property Passport stores property profile, contracts, service requests, invoices, reports, warranties, before/after evidence, and maintenance history for owner and broker confidence.";
    if (question.includes("evidence") || question.includes("proof") || question.includes("dispute")) return "Evidence workflow: complaint time, technician arrival, before photo, diagnosis, material note, after photo, SLA result, invoice reference, and tenant or owner verification.";
    return `${fallbackSummary ? `${fallbackSummary}\n\n` : ""}${role.toUpperCase()} AI status: live backend reached. ${ledger} Next action: ${snapshot.nextBestAction}`;
}

async function callOpenAI(apiKey: string, payload: { role: SovereignRole; text: string; context: any; snapshot: PropertyTruthLedgerSnapshot; fallbackSummary?: string }) {
    const openai = new OpenAI({ apiKey });
    const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        temperature: 0.25,
        max_tokens: 420,
        messages: [
            {
                role: "system",
                content: "You are BIN GROUP Sovereign AI, a UAE property operations assistant. Be concise, operational, and evidence-focused. Use only the supplied snapshot. Never invent live records or claim verified status when data is insufficient.",
            },
            { role: "user", content: JSON.stringify(payload) },
        ],
    });
    return response.choices[0]?.message?.content?.trim() || deterministicAnswer(payload.role, payload.text, payload.context, payload.fallbackSummary);
}

async function callGemini(apiKey: string, payload: { role: SovereignRole; text: string; context: any; snapshot: PropertyTruthLedgerSnapshot; fallbackSummary?: string }) {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${encodeURIComponent(apiKey)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            contents: [{
                role: "user",
                parts: [{ text: `You are BIN GROUP Sovereign AI. Use only this JSON snapshot and question. Never invent live records: ${JSON.stringify(payload)}` }],
            }],
            generationConfig: { temperature: 0.25, maxOutputTokens: 420 },
        }),
    });
    if (!response.ok) throw new Error(`Gemini request failed: ${response.status}`);
    const json = await response.json() as any;
    return String(json?.candidates?.[0]?.content?.parts?.[0]?.text || "").trim() || deterministicAnswer(payload.role, payload.text, payload.context, payload.fallbackSummary);
}

export const askSovereignAI = onCall({
    cors: true,
    region: "europe-west3",
    secrets: [OPENAI_API_KEY, GEMINI_API_KEY],
    timeoutSeconds: 45,
    memory: "512MiB",
}, async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Sign in before using Sovereign AI.");

    const role = safeRole(request.data?.role || request.auth.token?.role || request.auth.token?.primaryRole);
    const text = String(request.data?.text || "").trim().slice(0, 1600);
    if (!text) throw new HttpsError("invalid-argument", "Message text is required.");

    const context = sanitizePageContext(request.data?.pageContext || {});
    const fallbackSummary = String(request.data?.fallbackSummary || "").slice(0, 1000);
    const snapshot = buildPropertyTruthLedger(context);
    const payload = { role, text, context, snapshot, fallbackSummary };

    try {
        const openAiKey = OPENAI_API_KEY.value();
        if (openAiKey) return { provider: "openai", text: await callOpenAI(openAiKey, payload), snapshot };
        const geminiKey = GEMINI_API_KEY.value();
        if (geminiKey) return { provider: "gemini", text: await callGemini(geminiKey, payload), snapshot };
        return { provider: "deterministic", text: deterministicAnswer(role, text, context, fallbackSummary), snapshot };
    } catch (error: any) {
        console.warn("[askSovereignAI] provider failed, returning deterministic fallback:", error?.message || error);
        return { provider: "fallback", text: deterministicAnswer(role, text, context, fallbackSummary), snapshot };
    }
});

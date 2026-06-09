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
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const toNumber = (value: unknown, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const asArray = (value: unknown): any[] => Array.isArray(value) ? value : [];
const lower = (value: unknown) => String(value ?? "").toLowerCase();

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

function hasProof(ticket: any): boolean {
    const before = ticket?.beforePhoto || ticket?.beforePhotoUrl || ticket?.beforeImage || ticket?.evidence?.before || ticket?.photos?.before;
    const after = ticket?.afterPhoto || ticket?.afterPhotoUrl || ticket?.afterImage || ticket?.evidence?.after || ticket?.photos?.after;
    const gps = ticket?.gpsCheckIn || ticket?.arrivalGps || ticket?.locationProof || ticket?.evidence?.gps || ticket?.technicianLocation;
    return Boolean((before && after) || ticket?.proofComplete === true || (ticket?.evidenceComplete === true && gps));
}

function isOpen(ticket: any): boolean {
    const status = lower(ticket?.status || ticket?.state || ticket?.missionStatus);
    return !["closed", "complete", "completed", "resolved", "verified", "cancelled", "canceled"].includes(status);
}

function isSlaBreach(ticket: any): boolean {
    const status = lower(ticket?.slaStatus || ticket?.sla || ticket?.breachStatus);
    return status.includes("breach") || ticket?.slaBreached === true || ticket?.isSlaBreached === true || ticket?.breached === true;
}

function isRepeatDefect(ticket: any): boolean {
    return ticket?.repeat === true || ticket?.isRepeat === true || ticket?.recurring === true || toNumber(ticket?.repeatCount) > 1 || lower(ticket?.flags).includes("repeat");
}

function calculateMaintenanceCreditScore(context: any = {}): number {
    const tickets = collectTickets(context);
    const openMissionCount = toNumber(context?.stats?.openTickets ?? context?.openMissionCount, tickets.filter(isOpen).length);
    const slaBreachCount = toNumber(context?.stats?.slaBreaches ?? context?.slaBreachCount, tickets.filter(isSlaBreach).length);
    const repeatDefectCount = toNumber(context?.stats?.repeatDefects ?? context?.repeatDefectCount, tickets.filter(isRepeatDefect).length);
    const proofEligibleTickets = tickets.filter((ticket) => !isOpen(ticket));
    const proofCoveragePct = proofEligibleTickets.length
        ? Math.round((proofEligibleTickets.filter(hasProof).length / proofEligibleTickets.length) * 100)
        : toNumber(context?.proofCoveragePct ?? context?.stats?.proofCoveragePct, 92);
    const bpi = toNumber(context?.bpiAverage ?? context?.buildingPerformanceIndex ?? context?.healthScore, 82);
    const score = Math.round(50 + clamp(bpi, 0, 100) * 0.28 + clamp(proofCoveragePct, 0, 100) * 0.16 - slaBreachCount * 6 - repeatDefectCount * 4 - openMissionCount * 1.5);
    return clamp(score, 0, 100);
}

function getTruthHealthBand(score: number): TruthHealthBand {
    if (score >= 86) return "VERIFIED";
    if (score >= 72) return "WATCHLIST";
    if (score >= 55) return "AT_RISK";
    return "CRITICAL";
}

function buildPropertyTruthLedger(context: any = {}): PropertyTruthLedgerSnapshot {
    const tickets = collectTickets(context);
    const properties = asArray(context?.properties || context?.assets || context?.portfolio);
    const openMissionCount = toNumber(context?.stats?.openTickets ?? context?.openMissionCount, tickets.filter(isOpen).length);
    const slaBreachCount = toNumber(context?.stats?.slaBreaches ?? context?.slaBreachCount, tickets.filter(isSlaBreach).length);
    const repeatDefectCount = toNumber(context?.stats?.repeatDefects ?? context?.repeatDefectCount, tickets.filter(isRepeatDefect).length);
    const closedTickets = tickets.filter((ticket) => !isOpen(ticket));
    const proofCoveragePct = closedTickets.length
        ? Math.round((closedTickets.filter(hasProof).length / closedTickets.length) * 100)
        : toNumber(context?.proofCoveragePct ?? context?.stats?.proofCoveragePct, 92);
    const maintenanceCreditScore = calculateMaintenanceCreditScore(context);
    const healthBand = getTruthHealthBand(maintenanceCreditScore);
    const autopilotMode = healthBand === "CRITICAL" ? "LOCKED" : healthBand === "AT_RISK" ? "WATCH" : "READY";
    const nextBestAction = slaBreachCount > 0
        ? "Review SLA breach causes and issue owner-visible service credit decision."
        : repeatDefectCount > 0
            ? "Escalate repeat defects into root-cause inspection before another temporary repair."
            : proofCoveragePct < 90
                ? "Enforce No-Photo, No-GPS, No-Close proof before technician closeout."
                : "Activate Owner Silent Mode for low-risk repairs under the owner-approved threshold.";

    return {
        maintenanceCreditScore,
        healthBand,
        openMissionCount,
        slaBreachCount,
        repeatDefectCount,
        proofCoveragePct: clamp(proofCoveragePct, 0, 100),
        propertyCount: properties.length || toNumber(context?.propertyCount, 0),
        autopilotMode,
        evidenceProtocol: "No-Photo, No-GPS, No-Close",
        nextBestAction,
    };
}

function safeRole(value: unknown): SovereignRole {
    const role = lower(value) as SovereignRole;
    return ["owner", "tenant", "technician", "broker", "admin", "unknown"].includes(role) ? role : "unknown";
}

function sanitizePageContext(context: any) {
    const tickets = collectTickets(context).slice(0, 30).map((ticket) => ({
        id: String(ticket?.id || ticket?.ticketId || ""),
        status: String(ticket?.status || ticket?.state || ""),
        category: String(ticket?.category || ticket?.trade || ticket?.type || ""),
        priority: String(ticket?.priority || ticket?.severity || ""),
        slaStatus: String(ticket?.slaStatus || ticket?.sla || ""),
        proofComplete: ticket?.proofComplete === true || ticket?.evidenceComplete === true,
        repeatCount: toNumber(ticket?.repeatCount, 0),
    }));

    return {
        properties: asArray(context?.properties || context?.assets || context?.portfolio).slice(0, 20).map((property) => ({
            id: String(property?.id || property?.propertyId || ""),
            type: String(property?.type || property?.propertyType || ""),
            units: toNumber(property?.units || property?.numberOfUnits || property?.totalUnits, 0),
            healthScore: toNumber(property?.healthScore || property?.bpi || property?.buildingPerformanceIndex, 0),
        })),
        tickets,
        stats: context?.stats || {},
        bpiAverage: toNumber(context?.bpiAverage ?? context?.buildingPerformanceIndex ?? context?.healthScore, 0),
        proofCoveragePct: toNumber(context?.proofCoveragePct ?? context?.stats?.proofCoveragePct, 0),
    };
}

function deterministicAnswer(role: SovereignRole, text: string, context: any, fallbackSummary?: string) {
    const snapshot = buildPropertyTruthLedger(context);
    const question = lower(text);
    const ledger = `Maintenance Credit Score ${snapshot.maintenanceCreditScore}/100 (${snapshot.healthBand}), open missions ${snapshot.openMissionCount}, SLA breaches ${snapshot.slaBreachCount}, repeat defects ${snapshot.repeatDefectCount}, proof coverage ${snapshot.proofCoveragePct}%, Autopilot ${snapshot.autopilotMode}.`;

    if (question.includes("score") || question.includes("truth") || question.includes("ledger")) return `Property Truth Ledger: ${ledger} Next action: ${snapshot.nextBestAction}`;
    if (question.includes("autopilot") || question.includes("silent")) return `AI Property Autopilot is the owner-rule layer. It can handle low-risk repairs under owner thresholds, escalate emergencies, and interrupt only for cost, risk, or approval exceptions. Current mode: ${snapshot.autopilotMode}.`;
    if (question.includes("passport")) return "Verified Property Passport stores property profile, contracts, service requests, invoices, reports, warranties, before/after evidence, and maintenance history for owner and broker confidence.";
    if (question.includes("evidence") || question.includes("proof") || question.includes("dispute")) return "Evidence workflow: complaint time, technician GPS arrival, before photo, diagnosis, material note, after photo, SLA result, invoice reference, and tenant or owner verification.";
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
                content: "You are BIN GROUP Sovereign AI, a UAE property operations assistant. Be concise, operational, and evidence-focused. Do not provide legal advice. Explain Property Truth Ledger, Maintenance Credit Score, SLA, proof, Property Passport, Repair Memory, and Autopilot using the supplied snapshot only. Never invent live records.",
            },
            {
                role: "user",
                content: JSON.stringify(payload),
            },
        ],
    });
    return response.choices[0]?.message?.content?.trim() || "AI response was empty. Use the deterministic Property Truth fallback.";
}

async function callGemini(apiKey: string, payload: { role: SovereignRole; text: string; context: any; snapshot: PropertyTruthLedgerSnapshot; fallbackSummary?: string }) {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${encodeURIComponent(apiKey)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            contents: [{
                role: "user",
                parts: [{
                    text: `You are BIN GROUP Sovereign AI, a UAE property operations assistant. Be concise, operational, and evidence-focused. Do not provide legal advice. Use only this JSON snapshot and question: ${JSON.stringify(payload)}`,
                }],
            }],
            generationConfig: { temperature: 0.25, maxOutputTokens: 420 },
        }),
    });
    if (!response.ok) throw new Error(`Gemini request failed: ${response.status}`);
    const json = await response.json() as any;
    return String(json?.candidates?.[0]?.content?.parts?.[0]?.text || "").trim() || "Gemini response was empty. Use the deterministic Property Truth fallback.";
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

    const openAiKey = OPENAI_API_KEY.value();
    const geminiKey = GEMINI_API_KEY.value();

    try {
        if (openAiKey) {
            return { provider: "openai", text: await callOpenAI(openAiKey, payload), snapshot };
        }
        if (geminiKey) {
            return { provider: "gemini", text: await callGemini(geminiKey, payload), snapshot };
        }
        return { provider: "deterministic", text: deterministicAnswer(role, text, context, fallbackSummary), snapshot };
    } catch (error: any) {
        console.warn("[askSovereignAI] provider failed, returning deterministic fallback:", error?.message || error);
        return { provider: "fallback", text: deterministicAnswer(role, text, context, fallbackSummary), snapshot };
    }
});

import { HR_PAY_CONFIG } from "./hrPayConfig";

/** Max overtime a staff member may claim (and HR may approve) for one day. */
export const MAX_OVERTIME_CLAIM_MINUTES = HR_PAY_CONFIG.maxOvertimeMinutesPerDay;
const MAX_PHOTOS = 10;

export function toIso(value: unknown): string | null {
    if (value === null || value === undefined || value === "") return null;
    const v = value as { toMillis?: () => number; toDate?: () => Date };
    let ms: number | null = null;
    if (typeof v.toMillis === "function") ms = v.toMillis();
    else if (typeof v.toDate === "function") ms = v.toDate().getTime();
    else if (typeof value === "number") ms = value;
    else if (typeof value === "string") ms = Date.parse(value);
    else if (value instanceof Date) ms = value.getTime();
    return ms !== null && Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

function photoList(...lists: unknown[]): string[] {
    const out: string[] = [];
    for (const list of lists) {
        if (!Array.isArray(list)) continue;
        for (const item of list) {
            const url = typeof item === "string" ? item : String((item as Record<string, unknown>)?.url || (item as Record<string, unknown>)?.path || "");
            if (url && !out.includes(url)) out.push(url.slice(0, 500));
            if (out.length >= MAX_PHOTOS) return out;
        }
    }
    return out;
}

/**
 * Server-side proof snapshot copied onto the overtime claim at submission time, so HR
 * reviews what the shift and job records said then. Nothing here comes from the client.
 */
export function buildOvertimeProof(shift: Record<string, unknown>, ticket: Record<string, unknown> | null) {
    const loc = (ticket?.arrivalLocation || null) as Record<string, unknown> | null;
    return {
        shift: {
            clockInAt: toIso(shift.clockInTime),
            breakMinutes: Number(shift.totalBreakMinutes || shift.breakMinutes || 0) || 0,
            status: String(shift.status || ""),
        },
        job: ticket ? {
            arrivedAt: toIso(ticket.arrivedAt),
            startedAt: toIso(ticket.startedAt),
            completedAt: toIso(ticket.completedAt),
            arrivalLocation: loc ? {
                lat: Number(loc.lat ?? loc.latitude),
                lng: Number(loc.lng ?? loc.longitude),
                accuracy: Number(loc.accuracy),
                capturedAt: toIso(Number(loc.capturedAtMs) || null),
                source: String(loc.locationSource || ""),
            } : null,
            beforePhotos: photoList(ticket.beforePhotos, ticket.photos, ticket.initialPhotoUrls),
            afterPhotos: photoList(ticket.afterPhotos, ticket.completionPhotos, ticket.proofPhotos, ticket.evidencePhotos),
        } : null,
        source: "SERVER_OVERTIME_PROOF_V1",
    };
}

export function proofStrength(proof: ReturnType<typeof buildOvertimeProof>): "SHIFT_ONLY" | "SHIFT_AND_JOB" | "SHIFT_JOB_GPS_PHOTOS" {
    if (!proof.job) return "SHIFT_ONLY";
    const hasGps = Boolean(proof.job.arrivalLocation && Number.isFinite(proof.job.arrivalLocation.lat));
    const hasPhotos = proof.job.beforePhotos.length + proof.job.afterPhotos.length > 0;
    return hasGps && hasPhotos ? "SHIFT_JOB_GPS_PHOTOS" : "SHIFT_AND_JOB";
}

export const OVERTIME_REVIEWER_ROLES = ["hr_admin", "hr_manager", "hr_staff", "operations_manager", "supervisor"] as const;

export function validateApprovedMinutes(value: unknown, claimed: number): number | null {
    const n = Number(value);
    if (!Number.isInteger(n) || n < 1) return null;
    if (n > MAX_OVERTIME_CLAIM_MINUTES || n > claimed) return null;
    return n;
}

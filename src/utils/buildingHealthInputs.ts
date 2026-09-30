// N-29: the Building Performance Index must be computed only from recorded property facts.
// Missing facts are reported to the owner instead of being replaced with invented defaults
// (age 5, Villa, DX, maintenanceLoad 50).
export type BuildingHealthInput = {
    age: number; floors: number; units: number; propertyType: string; hvacType?: 'District' | 'DX';
    liftCount: number; pool: boolean; complaintFrequency: number; unresolvedTickets: number;
    emergencyIncidents: number; maintenanceLoad: number;
};

// Flat shape (not a discriminated union) so narrowing works without strictNullChecks.
export type BuildingHealthInputResult = { ok: boolean; missing: string[]; input: BuildingHealthInput | null };

const positiveNumber = (value: unknown): number | null => {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

function recordedAge(property: any, nowYear: number): number | null {
    const age = positiveNumber(property?.age ?? property?.buildingAge);
    if (age !== null) return age;
    const yearBuilt = positiveNumber(property?.yearBuilt ?? property?.constructionYear);
    if (yearBuilt !== null && yearBuilt <= nowYear) return Math.max(nowYear - yearBuilt, 0.5);
    return null;
}

function recordedHvac(value: unknown): 'District' | 'DX' | undefined {
    const text = String(value || '').trim().toLowerCase();
    if (text === 'dx') return 'DX';
    if (text === 'district' || text === 'district cooling') return 'District';
    return undefined;
}

export function buildBuildingHealthInput(property: any, tickets: any[], nowYear = new Date().getFullYear()): BuildingHealthInputResult {
    const missing: string[] = [];
    const age = recordedAge(property, nowYear);
    const propertyType = String(property?.propertyType || '').trim();
    if (age === null) missing.push('building age / year built');
    if (!propertyType) missing.push('property type');
    if (missing.length) return { ok: false, missing, input: null };

    const jobs = Array.isArray(tickets) ? tickets : [];
    const openJobs = jobs.filter((ticket: any) => !['COMPLETED', 'RESOLVED', 'CLOSED'].includes(String(ticket?.status || '').toUpperCase()));
    return {
        ok: true,
        missing: [],
        input: {
            age: age as number,
            floors: positiveNumber(property?.floors) ?? 1,
            units: positiveNumber(property?.units) ?? 1,
            propertyType,
            hvacType: recordedHvac(property?.hvacType),
            liftCount: positiveNumber(property?.lifts ?? property?.liftCount) ?? 0,
            pool: property?.pool === true,
            complaintFrequency: jobs.length / 3,
            unresolvedTickets: openJobs.length,
            emergencyIncidents: jobs.filter((ticket: any) => ticket?.priority === 'EMERGENCY').length,
            // Not used by the owner-app engine; kept at 0 so no invented load is implied.
            maintenanceLoad: 0,
        },
    };
}

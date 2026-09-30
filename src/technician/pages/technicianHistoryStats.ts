// N-35: truthful technician history metrics. A metric with nothing to measure is null
// ("No data yet") instead of a fabricated 100% (success) or 0% (SLA compliance).
export type TechnicianHistoryStats = {
    total: number;
    success: number | null;
    avgRating: number;
    slaCompliance: number | null;
};

export function computeTechnicianHistoryStats(docs: any[]): TechnicianHistoryStats {
    const jobs = Array.isArray(docs) ? docs : [];
    const closed = jobs.filter((job: any) => job?.status === 'CLOSED').length;

    // Quality score: average of real qualityScore/rating/technicianScore fields
    // recorded on completed tickets (same fields TechnicianDashboardPage reads).
    const ratingScores = jobs
        .map((job: any) => Number(job?.qualityScore || job?.rating || job?.technicianScore || 0))
        .filter((score) => Number.isFinite(score) && score > 0);
    const avgRating = ratingScores.length
        ? Math.round((ratingScores.reduce((sum, score) => sum + score, 0) / ratingScores.length) * 10) / 10
        : 0;

    // SLA compliance: share of tickets that were NOT flagged slaBreached / at-risk.
    const slaEligible = jobs.filter((job: any) => job?.slaBreached !== undefined || job?.slaStatus !== undefined);
    const slaBreachedCount = slaEligible.filter((job: any) => job.slaBreached === true || String(job.slaStatus || '').toLowerCase().includes('risk')).length;
    const slaCompliance = slaEligible.length
        ? Math.round(((slaEligible.length - slaBreachedCount) / slaEligible.length) * 100)
        : null;

    return {
        total: jobs.length,
        success: jobs.length > 0 ? Math.round((closed / jobs.length) * 100) : null,
        avgRating,
        slaCompliance,
    };
}

export function formatPercentOrNoData(value: number | null): string {
    return value === null ? 'No data yet' : `${value}%`;
}

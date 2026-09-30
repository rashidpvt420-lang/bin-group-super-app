// N-25: HR read callables report sections (or staff rows) they could not load. The UI must say
// so instead of rendering the gap as an empty list.
const SECTION_LABELS: Record<string, string> = {
    attendance: 'attendance',
    leaveRequests: 'leave requests',
    documents: 'HR documents',
    payroll: 'payroll evidence',
};

export function describeIncompleteHrRead(...responses: Array<unknown>): string | null {
    const sections = new Set<string>();
    let staffRows = 0;
    for (const response of responses) {
        const data = (response || {}) as { unavailableSections?: unknown; unavailableStaff?: unknown };
        if (Array.isArray(data.unavailableSections)) {
            data.unavailableSections.forEach((section) => sections.add(SECTION_LABELS[String(section)] || String(section)));
        }
        if (Array.isArray(data.unavailableStaff)) staffRows += data.unavailableStaff.length;
    }
    const parts: string[] = [];
    if (sections.size) parts.push([...sections].join(', '));
    if (staffRows) parts.push(`${staffRows} staff record${staffRows === 1 ? '' : 's'}`);
    if (!parts.length) return null;
    return `Some HR data could not be loaded (${parts.join('; ')}). The lists below are incomplete — do not treat missing entries as "none". Refresh to retry.`;
}

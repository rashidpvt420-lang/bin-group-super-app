export interface OwnerDatePolicy {
    showLeaseExpiry: boolean;
    showPermitExpiry: boolean;
    showInspectionExpiry: boolean;
    showMaintenanceReadiness: boolean;
}

const INSTITUTIONAL_ASSET_TYPES = new Set([
    'government_majlis',
    'majlis',
    'majils',
    'hotel',
    'school',
    'hospital',
    'clinic',
    'healthcare'
]);

/**
 * Resolves the date visibility policy based on the asset type.
 * Ensures government, majlis, educational, and healthcare assets hide lease expiry warnings,
 * while showing permit, inspection, and maintenance readiness information.
 */
export function getOwnerDatePolicy(assetType: string | undefined): OwnerDatePolicy {
    const normalizedType = String(assetType || '').trim().toLowerCase().replace(/\s+/g, '_');
    
    // Check if the normalized asset type matches or contains any institutional identifiers
    const isInstitutional = INSTITUTIONAL_ASSET_TYPES.has(normalizedType) ||
        normalizedType.includes('majlis') ||
        normalizedType.includes('majils') ||
        normalizedType.includes('government_majlis');

    if (isInstitutional) {
        return {
            showLeaseExpiry: false,
            showPermitExpiry: true,
            showInspectionExpiry: true,
            showMaintenanceReadiness: true
        };
    }

    // Default policy for residential / rental properties
    return {
        showLeaseExpiry: true,
        showPermitExpiry: true,
        showInspectionExpiry: true,
        showMaintenanceReadiness: true
    };
}

export interface OwnerDatePolicy {
  showLeaseExpiry: boolean;
  showPermitExpiry: boolean;
  showInspectionExpiry: boolean;
  showMaintenanceReadiness: boolean;
  reason: string;
}

const normalize = (value: unknown) => String(value || '').trim().toLowerCase().replace(/[\s-]+/g, '_');

const LEASE_EXEMPT_BY_DEFAULT = [
  'government_majlis',
  'majlis',
  'majils',
  'hotel',
  'resort',
  'school',
  'nursery',
  'university',
  'hospital',
  'clinic',
  'healthcare',
  'land',
  'plot',
  'warehouse',
  'industrial',
  'operational',
];

const RESIDENTIAL_RENTAL_TYPES = [
  'villa',
  'apartment',
  'flat',
  'residential',
  'residential_building',
  'tower',
  'high_rise',
  'skyscraper',
  'rental',
  'leased',
];

const LEASE_MODES = [
  'leased',
  'rented',
  'rental',
  'tenanted',
  'lease_managed',
  'leased_to_operator',
];

function containsAny(value: string, candidates: string[]) {
  return candidates.some((candidate) => value.includes(candidate));
}

function hasLeaseEvidence(metadata: any = {}) {
  return Boolean(
    metadata.leaseExpiry ||
    metadata.leaseEndDate ||
    metadata.leaseValidTo ||
    metadata.tenantId ||
    metadata.tenantUid ||
    metadata.activeTenantId
  );
}

export function getOwnerDatePolicy(assetType?: string, metadata: any = {}): OwnerDatePolicy {
  const normalizedType = normalize(assetType || metadata.assetType || metadata.propertyType || metadata.type || metadata.category || metadata.sector);
  const operatingMode = normalize(metadata.operatingMode || metadata.leaseMode || metadata.occupancyMode || metadata.managementMode);

  const explicitLeaseMode = containsAny(operatingMode, LEASE_MODES);
  const hasLeaseData = hasLeaseEvidence(metadata);
  const isResidentialRental = containsAny(normalizedType, RESIDENTIAL_RENTAL_TYPES);
  const exemptByDefault = containsAny(normalizedType, LEASE_EXEMPT_BY_DEFAULT);

  const showLeaseExpiry = explicitLeaseMode || hasLeaseData || (isResidentialRental && !exemptByDefault);

  return {
    showLeaseExpiry,
    showPermitExpiry: true,
    showInspectionExpiry: true,
    showMaintenanceReadiness: true,
    reason: showLeaseExpiry
      ? 'Lease expiry is shown because the asset is residential/rental, explicitly leased, or has tenant/lease evidence.'
      : 'Lease expiry is hidden by default for this institutional/operational asset type.',
  };
}

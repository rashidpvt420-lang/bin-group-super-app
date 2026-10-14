import crypto from 'crypto';
import { OWNER_AGREEMENT_RESPONSE_TARGET_MINUTES } from './ownerAgreementConfig';
import { SERVICE_ADDONS } from './pricing/uaePricingMatrix2026';

// Single, strict resolver for the services an Owner selected. The Owner Service Agreement PDF is
// driven ONLY by this result. Previously pdfEngine guessed the mode from free-text fields and
// silently fell back to "Maintenance Only" when nothing matched.

export type OwnerContractMode = 'MAINTENANCE_ONLY' | 'PROPERTY_MANAGEMENT_ONLY' | 'MAINTENANCE_AND_PROPERTY_MANAGEMENT';

export type OwnerServiceSelection = {
  mode: OwnerContractMode;
  maintenance: boolean;
  propertyManagement: boolean;
  addOns: Array<{ id: string; label: string; priceAed: number | null; unit: string | null }>;
  sources: string[];
  version: 'OWNER_SERVICE_SELECTION_V1';
};

export class OwnerServiceSelectionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OwnerServiceSelectionError';
  }
}

/**
 * Licensing gate. Property management / brokerage is NOT a listed activity on licence CN-5914744
 * at the time of review; the owner reports it was added on the renewed licence (verify on the new copy). Default ON so existing flows keep working; set OWNER_PM_AGREEMENTS_ENABLED=false
 * to refuse PM-only / combined agreements until the activity is licensed.
 */
export function propertyManagementAgreementsEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return String(env.OWNER_PM_AGREEMENTS_ENABLED ?? 'true').trim().toLowerCase() !== 'false';
}

const TOKEN_TO_MODE: Record<string, OwnerContractMode> = {
  fm_only: 'MAINTENANCE_ONLY',
  fm: 'MAINTENANCE_ONLY',
  maintenance_only: 'MAINTENANCE_ONLY',
  'maintenance only': 'MAINTENANCE_ONLY',
  pm_only: 'PROPERTY_MANAGEMENT_ONLY',
  rent: 'PROPERTY_MANAGEMENT_ONLY',
  property_management_only: 'PROPERTY_MANAGEMENT_ONLY',
  'property management': 'PROPERTY_MANAGEMENT_ONLY',
  'property management only': 'PROPERTY_MANAGEMENT_ONLY',
  both: 'MAINTENANCE_AND_PROPERTY_MANAGEMENT',
  hybrid: 'MAINTENANCE_AND_PROPERTY_MANAGEMENT',
  combined: 'MAINTENANCE_AND_PROPERTY_MANAGEMENT',
  total_care: 'MAINTENANCE_AND_PROPERTY_MANAGEMENT',
  'total-care': 'MAINTENANCE_AND_PROPERTY_MANAGEMENT',
  'total care hybrid': 'MAINTENANCE_AND_PROPERTY_MANAGEMENT',
  maintenance_and_property_management: 'MAINTENANCE_AND_PROPERTY_MANAGEMENT',
};

export function modeFromToken(value: unknown): OwnerContractMode | null {
  const key = String(value ?? '').trim().toLowerCase();
  return key ? TOKEN_TO_MODE[key] ?? null : null;
}

const asRecord = (value: unknown): Record<string, any> => (value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, any>) : {});

function addOnIds(data: Record<string, any>): string[] {
  const raw = data.selectedAddOns ?? data.serviceDetails?.selectedAddOns ?? data.commercialSchedule?.selectedAddOns ?? [];
  const list: unknown[] = Array.isArray(raw) ? raw : typeof raw === 'string' ? raw.split(',') : [];
  return list
    .map((item) => (typeof item === 'string' ? item : String(asRecord(item).id || asRecord(item).name || asRecord(item).label || '')))
    .map((item) => item.trim())
    .filter(Boolean);
}

/** Resolve and validate the Owner's selection from canonical stored contract fields. Throws on none / inconsistent. */
export function resolveOwnerServiceSelection(rawData: unknown, env: Record<string, string | undefined> = process.env): OwnerServiceSelection {
  const data = asRecord(rawData);
  const serviceDetails = asRecord(data.serviceDetails);
  const selectedPlan = asRecord(data.selectedPlan);
  const candidates: Array<[string, unknown]> = [
    ['contractMode', data.contractMode],
    ['serviceDetails.contractMode', serviceDetails.contractMode],
    ['contractType', data.contractType],
    ['planType', data.planType],
    ['selectedPlan.type', selectedPlan.type],
    ['selectedPlan.id', selectedPlan.id],
    ['serviceDetails.selectedPlan', serviceDetails.selectedPlan],
    ['packageName', data.packageName],
    ['planName', data.planName],
  ];
  const found: Array<[string, OwnerContractMode]> = [];
  for (const [source, value] of candidates) {
    const mode = modeFromToken(value);
    if (mode) found.push([source, mode]);
  }
  const properties = Array.isArray(data.properties) ? data.properties : [];
  properties.forEach((property: unknown, index: number) => {
    const mode = modeFromToken(asRecord(property).strategy);
    if (mode) found.push([`properties[${index}].strategy`, mode]);
  });

  if (!found.length) {
    throw new OwnerServiceSelectionError('No service selection is recorded on this contract (Maintenance only, Property Management only, or both). The agreement cannot be generated.');
  }
  const mode = found[0][1];
  const conflict = found.find(([, m]) => m !== mode);
  if (conflict) {
    throw new OwnerServiceSelectionError(`Inconsistent service selection: ${found[0][0]}=${mode} but ${conflict[0]}=${conflict[1]}. The agreement cannot be generated until the contract record is corrected.`);
  }
  const propertyManagement = mode !== 'MAINTENANCE_ONLY';
  if (propertyManagement && !propertyManagementAgreementsEnabled(env)) {
    throw new OwnerServiceSelectionError('Property management agreements are disabled (OWNER_PM_AGREEMENTS_ENABLED=false) until the activity is added to the trade licence.');
  }

  const addOns = addOnIds(data).map((id) => {
    const match = SERVICE_ADDONS.find((addOn) => addOn.id === id || addOn.label.toLowerCase() === id.toLowerCase());
    return match
      ? { id: match.id, label: match.label, priceAed: Number.isFinite(match.price) && match.price > 0 ? match.price : null, unit: match.unit || null }
      : { id, label: id, priceAed: null, unit: null };
  });

  return {
    mode,
    maintenance: mode !== 'PROPERTY_MANAGEMENT_ONLY',
    propertyManagement,
    addOns,
    sources: found.map(([source]) => source),
    version: 'OWNER_SERVICE_SELECTION_V1',
  };
}

export function hashOwnerServiceSelection(selection: OwnerServiceSelection): string {
  const canonical = { mode: selection.mode, maintenance: selection.maintenance, propertyManagement: selection.propertyManagement, addOns: selection.addOns.map((a) => a.id).sort(), version: selection.version };
  return crypto.createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
}

/** Official contractual response targets (ownerAgreementConfig.ts; same as the owner ticket callable). */
export function maintenanceResponseTargets(): Array<{ priority: string; minutes: number }> {
  return Object.entries(OWNER_AGREEMENT_RESPONSE_TARGET_MINUTES).map(([priority, minutes]) => ({ priority, minutes }));
}

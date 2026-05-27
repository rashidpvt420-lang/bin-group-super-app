export type ContractMode = 'MAINTENANCE_ONLY' | 'PROPERTY_MANAGEMENT_ONLY' | 'HYBRID' | 'UNKNOWN';

export function detectContractMode(contract: any): ContractMode {
  if (!contract) return 'UNKNOWN';

  const raw = [
    contract?.contractType,
    contract?.packageType,
    contract?.packageName,
    contract?.planType,
    contract?.serviceType,
    contract?.selectedPlan?.name,
    contract?.selectedPlan?.type,
    contract?.scope,
  ].filter(Boolean).join(' ').toLowerCase();

  const hasMaintenance = /maintenance|facility|fm|mep|repair|preventive/.test(raw);
  const hasPm = /property management|management|pm|leasing|tenant|rent|collection/.test(raw);

  if (hasMaintenance && hasPm) return 'HYBRID';
  if (hasMaintenance) return 'MAINTENANCE_ONLY';
  if (hasPm) return 'PROPERTY_MANAGEMENT_ONLY';

  if (raw.includes('hybrid') || raw.includes('combined')) return 'HYBRID';
  if (raw.includes('pm') || raw.includes('lease') || raw.includes('rent')) return 'PROPERTY_MANAGEMENT_ONLY';
  if (raw.includes('maintenance') || raw.includes('repair')) return 'MAINTENANCE_ONLY';

  return 'UNKNOWN';
}

export function canSeeMaintenance(mode: ContractMode): boolean {
  return mode === 'MAINTENANCE_ONLY' || mode === 'HYBRID' || mode === 'UNKNOWN';
}

export function canSeePropertyManagement(mode: ContractMode): boolean {
  return mode === 'PROPERTY_MANAGEMENT_ONLY' || mode === 'HYBRID';
}

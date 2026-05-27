export type SovereignContractMode = 'MAINTENANCE_ONLY' | 'PROPERTY_MANAGEMENT_ONLY' | 'HYBRID';
export type SovereignOccupancyModel = 'TENANT_BASED' | 'REPORTER_BASED' | 'MIXED' | 'NONE_REQUIRED';
export type SovereignPropertyClass =
  | 'MAJLIS'
  | 'VILLA'
  | 'APARTMENT_BUILDING'
  | 'TOWER'
  | 'HOTEL'
  | 'MALL'
  | 'UNIVERSITY'
  | 'SCHOOL'
  | 'HOSPITAL'
  | 'GOVERNMENT'
  | 'COMMERCIAL'
  | 'INDUSTRIAL'
  | 'UNKNOWN';

export interface ContractModeProfile {
  mode: SovereignContractMode;
  ownerTitle: string;
  tenantTitle: string;
  ownerSummary: string;
  tenantSummary: string;
  showMaintenance: boolean;
  showPropertyManagement: boolean;
  showTenantRegistry: boolean;
  showReporterRegistry: boolean;
  showFinancialRoi: boolean;
  showRentLedger: boolean;
  showComplaintCenter: boolean;
  recommendedDashboardTabs: string[];
}

export interface PropertyIntelligenceProfile {
  propertyClass: SovereignPropertyClass;
  occupancyModel: SovereignOccupancyModel;
  titleDeedStatus: 'VERIFIED' | 'SUBMITTED' | 'MISSING';
  contractRecommendation: SovereignContractMode;
  tenantContractRequired: boolean;
  reporterRequired: boolean;
  ownerProblemStatement: string;
  recommendedContracts: string[];
  requiredEvidence: string[];
  ownerDashboardInstruction: string;
  tenantDashboardInstruction: string;
}

const normalize = (value: unknown) => String(value || '').trim().toUpperCase().replace(/[\s-]+/g, '_');
const text = (...values: unknown[]) => values.map((v) => String(v || '').toLowerCase()).join(' ');

export function resolveContractMode(contract: any): SovereignContractMode {
  const raw = normalize(
    contract?.contractType ||
    contract?.serviceType ||
    contract?.planType ||
    contract?.packageType ||
    contract?.packageName ||
    contract?.selectedPlan?.name ||
    contract?.scope
  );

  const haystack = text(
    contract?.contractType,
    contract?.serviceType,
    contract?.planType,
    contract?.packageType,
    contract?.packageName,
    contract?.selectedPlan?.name,
    contract?.scope,
    contract?.description
  );

  if (raw.includes('HYBRID') || raw.includes('COMBINED') || raw.includes('MAINTENANCE_AND_PM') || (haystack.includes('maintenance') && (haystack.includes('property management') || haystack.includes('pm')))) return 'HYBRID';
  if (raw.includes('PROPERTY_MANAGEMENT') || raw === 'PM_ONLY' || haystack.includes('property management only') || haystack.includes('pm only')) return 'PROPERTY_MANAGEMENT_ONLY';
  return 'MAINTENANCE_ONLY';
}

export function getContractModeProfile(mode: SovereignContractMode): ContractModeProfile {
  if (mode === 'PROPERTY_MANAGEMENT_ONLY') {
    return {
      mode,
      ownerTitle: 'Property Management Only',
      tenantTitle: 'Managed Property Tenant',
      ownerSummary: 'BIN manages occupancy, tenant registry, rent/ledger visibility, move-in/out records, notices, documents, and owner reporting. Maintenance is tracked only when linked as an external or add-on service.',
      tenantSummary: 'Your dashboard focuses on lease, rent ledger, documents, notices, gate passes, amenities, and communication with management. Maintenance requests may be routed to the property manager or external maintenance provider.',
      showMaintenance: false,
      showPropertyManagement: true,
      showTenantRegistry: true,
      showReporterRegistry: true,
      showFinancialRoi: true,
      showRentLedger: true,
      showComplaintCenter: true,
      recommendedDashboardTabs: ['Tenant Registry', 'Rent Ledger', 'Documents', 'Move-In/Move-Out', 'Owner ROI', 'Notices'],
    };
  }

  if (mode === 'HYBRID') {
    return {
      mode,
      ownerTitle: 'Maintenance + Property Management',
      tenantTitle: 'Fully Managed & Maintained Tenant',
      ownerSummary: 'BIN controls the full property lifecycle: occupancy, rent ledger, tenant records, maintenance tickets, technician proof, SLA, ROI, complaints, documents, and asset intelligence.',
      tenantSummary: 'Your dashboard includes lease/rent visibility, complaints, technician tracking, documents, gate passes, amenities, and AI Studio because the property is both managed and maintained by BIN.',
      showMaintenance: true,
      showPropertyManagement: true,
      showTenantRegistry: true,
      showReporterRegistry: true,
      showFinancialRoi: true,
      showRentLedger: true,
      showComplaintCenter: true,
      recommendedDashboardTabs: ['Maintenance Command', 'Tenant Registry', 'Rent Ledger', 'Owner ROI', 'Technician Proof', 'Documents', 'SLA'],
    };
  }

  return {
    mode: 'MAINTENANCE_ONLY',
    ownerTitle: 'Maintenance Only',
    tenantTitle: 'Maintenance Support Access',
    ownerSummary: 'BIN is responsible for maintenance operations only: complaints, technician dispatch, SLA, before/after proof, cost visibility, and preventive maintenance. Rent collection and tenant management remain with the owner unless upgraded.',
    tenantSummary: 'Your dashboard focuses on maintenance complaints, technician status, emergency dispatch, and documents shared for service. Lease/rent tools may be hidden unless the owner upgrades to Property Management.',
    showMaintenance: true,
    showPropertyManagement: false,
    showTenantRegistry: true,
    showReporterRegistry: true,
    showFinancialRoi: false,
    showRentLedger: false,
    showComplaintCenter: true,
    recommendedDashboardTabs: ['Maintenance Tickets', 'SLA', 'Technician Proof', 'Authorized Reporters', 'Property Passport'],
  };
}

export function classifyProperty(property: any): SovereignPropertyClass {
  const raw = text(property?.propertyType, property?.type, property?.assetGrade, property?.sector, property?.subType, property?.titleDeedType, property?.usage, property?.name, property?.propertyName);
  const floors = Number(property?.floors || property?.numberOfFloors || 0);
  const units = Number(property?.units || property?.numberOfUnits || property?.totalUnits || 0);
  if (raw.includes('majlis')) return 'MAJLIS';
  if (raw.includes('hospital') || raw.includes('clinic') || raw.includes('healthcare')) return 'HOSPITAL';
  if (raw.includes('university') || raw.includes('college') || raw.includes('campus')) return 'UNIVERSITY';
  if (raw.includes('school') || raw.includes('nursery')) return 'SCHOOL';
  if (raw.includes('hotel') || raw.includes('resort')) return 'HOTEL';
  if (raw.includes('mall') || raw.includes('retail')) return 'MALL';
  if (raw.includes('government') || raw.includes('municipality') || raw.includes('public')) return 'GOVERNMENT';
  if (raw.includes('industrial') || raw.includes('warehouse') || raw.includes('factory')) return 'INDUSTRIAL';
  if (raw.includes('villa')) return 'VILLA';
  if (floors >= 15 || units >= 80 || raw.includes('tower')) return 'TOWER';
  if (units > 1 || raw.includes('apartment') || raw.includes('building')) return 'APARTMENT_BUILDING';
  if (raw.includes('commercial') || raw.includes('office')) return 'COMMERCIAL';
  return 'UNKNOWN';
}

function titleDeedStatus(property: any): PropertyIntelligenceProfile['titleDeedStatus'] {
  const submitted = property?.titleDeedUrl || property?.titleDeedFile || property?.titleDeedNumber || property?.documents?.titleDeed || property?.titleDeed?.number || property?.titleDeed?.fileUrl;
  const verified = property?.titleDeedVerified === true || property?.documents?.titleDeed?.verified === true || property?.titleDeed?.verified === true;
  if (verified) return 'VERIFIED';
  if (submitted) return 'SUBMITTED';
  return 'MISSING';
}

export function getPropertyIntelligenceProfile(property: any, contract?: any): PropertyIntelligenceProfile {
  const propertyClass = classifyProperty(property);
  const deedStatus = titleDeedStatus(property);
  const units = Number(property?.units || property?.numberOfUnits || property?.totalUnits || 0);

  const nonTenantClasses: SovereignPropertyClass[] = ['MAJLIS', 'HOSPITAL', 'UNIVERSITY', 'SCHOOL', 'GOVERNMENT'];
  const mixedClasses: SovereignPropertyClass[] = ['HOTEL', 'MALL', 'COMMERCIAL'];
  const tenantClasses: SovereignPropertyClass[] = ['VILLA', 'APARTMENT_BUILDING', 'TOWER'];

  let occupancyModel: SovereignOccupancyModel = 'NONE_REQUIRED';
  if (tenantClasses.includes(propertyClass)) occupancyModel = 'TENANT_BASED';
  else if (mixedClasses.includes(propertyClass)) occupancyModel = 'MIXED';
  else if (nonTenantClasses.includes(propertyClass)) occupancyModel = 'REPORTER_BASED';
  else if (units > 0) occupancyModel = 'TENANT_BASED';

  let contractRecommendation: SovereignContractMode = 'MAINTENANCE_ONLY';
  if (occupancyModel === 'TENANT_BASED') contractRecommendation = units > 1 ? 'HYBRID' : 'PROPERTY_MANAGEMENT_ONLY';
  if (occupancyModel === 'MIXED') contractRecommendation = 'HYBRID';
  if (occupancyModel === 'REPORTER_BASED') contractRecommendation = 'MAINTENANCE_ONLY';

  const tenantContractRequired = occupancyModel === 'TENANT_BASED' || occupancyModel === 'MIXED';
  const reporterRequired = occupancyModel === 'REPORTER_BASED' || occupancyModel === 'MIXED';

  const requiredEvidence = ['Title Deed / Ownership Proof', 'Emirates ID or Trade License', 'Exact GPS Pin'];
  if (tenantContractRequired) requiredEvidence.push('Unit List', 'Tenant Lease / Occupancy Records');
  if (reporterRequired) requiredEvidence.push('Authorized Reporter / Facility Contact List');
  if (['HOSPITAL', 'SCHOOL', 'UNIVERSITY', 'HOTEL', 'MALL'].includes(propertyClass)) requiredEvidence.push('Operating License / Facility Permit');

  const recommendedContracts = contractRecommendation === 'HYBRID'
    ? ['Maintenance + Property Management', 'Maintenance Only fallback', 'Property Management Only fallback']
    : contractRecommendation === 'PROPERTY_MANAGEMENT_ONLY'
      ? ['Property Management Only', 'Maintenance + Property Management upgrade']
      : ['Maintenance Only', 'Maintenance + Property Management upgrade if tenant/occupancy management is required'];

  return {
    propertyClass,
    occupancyModel,
    titleDeedStatus: deedStatus,
    contractRecommendation,
    tenantContractRequired,
    reporterRequired,
    ownerProblemStatement: reporterRequired && !tenantContractRequired
      ? 'This property does not operate like a rented apartment. The owner needs controlled maintenance reporting by residents, staff, reception, security, or an owner delegate instead of tenant leases.'
      : tenantContractRequired
        ? 'This property needs tenant/occupancy visibility, lease or unit records, rent ledger logic, and maintenance complaint routing.'
        : 'This property needs asset-level maintenance visibility and ownership proof before full contract recommendation can be finalized.',
    recommendedContracts,
    requiredEvidence,
    ownerDashboardInstruction: tenantContractRequired
      ? 'Show tenant registry, lease/occupancy records, rent ledger where PM is active, complaint history by unit, and property-level ROI.'
      : 'Do not punish the owner with vacant tenant warnings. Show authorized reporters, staff/resident complaint access, maintenance SLA, property passport, and proof of work.',
    tenantDashboardInstruction: tenantContractRequired
      ? 'Show lease, rent/payment status when PM is active, maintenance complaints, documents, gate pass, amenities, and technician tracking.'
      : 'Use reporter/staff access mode. Hide rent ledger and lease pressure unless a real tenancy exists; focus on complaints, proof, and property access rights.',
  };
}

export function summarizePortfolioIntelligence(properties: any[], contract?: any) {
  const profiles = (properties || []).map((property) => getPropertyIntelligenceProfile(property, contract));
  const tenantBased = profiles.filter((profile) => profile.tenantContractRequired).length;
  const reporterBased = profiles.filter((profile) => profile.reporterRequired).length;
  const missingTitleDeeds = profiles.filter((profile) => profile.titleDeedStatus === 'MISSING').length;
  const recommendedHybrid = profiles.filter((profile) => profile.contractRecommendation === 'HYBRID').length;
  return {
    profiles,
    tenantBased,
    reporterBased,
    missingTitleDeeds,
    recommendedHybrid,
    needsTenantContracts: tenantBased > 0,
    needsAuthorizedReporters: reporterBased > 0,
  };
}

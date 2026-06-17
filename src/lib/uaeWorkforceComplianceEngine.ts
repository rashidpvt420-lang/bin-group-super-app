import type { HrJurisdiction } from './uaeHrComplianceConfig';

// Implements calculation logic for the 'eosb-final-settlement', 'emiratisation-gpssa',
// and 'heat-stress-midday-break' rules declared in uaeHrComplianceConfig.ts.

export type LegalEntityProfile = {
  legalEntityId: string;
  legalNameEn: string;
  jurisdiction: HrJurisdiction;
  workLocationEmirate: string;
  emiratisationBand: '20-49-one-hire' | '50-plus-two-percent-growth' | 'not-applicable';
  rulePackVersion: string;
  fieldsRequiringConfirmation: string[];
  notes: string;
};

// Single mainland entity per the captive-pilot scoping decision. Multi-entity/DIFC/ADGM
// support is intentionally out of scope until BIN GROUP actually operates more than one entity.
export const BIN_GROUP_PRIMARY_ENTITY: LegalEntityProfile = {
  legalEntityId: 'bin-group-mainland-primary',
  legalNameEn: 'BIN GROUP (confirm exact name as registered on trade licence)',
  jurisdiction: 'uae-mainland',
  workLocationEmirate: 'Confirm primary emirate of trade licence',
  emiratisationBand: '50-plus-two-percent-growth',
  rulePackVersion: '2026-06-uae-mainland-v1',
  fieldsRequiringConfirmation: ['legalNameEn', 'workLocationEmirate', 'tradeLicenseNumber', 'mohreEstablishmentId'],
  notes: 'BIN GROUP reports 100+ employees, which places it in the 2%-per-year skilled-role Emiratisation growth band rather than the lighter 20-49 single-hire band. Trade licence number and MOHRE establishment ID are not yet on file and must be confirmed before this profile is used for any filing.',
};

export type EosbTerminationReason = 'resignation' | 'employer_terminated' | 'contract_end' | 'death_or_disability';

export type EosbEstimateInput = {
  basicMonthlySalaryAed: number;
  joiningDate: Date;
  lastWorkingDate: Date;
  terminationReason: EosbTerminationReason;
};

export type EosbEstimateResult = {
  serviceYears: number;
  dailyRateAed: number;
  rawGratuityAed: number;
  capAed: number;
  capApplied: boolean;
  resignationMultiplier: number;
  finalEstimateAed: number;
  note: string;
  disclaimer: string;
};

const EOSB_DISCLAIMER =
  'Estimate only, based on Federal Decree-Law No. 33 of 2021 (Art. 51) general-case gratuity rules. Not legal or payroll advice. Confirm with a licensed UAE labour/HR legal consultant before using for an actual final settlement.';

// First 5 years accrue at 21 days' basic wage per year, every year after at 30 days' basic
// wage per year, capped at 2 years' total wage (Federal Decree-Law No. 33 of 2021, Art. 51).
export function calculateEosbEstimate(input: EosbEstimateInput): EosbEstimateResult {
  const { basicMonthlySalaryAed, joiningDate, lastWorkingDate, terminationReason } = input;

  if (!Number.isFinite(basicMonthlySalaryAed) || basicMonthlySalaryAed <= 0 || !(joiningDate instanceof Date) || !(lastWorkingDate instanceof Date) || lastWorkingDate <= joiningDate) {
    return {
      serviceYears: 0,
      dailyRateAed: 0,
      rawGratuityAed: 0,
      capAed: 0,
      capApplied: false,
      resignationMultiplier: 0,
      finalEstimateAed: 0,
      note: 'Basic salary, joining date, and a later last-working date are required to estimate EOSB.',
      disclaimer: EOSB_DISCLAIMER,
    };
  }

  const serviceDays = Math.floor((lastWorkingDate.getTime() - joiningDate.getTime()) / (1000 * 60 * 60 * 24));
  const serviceYears = serviceDays / 365;

  if (serviceYears < 1) {
    return {
      serviceYears,
      dailyRateAed: Math.round((basicMonthlySalaryAed / 30) * 100) / 100,
      rawGratuityAed: 0,
      capAed: basicMonthlySalaryAed * 24,
      capApplied: false,
      resignationMultiplier: 0,
      finalEstimateAed: 0,
      note: 'Less than 1 year of continuous service: no statutory gratuity entitlement.',
      disclaimer: EOSB_DISCLAIMER,
    };
  }

  const dailyRateAed = basicMonthlySalaryAed / 30;
  const yearsAtTierOne = Math.min(serviceYears, 5);
  const yearsAtTierTwo = Math.max(0, serviceYears - 5);
  const rawGratuityAed = yearsAtTierOne * 21 * dailyRateAed + yearsAtTierTwo * 30 * dailyRateAed;
  const capAed = basicMonthlySalaryAed * 24;
  const cappedGratuityAed = Math.min(rawGratuityAed, capAed);

  let resignationMultiplier = 1;
  let note = 'Full gratuity rate applies (employer-initiated termination, contract end, or death/disability).';
  if (terminationReason === 'resignation') {
    if (serviceYears < 3) {
      resignationMultiplier = 1 / 3;
      note = 'Voluntary resignation between 1 and 3 years of service: statutory reduction to 1/3 of calculated gratuity.';
    } else if (serviceYears < 5) {
      resignationMultiplier = 2 / 3;
      note = 'Voluntary resignation between 3 and 5 years of service: statutory reduction to 2/3 of calculated gratuity.';
    } else {
      resignationMultiplier = 1;
      note = 'Voluntary resignation after 5+ years of service: full calculated gratuity applies.';
    }
  }

  const finalEstimateAed = Math.round(cappedGratuityAed * resignationMultiplier);

  return {
    serviceYears: Math.round(serviceYears * 100) / 100,
    dailyRateAed: Math.round(dailyRateAed * 100) / 100,
    rawGratuityAed: Math.round(rawGratuityAed),
    capAed,
    capApplied: rawGratuityAed > capAed,
    resignationMultiplier,
    finalEstimateAed,
    note,
    disclaimer: EOSB_DISCLAIMER,
  };
}

export type EmiratisationStatus = {
  applicable: boolean;
  band: LegalEntityProfile['emiratisationBand'];
  totalHeadcount: number;
  emiratiHeadcount: number;
  currentPct: number;
  requiredPct: number;
  gapPct: number;
  onTrack: boolean;
  note: string;
};

const UAE_NATIONALITY_TOKENS = new Set(['uae', 'emirati', 'united arab emirates', 'uae national']);

function isUaeNational(nationality: unknown): boolean {
  return UAE_NATIONALITY_TOKENS.has(String(nationality || '').trim().toLowerCase());
}

// MOHRE's Emiratisation rule requires 50+ employee mainland establishments in scoped activities
// to grow Emirati representation in skilled roles by 2% per year from a confirmed baseline year.
// baselineYear/targetAnnualGrowthPct are inputs (not hard-coded) because the real baseline depends
// on BIN GROUP's MOHRE Emiratisation notice, which has not been confirmed.
export function summarizeEmiratisation(
  staffList: Array<{ nationality?: unknown }>,
  options: { baselineYear: number; asOfYear?: number; targetAnnualGrowthPct?: number } = { baselineYear: 2024 }
): EmiratisationStatus {
  const totalHeadcount = staffList.length;
  const emiratiHeadcount = staffList.filter((s) => isUaeNational(s.nationality)).length;
  const band: LegalEntityProfile['emiratisationBand'] = totalHeadcount >= 50 ? '50-plus-two-percent-growth' : totalHeadcount >= 20 ? '20-49-one-hire' : 'not-applicable';

  if (band === 'not-applicable' || totalHeadcount === 0) {
    return {
      applicable: false,
      band,
      totalHeadcount,
      emiratiHeadcount,
      currentPct: 0,
      requiredPct: 0,
      gapPct: 0,
      onTrack: true,
      note: 'Below the 20-employee threshold where Emiratisation quotas apply.',
    };
  }

  const currentPct = totalHeadcount ? Math.round((emiratiHeadcount / totalHeadcount) * 1000) / 10 : 0;

  if (band === '20-49-one-hire') {
    const required = 1;
    return {
      applicable: true,
      band,
      totalHeadcount,
      emiratiHeadcount,
      currentPct,
      requiredPct: Math.round((required / totalHeadcount) * 1000) / 10,
      gapPct: emiratiHeadcount >= required ? 0 : Math.round(((required - emiratiHeadcount) / totalHeadcount) * 1000) / 10,
      onTrack: emiratiHeadcount >= required,
      note: '20-49 employee band: at least 1 Emirati hire required in a specified skilled role.',
    };
  }

  const asOfYear = options.asOfYear ?? new Date().getFullYear();
  const annualGrowthPct = options.targetAnnualGrowthPct ?? 2;
  const yearsSinceBaseline = Math.max(0, asOfYear - options.baselineYear);
  const requiredPct = Math.round(annualGrowthPct * yearsSinceBaseline * 10) / 10;
  const gapPct = Math.max(0, Math.round((requiredPct - currentPct) * 10) / 10);

  return {
    applicable: true,
    band,
    totalHeadcount,
    emiratiHeadcount,
    currentPct,
    requiredPct,
    gapPct,
    onTrack: currentPct >= requiredPct,
    note: `50+ employee band: cumulative ${annualGrowthPct}%/year growth target in skilled roles since baseline year ${options.baselineYear} (confirm exact baseline against BIN GROUP's MOHRE Emiratisation notice).`,
  };
}

export type GpssaStatus = {
  applicable: boolean;
  dueDate: Date | null;
  daysRemaining: number | null;
  overdue: boolean;
  registered: boolean;
};

// GPSSA pension registration applies only to UAE/GCC national employees and is due within
// approximately 30 working days of joining; approximated here as 42 calendar days.
const GPSSA_REGISTRATION_WINDOW_DAYS = 42;

export function getGpssaRegistrationStatus(input: {
  nationality: unknown;
  joiningDate: Date | null;
  gpssaRegisteredAt?: Date | null;
  asOfDate?: Date;
}): GpssaStatus {
  if (!isUaeNational(input.nationality)) {
    return { applicable: false, dueDate: null, daysRemaining: null, overdue: false, registered: false };
  }
  if (!input.joiningDate) {
    return { applicable: true, dueDate: null, daysRemaining: null, overdue: false, registered: Boolean(input.gpssaRegisteredAt) };
  }

  const dueDate = new Date(input.joiningDate.getTime() + GPSSA_REGISTRATION_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  if (input.gpssaRegisteredAt) {
    return { applicable: true, dueDate, daysRemaining: null, overdue: input.gpssaRegisteredAt > dueDate, registered: true };
  }

  const asOfDate = input.asOfDate ?? new Date();
  const daysRemaining = Math.ceil((dueDate.getTime() - asOfDate.getTime()) / (1000 * 60 * 60 * 24));
  return { applicable: true, dueDate, daysRemaining, overdue: daysRemaining < 0, registered: false };
}

export function summarizeGpssaRegistrations<T extends { nationality?: unknown; joiningDate?: unknown; hireDate?: unknown; createdAt?: unknown; gpssaRegisteredAt?: unknown }>(
  staffList: T[],
  asOfDate: Date = new Date()
) {
  const toDate = (value: unknown): Date | null => {
    if (!value) return null;
    const candidate = value as { toDate?: () => Date };
    const date = typeof candidate.toDate === 'function' ? candidate.toDate() : new Date(String(value));
    return Number.isNaN(date.getTime()) ? null : date;
  };

  const results = staffList.map((staff) => ({
    staff,
    status: getGpssaRegistrationStatus({
      nationality: staff.nationality,
      joiningDate: toDate(staff.joiningDate || staff.hireDate || staff.createdAt),
      gpssaRegisteredAt: toDate(staff.gpssaRegisteredAt),
      asOfDate,
    }),
  }));

  return {
    applicableCount: results.filter((r) => r.status.applicable).length,
    registeredCount: results.filter((r) => r.status.applicable && r.status.registered).length,
    overdueCount: results.filter((r) => r.status.applicable && r.status.overdue).length,
    overdueStaff: results.filter((r) => r.status.applicable && r.status.overdue).map((r) => r.staff),
  };
}

export type HeatStressSeasonStatus = {
  inSeason: boolean;
  inRestrictedWindowNow: boolean;
  seasonLabel: string;
  windowLabel: string;
};

// Federal heat-stress rule: outdoor direct-sun work is banned 12:30-15:00, 15 June - 15 September.
export function getHeatStressSeasonStatus(now: Date = new Date()): HeatStressSeasonStatus {
  const year = now.getFullYear();
  const seasonStart = new Date(year, 5, 15, 0, 0, 0);
  const seasonEnd = new Date(year, 8, 15, 23, 59, 59);
  const inSeason = now >= seasonStart && now <= seasonEnd;

  const minutesNow = now.getHours() * 60 + now.getMinutes();
  const windowStart = 12 * 60 + 30;
  const windowEnd = 15 * 60;
  const inRestrictedWindowNow = inSeason && minutesNow >= windowStart && minutesNow < windowEnd;

  return {
    inSeason,
    inRestrictedWindowNow,
    seasonLabel: '15 June - 15 September',
    windowLabel: '12:30 - 15:00',
  };
}

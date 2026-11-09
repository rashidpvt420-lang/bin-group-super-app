// P2-16: server copy of the EOSB (gratuity) estimate so staff never read salary from the client.
// Kept identical to src/lib/uaeWorkforceComplianceEngine.ts calculateEosbEstimate (Decree-Law 33/2021, Art. 51).

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

export const EOSB_DISCLAIMER =
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

  // Federal Decree-Law No. 33 of 2021 (Art. 51) removed the old resignation reductions (1/3, 2/3).
  // Resignation and termination after 1+ year of service both earn full gratuity.
  const resignationMultiplier = 1;
  const note = terminationReason === 'resignation'
    ? 'Voluntary resignation after 1+ year of service: full calculated gratuity applies (Decree-Law 33/2021, no resignation reduction).'
    : 'Full gratuity rate applies (termination, contract end, or death/disability).';

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

export type TruthStatus = 'LIVE' | 'VERIFIED' | 'ESTIMATED' | 'FORECAST' | 'MISSING';

export interface TruthMetric {
  value: number | null;
  status: TruthStatus;
  basis: string;
}

const num = (value: unknown): number => {
  if (value === null || value === undefined || value === '') return 0;
  const parsed = Number(String(value).replace(/[^0-9.-]/g, ''));
  return Number.isFinite(parsed) ? parsed : 0;
};

const firstPositive = (...values: unknown[]): number => {
  for (const value of values) {
    const parsed = num(value);
    if (parsed > 0) return parsed;
  }
  return 0;
};

const millis = (value: any): number => {
  if (!value) return 0;
  if (typeof value?.toDate === 'function') return value.toDate().getTime();
  if (value?.seconds) return value.seconds * 1000;
  if (value?._seconds) return value._seconds * 1000;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
};

const upper = (value: unknown) => String(value || '').trim().toUpperCase().replace(/\s+/g, '_');

export const formatAed = (value: number | null) =>
  value === null ? '—' : `AED ${Math.round(value).toLocaleString()}`;

export const formatPercent = (value: number | null) =>
  value === null ? '—' : `${value.toFixed(1)}%`;

export function resolveDigitalTwin(properties: any[]) {
  return properties.reduce(
    (acc, property) => {
      acc.properties += 1;
      acc.floors += firstPositive(property?.floors, property?.numberOfFloors, property?.floorsCount);
      acc.units += firstPositive(property?.units, property?.numberOfUnits, property?.totalUnits, property?.unitsCount);
      acc.spaces += [
        property?.rooms,
        property?.roomCount,
        property?.bedrooms,
        property?.offices,
        property?.officeCount,
        property?.shops,
        property?.retailUnits,
        property?.majlisRooms,
        property?.halls,
        property?.suites,
      ].reduce((sum, value) => sum + num(value), 0);
      const assetArrays = [
        property?.assets,
        property?.equipment,
        property?.appliances,
        property?.hvacAssets,
        property?.fireSafetyAssets,
      ];
      acc.assets += assetArrays.reduce((sum, rows) => sum + (Array.isArray(rows) ? rows.length : 0), 0);
      return acc;
    },
    { properties: 0, floors: 0, units: 0, spaces: 0, assets: 0 },
  );
}

export function resolveOwnerFinancialTruth(properties: any[], contract: any = {}) {
  const annualRentalIncome = properties.reduce(
    (sum, p) => sum + firstPositive(p?.annualRentalIncome, p?.annualRent, p?.rentAnnual, p?.expectedAnnualRent),
    0,
  );
  const recordedRentCollected = properties.reduce(
    (sum, p) => sum + firstPositive(p?.rentCollectedTotal, p?.rentCollected, p?.totalRentCollected),
    0,
  );
  const maintenanceCost = properties.reduce(
    (sum, p) => sum + firstPositive(p?.maintenanceCostTotal, p?.maintenanceCost, p?.annualMaintenanceCost),
    0,
  );
  const operatingExpenses = properties.reduce(
    (sum, p) => sum + firstPositive(p?.operatingExpenses, p?.annualOperatingExpenses, p?.opex),
    0,
  );
  const managementFees = properties.reduce(
    (sum, p) => sum + firstPositive(p?.managementFeesTotal, p?.annualManagementFees),
    0,
  );
  const explicitValue = properties.reduce(
    (sum, p) => sum + firstPositive(p?.purchasePrice, p?.acquisitionCost, p?.bookValue),
    0,
  );
  const estimatedValue = properties.reduce(
    (sum, p) => sum + firstPositive(p?.estimatedMarketValue, p?.marketValueEstimate, p?.valuationEstimate),
    0,
  );
  const propertyValue = explicitValue || estimatedValue;
  const valueStatus: TruthStatus = explicitValue > 0 ? 'VERIFIED' : estimatedValue > 0 ? 'ESTIMATED' : 'MISSING';

  const noi = annualRentalIncome > 0
    ? Math.max(0, annualRentalIncome - maintenanceCost - operatingExpenses - managementFees)
    : null;
  const grossYield = annualRentalIncome > 0 && propertyValue > 0 ? (annualRentalIncome / propertyValue) * 100 : null;
  const netYield = noi !== null && propertyValue > 0 ? (noi / propertyValue) * 100 : null;

  const totalUnits = properties.reduce(
    (sum, p) => sum + firstPositive(p?.units, p?.numberOfUnits, p?.totalUnits, p?.unitsCount),
    0,
  );
  const occupiedUnits = properties.reduce(
    (sum, p) => sum + firstPositive(p?.occupiedUnits, p?.activeTenants, p?.tenantCount),
    0,
  );
  const occupancy = totalUnits > 0 && occupiedUnits <= totalUnits ? (occupiedUnits / totalUnits) * 100 : null;

  const marketRentEstimate = properties.reduce(
    (sum, p) => sum + firstPositive(p?.estimatedMarketRentAnnual, p?.marketRentAnnual, p?.marketRentEstimate),
    0,
  );
  const potentialUplift = marketRentEstimate > 0 && annualRentalIncome > 0
    ? Math.max(0, marketRentEstimate - annualRentalIncome)
    : null;

  return {
    annualRentalIncome: {
      value: annualRentalIncome || null,
      status: annualRentalIncome > 0 ? 'VERIFIED' as TruthStatus : 'MISSING' as TruthStatus,
      basis: annualRentalIncome > 0 ? 'Property lease/rent records' : 'Annual rent data is not recorded yet',
    },
    recordedRentCollected: {
      value: recordedRentCollected || null,
      status: recordedRentCollected > 0 ? 'LIVE' as TruthStatus : 'MISSING' as TruthStatus,
      basis: recordedRentCollected > 0 ? 'Recorded property collection totals' : 'No collection total recorded',
    },
    noi: {
      value: noi,
      status: noi !== null ? 'VERIFIED' as TruthStatus : 'MISSING' as TruthStatus,
      basis: 'Annual rent less recorded maintenance, operating expenses and management fees',
    },
    grossYield: {
      value: grossYield,
      status: grossYield !== null ? valueStatus : 'MISSING' as TruthStatus,
      basis: propertyValue > 0 ? 'Annual rent divided by recorded property value basis' : 'Property value basis missing',
    },
    netYield: {
      value: netYield,
      status: netYield !== null ? valueStatus : 'MISSING' as TruthStatus,
      basis: propertyValue > 0 ? 'NOI divided by recorded property value basis' : 'Property value basis missing',
    },
    propertyValue: {
      value: propertyValue || null,
      status: valueStatus,
      basis: explicitValue > 0 ? 'Purchase/acquisition/book value' : estimatedValue > 0 ? 'Stored market estimate' : 'No value basis recorded',
    },
    occupancy: {
      value: occupancy,
      status: occupancy !== null ? 'LIVE' as TruthStatus : 'MISSING' as TruthStatus,
      basis: occupancy !== null ? `${occupiedUnits} occupied of ${totalUnits} recorded units` : 'Occupied-unit data incomplete',
    },
    maintenanceCost: {
      value: maintenanceCost || null,
      status: maintenanceCost > 0 ? 'LIVE' as TruthStatus : 'MISSING' as TruthStatus,
      basis: 'Recorded maintenance expenditure',
    },
    potentialUplift: {
      value: potentialUplift,
      status: potentialUplift !== null ? 'ESTIMATED' as TruthStatus : 'MISSING' as TruthStatus,
      basis: potentialUplift !== null ? 'Stored market-rent estimate minus recorded annual rent' : 'Market-rent estimate not connected',
    },
    annualContractValue: firstPositive(contract?.annualContractValue, contract?.annualValue, contract?.totalValue),
  };
}

export function resolvePropertyHealth(properties: any[], tickets: any[]) {
  let score = 100;
  const reasons: string[] = [];
  const openTickets = tickets.filter((ticket) => !['COMPLETED', 'CLOSED', 'CANCELLED', 'CANCELED'].includes(upper(ticket?.status)));
  const criticalTickets = openTickets.filter((ticket) =>
    ['CRITICAL', 'EMERGENCY', 'URGENT'].includes(upper(ticket?.priority || ticket?.severity)),
  );

  const missingTitle = properties.filter((p) =>
    !(p?.titleDeedUrl || p?.titleDeedFileUrl || p?.titleDeedNumber || p?.ownershipDocumentUrl),
  ).length;
  const missingGeo = properties.filter((p) =>
    !(p?.geoVerified || p?.gpsVerified || p?.coordinates || p?.location?.lat || p?.latitude || p?.lat),
  ).length;

  if (missingTitle) {
    const deduction = Math.min(15, missingTitle * 5);
    score -= deduction;
    reasons.push(`-${deduction}: ${missingTitle} property record(s) missing title evidence`);
  }
  if (missingGeo) {
    const deduction = Math.min(10, missingGeo * 3);
    score -= deduction;
    reasons.push(`-${deduction}: ${missingGeo} property record(s) missing verified location`);
  }
  if (openTickets.length) {
    const deduction = Math.min(20, openTickets.length * 2);
    score -= deduction;
    reasons.push(`-${deduction}: ${openTickets.length} open maintenance issue(s)`);
  }
  if (criticalTickets.length) {
    const deduction = Math.min(20, criticalTickets.length * 5);
    score -= deduction;
    reasons.push(`-${deduction}: ${criticalTickets.length} urgent/critical issue(s)`);
  }

  return {
    score: Math.max(0, Math.round(score)),
    reasons: reasons.length ? reasons : ['No current deductions from the records available to BIN'],
    openTickets: openTickets.length,
    criticalTickets: criticalTickets.length,
  };
}

export function resolvePredictiveMaintenance(tickets: any[]) {
  const groups = new Map<string, any[]>();
  for (const ticket of tickets) {
    const key = upper(ticket?.category || ticket?.serviceType || ticket?.issueType || 'GENERAL');
    const rows = groups.get(key) || [];
    rows.push(ticket);
    groups.set(key, rows);
  }

  return Array.from(groups.entries())
    .filter(([, rows]) => rows.length >= 3)
    .map(([category, rows]) => ({
      category: category.replace(/_/g, ' '),
      count: rows.length,
      severity: rows.length >= 5 ? 'HIGH' : 'WATCH',
      recommendation: rows.length >= 5
        ? 'Recurring pattern detected. Inspect root cause and compare replacement vs repeated repair cost.'
        : 'Recurring pattern detected. Schedule preventive inspection before another reactive callout.',
    }))
    .sort((a, b) => b.count - a.count);
}

export function resolveOwnerDecisions(properties: any[], tickets: any[], contract: any = {}) {
  const decisions: { priority: 'HIGH' | 'MEDIUM' | 'LOW'; title: string; detail: string }[] = [];
  const health = resolvePropertyHealth(properties, tickets);
  const predictive = resolvePredictiveMaintenance(tickets);

  if (health.criticalTickets > 0) {
    decisions.push({
      priority: 'HIGH',
      title: 'Urgent maintenance requires attention',
      detail: `${health.criticalTickets} urgent/critical ticket(s) are still open.`,
    });
  }
  if (predictive.length > 0) {
    decisions.push({
      priority: predictive[0].severity === 'HIGH' ? 'HIGH' : 'MEDIUM',
      title: `Recurring ${predictive[0].category.toLowerCase()} pattern`,
      detail: predictive[0].recommendation,
    });
  }

  const end = millis(contract?.endDate || contract?.validTo || contract?.leaseEnd);
  if (end > 0) {
    const days = Math.ceil((end - Date.now()) / 86_400_000);
    if (days >= 0 && days <= 90) {
      decisions.push({
        priority: days <= 30 ? 'HIGH' : 'MEDIUM',
        title: 'Contract renewal window',
        detail: `${days} day(s) remain before the recorded contract end date.`,
      });
    }
  }

  const missingTitle = properties.filter((p) =>
    !(p?.titleDeedUrl || p?.titleDeedFileUrl || p?.titleDeedNumber || p?.ownershipDocumentUrl),
  ).length;
  if (missingTitle) {
    decisions.push({
      priority: 'MEDIUM',
      title: 'Complete property trust records',
      detail: `${missingTitle} property record(s) still need title-deed evidence.`,
    });
  }

  return decisions.slice(0, 4);
}

export function resolveTenantResidenceIntelligence(unit: any, contract: any, tickets: any[]) {
  const activeTickets = tickets.filter((ticket) => !['COMPLETED', 'CLOSED', 'CANCELLED', 'CANCELED'].includes(upper(ticket?.status)));
  const end = millis(contract?.endDate || contract?.validTo || contract?.leaseEnd);
  const daysToRenewal = end > 0 ? Math.ceil((end - Date.now()) / 86_400_000) : null;
  const rent = firstPositive(contract?.rentAmount, contract?.monthlyRent, unit?.rentAmount);
  const nextPayment = firstPositive(contract?.nextPaymentAmount, contract?.upcomingPaymentAmount, rent);
  const predictive = resolvePredictiveMaintenance(tickets);

  let health = 100;
  const reasons: string[] = [];
  if (activeTickets.length) {
    const deduction = Math.min(30, activeTickets.length * 8);
    health -= deduction;
    reasons.push(`${activeTickets.length} active request(s)`);
  }
  if (predictive.length) {
    const deduction = Math.min(25, predictive.length * 10);
    health -= deduction;
    reasons.push(`${predictive.length} recurring issue pattern(s)`);
  }

  return {
    unitLabel: unit?.unitNumber || unit?.unitId || 'Property access',
    daysToRenewal,
    nextPayment: nextPayment || null,
    activeTickets: activeTickets.length,
    unitHealth: Math.max(0, health),
    healthReasons: reasons.length ? reasons : ['No active maintenance deductions'],
    predictive,
  };
}

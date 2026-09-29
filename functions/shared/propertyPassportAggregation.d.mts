export function roundAed(value: unknown): number;

export function ledgerMoney(record: Record<string, unknown>): { collected: number; outstanding: number };

export function passportIdentity(property: Record<string, unknown>): { ownerId?: string; ownerEmail?: string };

export function summarizePropertyPassportSources(input?: {
  units?: Array<Record<string, unknown>>;
  leases?: Array<Record<string, unknown>>;
  ledgers?: Array<Record<string, unknown>>;
  tickets?: Array<Record<string, unknown>>;
}): {
  totalUnits: number;
  occupiedUnits: number;
  vacantUnits: number;
  activeLeases: number;
  expiredLeases: number;
  rentCollectedTotal: number;
  rentOutstandingTotal: number;
  maintenanceTicketsOpen: number;
  maintenanceTicketsClosed: number;
  tenantCount: number;
};

export function mergePassportRecords<T extends { id?: string }>(groups: Array<Array<T>>): T[];

export function summarizeOwnerPassportFinancials(passports: Array<Record<string, unknown>>, feeRate?: number): {
  totalRevenue: number;
  maintenanceDeductions: number;
  pendingVerification: number;
  managementFees: number;
  netPayout: number;
  propertyCount: number;
};

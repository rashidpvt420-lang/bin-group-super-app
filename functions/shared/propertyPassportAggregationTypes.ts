export type PassportIdentity = (property: Record<string, unknown>) => {
  ownerId?: string;
  ownerEmail?: string;
};

export type PropertyPassportSummary = {
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

export type SummarizePropertyPassportSources = (input: {
  units?: Array<Record<string, unknown>>;
  leases?: Array<Record<string, unknown>>;
  ledgers?: Array<Record<string, unknown>>;
  tickets?: Array<Record<string, unknown>>;
}) => PropertyPassportSummary;

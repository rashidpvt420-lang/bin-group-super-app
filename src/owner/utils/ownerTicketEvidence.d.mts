export type OwnerTicketEvidenceItem = {
  url: string | null;
  storagePath: string | null;
  source: string;
};
export type OwnerTicketEvidence = {
  before: OwnerTicketEvidenceItem[];
  after: OwnerTicketEvidenceItem[];
  notes: string;
  materials: string[];
  beforeEvidenceConfirmed: boolean;
  afterEvidenceConfirmed: boolean;
  hasAnyEvidence: boolean;
};
export const OWNER_BEFORE_EVIDENCE_FIELDS: readonly string[];
export const OWNER_AFTER_EVIDENCE_FIELDS: readonly string[];
export function storageObjectPathFromUrl(value: unknown): string | null;
export function resolveOwnerTicketEvidence(ticket: unknown): OwnerTicketEvidence;

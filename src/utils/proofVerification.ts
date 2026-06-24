export type ProofDocumentType = 'invoice' | 'contract' | 'certificate';

export type ProofVerificationInput = {
  type: ProofDocumentType;
  id: string;
  reference?: string;
  ownerId?: string;
  tenantId?: string;
  propertyId?: string;
  contractId?: string;
  amount?: number | string;
  issuedAt?: string | number | Date;
  expiresAt?: string | number | Date;
  status?: string;
  host?: string;
};

export type ProofVerificationPayload = ProofVerificationInput & {
  canonical: string;
  hash: string;
  shortHash: string;
  verifyPath: string;
  verifyUrl: string;
  qrPayload: string;
};

const stableValue = (value: unknown) => {
  if (value instanceof Date) return value.toISOString();
  if (value === undefined || value === null) return '';
  return String(value).trim();
};

const stableDocument = (input: ProofVerificationInput) => ({
  type: stableValue(input.type),
  id: stableValue(input.id),
  reference: stableValue(input.reference),
  ownerId: stableValue(input.ownerId),
  tenantId: stableValue(input.tenantId),
  propertyId: stableValue(input.propertyId),
  contractId: stableValue(input.contractId),
  amount: stableValue(input.amount),
  issuedAt: stableValue(input.issuedAt),
  expiresAt: stableValue(input.expiresAt),
  status: stableValue(input.status),
});

const fallbackHash = (value: string) => {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < value.length; i += 1) {
    const ch = value.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  const hex = `${(h2 >>> 0).toString(16).padStart(8, '0')}${(h1 >>> 0).toString(16).padStart(8, '0')}`;
  return `${hex}${hex}${hex}${hex}`.slice(0, 64);
};

export function createProofCanonical(input: ProofVerificationInput) {
  return JSON.stringify(stableDocument(input));
}

export function createProofHash(input: ProofVerificationInput) {
  return fallbackHash(createProofCanonical(input));
}

export function createProofVerificationPayload(input: ProofVerificationInput): ProofVerificationPayload {
  const canonical = createProofCanonical(input);
  const hash = fallbackHash(canonical);
  const shortHash = hash.slice(0, 12).toUpperCase();
  const ref = encodeURIComponent(input.reference || '');
  const id = encodeURIComponent(input.id);
  const verifyPath = input.type === 'certificate'
    ? `/verify/cert/${encodeURIComponent(hash)}?id=${id}&ref=${ref}`
    : `/verify/invoice/${encodeURIComponent(hash)}?type=${encodeURIComponent(input.type)}&id=${id}&ref=${ref}`;
  const host = String(input.host || 'https://bin-group-57c60.web.app').replace(/\/$/, '');
  const verifyUrl = `${host}${verifyPath}`;
  return { ...input, canonical, hash, shortHash, verifyPath, verifyUrl, qrPayload: verifyUrl };
}

export function attachProofVerification<T extends Record<string, any>>(record: T, type: ProofDocumentType, host?: string) {
  const payload = createProofVerificationPayload({
    type,
    id: String(record.id || record.invoiceId || record.contractId || record.certificateId || ''),
    reference: record.reference || record.invoiceNumber || record.contractNumber || record.certificateNumber,
    ownerId: record.ownerId,
    tenantId: record.tenantId,
    propertyId: record.propertyId,
    contractId: record.contractId,
    amount: record.amount || record.total || record.totalAmount,
    issuedAt: record.issuedAt || record.createdAt,
    expiresAt: record.expiresAt || record.validUntil,
    status: record.status,
    host,
  });
  return {
    ...record,
    proofHash: payload.hash,
    proofShortHash: payload.shortHash,
    proofVerifyUrl: payload.verifyUrl,
    proofQrPayload: payload.qrPayload,
    proofCanonical: payload.canonical,
  };
}

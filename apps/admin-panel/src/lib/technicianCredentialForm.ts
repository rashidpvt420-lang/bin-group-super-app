// Pure helpers for the HR "Verified credentials" panel. Kept free of React/Firebase so the payload
// rules can be regression-tested statically. The server (adminRecordTechnicianCredentials) remains
// the authority and re-validates everything.

export type DecisionDraft = { decision: string; expiryDate: string; documentReference: string };
export type CertificationDraft = DecisionDraft & { name: string };
export type CredentialDraft = {
  medicalCard: DecisionDraft;
  drivingLicence: DecisionDraft;
  certifications: CertificationDraft[];
  reviewNote: string;
  attested: boolean;
};
export type CredentialSummary = {
  medicalCardStatus?: string | null;
  medicalCardExpiry?: string | null;
  drivingLicenseStatus?: string | null;
  drivingLicenseExpiry?: string | null;
  certificationsStatus?: string | null;
  certifications?: Array<{ name: string | null; status: string | null; expiryAt: string | null }>;
  credentialRenewalPending?: boolean;
  latestCredentialRenewalRequestId?: string | null;
};

const blank = (): DecisionDraft => ({ decision: '', expiryDate: '', documentReference: '' });

export function emptyCredentialDraft(): CredentialDraft {
  return { medicalCard: blank(), drivingLicence: blank(), certifications: [], reviewNote: '', attested: false };
}

export function credentialChipColor(status: string | null | undefined, expiry: string | null | undefined, nowMs = Date.now()) {
  const value = String(status || '').toLowerCase();
  if (expiry && Date.parse(expiry) <= nowMs) return 'error';
  if (['verified', 'valid', 'approved', 'active', 'current'].includes(value)) return 'success';
  if (value === 'rejected' || value === 'expired') return 'error';
  return 'warning';
}

function decisionPayload(draft: DecisionDraft, label: string): { ok: true; value: Record<string, string> | null } | { ok: false; error: string } {
  if (!draft.decision) return { ok: true, value: null };
  const reference = draft.documentReference.trim();
  if (draft.decision === 'VERIFIED') {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.expiryDate)) return { ok: false, error: `${label}: enter the expiry date shown on the original document.` };
    if (!reference) return { ok: false, error: `${label}: enter the document number or reference you checked.` };
    return { ok: true, value: { decision: 'VERIFIED', expiryDate: draft.expiryDate, documentReference: reference } };
  }
  return { ok: true, value: { decision: 'REJECTED', documentReference: reference } };
}

export function buildCredentialPayload(uid: string, draft: CredentialDraft, renewalRequestId?: string | null):
  { ok: true; payload: Record<string, unknown> } | { ok: false; error: string } {
  if (!draft.attested) return { ok: false, error: 'Confirm you personally checked the original documents.' };
  if (draft.reviewNote.trim().length < 8) return { ok: false, error: 'Describe which original documents you checked (at least 8 characters).' };
  const payload: Record<string, unknown> = { technicianId: uid, reviewNote: draft.reviewNote.trim() };
  const medical = decisionPayload(draft.medicalCard, 'Medical card');
  if (!medical.ok) return medical;
  if (medical.value) payload.medicalCard = medical.value;
  const licence = decisionPayload(draft.drivingLicence, 'Driving licence');
  if (!licence.ok) return licence;
  if (licence.value) payload.drivingLicence = licence.value;
  if (draft.certifications.length) {
    const rows: Array<Record<string, string>> = [];
    for (const [index, item] of draft.certifications.entries()) {
      const name = item.name.trim();
      if (!name) return { ok: false, error: `Certificate ${index + 1}: enter its name.` };
      if (!item.decision) return { ok: false, error: `Certificate "${name}": choose Verified or Rejected.` };
      const parsed = decisionPayload(item, `Certificate "${name}"`);
      if (!parsed.ok) return parsed;
      rows.push({ name, ...(parsed.value as Record<string, string>) });
    }
    payload.certifications = rows;
  }
  if (!payload.medicalCard && !payload.drivingLicence && !payload.certifications) {
    return { ok: false, error: 'Choose at least one credential decision.' };
  }
  if (renewalRequestId) payload.renewalRequestId = renewalRequestId;
  return { ok: true, payload };
}

// ---- Verify a credential from a document HR already holds (HR Documents tab) ----
// HR-registered documents (staffHrDocuments) and staff vault uploads (staffDocuments) are only
// evidence. Uploading/registering never makes a credential valid; an Admin/HR Manager opens the
// document, checks the original and records a decision with the expiry they read on it.

export type CredentialKind = 'medicalCard' | 'drivingLicence' | 'certification';
export type DocumentSourceCollection = 'staffHrDocuments' | 'staffDocuments';

const KIND_BY_DOCUMENT_TYPE: Record<DocumentSourceCollection, Record<string, CredentialKind>> = {
  staffHrDocuments: { MEDICAL_CARD: 'medicalCard', DRIVING_LICENCE: 'drivingLicence', DRIVING_LICENSE: 'drivingLicence', CERTIFICATE: 'certification' },
  staffDocuments: { medical_card: 'medicalCard', driving_license: 'drivingLicence', driving_licence: 'drivingLicence', trade_certificate: 'certification' },
};

export function credentialKindForDocument(source: DocumentSourceCollection, documentType: string | null | undefined): CredentialKind | null {
  const raw = String(documentType || '').trim();
  const key = source === 'staffHrDocuments' ? raw.toUpperCase() : raw.toLowerCase();
  return KIND_BY_DOCUMENT_TYPE[source][key] || null;
}

export const CREDENTIAL_KIND_LABEL: Record<CredentialKind, string> = {
  medicalCard: 'Medical card',
  drivingLicence: 'Driving licence',
  certification: 'Certification',
};

export type DocumentVerificationDraft = DecisionDraft & { certificationName: string; reviewNote: string; attested: boolean };

export function emptyDocumentVerificationDraft(): DocumentVerificationDraft {
  // Expiry is deliberately NOT copied from the registered metadata: the reviewer types what the
  // original document shows.
  return { decision: '', expiryDate: '', documentReference: '', certificationName: '', reviewNote: '', attested: false };
}

export function buildDocumentVerificationPayload(
  document: { source: DocumentSourceCollection; id: string; uid: string; documentType: string | null | undefined },
  draft: DocumentVerificationDraft,
): { ok: true; payload: Record<string, unknown> } | { ok: false; error: string } {
  const kind = credentialKindForDocument(document.source, document.documentType);
  if (!kind) return { ok: false, error: 'This document type is not a technician credential (medical card, driving licence or certificate).' };
  if (!document.uid || !document.id) return { ok: false, error: 'The document is not linked to a staff member.' };
  if (!draft.attested) return { ok: false, error: 'Confirm you personally checked the original document.' };
  if (draft.reviewNote.trim().length < 8) return { ok: false, error: 'Describe what you checked (at least 8 characters).' };
  if (!draft.decision) return { ok: false, error: 'Choose Verified or Rejected.' };
  const label = CREDENTIAL_KIND_LABEL[kind];
  const link: Record<string, string> = document.source === 'staffHrDocuments' ? { hrDocumentId: document.id } : { staffDocumentId: document.id };
  let decision: Record<string, string>;
  if (draft.decision === 'VERIFIED') {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.expiryDate)) return { ok: false, error: `${label}: enter the expiry date shown on the original document.` };
    decision = { decision: 'VERIFIED', expiryDate: draft.expiryDate, ...link };
  } else if (draft.decision === 'REJECTED') {
    decision = { decision: 'REJECTED', ...link };
  } else {
    return { ok: false, error: 'Choose Verified or Rejected.' };
  }
  const reference = draft.documentReference.trim();
  if (reference) decision.documentReference = reference;
  const payload: Record<string, unknown> = { technicianId: document.uid, reviewNote: draft.reviewNote.trim() };
  if (kind === 'medicalCard') payload.medicalCard = decision;
  if (kind === 'drivingLicence') payload.drivingLicence = decision;
  if (kind === 'certification') {
    const name = draft.certificationName.trim();
    if (!name) return { ok: false, error: 'Certification: enter the certificate name (e.g. "HVAC Technician").' };
    payload.certifications = [{ name, ...decision }];
  }
  return { ok: true, payload };
}

import React, { useEffect, useState } from 'react';
import {
  Alert, Button, Checkbox, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, MenuItem, Stack, TextField, Typography,
} from '@mui/material';
import { functions, httpsCallable } from '../../lib/firebase';
import {
  CREDENTIAL_KIND_LABEL,
  buildDocumentVerificationPayload,
  credentialKindForDocument,
  emptyDocumentVerificationDraft,
  type DocumentSourceCollection,
  type DocumentVerificationDraft,
} from '../../lib/technicianCredentialForm';

// Verify a technician credential from a document HR already holds (HR-registered metadata or a
// staff vault upload). Registering/uploading never makes a credential valid; this dialog records
// the reviewer's decision through adminRecordTechnicianCredentials (Admin/HR Manager, MFA,
// audited), which links the document and sets the technician readiness status and expiry.

export type VerifiableDocument = {
  source: DocumentSourceCollection;
  id: string;
  uid: string;
  staffName: string;
  documentType: string | null;
  fileName?: string | null;
  registeredExpiry?: string | null;
};

function safeError(error: any) {
  return String(error?.details || error?.message || error?.code || 'Verification could not be saved.')
    .replace(/^FirebaseError:\s*/i, '')
    .slice(0, 360);
}

export default function HrDocumentVerifyDialog({ document, onClose, onSaved }: {
  document: VerifiableDocument | null;
  onClose: () => void;
  onSaved: (message: string) => void | Promise<void>;
}) {
  const [draft, setDraft] = useState<DocumentVerificationDraft>(emptyDocumentVerificationDraft());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { setDraft(emptyDocumentVerificationDraft()); setError(''); }, [document?.id]);
  if (!document) return null;
  const kind = credentialKindForDocument(document.source, document.documentType);
  const label = kind ? CREDENTIAL_KIND_LABEL[kind] : 'Credential';

  const submit = async () => {
    const built = buildDocumentVerificationPayload(document, draft);
    if (!built.ok) { setError(built.error); return; }
    setBusy(true);
    setError('');
    try {
      const response: any = await httpsCallable(functions, 'adminRecordTechnicianCredentials')(built.payload);
      const remaining: string[] = Array.isArray(response?.data?.remainingReadinessFailures) ? response.data.remainingReadinessFailures : [];
      await onSaved(`${label} ${draft.decision === 'VERIFIED' ? 'verified' : 'rejected'} for ${document.staffName} and audited.${remaining.length ? ` Still blocking dispatch: ${remaining.join(', ')}.` : ' Technician meets every dispatch readiness check.'}`);
      onClose();
    } catch (caught) {
      setError(safeError(caught));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onClose={busy ? undefined : onClose} fullWidth maxWidth="sm" data-testid="hr-document-verify-dialog">
      <DialogTitle sx={{ fontWeight: 950 }}>Verify {label.toLowerCase()} — {document.staffName}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <Alert severity="info">
            Open the document ({document.fileName || 'protected file'}) and check the original. The expiry is not copied from the
            registered metadata{document.registeredExpiry ? ` (registered: ${document.registeredExpiry})` : ''} — enter what the original shows.
            Saving updates the technician&apos;s dispatch readiness and writes an audit entry.
          </Alert>
          {!kind && <Alert severity="warning">This document type is not a technician credential.</Alert>}
          <TextField select fullWidth label="Decision" value={draft.decision} disabled={busy || !kind} onChange={(e) => setDraft({ ...draft, decision: e.target.value })}>
            <MenuItem value="VERIFIED">Verified — original checked and valid</MenuItem>
            <MenuItem value="REJECTED">Rejected</MenuItem>
          </TextField>
          {kind === 'certification' && (
            <TextField fullWidth label="Certificate name" value={draft.certificationName} disabled={busy} onChange={(e) => setDraft({ ...draft, certificationName: e.target.value })} />
          )}
          <TextField fullWidth type="date" label="Expiry on the original" InputLabelProps={{ shrink: true }} value={draft.expiryDate} disabled={busy || draft.decision !== 'VERIFIED'} onChange={(e) => setDraft({ ...draft, expiryDate: e.target.value })} />
          <TextField fullWidth label="Document number (optional — the HR document is linked as the reference)" value={draft.documentReference} disabled={busy} onChange={(e) => setDraft({ ...draft, documentReference: e.target.value })} />
          <TextField fullWidth multiline minRows={2} label="Review note" value={draft.reviewNote} disabled={busy} onChange={(e) => setDraft({ ...draft, reviewNote: e.target.value })} />
          <FormControlLabel control={<Checkbox checked={draft.attested} disabled={busy} onChange={(e) => setDraft({ ...draft, attested: e.target.checked })} />} label="I personally checked the original document." />
          {error && <Alert severity="error">{error}</Alert>}
          <Typography variant="caption" sx={{ opacity: .8 }}>Requires Founder/Admin or HR Manager with an MFA session. You cannot verify your own documents.</Typography>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy}>Cancel</Button>
        <Button data-testid="hr-document-verify-submit" variant="contained" onClick={() => void submit()} disabled={busy || !kind}>Save decision</Button>
      </DialogActions>
    </Dialog>
  );
}

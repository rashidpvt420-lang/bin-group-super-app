import React, { useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  Divider,
  FormControlLabel,
  Grid,
  IconButton,
  MenuItem,
  Paper,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { BadgeCheck, Plus, Trash2 } from 'lucide-react';
import { functions, httpsCallable } from '../../lib/firebase';
import { binThemeTokens } from '../../theme/adminTheme';
import {
  buildCredentialPayload,
  credentialChipColor,
  emptyCredentialDraft,
  type CredentialDraft,
  type CredentialSummary,
} from '../../lib/technicianCredentialForm';

// HR records the outcome of checking a technician's ORIGINAL documents. Every field starts empty:
// the panel never pre-fills, guesses or copies values, and the server re-validates and audits.

function safeError(error: any) {
  return String(error?.details || error?.message || error?.code || 'Credential review could not be saved.')
    .replace(/^FirebaseError:\s*/i, '')
    .slice(0, 360);
}

function dateLabel(value: string | null | undefined) {
  return value ? new Date(value).toLocaleDateString('en-AE', { timeZone: 'Asia/Dubai' }) : '—';
}

function CurrentStatus({ label, status, expiry }: { label: string; status: string | null; expiry: string | null }) {
  return (
    <Stack direction="row" spacing={1} alignItems="center" sx={{ py: .5 }}>
      <Typography variant="body2" sx={{ minWidth: 130, color: 'rgba(255,255,255,.75)' }}>{label}</Typography>
      <Chip size="small" color={credentialChipColor(status, expiry) as any} label={String(status || 'not recorded').toUpperCase()} />
      <Typography variant="caption" sx={{ color: 'rgba(255,255,255,.6)' }}>expires {dateLabel(expiry)}</Typography>
    </Stack>
  );
}

function DecisionFields({ label, value, onChange, disabled }: {
  label: string;
  value: { decision: string; expiryDate: string; documentReference: string };
  onChange: (next: { decision: string; expiryDate: string; documentReference: string }) => void;
  disabled: boolean;
}) {
  return (
    <Grid container spacing={1.5} sx={{ mt: .5 }}>
      <Grid item xs={12} md={4}>
        <TextField select fullWidth size="small" label={`${label} decision`} value={value.decision} disabled={disabled} onChange={(e) => onChange({ ...value, decision: e.target.value })}>
          <MenuItem value="">No change</MenuItem>
          <MenuItem value="VERIFIED">Verified (original checked)</MenuItem>
          <MenuItem value="REJECTED">Rejected</MenuItem>
        </TextField>
      </Grid>
      <Grid item xs={12} md={4}>
        <TextField fullWidth size="small" type="date" InputLabelProps={{ shrink: true }} label="Expiry on document" value={value.expiryDate} disabled={disabled || value.decision !== 'VERIFIED'} onChange={(e) => onChange({ ...value, expiryDate: e.target.value })} />
      </Grid>
      <Grid item xs={12} md={4}>
        <TextField fullWidth size="small" label="Document number / reference" value={value.documentReference} disabled={disabled || !value.decision} onChange={(e) => onChange({ ...value, documentReference: e.target.value })} />
      </Grid>
    </Grid>
  );
}

export default function TechnicianCredentialsPanel({
  uid,
  credentials,
  canManage,
  disabled,
  onSaved,
}: {
  uid: string;
  credentials: CredentialSummary | null;
  canManage: boolean;
  disabled?: boolean;
  onSaved?: () => void | Promise<void>;
}) {
  const [draft, setDraft] = useState<CredentialDraft>(emptyCredentialDraft());
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ severity: 'success' | 'error' | 'warning'; message: string } | null>(null);
  const current = credentials || ({} as CredentialSummary);
  const locked = !canManage || busy || Boolean(disabled);

  const submit = async () => {
    const built = buildCredentialPayload(uid, draft, current.credentialRenewalPending ? current.latestCredentialRenewalRequestId : null);
    if (!built.ok) {
      setNotice({ severity: 'warning', message: built.error });
      return;
    }
    setBusy(true);
    setNotice(null);
    try {
      const response: any = await httpsCallable(functions, 'adminRecordTechnicianCredentials')(built.payload);
      const remaining: string[] = Array.isArray(response?.data?.remainingReadinessFailures) ? response.data.remainingReadinessFailures : [];
      setNotice({
        severity: 'success',
        message: `Credential review saved and audited.${remaining.length ? ` Still blocking dispatch: ${remaining.join(', ')}.` : ' Technician meets every dispatch readiness check.'}`,
      });
      setDraft(emptyCredentialDraft());
      await onSaved?.();
    } catch (error) {
      setNotice({ severity: 'error', message: safeError(error) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Paper data-testid="hr-technician-credentials" sx={{ p: 3, bgcolor: 'rgba(15,23,42,.82)', borderRadius: 4 }}>
      <Stack direction="row" spacing={1} alignItems="center">
        <BadgeCheck size={20} color={binThemeTokens.gold} />
        <Typography variant="h6" fontWeight={950}>Verified credentials</Typography>
      </Stack>
      <Typography variant="body2" sx={{ mt: 1, color: 'rgba(255,255,255,.65)' }}>
        Dispatch requires a verified, unexpired medical card, driving licence and certifications. Record only what you confirmed on the original documents; every save is audited with your name.
      </Typography>
      <Box sx={{ mt: 2 }}>
        <CurrentStatus label="Medical card" status={current.medicalCardStatus || null} expiry={current.medicalCardExpiry || null} />
        <CurrentStatus label="Driving licence" status={current.drivingLicenseStatus || null} expiry={current.drivingLicenseExpiry || null} />
        <CurrentStatus label="Certifications" status={current.certificationsStatus || null} expiry={null} />
        {(current.certifications || []).map((item, index) => (
          <Typography key={`${item.name}-${index}`} variant="caption" display="block" sx={{ ml: 2, color: 'rgba(255,255,255,.65)' }}>• {item.name || 'Unnamed'} — {String(item.status || 'unknown').toUpperCase()} · expires {dateLabel(item.expiryAt)}</Typography>
        ))}
        {current.credentialRenewalPending && <Alert severity="info" sx={{ mt: 1.5 }}>The technician uploaded a renewal for review. Saving below closes that request as approved (all verified) or rejected.</Alert>}
      </Box>

      {canManage && (
        <>
          <Divider sx={{ my: 2 }} />
          <DecisionFields label="Medical card" value={draft.medicalCard} disabled={locked} onChange={(medicalCard) => setDraft({ ...draft, medicalCard })} />
          <DecisionFields label="Driving licence" value={draft.drivingLicence} disabled={locked} onChange={(drivingLicence) => setDraft({ ...draft, drivingLicence })} />
          <Typography variant="subtitle2" fontWeight={900} sx={{ mt: 2, color: binThemeTokens.gold }}>Certifications (replaces the full list when provided)</Typography>
          {draft.certifications.map((item, index) => (
            <Stack key={index} direction="row" spacing={1} alignItems="flex-start" sx={{ mt: 1 }}>
              <TextField size="small" label="Certificate name" value={item.name} disabled={locked} onChange={(e) => setDraft({ ...draft, certifications: draft.certifications.map((row, i) => i === index ? { ...row, name: e.target.value } : row) })} sx={{ minWidth: 160 }} />
              <Box sx={{ flex: 1 }}>
                <DecisionFields label="Certificate" value={item} disabled={locked} onChange={(next) => setDraft({ ...draft, certifications: draft.certifications.map((row, i) => i === index ? { ...row, ...next } : row) })} />
              </Box>
              <IconButton aria-label="Remove certificate" disabled={locked} onClick={() => setDraft({ ...draft, certifications: draft.certifications.filter((_, i) => i !== index) })} sx={{ color: '#fca5a5' }}><Trash2 size={16} /></IconButton>
            </Stack>
          ))}
          <Button size="small" startIcon={<Plus size={15} />} disabled={locked} onClick={() => setDraft({ ...draft, certifications: [...draft.certifications, { name: '', decision: '', expiryDate: '', documentReference: '' }] })} sx={{ mt: 1 }}>ADD CERTIFICATE</Button>
          <TextField fullWidth multiline minRows={2} sx={{ mt: 2 }} label="Review note (which originals you checked)" value={draft.reviewNote} disabled={locked} onChange={(e) => setDraft({ ...draft, reviewNote: e.target.value })} />
          <FormControlLabel sx={{ mt: 1 }} control={<Checkbox checked={draft.attested} disabled={locked} onChange={(e) => setDraft({ ...draft, attested: e.target.checked })} />} label="I personally checked the original documents for the decisions above." />
          {notice && <Alert severity={notice.severity} sx={{ mt: 1.5 }}>{notice.message}</Alert>}
          <Button fullWidth variant="contained" onClick={() => void submit()} disabled={locked} sx={{ mt: 2, bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950 }}>
            {busy ? 'SAVING…' : 'RECORD CREDENTIAL REVIEW'}
          </Button>
        </>
      )}
      {!canManage && <Alert severity="info" sx={{ mt: 2 }}>Only Founder/Admin or an HR Manager can record credential decisions.</Alert>}
    </Paper>
  );
}

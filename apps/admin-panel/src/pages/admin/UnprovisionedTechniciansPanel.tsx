import React, { useState } from 'react';
import { Alert, Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, Stack, TextField, Typography } from '@mui/material';
import { functions, httpsCallable } from '../../lib/firebase';

// Technicians that exist on the dispatch roster (and the live map) or as technician users but were
// never provisioned as staff (created by a seed, script or legacy path without isStaff). The Staff
// Registry used to omit them silently. Founder/Admin can adopt an eligible identity (MFA, audited);
// other gaps need a remediation, which is shown as the reason.

export type UnprovisionedTechnician = {
  uid: string;
  displayName: string;
  email?: string | null;
  reason: 'NOT_PROVISIONED_AS_STAFF' | 'NO_USER_PROFILE' | 'ROLE_MISMATCH' | string;
  status?: string | null;
  onDispatchRoster: boolean;
  specialization?: string | null;
  adoptable: boolean;
};

export const UNPROVISIONED_REASON_LABEL: Record<string, string> = {
  NOT_PROVISIONED_AS_STAFF: 'Technician account exists but was never added to the staff registry',
  NO_USER_PROFILE: 'On the dispatch roster but has no user profile — needs a new staff identity',
  ROLE_MISMATCH: 'On the dispatch roster but the user profile is not a technician — needs review',
};

function safeError(error: any) {
  return String(error?.details || error?.message || error?.code || 'The technician could not be added.').replace(/^FirebaseError:\s*/i, '').slice(0, 300);
}

export default function UnprovisionedTechniciansPanel({ technicians, canAdopt, onAdopted }: {
  technicians: UnprovisionedTechnician[];
  canAdopt: boolean;
  onAdopted: (message: string) => void | Promise<void>;
}) {
  const [target, setTarget] = useState<UnprovisionedTechnician | null>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  if (!technicians.length) return null;

  const adopt = async () => {
    if (!target) return;
    if (reason.trim().length < 8) { setError('Record why this technician is being added (at least 8 characters).'); return; }
    setBusy(true);
    setError('');
    try {
      await httpsCallable(functions, 'adminAdoptTechnicianIntoStaffRegistry')({ uid: target.uid, reason: reason.trim() });
      await onAdopted(`${target.displayName} added to the staff registry (audited). Complete the HR profile from original documents.`);
      setTarget(null);
      setReason('');
    } catch (caught) {
      setError(safeError(caught));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Box data-testid="hr-unprovisioned-technicians" sx={{ p: 2.5, pt: 0 }}>
      <Alert severity="warning">
        <Typography fontWeight={900}>{technicians.length} technician{technicians.length === 1 ? '' : 's'} not in the staff registry</Typography>
        <Typography variant="body2" sx={{ mb: 1 }}>
          These identities can appear on the dispatch roster and live map but were created outside staff provisioning, so HR records, attendance and credential checks could not reach them.
        </Typography>
        <Stack spacing={1}>
          {technicians.map((tech) => (
            <Stack key={tech.uid} direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ sm: 'center' }}>
              <Typography fontWeight={800} sx={{ minWidth: 160 }}>{tech.displayName}</Typography>
              {tech.specialization && <Chip size="small" label={tech.specialization} />}
              {tech.onDispatchRoster && <Chip size="small" color="info" label="On dispatch roster" />}
              <Typography variant="caption" sx={{ flex: 1 }}>{UNPROVISIONED_REASON_LABEL[tech.reason] || tech.reason}</Typography>
              {canAdopt && tech.adoptable && (
                <Button size="small" variant="outlined" data-testid="hr-adopt-technician" onClick={() => { setTarget(tech); setReason(''); setError(''); }}>Add to staff registry</Button>
              )}
            </Stack>
          ))}
        </Stack>
        {!canAdopt && <Typography variant="caption" sx={{ display: 'block', mt: 1 }}>Founder/Admin can add eligible technicians to the registry.</Typography>}
      </Alert>
      <Dialog open={Boolean(target)} onClose={busy ? undefined : () => setTarget(null)} fullWidth maxWidth="sm">
        <DialogTitle sx={{ fontWeight: 950 }}>Add {target?.displayName} to the staff registry</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <Alert severity="info">
              Keeps the technician&apos;s role and current suspension state, adds the staff markers and empty HR profile shells.
              No salary, Emirates ID or employee ID is created — HR completes them from original documents. Requires an Admin MFA session; audited.
            </Alert>
            <TextField fullWidth multiline minRows={2} label="Reason" value={reason} disabled={busy} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Created by the legacy onboarding script; confirmed active employee with operations." />
            {error && <Alert severity="error">{error}</Alert>}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setTarget(null)} disabled={busy}>Cancel</Button>
          <Button variant="contained" data-testid="hr-adopt-technician-confirm" onClick={() => void adopt()} disabled={busy}>Add to registry</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

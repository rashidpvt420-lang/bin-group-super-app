import React, { useState } from 'react';
import { Alert, Box, Button, Paper, Stack, TextField, Typography, alpha } from '@mui/material';
import { Link2, ShieldCheck } from 'lucide-react';
import { functions, httpsCallable } from '../../lib/firebase';
import { useRole } from '../../context/RoleContext';
import { binThemeTokens } from '../../theme/binGroupTheme';

type TenantUnitLinkFallbackProps = {
  message?: string;
  compact?: boolean;
};

export default function TenantUnitLinkFallback({ message, compact = false }: TenantUnitLinkFallbackProps) {
  const { user } = useRole();
  const [propertyName, setPropertyName] = useState('');
  const [unitNumber, setUnitNumber] = useState('');
  const [leaseReference, setLeaseReference] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<{ type: 'success' | 'error' | 'warning' | 'info'; text: string } | null>(null);

  const submit = async () => {
    if (!propertyName.trim() || !unitNumber.trim()) {
      setNotice({ type: 'warning', text: 'Property name and unit number are required before BIN GROUP can verify the link.' });
      return;
    }
    setSaving(true);
    setNotice(null);
    try {
      const callable = httpsCallable(functions, 'tenantRequestUnitLink');
      const result = await callable({
        propertyName: propertyName.trim(),
        unitNumber: unitNumber.trim(),
        leaseReference: leaseReference.trim(),
        verificationCode: verificationCode.trim(),
        notes: notes.trim(),
      });
      const data = result.data as any;
      setNotice({ type: 'success', text: `Unit link request submitted for admin verification. Request ID: ${data?.requestId || 'created'}.` });
      setLeaseReference('');
      setVerificationCode('');
      setNotes('');
    } catch (error: any) {
      setNotice({ type: 'error', text: error?.message || 'Could not submit the unit link request.' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Paper sx={{ p: compact ? 3 : { xs: 3, md: 4 }, bgcolor: 'rgba(15,23,42,0.72)', border: `1px solid ${alpha(binThemeTokens.gold, 0.2)}`, borderRadius: 5 }}>
      <Stack spacing={2.5}>
        <Stack direction="row" spacing={2} alignItems="center">
          <Box sx={{ width: 48, height: 48, display: 'grid', placeItems: 'center', borderRadius: 3, bgcolor: alpha(binThemeTokens.gold, 0.12), color: binThemeTokens.gold }}>
            <Link2 size={24} />
          </Box>
          <Box>
            <Typography variant={compact ? 'h6' : 'h5'} sx={{ color: '#fff', fontWeight: 950 }}>Link my unit</Typography>
            <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.52)' }}>{message || 'No assigned unit is linked to this tenant profile yet.'}</Typography>
          </Box>
        </Stack>

        <Alert icon={<ShieldCheck size={18} />} severity="info" sx={{ bgcolor: alpha(binThemeTokens.gold, 0.08), color: '#fff', border: `1px solid ${alpha(binThemeTokens.gold, 0.18)}` }}>
          This creates a pending verification request only. BIN GROUP or the property owner must verify the tenancy before unit access is granted.
        </Alert>

        {notice && <Alert severity={notice.type} onClose={() => setNotice(null)}>{notice.text}</Alert>}

        <Stack direction={{ xs: 'column', md: compact ? 'column' : 'row' }} spacing={2}>
          <TextField label="Property / building name" value={propertyName} onChange={(event) => setPropertyName(event.target.value)} fullWidth required />
          <TextField label="Unit number" value={unitNumber} onChange={(event) => setUnitNumber(event.target.value)} fullWidth required />
        </Stack>
        <Stack direction={{ xs: 'column', md: compact ? 'column' : 'row' }} spacing={2}>
          <TextField label="Lease / contract reference" value={leaseReference} onChange={(event) => setLeaseReference(event.target.value)} fullWidth />
          <TextField label="Invite or verification code" value={verificationCode} onChange={(event) => setVerificationCode(event.target.value)} fullWidth helperText="Optional; stored hashed for admin verification." />
        </Stack>
        <TextField label="Notes for verification" value={notes} onChange={(event) => setNotes(event.target.value)} multiline minRows={compact ? 2 : 3} fullWidth placeholder={`Signed in as ${user?.email || 'tenant account'}`} />
        <Button disabled={saving || !propertyName.trim() || !unitNumber.trim()} onClick={submit} variant="contained" sx={{ alignSelf: 'flex-start', bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950 }}>
          {saving ? 'Submitting...' : 'Submit link request'}
        </Button>
      </Stack>
    </Paper>
  );
}

import React, { useState } from 'react';
import { Alert, Button, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, Stack, TextField, Typography } from '@mui/material';
import { functions, httpsCallable, storage, ref, uploadBytes } from '../../lib/firebase';
import { useRole } from '../../context/RoleContext';
import { binThemeTokens } from '../../theme/binGroupTheme';

/** Which registry applies, shown to the owner before saving. Mirrors functions/leaseAgreements.ts. */
export function registryLabel(emirate?: string) {
  const e = String(emirate || '').toLowerCase().replace(/[^a-z]/g, '');
  if (e === 'dubai') return 'Ejari (Dubai Land Department)';
  if (e === 'abudhabi' || e === 'alain') return 'Tawtheeq (Abu Dhabi)';
  return 'the emirate municipality';
}

export default function OwnerTenancyAgreementDialog({ open, onClose, unit, emirate }: { open: boolean; onClose: () => void; unit: { id: string; unitNumber?: string }; emirate?: string }) {
  const { user } = useRole();
  const [form, setForm] = useState({ agreementType: 'GOVERNMENT', startDate: '', endDate: '', annualRent: '', registrationNumber: '', registrationDate: '' });
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const gov = form.agreementType === 'GOVERNMENT';
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value });

  const save = async () => {
    if (!user?.uid) return;
    setSaving(true); setMessage(null);
    try {
      let certificatePath = '';
      if (gov && file) {
        if (file.size > 15 * 1024 * 1024) throw new Error('The certificate must be 15 MB or smaller.');
        certificatePath = `owners/${user.uid}/tenancy-registrations/${unit.id}_${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-80)}`;
        await uploadBytes(ref(storage, certificatePath), file, { contentType: file.type || 'application/pdf' });
      }
      const callable = httpsCallable(functions, 'ownerRecordLeaseAgreement');
      const res: any = await callable({
        unitId: unit.id, agreementType: form.agreementType, startDate: form.startDate, endDate: form.endDate,
        annualRent: form.annualRent || undefined,
        ...(gov ? { registrationNumber: form.registrationNumber, registrationDate: form.registrationDate, certificatePath: certificatePath || undefined } : {}),
      });
      const status = res?.data?.registrationStatus;
      setMessage({ ok: true, text: status === 'PENDING_REGISTRATION' ? 'Saved. The lease stays "pending registration" until you add the registration number, date and certificate.' : 'Agreement saved. Renewal reminders will use the end date.' });
    } catch (error: any) {
      setMessage({ ok: false, text: error?.message || 'Could not save the agreement.' });
    } finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle sx={{ fontWeight: 950 }}>Tenancy agreement · Unit {unit.unitNumber || unit.id}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <TextField select label="Agreement type" value={form.agreementType} onChange={set('agreementType')}>
            <MenuItem value="GOVERNMENT">Government registered ({registryLabel(emirate)})</MenuItem>
            <MenuItem value="PRIVATE">Private agreement (not registered)</MenuItem>
          </TextField>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
            <TextField type="date" label="Lease start" value={form.startDate} onChange={set('startDate')} InputLabelProps={{ shrink: true }} fullWidth required />
            <TextField type="date" label="Lease end" value={form.endDate} onChange={set('endDate')} InputLabelProps={{ shrink: true }} fullWidth required />
          </Stack>
          <TextField label="Annual rent (AED)" value={form.annualRent} onChange={set('annualRent')} inputProps={{ inputMode: 'decimal' }} />
          {gov && (
            <>
              <TextField label="Registration number" value={form.registrationNumber} onChange={set('registrationNumber')} helperText={`The ${registryLabel(emirate)} contract number`} />
              <TextField type="date" label="Registration date" value={form.registrationDate} onChange={set('registrationDate')} InputLabelProps={{ shrink: true }} />
              <Button variant="outlined" component="label" sx={{ color: binThemeTokens.textPrimary, borderColor: binThemeTokens.gold }}>
                {file ? file.name : 'Upload registration certificate (PDF or photo)'}
                <input hidden type="file" accept="application/pdf,image/*" onChange={(e) => setFile(e.target.files?.[0] || null)} />
              </Button>
            </>
          )}
          {!gov && <Typography variant="body2" sx={{ color: binThemeTokens.textSecondary }}>A private agreement is recorded without a registry number. You can switch to government registered later.</Typography>}
          {message && <Alert severity={message.ok ? 'success' : 'error'}>{message.text}</Alert>}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} sx={{ color: binThemeTokens.textSecondary }}>Close</Button>
        <Button variant="contained" disabled={saving || !form.startDate || !form.endDate} onClick={save} sx={{ bgcolor: binThemeTokens.gold, color: '#111827', fontWeight: 950 }}>{saving ? 'Saving…' : 'Save agreement'}</Button>
      </DialogActions>
    </Dialog>
  );
}

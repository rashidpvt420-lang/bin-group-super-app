import React, { useEffect, useState } from 'react';
import { Alert, Button, Dialog, DialogActions, DialogContent, DialogTitle, Stack, TextField, Typography } from '@mui/material';
import { collection, db, functions, getDocs, httpsCallable, query, where } from '../../lib/firebase';
import { useRole } from '../../context/RoleContext';
import { binThemeTokens } from '../../theme/binGroupTheme';

/** Feature 4: owner proposes renewal terms; the tenant accepts or declines in their app. */
export default function OwnerLeaseRenewalDialog({ open, onClose, unit }: { open: boolean; onClose: () => void; unit: { id: string; unitNumber?: string } }) {
  const { user } = useRole();
  const [lease, setLease] = useState<any>(null);
  const [loadError, setLoadError] = useState('');
  const [form, setForm] = useState({ newEndDate: '', newAnnualRent: '', message: '' });
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    if (!open || !user?.uid) return;
    getDocs(query(collection(db, 'leases'), where('ownerId', '==', user.uid), where('unitId', '==', unit.id)))
      .then((snap) => setLease(snap.docs[0] ? { id: snap.docs[0].id, ...(snap.docs[0].data() as any) } : null))
      .catch(() => setLoadError('The lease could not be loaded. Try again.'));
  }, [open, user?.uid, unit.id]);

  const end = lease?.leaseEndDate || lease?.endDate || '';
  const submit = async () => {
    setSaving(true); setResult(null);
    try {
      await httpsCallable(functions, 'ownerProposeLeaseRenewal')({ leaseId: lease.id, ...form });
      setResult({ ok: true, text: 'Renewal offer sent. The tenant has been notified.' });
    } catch (e: any) {
      setResult({ ok: false, text: e?.message || 'The offer could not be sent.' });
    } finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Offer lease renewal · Unit {unit.unitNumber || unit.id}</DialogTitle>
      <DialogContent>
        {loadError && <Alert severity="error">{loadError}</Alert>}
        {!loadError && lease === null && <Alert severity="info">No lease is recorded for this unit. Record the agreement first.</Alert>}
        {lease && !end && <Alert severity="warning">This lease has no end date. Record the agreement dates first.</Alert>}
        {lease && end && (
          <Stack spacing={2} sx={{ mt: 1 }}>
            <Typography sx={{ color: binThemeTokens.textSecondary }}>Current lease ends {end}{lease.renewalStatus ? ` · ${String(lease.renewalStatus).replaceAll('_', ' ')}` : ''}</Typography>
            <TextField label="New end date" type="date" InputLabelProps={{ shrink: true }} value={form.newEndDate} onChange={(e) => setForm({ ...form, newEndDate: e.target.value })} />
            <TextField label="New annual rent (AED)" inputMode="decimal" value={form.newAnnualRent} onChange={(e) => setForm({ ...form, newAnnualRent: e.target.value })} />
            <TextField label="Message to tenant (optional)" multiline minRows={2} value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} />
          </Stack>
        )}
        {result && <Alert severity={result.ok ? 'success' : 'error'} sx={{ mt: 2 }}>{result.text}</Alert>}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
        <Button variant="contained" disabled={!lease || !end || saving || !form.newEndDate || !form.newAnnualRent || result?.ok} onClick={submit}>Send offer</Button>
      </DialogActions>
    </Dialog>
  );
}

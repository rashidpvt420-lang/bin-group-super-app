import React, { useEffect, useState } from 'react';
import { Alert, Button, Paper, Stack, Typography } from '@mui/material';
import { collection, db, functions, httpsCallable, onSnapshot, query, where } from '../../lib/firebase';
import { binThemeTokens } from '../../theme/binGroupTheme';

/** Feature 4: tenant sees a pending renewal offer and accepts or declines it. */
export default function TenantRenewalOfferPanel({ uid }: { uid: string }) {
  const [offers, setOffers] = useState<any[]>([]);
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  useEffect(() => {
    if (!uid) return undefined;
    return onSnapshot(query(collection(db, 'lease_renewals'), where('tenantId', '==', uid), where('status', '==', 'PROPOSED')),
      (snap) => setOffers(snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }))), () => setOffers([]));
  }, [uid]);
  const respond = async (renewalId: string, decision: 'ACCEPT' | 'DECLINE') => {
    setBusy(renewalId); setMessage(null);
    try {
      await httpsCallable(functions, 'tenantRespondLeaseRenewal')({ renewalId, decision });
      setMessage({ ok: true, text: decision === 'ACCEPT' ? 'Renewal accepted. Your owner has been notified.' : 'You declined the renewal. Your owner has been notified.' });
    } catch (e: any) { setMessage({ ok: false, text: e?.message || 'Your answer could not be saved.' }); } finally { setBusy(''); }
  };
  if (!offers.length && !message) return null;
  return (
    <Paper variant="outlined" sx={{ p: 3, mb: 3, borderRadius: 3, borderColor: binThemeTokens.gold }} data-testid="renewal-offer">
      {message && <Alert severity={message.ok ? 'success' : 'error'} sx={{ mb: offers.length ? 2 : 0 }}>{message.text}</Alert>}
      {offers.map((o) => (
        <Stack key={o.id} spacing={1}>
          <Typography variant="h6" component="h2" fontWeight={900} sx={{ color: binThemeTokens.textPrimary }}>Lease renewal offer</Typography>
          <Typography sx={{ color: binThemeTokens.textPrimary }}>New term {o.newStartDate} to {o.newEndDate} · AED {Number(o.newAnnualRent).toLocaleString('en-AE')} per year</Typography>
          {o.message && <Typography sx={{ color: binThemeTokens.textSecondary }}>{o.message}</Typography>}
          <Stack direction="row" spacing={1}>
            <Button variant="contained" disabled={busy === o.id} onClick={() => respond(o.id, 'ACCEPT')}>Accept</Button>
            <Button variant="outlined" disabled={busy === o.id} onClick={() => respond(o.id, 'DECLINE')} sx={{ color: binThemeTokens.textPrimary }}>Decline</Button>
          </Stack>
        </Stack>
      ))}
    </Paper>
  );
}

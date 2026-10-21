import React, { useEffect, useState } from 'react';
import { Alert, Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, Stack, TextField, Typography } from '@mui/material';
import { QRCodeSVG } from 'qrcode.react';
import { functions, httpsCallable } from '../../lib/firebase';
import { binThemeTokens } from '../../theme/binGroupTheme';

const STATE_COLOR: Record<string, string> = { SENT: '#1D4ED8', OPENED: '#B45309', ACCEPTED: '#047857', EXPIRED: '#6B7280', CANCELLED: '#6B7280', PENDING: '#6B7280' };

/** Feature 7: owner invites their own tenant to a unit (email + one-time link / QR) and tracks status. */
export default function OwnerTenantInviteDialog({ open, onClose, unit }: { open: boolean; onClose: () => void; unit: { id: string; unitNumber?: string } }) {
  const [form, setForm] = useState({ tenantEmail: '', tenantName: '' });
  const [saving, setSaving] = useState(false);
  const [link, setLink] = useState('');
  const [error, setError] = useState('');
  const [history, setHistory] = useState<any[] | null>(null);

  useEffect(() => {
    if (!open) return;
    httpsCallable(functions, 'ownerListTenantInvitations')({})
      .then((res: any) => setHistory((res?.data?.invitations || []).filter((i: any) => i.unitId === unit.id)))
      .catch(() => setHistory(null));
  }, [open, unit.id, link]);

  const send = async () => {
    setSaving(true); setError('');
    try {
      const res: any = await httpsCallable(functions, 'ownerInviteTenantToUnit')({ unitId: unit.id, ...form });
      setLink(String(res?.data?.inviteLink || ''));
    } catch (e: any) { setError(e?.message || 'The invitation could not be sent.'); } finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Invite tenant · Unit {unit.unitNumber || unit.id}</DialogTitle>
      <DialogContent>
        {!link ? (
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField label="Tenant email" type="email" value={form.tenantEmail} onChange={(e) => setForm({ ...form, tenantEmail: e.target.value })} />
            <TextField label="Tenant name" value={form.tenantName} onChange={(e) => setForm({ ...form, tenantName: e.target.value })} />
            <Typography variant="body2" sx={{ color: binThemeTokens.textSecondary }}>The tenant gets an email with a one-time link valid for 14 days. They must sign in with this email to accept.</Typography>
          </Stack>
        ) : (
          <Stack spacing={2} alignItems="center" sx={{ mt: 1 }} data-testid="tenant-invite-link">
            <Alert severity="success" sx={{ width: '100%' }}>Invitation emailed. You can also share this link or let the tenant scan the QR code. It is shown only once.</Alert>
            <Box sx={{ p: 2, bgcolor: '#fff', borderRadius: 2 }}><QRCodeSVG value={link} size={180} /></Box>
            <Button variant="outlined" onClick={() => navigator.clipboard?.writeText(link)} sx={{ color: binThemeTokens.textPrimary }}>Copy link</Button>
          </Stack>
        )}
        {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}
        {history && history.length > 0 && (
          <Stack spacing={1} sx={{ mt: 3 }}>
            <Typography fontWeight={900} sx={{ color: binThemeTokens.textPrimary }}>Invitations for this unit</Typography>
            {history.map((i) => (
              <Stack key={i.id} direction="row" spacing={1} alignItems="center">
                <Chip size="small" label={i.state} sx={{ color: '#fff', bgcolor: STATE_COLOR[i.state] || '#6B7280', fontWeight: 900 }} />
                <Typography variant="body2" sx={{ color: binThemeTokens.textPrimary }}>{i.tenantEmail}</Typography>
              </Stack>
            ))}
          </Stack>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
        {!link && <Button variant="contained" disabled={saving || !form.tenantEmail} onClick={send}>Send invitation</Button>}
      </DialogActions>
    </Dialog>
  );
}

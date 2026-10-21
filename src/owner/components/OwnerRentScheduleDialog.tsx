import React, { useState } from 'react';
import { Alert, Button, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, MenuItem, Stack, TextField, Typography } from '@mui/material';
import { Plus, Trash2 } from 'lucide-react';
import { functions, httpsCallable } from '../../lib/firebase';
import { binThemeTokens } from '../../theme/binGroupTheme';

import { splitAnnualRent, type RentRow as Row } from '../rentScheduleSplit';

export default function OwnerRentScheduleDialog({ open, onClose, unit }: { open: boolean; onClose: () => void; unit: { id: string; unitNumber?: string; annualRent?: number; rentAmount?: number } }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [cheques, setCheques] = useState(4);
  const [firstDue, setFirstDue] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const annual = Number(unit.annualRent || unit.rentAmount || 0);

  const save = async () => {
    setSaving(true); setMessage(null);
    try {
      const callable = httpsCallable(functions, 'ownerSetRentSchedule');
      const res: any = await callable({ unitId: unit.id, installments: rows.map((r) => ({ dueDate: r.dueDate, amount: r.amount, chequeNumber: r.chequeNumber })) });
      setMessage({ ok: true, text: `Saved ${res?.data?.installments ?? rows.length} installment(s). The tenant will get reminders 7 days and 1 day before each due date.` });
    } catch (error: any) {
      setMessage({ ok: false, text: error?.message || 'Could not save the rent schedule.' });
    } finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle sx={{ fontWeight: 950 }}>Rent schedule · Unit {unit.unitNumber || unit.id}</DialogTitle>
      <DialogContent>
        <Typography variant="body2" sx={{ color: binThemeTokens.textSecondary, mb: 2 }}>
          Cash or cheque only. Paid installments are kept when you save a new schedule.
        </Typography>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ mb: 2 }}>
          <TextField select label="Cheques per year" value={cheques} onChange={(e) => setCheques(Number(e.target.value))} size="small" sx={{ minWidth: 150 }}>
            {[1, 2, 3, 4, 6, 12].map((n) => <MenuItem key={n} value={n}>{n}</MenuItem>)}
          </TextField>
          <TextField type="date" label="First due date" value={firstDue} onChange={(e) => setFirstDue(e.target.value)} size="small" InputLabelProps={{ shrink: true }} />
          <Button variant="outlined" disabled={!annual || !firstDue} onClick={() => setRows(splitAnnualRent(annual, cheques, firstDue))} sx={{ color: binThemeTokens.textPrimary, borderColor: binThemeTokens.gold }}>
            Split AED {annual.toLocaleString()}
          </Button>
        </Stack>
        {rows.map((row, i) => (
          <Stack key={i} direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
            <TextField type="date" size="small" label="Due" value={row.dueDate} InputLabelProps={{ shrink: true }} onChange={(e) => setRows(rows.map((r, j) => (j === i ? { ...r, dueDate: e.target.value } : r)))} />
            <TextField size="small" label="AED" value={row.amount} inputProps={{ inputMode: 'decimal' }} onChange={(e) => setRows(rows.map((r, j) => (j === i ? { ...r, amount: e.target.value } : r)))} />
            <TextField size="small" label="Cheque no." value={row.chequeNumber} onChange={(e) => setRows(rows.map((r, j) => (j === i ? { ...r, chequeNumber: e.target.value } : r)))} />
            <IconButton aria-label="Remove installment" onClick={() => setRows(rows.filter((_, j) => j !== i))}><Trash2 size={16} /></IconButton>
          </Stack>
        ))}
        <Button startIcon={<Plus size={16} />} onClick={() => setRows([...rows, { dueDate: '', amount: '', chequeNumber: '' }])} sx={{ color: binThemeTokens.goldText, fontWeight: 900 }}>Add installment</Button>
        {message && <Alert severity={message.ok ? 'success' : 'error'} sx={{ mt: 2 }}>{message.text}</Alert>}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} sx={{ color: binThemeTokens.textSecondary }}>Close</Button>
        <Button variant="contained" disabled={saving || rows.length === 0} onClick={save} sx={{ bgcolor: binThemeTokens.gold, color: '#111827', fontWeight: 950 }}>{saving ? 'Saving…' : 'Save schedule'}</Button>
      </DialogActions>
    </Dialog>
  );
}

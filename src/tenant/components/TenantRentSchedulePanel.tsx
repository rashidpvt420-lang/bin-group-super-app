import React, { useEffect, useState } from 'react';
import { Alert, Box, Button, Chip, Paper, Stack, Typography } from '@mui/material';
import { CalendarClock, Download } from 'lucide-react';
import { db, collection, query, where, onSnapshot } from '../../lib/firebase';
import { binThemeTokens } from '../../theme/binGroupTheme';

export type RentInstallment = {
  id: string;
  dueDate: string;
  amount: number;
  status: 'DUE' | 'OVERDUE' | 'PENDING_VERIFICATION' | 'PAID' | string;
  chequeNumber?: string | null;
  receiptNumber?: string;
  receiptPdfUrl?: string | null;
};

const STATUS: Record<string, { label: string; color: string }> = {
  DUE: { label: 'Due', color: '#B45309' },
  OVERDUE: { label: 'Overdue', color: '#B91C1C' },
  PENDING_VERIFICATION: { label: 'Awaiting verification', color: '#1D4ED8' },
  PAID: { label: 'Paid', color: '#047857' },
};

export function daysUntil(dueDate: string, today = new Date()): number {
  const t = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Dubai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(today);
  return Math.round((Date.parse(`${dueDate}T00:00:00Z`) - Date.parse(`${t}T00:00:00Z`)) / 86_400_000);
}

export function nextOpenInstallment(items: RentInstallment[]): RentInstallment | null {
  return [...items].filter((i) => i.status === 'DUE' || i.status === 'OVERDUE').sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0] || null;
}

/** Rent schedule set by the owner (feature 1). Server-written; tenant reads their own rows. */
export default function TenantRentSchedulePanel({ uid, onPay }: { uid: string; onPay: (installment: RentInstallment) => void }) {
  const [items, setItems] = useState<RentInstallment[]>([]);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!uid) return undefined;
    return onSnapshot(
      query(collection(db, 'rent_installments'), where('tenantUid', '==', uid)),
      (snap) => setItems(snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })).sort((a, b) => String(a.dueDate).localeCompare(String(b.dueDate)))),
      () => setError('Your rent schedule could not be loaded. Pull to refresh or try again later.'),
    );
  }, [uid]);

  const next = nextOpenInstallment(items);
  if (error) return <Alert severity="warning" sx={{ mb: 3 }}>{error}</Alert>;
  if (!items.length) {
    return <Alert severity="info" sx={{ mb: 3 }} data-testid="rent-schedule-empty">Your owner has not set a rent schedule yet. Due dates and reminders will appear here once they do.</Alert>;
  }
  const days = next ? daysUntil(next.dueDate) : null;
  return (
    <Paper variant="outlined" sx={{ p: 3, mb: 3, borderRadius: 3 }} data-testid="rent-schedule">
      <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 2 }}>
        <CalendarClock size={22} color={binThemeTokens.goldText} />
        <Typography variant="h6" component="h2" fontWeight={900} sx={{ color: binThemeTokens.textPrimary }}>Rent schedule</Typography>
      </Stack>
      {next && (
        <Box sx={{ mb: 2, p: 2, borderRadius: 2, bgcolor: binThemeTokens.softCanvas }}>
          <Typography sx={{ color: binThemeTokens.textSecondary, fontWeight: 700 }}>Next payment</Typography>
          <Typography variant="h5" fontWeight={950} sx={{ color: binThemeTokens.textPrimary }}>AED {next.amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}</Typography>
          <Typography sx={{ color: days !== null && days < 0 ? '#B91C1C' : binThemeTokens.textPrimary, fontWeight: 800 }}>
            {days === null ? '' : days < 0 ? `${-days} day(s) overdue (due ${next.dueDate})` : days === 0 ? `Due today (${next.dueDate})` : `Due in ${days} day(s), on ${next.dueDate}`}
          </Typography>
          <Button variant="contained" onClick={() => onPay(next)} sx={{ mt: 1.5, bgcolor: binThemeTokens.gold, color: '#111827', fontWeight: 900 }}>Upload receipt for this payment</Button>
        </Box>
      )}
      <Stack spacing={1}>
        {items.map((i) => {
          const s = STATUS[i.status] || { label: i.status, color: binThemeTokens.textSecondary };
          return (
            <Stack key={i.id} direction="row" justifyContent="space-between" alignItems="center" sx={{ py: 1, borderBottom: '1px solid #E5E7EB' }}>
              <Box>
                <Typography fontWeight={800} sx={{ color: binThemeTokens.textPrimary }}>{i.dueDate}{i.chequeNumber ? ` · Cheque ${i.chequeNumber}` : ''}</Typography>
                <Typography variant="body2" sx={{ color: binThemeTokens.textSecondary }}>AED {Number(i.amount).toLocaleString('en-US', { minimumFractionDigits: 2 })}</Typography>
              </Box>
              <Stack direction="row" spacing={1} alignItems="center">
                <Chip size="small" label={s.label} sx={{ color: s.color, borderColor: s.color, fontWeight: 800 }} variant="outlined" />
                {i.status === 'PAID' && i.receiptPdfUrl && (
                  <Button size="small" href={i.receiptPdfUrl} target="_blank" rel="noopener noreferrer" startIcon={<Download size={14} />} sx={{ color: binThemeTokens.goldText, fontWeight: 800 }}>
                    Receipt
                  </Button>
                )}
              </Stack>
            </Stack>
          );
        })}
      </Stack>
    </Paper>
  );
}

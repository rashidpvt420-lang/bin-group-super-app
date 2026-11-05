import React, { useEffect, useState } from 'react';
import { Alert, Button, CircularProgress, Paper, Stack, Typography } from '@mui/material';
import { Wallet } from 'lucide-react';
import { functions, httpsCallable } from '../../lib/firebase';
import { binThemeTokens } from '../../theme/binGroupTheme';
import HrBi, { useHrText } from './HrBi';

type PayslipRow = { reportId: string; monthPeriod: string | null; generatedAt: string | null; status: string };

/** Official payslip PDFs issued for the signed-in technician. The callable ignores any other uid. */
export default function MyPayslipsPanel() {
  const { ht } = useHrText();
  const [rows, setRows] = useState<PayslipRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [opening, setOpening] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    httpsCallable(functions, 'listMyPayslips')({})
      .then((response: any) => {
        if (cancelled) return;
        const payslips = Array.isArray(response?.data?.payslips) ? response.data.payslips : [];
        setRows(payslips.filter((row: PayslipRow) => row?.reportId));
        setError('');
      })
      .catch((err: any) => {
        if (!cancelled) setError(err?.message || 'Payslips could not be loaded.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  const download = async (reportId: string) => {
    setOpening(reportId);
    setError('');
    try {
      const response: any = await httpsCallable(functions, 'openMyPayslip')({ reportId });
      const url = String(response?.data?.url || '');
      if (!url) throw new Error('Payslip download was not authorized.');
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (err: any) {
      setError(err?.message || 'Payslip download failed.');
    } finally {
      setOpening('');
    }
  };

  return (
    <Paper data-testid="my-payslips" sx={{ p: 4, mt: 3, bgcolor: 'rgba(22,22,24,0.78)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 5 }}>
      <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 1 }}>
        <Wallet color={binThemeTokens.gold} />
        <Typography variant="h6" color="#FFF" fontWeight={950}>{ht('My payslips')}</Typography>
      </Stack>
      <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.62)', mb: 2 }}>
        {ht('Only your official payslips are listed. Other people\'s payslips are not shown.')}
      </Typography>
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      {loading ? <CircularProgress size={22} sx={{ color: binThemeTokens.gold }} /> : null}
      {!loading && rows.length === 0 && !error && (
        <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.5)' }}>{ht('No payslips yet. HR issues them from payroll.')}</Typography>
      )}
      <Stack spacing={1.2}>
        {rows.map((row) => (
          <Stack key={row.reportId} direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ sm: 'center' }} justifyContent="space-between" data-testid="my-payslip-row">
            <BoxLabel period={row.monthPeriod} status={row.status} />
            <Button variant="outlined" disabled={opening === row.reportId} onClick={() => void download(row.reportId)} sx={{ color: binThemeTokens.gold, borderColor: 'rgba(198,167,94,0.45)', fontWeight: 900 }}>
              {opening === row.reportId ? <CircularProgress size={18} sx={{ color: binThemeTokens.gold }} /> : ht('Download payslip')}
            </Button>
          </Stack>
        ))}
      </Stack>
    </Paper>
  );
}

function BoxLabel({ period, status }: { period: string | null; status: string }) {
  return (
    <Typography color="#FFF" fontWeight={800}>
      <HrBi en={period || 'Pay period not recorded'} ar={period || 'فترة الراتب غير مسجلة'} />
      {' · '}
      {String(status || 'ISSUED').replace(/_/g, ' ')}
    </Typography>
  );
}

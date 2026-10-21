import React, { useEffect, useState } from 'react';
import { Alert, Button, Grid, Paper, Skeleton, Typography } from '@mui/material';
import { functions, httpsCallable } from '../../lib/firebase';
import { binThemeTokens } from '../../theme/binGroupTheme';

type Kpi<T> = { value: T | null; error: string | null };
export type OwnerKpis = {
  month: string;
  rent: Kpi<{ due: number; collected: number; overdueInstallments: number }>;
  occupancy: Kpi<{ occupied: number; total: number }>;
  jobs: Kpi<{ open: number; urgent: number }>;
  leasesExpiring90d: Kpi<number>;
  approvalsWaiting: Kpi<number>;
};
const aed = (n: number) => `AED ${Math.round(n).toLocaleString('en-AE')}`;

function Tile({ label, kpi, render, sub, path, onNavigate, loading }: { label: string; kpi?: Kpi<any>; render: (v: any) => string; sub?: (v: any) => string; path: string; onNavigate: (p: string) => void; loading: boolean }) {
  return (
    <Paper variant="outlined" sx={{ p: 2, borderRadius: 3, height: '100%', bgcolor: '#fff' }} data-testid={`owner-kpi-${label.toLowerCase().replace(/\s+/g, '-')}`}>
      <Typography sx={{ color: binThemeTokens.textSecondary, fontSize: 12, fontWeight: 900, textTransform: 'uppercase', letterSpacing: 0.6 }}>{label}</Typography>
      {loading ? <Skeleton width="60%" height={36} /> : !kpi || kpi.error || kpi.value === null ? (
        <Alert severity="warning" sx={{ py: 0, mt: 0.5 }}>Could not load</Alert>
      ) : (
        <>
          <Typography sx={{ color: binThemeTokens.textPrimary, fontWeight: 950, fontSize: 22 }}>{render(kpi.value)}</Typography>
          {sub && <Typography variant="caption" sx={{ color: binThemeTokens.textSecondary }}>{sub(kpi.value)}</Typography>}
        </>
      )}
      <Button size="small" onClick={() => onNavigate(path)} sx={{ display: 'block', px: 0, mt: 0.5, color: binThemeTokens.goldText, fontWeight: 900 }}>Open</Button>
    </Paper>
  );
}

/** Feature 9: owner KPI tiles from server aggregates; each tile shows its own error, never a silent 0. */
export default function OwnerKpiTiles({ onNavigate }: { onNavigate: (path: string) => void }) {
  const [data, setData] = useState<OwnerKpis | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const load = () => {
    setLoading(true); setFailed(false);
    httpsCallable(functions, 'getOwnerKpis')({})
      .then((res: any) => setData(res?.data || null))
      .catch(() => { setFailed(true); setData(null); })
      .finally(() => setLoading(false));
  };
  useEffect(load, []);
  if (failed) return <Alert severity="warning" action={<Button onClick={load}>Retry</Button>} data-testid="owner-kpi-error">Your portfolio numbers could not be loaded. Nothing is shown as zero until they load.</Alert>;
  return (
    <Grid container spacing={1.5} data-testid="owner-kpi-tiles">
      <Grid item xs={6} md={3}><Tile label="Rent this month" loading={loading} kpi={data?.rent} render={(v) => `${aed(v.collected)} / ${aed(v.due)}`} sub={(v) => `${v.overdueInstallments} overdue instalment(s)`} path="/owner/units" onNavigate={onNavigate} /></Grid>
      <Grid item xs={6} md={3}><Tile label="Occupancy" loading={loading} kpi={data?.occupancy} render={(v) => `${v.occupied} / ${v.total}`} sub={(v) => (v.total ? `${Math.round((v.occupied / v.total) * 100)}% occupied` : 'No units yet')} path="/owner/units" onNavigate={onNavigate} /></Grid>
      <Grid item xs={6} md={3}><Tile label="Open jobs" loading={loading} kpi={data?.jobs} render={(v) => String(v.open)} sub={(v) => `${v.urgent} urgent`} path="/owner/tickets" onNavigate={onNavigate} /></Grid>
      <Grid item xs={6} md={3}><Tile label="Approvals waiting" loading={loading} kpi={data?.approvalsWaiting} render={(v) => String(v)} sub={() => `${data?.leasesExpiring90d?.value ?? '—'} lease(s) expiring in 90 days`} path="/owner/approvals" onNavigate={onNavigate} /></Grid>
    </Grid>
  );
}

import React from 'react';
import { Box, Card, CardContent, Grid, Stack, Typography, alpha, Chip, Button, Table, TableBody, TableCell, TableContainer, TableHead, TableRow } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { Wallet, TrendingUp, AlertTriangle, Clock, CheckCircle2 } from 'lucide-react';
import { binThemeTokens } from '../../theme/binGroupTheme';
import { useLanguage } from '../../context/LanguageContext';
import type { TenantLedgerSummary } from '../utils/ownerTenantLedgerResolver';

interface OwnerRentCollectionSectionProps {
  ledgerSummary: TenantLedgerSummary | null;
}

const cardSx = {
  bgcolor: 'rgba(22,22,24,0.72)',
  border: `1px solid ${alpha(binThemeTokens.gold, 0.16)}`,
  borderRadius: 4,
  minWidth: 0,
  overflow: 'hidden',
};

const metricBoxSx = {
  p: 2.5,
  bgcolor: 'rgba(255,255,255,0.025)',
  borderRadius: 3,
  border: '1px solid rgba(255,255,255,0.06)',
  minWidth: 0,
  height: '100%',
};

const textSafeSx = {
  minWidth: 0,
  overflowWrap: 'anywhere',
  wordBreak: 'break-word',
};

function formatCurrency(amount: number) {
  if (!amount) return 'AED 0';
  return `AED ${amount.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function statusColor(status: string) {
  if (status === 'ACTIVE' || status === 'ACCEPTED' || status === 'SIGNED' || status === 'OCCUPIED') return '#10b981';
  if (status === 'PENDING' || status === 'INVITED' || status === 'SENT' || status === 'PENDING_AUTH_CREATION') return '#f59e0b';
  return '#94a3b8';
}

export default function OwnerRentCollectionSection({ ledgerSummary }: OwnerRentCollectionSectionProps) {
  const { t } = useLanguage();
  const navigate = useNavigate();

  if (!ledgerSummary) return null;

  const { totalRentDue, totalRentPaid, totalRentBalance, collectionRate, pendingTenants, ledgerRows } = ledgerSummary;
  const overdueTenants = ledgerRows.filter((row) => row.overdueDays > 0).length;
  const hasRows = ledgerRows.length > 0;

  const renderMetric = (label: string, value: React.ReactNode, icon: React.ReactNode, color = '#fff') => (
    <Grid item xs={12} sm={6} md={2}>
      <Box sx={metricBoxSx}>
        <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1.5 }}>
          <Box sx={{ color: 'rgba(255,255,255,0.5)' }}>{icon}</Box>
          <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.45)', fontWeight: 900, ...textSafeSx }}>
            {label.toUpperCase()}
          </Typography>
        </Stack>
        <Typography variant="h6" fontWeight={950} sx={{ color, ...textSafeSx }}>
          {value}
        </Typography>
      </Box>
    </Grid>
  );

  return (
    <Card sx={cardSx} id="rent-collection">
      <CardContent sx={{ p: { xs: 2.25, md: 4 } }}>
        <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" alignItems={{ xs: 'flex-start', md: 'center' }} spacing={2} sx={{ mb: 4, minWidth: 0 }}>
          <Stack direction="row" alignItems="center" spacing={1.5} sx={{ minWidth: 0 }}>
            <Box sx={{ p: 1, bgcolor: alpha(binThemeTokens.gold, 0.1), borderRadius: 2, color: binThemeTokens.gold, flexShrink: 0 }}>
              <Wallet size={22} />
            </Box>
            <Box sx={{ minWidth: 0 }}>
              <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 900, letterSpacing: 2, ...textSafeSx }}>
                {t('owner.rentCollection') || 'Rent Collection'}
              </Typography>
              <Typography variant="h5" fontWeight={950} sx={{ color: '#fff', ...textSafeSx }}>
                Tenant Ledger & Collection Rate
              </Typography>
            </Box>
          </Stack>
          <Button variant="outlined" onClick={() => navigate('/owner/financials')} sx={{ borderColor: binThemeTokens.gold, color: binThemeTokens.gold, fontWeight: 950 }}>
            View Financials
          </Button>
        </Stack>

        <Grid container spacing={2} sx={{ mb: 4 }}>
          {renderMetric('Total Rent Due', formatCurrency(totalRentDue), <Wallet size={16} />, '#fff')}
          {renderMetric('Rent Collected', formatCurrency(totalRentPaid), <CheckCircle2 size={16} />, '#10b981')}
          {renderMetric('Balance', formatCurrency(totalRentBalance), <AlertTriangle size={16} />, totalRentBalance > 0 ? '#ef4444' : '#fff')}
          {renderMetric('Collection Rate', `${collectionRate}%`, <TrendingUp size={16} />, collectionRate >= 80 ? '#10b981' : collectionRate >= 50 ? '#f59e0b' : '#ef4444')}
          {renderMetric('Pending Verification', pendingTenants, <Clock size={16} />, pendingTenants > 0 ? '#f59e0b' : '#fff')}
          {renderMetric('Overdue Tenants', overdueTenants, <AlertTriangle size={16} />, overdueTenants > 0 ? '#ef4444' : '#fff')}
        </Grid>

        {!hasRows ? (
          <Box sx={{ p: 6, textAlign: 'center', border: '1px dashed rgba(255,255,255,0.1)', borderRadius: 4 }}>
            <Wallet size={36} color="rgba(255,255,255,0.25)" style={{ margin: '0 auto 16px' }} />
            <Typography variant="h6" fontWeight={950} sx={{ color: 'rgba(255,255,255,0.6)' }}>No Tenant Ledger Records Yet</Typography>
            <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.4)', mt: 1 }}>
              Occupancies, leases, and ledger entries will populate this table as tenants are onboarded.
            </Typography>
          </Box>
        ) : (
          <TableContainer sx={{ overflowX: 'auto', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 3, bgcolor: 'rgba(255,255,255,0.01)' }}>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 900, borderBottom: '1px solid rgba(255,255,255,0.1)' }}>TENANT</TableCell>
                  <TableCell sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 900, borderBottom: '1px solid rgba(255,255,255,0.1)' }}>PROPERTY</TableCell>
                  <TableCell sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 900, borderBottom: '1px solid rgba(255,255,255,0.1)' }}>UNIT</TableCell>
                  <TableCell sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 900, borderBottom: '1px solid rgba(255,255,255,0.1)' }}>DUE</TableCell>
                  <TableCell sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 900, borderBottom: '1px solid rgba(255,255,255,0.1)' }}>PAID</TableCell>
                  <TableCell sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 900, borderBottom: '1px solid rgba(255,255,255,0.1)' }}>BALANCE</TableCell>
                  <TableCell sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 900, borderBottom: '1px solid rgba(255,255,255,0.1)' }}>STATUS</TableCell>
                  <TableCell sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 900, borderBottom: '1px solid rgba(255,255,255,0.1)' }}>LAST PAYMENT</TableCell>
                  <TableCell sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 900, borderBottom: '1px solid rgba(255,255,255,0.1)' }} />
                </TableRow>
              </TableHead>
              <TableBody>
                {ledgerRows.map((row) => (
                  <TableRow key={row.id} sx={{ '& > *': { borderColor: 'rgba(255,255,255,0.05)' } }}>
                    <TableCell sx={{ color: '#fff', fontWeight: 900, borderBottom: '1px solid rgba(255,255,255,0.05)' }}>{row.name}</TableCell>
                    <TableCell sx={{ color: 'rgba(255,255,255,0.7)', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>{row.property}</TableCell>
                    <TableCell sx={{ color: 'rgba(255,255,255,0.7)', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>{row.unit}</TableCell>
                    <TableCell sx={{ color: 'rgba(255,255,255,0.7)', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>{formatCurrency(row.due)}</TableCell>
                    <TableCell sx={{ color: '#10b981', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>{formatCurrency(row.paid)}</TableCell>
                    <TableCell sx={{ color: row.balance > 0 ? '#ef4444' : 'rgba(255,255,255,0.7)', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                      {formatCurrency(row.balance)}
                      {row.overdueDays > 0 && (
                        <Typography component="span" variant="caption" sx={{ color: '#ef4444', ml: 1 }}>
                          ({row.overdueDays}d overdue)
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell sx={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                      <Chip label={row.status.replace(/_/g, ' ')} size="small" sx={{ bgcolor: alpha(statusColor(row.status), 0.15), color: statusColor(row.status), fontWeight: 900, fontSize: '0.65rem' }} />
                    </TableCell>
                    <TableCell sx={{ color: 'rgba(255,255,255,0.6)', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>{row.lastPaymentDate || '—'}</TableCell>
                    <TableCell sx={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                      <Button size="small" onClick={() => navigate('/owner/tenants')} sx={{ color: binThemeTokens.gold, fontWeight: 900, minWidth: 0 }}>
                        View
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </CardContent>
    </Card>
  );
}

import React from 'react';
import {
  Box,
  Button,
  Chip,
  Grid,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
  alpha,
} from '@mui/material';
import { AlertTriangle, CheckCircle2, ClipboardCheck, CreditCard, FileText, Home, ReceiptText } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { binThemeTokens } from '../../theme/binGroupTheme';
import { useLanguage } from '../../context/LanguageContext';

type LedgerRow = {
  id: string;
  name: string;
  property: string;
  unit: string;
  status: string;
  due: number;
  paid: number;
  balance: number;
  overdueDays: number;
  lastPaymentDate?: string | null;
};

type LedgerSummary = {
  totalRentDue: number;
  totalRentPaid: number;
  totalRentBalance: number;
  collectionRate: number;
  ledgerRows: LedgerRow[];
};

function money(value: unknown) {
  return `AED ${Number(value || 0).toLocaleString()}`;
}

function statusFor(row: LedgerRow) {
  if (row.balance <= 0) return 'PAID';
  if (row.overdueDays > 0) return 'OVERDUE';
  return 'PENDING';
}

function statusChip(status: string) {
  if (status === 'PAID') return { color: '#10b981', bg: alpha('#10b981', 0.1) };
  if (status === 'OVERDUE') return { color: '#ef4444', bg: alpha('#ef4444', 0.1) };
  return { color: '#f59e0b', bg: alpha('#f59e0b', 0.1) };
}

export default function OwnerRentHandoverControlCenter({
  ledgerSummary,
  pendingPayments,
  pendingApprovals = 0,
}: {
  ledgerSummary: LedgerSummary | null;
  pendingPayments: number;
  pendingApprovals?: number;
}) {
  const navigate = useNavigate();
  const { tx } = useLanguage();
  const rows = ledgerSummary?.ledgerRows || [];
  const overdueCount = rows.filter((row) => row.balance > 0 && row.overdueDays > 0).length;
  const rentDue = ledgerSummary?.totalRentDue || 0;
  const rentPaid = ledgerSummary?.totalRentPaid || 0;
  const balance = ledgerSummary?.totalRentBalance || 0;
  const collectionRate = ledgerSummary?.collectionRate || 0;

  const cards = [
    { label: tx('owner.money.rentDue', 'Rent Due'), value: money(rentDue), icon: <CreditCard size={20} />, color: binThemeTokens.goldHover },
    { label: tx('owner.money.rentCollected', 'Rent Collected'), value: money(rentPaid), icon: <CheckCircle2 size={20} />, color: '#10b981' },
    { label: tx('owner.money.balance', 'Balance'), value: money(balance), icon: <AlertTriangle size={20} />, color: balance > 0 ? '#f59e0b' : '#10b981' },
    { label: tx('owner.money.collectionRate', 'Collection Rate'), value: `${collectionRate}%`, icon: <ReceiptText size={20} />, color: collectionRate >= 90 ? '#10b981' : '#f59e0b' },
    { label: tx('owner.money.pendingVerification', 'Pending Verification'), value: pendingPayments, icon: <FileText size={20} />, color: pendingPayments ? '#f59e0b' : '#10b981' },
    { label: tx('owner.money.overdueTenants', 'Overdue Tenants'), value: overdueCount, icon: <AlertTriangle size={20} />, color: overdueCount ? '#ef4444' : '#10b981' },
    { label: tx('owner.money.pendingApprovals', 'Pending Approvals'), value: pendingApprovals, icon: <ClipboardCheck size={20} />, color: pendingApprovals ? '#f59e0b' : '#10b981' },
    { label: tx('owner.handover.pending', 'Handover Reviews'), value: tx('owner.handover.open', 'Open'), icon: <Home size={20} />, color: binThemeTokens.goldHover },
  ];

  return (
    <Paper sx={{ p: { xs: 2.5, md: 4 }, borderRadius: 6, bgcolor: '#fff', border: `1px solid ${alpha(binThemeTokens.gold, 0.16)}`, boxShadow: '0 18px 44px rgba(17,24,39,0.06)' }}>
      <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} justifyContent="space-between" alignItems={{ xs: 'flex-start', md: 'center' }} sx={{ mb: 3 }}>
        <Box>
          <Typography variant="overline" sx={{ color: binThemeTokens.goldHover, fontWeight: 950, letterSpacing: 2 }}>
            {tx('owner.money.titleOverline', 'OWNER MONEY + HANDOVER CONTROL')}
          </Typography>
          <Typography variant="h5" sx={{ color: binThemeTokens.textPrimary, fontWeight: 950 }}>
            {tx('owner.money.title', 'Rent, payment proof, approvals, and move-in / move-out status')}
          </Typography>
          <Typography sx={{ color: binThemeTokens.textSecondary, mt: 0.5, fontWeight: 700 }}>
            {tx('owner.money.subtitle', 'This section turns the internal ledger resolver into an owner-facing control center.')}
          </Typography>
        </Box>
        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
          <Button variant="contained" onClick={() => navigate('/owner/financials')} sx={{ bgcolor: binThemeTokens.goldHover, color: '#fff', fontWeight: 950 }}>
            {tx('owner.money.viewFinancials', 'Financials')}
          </Button>
          <Button variant="outlined" onClick={() => navigate('/owner/approvals')} sx={{ borderColor: binThemeTokens.goldHover, color: binThemeTokens.goldHover, fontWeight: 950 }}>
            {tx('owner.money.viewApprovals', 'Approvals')}
          </Button>
          <Button variant="outlined" onClick={() => navigate('/owner/inspections')} sx={{ borderColor: binThemeTokens.goldHover, color: binThemeTokens.goldHover, fontWeight: 950 }}>
            {tx('owner.handover.view', 'Move-In / Move-Out')}
          </Button>
        </Stack>
      </Stack>

      <Grid container spacing={2} sx={{ mb: 3 }}>
        {cards.map((card) => (
          <Grid item xs={12} sm={6} md={3} key={card.label}>
            <Box sx={{ p: 2.25, borderRadius: 4, bgcolor: alpha(card.color, 0.06), border: `1px solid ${alpha(card.color, 0.18)}`, minHeight: 116 }}>
              <Box sx={{ color: card.color, mb: 1 }}>{card.icon}</Box>
              <Typography variant="h6" sx={{ color: binThemeTokens.textPrimary, fontWeight: 950 }}>{card.value}</Typography>
              <Typography variant="caption" sx={{ color: binThemeTokens.textSecondary, fontWeight: 900, letterSpacing: 1 }}>{card.label.toUpperCase()}</Typography>
            </Box>
          </Grid>
        ))}
      </Grid>

      <TableContainer sx={{ border: `1px solid ${alpha(binThemeTokens.gold, 0.12)}`, borderRadius: 4, overflow: 'hidden' }}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>{tx('owner.ledger.tenant', 'Tenant')}</TableCell>
              <TableCell>{tx('owner.ledger.property', 'Property')}</TableCell>
              <TableCell>{tx('owner.ledger.unit', 'Unit')}</TableCell>
              <TableCell align="right">{tx('owner.ledger.due', 'Due')}</TableCell>
              <TableCell align="right">{tx('owner.ledger.paid', 'Paid')}</TableCell>
              <TableCell align="right">{tx('owner.ledger.balance', 'Balance')}</TableCell>
              <TableCell>{tx('owner.ledger.status', 'Status')}</TableCell>
              <TableCell>{tx('owner.ledger.lastPayment', 'Last Payment')}</TableCell>
              <TableCell align="right">{tx('owner.ledger.action', 'Action')}</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.slice(0, 8).map((row) => {
              const status = statusFor(row);
              const colors = statusChip(status);
              return (
                <TableRow key={row.id} hover>
                  <TableCell sx={{ fontWeight: 900 }}>{row.name}</TableCell>
                  <TableCell>{row.property}</TableCell>
                  <TableCell>{row.unit}</TableCell>
                  <TableCell align="right">{money(row.due)}</TableCell>
                  <TableCell align="right">{money(row.paid)}</TableCell>
                  <TableCell align="right">{money(row.balance)}</TableCell>
                  <TableCell><Chip size="small" label={status} sx={{ bgcolor: colors.bg, color: colors.color, fontWeight: 950 }} /></TableCell>
                  <TableCell>{row.lastPaymentDate || '—'}</TableCell>
                  <TableCell align="right">
                    <Button size="small" onClick={() => navigate(`/owner/financials?tenantLedgerRow=${encodeURIComponent(row.id)}`)} sx={{ color: binThemeTokens.goldHover, fontWeight: 950 }}>
                      {tx('owner.ledger.viewProof', 'View Proof')}
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={9} align="center" sx={{ py: 5, color: binThemeTokens.textSecondary, fontWeight: 800 }}>
                  {tx('owner.ledger.empty', 'No tenant ledger rows are linked yet. Add tenants/leases or verify ledger records to populate this table.')}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>
    </Paper>
  );
}

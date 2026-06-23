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
import { CalendarCheck, ClipboardCheck, Coins, CreditCard, ReceiptText, ShieldAlert, ShieldCheck, TrendingUp, Wrench } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { binThemeTokens } from '../../theme/binGroupTheme';

type Props = {
  properties: any[];
  financials?: any;
  complaints: any[];
  tickets: number;
  tenantCount: number;
};

const n = (value: unknown) => Number(value || 0);
const unitsOf = (property: any) => n(property?.units || property?.totalUnits || property?.numberOfUnits || property?.unitsCount);
const money = (value: unknown) => `AED ${n(value).toLocaleString()}`;

const statusFor = (balance: number, overdue: number) => {
  if (balance <= 0) return { label: 'PAID', color: '#10b981' };
  if (overdue > 0) return { label: 'OVERDUE', color: '#ef4444' };
  return { label: 'PENDING', color: '#f59e0b' };
};

export default function OwnerMoneyRiskDashboardSection({ properties, financials, complaints, tickets, tenantCount }: Props) {
  const navigate = useNavigate();
  const units = properties.reduce((sum, property) => sum + unitsOf(property), 0);
  const annualMaintenance = properties.reduce((sum, property) => sum + n(property.maintenanceCostTotal || property.annualMaintenanceCost || property.maintenanceSpend), 0);
  const monthlyMaintenance = Math.round(annualMaintenance / 12);
  const costPerUnit = units ? Math.round(annualMaintenance / units) : 0;
  const serviceIssues = complaints.length;
  const healthScore = Math.max(45, Math.min(96, 92 - tickets * 6 - serviceIssues * 3 + Math.min(8, properties.length)));

  const propertyRentRows = properties.map((property, index) => {
    const due = n(property.rentDueTotal || property.rentDue || property.expectedRent || property.annualRent || property.grossRent);
    const paid = n(property.rentCollectedTotal || property.rentCollected || property.paidRent || property.receivedRent);
    const balance = Math.max(0, n(property.rentBalance || property.outstandingRent || due - paid));
    const overdue = n(property.overdueTenants || property.overdueCount || property.overdueDays || 0);
    return {
      id: String(property.id || property.propertyId || `property-${index}`),
      name: property.propertyName || property.name || property.address || `Property ${index + 1}`,
      unit: property.unitNumber || property.unitLabel || property.unitsLabel || `${unitsOf(property) || '—'} units`,
      due,
      paid,
      balance,
      overdue,
    };
  });

  const rentDue = n(financials?.rentDue || financials?.totalRentDue || financials?.expectedRent) || propertyRentRows.reduce((sum, row) => sum + row.due, 0);
  const rentCollected = n(financials?.rentCollected || financials?.totalRentCollected || financials?.totalCollected) || propertyRentRows.reduce((sum, row) => sum + row.paid, 0);
  const rentBalance = n(financials?.rentBalance || financials?.outstandingRent || financials?.totalOutstanding) || Math.max(0, rentDue - rentCollected);
  const collectionRate = rentDue ? Math.round((rentCollected / rentDue) * 100) : 0;
  const pendingVerification = n(financials?.pendingPaymentVerifications || financials?.pendingPayments || financials?.pendingLiquidity);
  const overdueTenants = n(financials?.overdueTenants || financials?.overdueTenantCount) || propertyRentRows.filter((row) => row.balance > 0 && row.overdue > 0).length;
  const pendingApprovals = n(financials?.pendingApprovals || financials?.ownerApprovals || financials?.pendingOwnerActions);
  const nextAction = pendingVerification > 0
    ? 'Review pending payment proof'
    : overdueTenants > 0
      ? 'Review overdue tenant balances'
      : tickets > 0
        ? 'Close active maintenance tasks first'
        : annualMaintenance === 0
          ? 'Start asset baseline inspection'
          : 'Schedule preventive maintenance';

  const cards = [
    { label: 'Rent due', value: rentDue ? money(rentDue) : 'Ledger pending', icon: <CreditCard size={20} />, color: binThemeTokens.gold },
    { label: 'Rent collected', value: rentCollected ? money(rentCollected) : 'AED 0', icon: <ReceiptText size={20} />, color: '#10b981' },
    { label: 'Balance', value: money(rentBalance), icon: <ShieldAlert size={20} />, color: rentBalance ? '#f59e0b' : '#10b981' },
    { label: 'Collection rate', value: rentDue ? `${collectionRate}%` : 'Pending', icon: <TrendingUp size={20} />, color: collectionRate >= 90 ? '#10b981' : '#f59e0b' },
    { label: 'Pending verification', value: pendingVerification, icon: <ClipboardCheck size={20} />, color: pendingVerification ? '#f59e0b' : '#10b981' },
    { label: 'Overdue tenants', value: overdueTenants, icon: <ShieldAlert size={20} />, color: overdueTenants ? '#ef4444' : '#10b981' },
    { label: 'Pending approvals', value: pendingApprovals, icon: <ClipboardCheck size={20} />, color: pendingApprovals ? '#f59e0b' : '#10b981' },
    { label: 'Handover reviews', value: 'Open', icon: <CalendarCheck size={20} />, color: binThemeTokens.gold },
    { label: 'Monthly maintenance cost', value: monthlyMaintenance ? money(monthlyMaintenance) : 'Baseline pending', icon: <Coins size={20} />, color: binThemeTokens.gold },
    { label: 'Cost per unit', value: costPerUnit ? money(costPerUnit) : '—', icon: <TrendingUp size={20} />, color: '#3b82f6' },
    { label: 'Open maintenance', value: tickets, icon: <Wrench size={20} />, color: tickets ? binThemeTokens.gold : '#10b981' },
    { label: 'Net property health', value: `${healthScore}%`, icon: <ShieldCheck size={20} />, color: healthScore >= 80 ? '#10b981' : binThemeTokens.gold },
  ];

  return (
    <Paper sx={{ p: { xs: 3, md: 4 }, bgcolor: 'rgba(15,23,42,.58)', border: `1px solid ${alpha(binThemeTokens.gold, 0.14)}`, borderRadius: 6 }}>
      <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} justifyContent="space-between" alignItems={{ xs: 'flex-start', md: 'center' }} sx={{ mb: 3 }}>
        <Box>
          <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 950, letterSpacing: 3 }}>OWNER MONEY, PROOF & HANDOVER CONTROL</Typography>
          <Typography variant="h5" sx={{ color: '#fff', fontWeight: 950, mt: 0.5 }}>Rent, payment proof, approvals, and property risk</Typography>
          <Typography variant="body2" sx={{ color: 'rgba(255,255,255,.52)', mt: 1 }}>Owner-facing control center for collections, pending proof, overdue exposure, handover reviews, service risk, and preventive maintenance.</Typography>
        </Box>
        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
          <Chip label={`NEXT: ${nextAction}`} sx={{ bgcolor: alpha(binThemeTokens.gold, 0.1), color: binThemeTokens.gold, fontWeight: 950 }} />
          <Button size="small" variant="outlined" onClick={() => navigate('/owner/financials')} sx={{ borderColor: binThemeTokens.gold, color: binThemeTokens.gold, fontWeight: 950 }}>Financials</Button>
          <Button size="small" variant="outlined" onClick={() => navigate('/owner/approvals')} sx={{ borderColor: binThemeTokens.gold, color: binThemeTokens.gold, fontWeight: 950 }}>Approvals</Button>
          <Button size="small" variant="outlined" onClick={() => navigate('/owner/inspections')} sx={{ borderColor: binThemeTokens.gold, color: binThemeTokens.gold, fontWeight: 950 }}>Move-In / Move-Out</Button>
        </Stack>
      </Stack>

      <Grid container spacing={2}>
        {cards.map((card) => (
          <Grid item xs={12} sm={6} md={3} key={card.label}>
            <Paper sx={{ p: 2.5, height: '100%', bgcolor: 'rgba(255,255,255,0.035)', border: `1px solid ${alpha(card.color, 0.2)}`, borderRadius: 4 }}>
              <Box sx={{ color: card.color, mb: 1 }}>{card.icon}</Box>
              <Typography variant="h6" sx={{ color: '#fff', fontWeight: 950 }}>{card.value}</Typography>
              <Typography variant="caption" sx={{ color: 'rgba(255,255,255,.42)', fontWeight: 900 }}>{card.label.toUpperCase()}</Typography>
            </Paper>
          </Grid>
        ))}
      </Grid>

      <TableContainer sx={{ mt: 3, border: `1px solid ${alpha(binThemeTokens.gold, 0.12)}`, borderRadius: 4, overflow: 'hidden' }}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Property / Tenant Group</TableCell>
              <TableCell>Unit Scope</TableCell>
              <TableCell align="right">Due</TableCell>
              <TableCell align="right">Collected</TableCell>
              <TableCell align="right">Balance</TableCell>
              <TableCell>Status</TableCell>
              <TableCell align="right">Proof</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {propertyRentRows.slice(0, 6).map((row) => {
              const status = statusFor(row.balance, row.overdue);
              return (
                <TableRow key={row.id} hover>
                  <TableCell sx={{ color: '#fff', fontWeight: 900 }}>{row.name}</TableCell>
                  <TableCell sx={{ color: 'rgba(255,255,255,.62)' }}>{row.unit}</TableCell>
                  <TableCell align="right" sx={{ color: 'rgba(255,255,255,.72)' }}>{money(row.due)}</TableCell>
                  <TableCell align="right" sx={{ color: '#10b981', fontWeight: 900 }}>{money(row.paid)}</TableCell>
                  <TableCell align="right" sx={{ color: row.balance ? '#f59e0b' : '#10b981', fontWeight: 900 }}>{money(row.balance)}</TableCell>
                  <TableCell><Chip size="small" label={status.label} sx={{ bgcolor: alpha(status.color, 0.12), color: status.color, fontWeight: 950 }} /></TableCell>
                  <TableCell align="right"><Button size="small" onClick={() => navigate(`/owner/financials?propertyId=${encodeURIComponent(row.id)}`)} sx={{ color: binThemeTokens.gold, fontWeight: 950 }}>View Proof</Button></TableCell>
                </TableRow>
              );
            })}
            {propertyRentRows.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} align="center" sx={{ py: 4, color: 'rgba(255,255,255,.45)', fontWeight: 800 }}>No rent ledger rows are linked yet. Add properties, units, leases, or payment proof to populate this control center.</TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>

      <Typography variant="caption" sx={{ display: 'block', color: 'rgba(255,255,255,.46)', mt: 3 }}>Preventive calendar preview: AC service, water tank cleaning, fire-safety inspection, pest control, lift inspection, pump-room check, and roof/drainage review.</Typography>
    </Paper>
  );
}

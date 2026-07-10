import React from 'react';
import {
  Alert,
  Box,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Container,
  Grid,
  LinearProgress,
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
import { AccountBalance, Payments, PieChart, ReceiptLong, Scale, Security } from '@mui/icons-material';
import { useLanguage } from '@bin/shared';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../../lib/firebase';

const upper = (value: unknown) => String(value || '').trim().toUpperCase();
const money = (value: unknown) => Number.isFinite(Number(value)) ? Number(value) : 0;
const paymentAmount = (row: any) => money(row.amountReceived || row.amountPaid || row.mobilizationAmount || row.rentPaid || row.amount || row.total || 0);
const invoiceAmount = (row: any) => money(row.balanceDue || row.amountDue || row.total || row.amount || 0);
const expenseAmount = (row: any) => money(row.amount || row.total || row.cost || row.actualCost || 0);
const contractAnnualValue = (row: any) => money(row.annualContractValue || row.annualValue || row.annualAMC || row.contractValue || row.totalContractValue || 0);
const paidStatuses = new Set(['PAID', 'APPROVED', 'SUCCEEDED', 'SUCCESS', 'COMPLETED', 'SETTLED']);
const activeContractStatuses = new Set(['ACTIVE', 'APPROVED', 'SIGNED', 'LIVE']);
const cancelledContractStatuses = new Set(['CANCELLED', 'TERMINATED', 'EXPIRED', 'REJECTED']);
const cancelledExpenseStatuses = new Set(['CANCELLED', 'REJECTED', 'VOID']);
const dayValue = (value: any) => value?.toDate?.() || (value ? new Date(value) : null);
const formatAed = (value: number) => `AED ${Math.round(value || 0).toLocaleString('en-AE')}`;
const paymentKey = (row: any) => String(row.providerPaymentIntentId || row.paymentIntentId || row.stripePaymentIntentId || row.paymentReferenceId || row.paymentReference || row.referenceId || `${row.__source}:${row.id}`);
const uniquePayments = (rows: any[]) => Array.from(new Map(rows.map((row) => [paymentKey(row), row])).values());

type LedgerState = {
  payments: any[];
  payment_transactions: any[];
  invoices: any[];
  expenses: any[];
  contracts: any[];
  properties: any[];
};

type PortfolioRow = {
  id: string;
  name: string;
  contractValue: number;
  revenue: number;
  costs: number;
  profit: number;
  margin: number;
};

export default function ProfitabilityPage() {
  const { lang, isRTL } = useLanguage();
  const ar = lang === 'ar';
  const copy = (en: string, arText: string) => ar ? arText : en;
  const [ledger, setLedger] = React.useState<LedgerState>({ payments: [], payment_transactions: [], invoices: [], expenses: [], contracts: [], properties: [] });
  const [ready, setReady] = React.useState(new Set<string>());
  const [error, setError] = React.useState('');

  React.useEffect(() => {
    const streams: Array<{ key: keyof LedgerState; collectionName: string; ref: ReturnType<typeof collection> }> = [
      { key: 'payments', collectionName: 'payments', ref: collection(db, 'payments') },
      { key: 'payment_transactions', collectionName: 'payment_transactions', ref: collection(db, 'payment_transactions') },
      { key: 'invoices', collectionName: 'invoices', ref: collection(db, 'invoices') },
      { key: 'expenses', collectionName: 'expenses', ref: collection(db, 'expenses') },
      { key: 'contracts', collectionName: 'contracts', ref: collection(db, 'contracts') },
      { key: 'properties', collectionName: 'properties', ref: collection(db, 'properties') },
    ];
    const unsubscribers = streams.map(({ key, collectionName, ref }) => onSnapshot(ref, (snapshot) => {
      setLedger((current) => ({ ...current, [key]: snapshot.docs.map((item) => ({ id: item.id, __source: collectionName, ...item.data() })) }));
      setReady((current) => new Set(current).add(key));
      setError('');
    }, (streamError) => {
      console.error(`[Profitability] ${collectionName} listener failed`, streamError);
      setReady((current) => new Set(current).add(key));
      setError(copy('One or more financial ledgers could not be loaded.', 'تعذر تحميل سجل مالي واحد أو أكثر.'));
    }));
    return () => unsubscribers.forEach((unsubscribe) => unsubscribe());
  }, [ar]);

  const data = React.useMemo(() => {
    const contractsById = new Map(ledger.contracts.map((row) => [String(row.id), row]));
    const propertyIdFor = (row: any) => String(row.propertyId || contractsById.get(String(row.contractId || ''))?.propertyId || 'unassigned');
    const allPayments = uniquePayments([...ledger.payment_transactions, ...ledger.payments]);
    const successfulPayments = allPayments.filter((row) => paidStatuses.has(upper(row.status || row.paymentStatus)));
    const validExpenses = ledger.expenses.filter((row) => !cancelledExpenseStatuses.has(upper(row.status)));
    const activeContracts = ledger.contracts.filter((row) => activeContractStatuses.has(upper(row.status || row.activationStatus)));
    const cancelledContracts = ledger.contracts.filter((row) => cancelledContractStatuses.has(upper(row.status || row.activationStatus)));
    const totalRevenue = successfulPayments.reduce((sum, row) => sum + paymentAmount(row), 0);
    const totalCosts = validExpenses.reduce((sum, row) => sum + expenseAmount(row), 0);
    const grossProfit = totalRevenue - totalCosts;
    const arr = activeContracts.reduce((sum, row) => sum + contractAnnualValue(row), 0);
    const mrr = arr / 12;
    const profitMargin = totalRevenue > 0 ? (grossProfit / totalRevenue) * 100 : 0;
    const churnRate = ledger.contracts.length > 0 ? (cancelledContracts.length / ledger.contracts.length) * 100 : 0;
    const now = Date.now();
    const outstandingInvoices = ledger.invoices.filter((row) => ['PENDING', 'UNPAID', 'OPEN', 'PARTIAL', 'OVERDUE'].includes(upper(row.status))).reduce((sum, row) => sum + invoiceAmount(row), 0);
    const overdueInvoices = ledger.invoices.filter((row) => {
      if (upper(row.status) === 'OVERDUE') return true;
      const due = dayValue(row.dueDate || row.paymentDueDate);
      return due instanceof Date && !Number.isNaN(due.getTime()) && due.getTime() < now && !paidStatuses.has(upper(row.status));
    }).reduce((sum, row) => sum + invoiceAmount(row), 0);

    const revenueByProperty = new Map<string, number>();
    successfulPayments.forEach((row) => revenueByProperty.set(propertyIdFor(row), (revenueByProperty.get(propertyIdFor(row)) || 0) + paymentAmount(row)));
    const costsByProperty = new Map<string, number>();
    validExpenses.forEach((row) => costsByProperty.set(propertyIdFor(row), (costsByProperty.get(propertyIdFor(row)) || 0) + expenseAmount(row)));
    const contractsByProperty = new Map<string, number>();
    activeContracts.forEach((row) => contractsByProperty.set(propertyIdFor(row), (contractsByProperty.get(propertyIdFor(row)) || 0) + contractAnnualValue(row)));

    const portfolioRows: PortfolioRow[] = ledger.properties.map((property) => {
      const id = String(property.id);
      const revenue = revenueByProperty.get(id) || 0;
      const costs = costsByProperty.get(id) || 0;
      const profit = revenue - costs;
      return {
        id,
        name: property.propertyName || property.name || property.address || copy('Unnamed Property', 'عقار بدون اسم'),
        contractValue: contractsByProperty.get(id) || 0,
        revenue,
        costs,
        profit,
        margin: revenue > 0 ? (profit / revenue) * 100 : 0,
      };
    }).sort((a, b) => b.revenue - a.revenue || b.contractValue - a.contractValue);

    return {
      totalRevenue,
      totalCosts,
      grossProfit,
      arr,
      mrr,
      profitMargin,
      churnRate,
      outstandingInvoices,
      overdueInvoices,
      activeContracts: activeContracts.length,
      portfolioCount: ledger.properties.length,
      portfolioRows,
      unassignedRevenue: revenueByProperty.get('unassigned') || 0,
      unassignedCosts: costsByProperty.get('unassigned') || 0,
    };
  }, [ar, ledger]);

  const loading = ready.size < 6;
  const expenseBreakdown = React.useMemo(() => {
    const buckets = new Map<string, number>();
    ledger.expenses.filter((row) => !cancelledExpenseStatuses.has(upper(row.status))).forEach((row) => {
      const category = String(row.category || row.expenseType || row.type || copy('Uncategorised', 'غير مصنف'));
      buckets.set(category, (buckets.get(category) || 0) + expenseAmount(row));
    });
    return [...buckets.entries()].map(([label, amount]) => ({ label, amount })).sort((a, b) => b.amount - a.amount).slice(0, 8);
  }, [ar, ledger.expenses]);

  if (loading) return <Box sx={{ minHeight: '70vh', display: 'grid', placeItems: 'center' }}><Stack spacing={2} alignItems="center"><CircularProgress sx={{ color: '#DAA520' }} /><Typography sx={{ color: '#fff' }}>{copy('Loading live financial ledgers...', 'جاري تحميل السجلات المالية المباشرة...')}</Typography></Stack></Box>;

  return (
    <Container maxWidth={false} sx={{ py: 5, bgcolor: '#020617', minHeight: '100vh', color: '#fff', direction: isRTL ? 'rtl' : 'ltr' }}>
      <Stack spacing={4}>
        <Box sx={{ textAlign: isRTL ? 'right' : 'left' }}>
          <Typography variant="overline" sx={{ color: '#DAA520', fontWeight: 950, letterSpacing: 4 }}>{copy('LIVE FINANCIAL LEDGER', 'السجل المالي المباشر')}</Typography>
          <Typography variant="h3" sx={{ fontWeight: 950 }}>{copy('Profitability Command', 'مركز قيادة الربحية')}</Typography>
          <Typography sx={{ color: 'rgba(255,255,255,0.58)', mt: 1 }}>{copy('Actual payments, invoices, expenses, contracts and property records. No sample revenue or assumed margins.', 'مدفوعات وفواتير ومصروفات وعقود وعقارات فعلية، دون إيرادات تجريبية أو هوامش مفترضة.')}</Typography>
        </Box>
        {error && <Alert severity="warning">{error}</Alert>}
        {(data.unassignedRevenue > 0 || data.unassignedCosts > 0) && <Alert severity="warning">{copy(`Unassigned ledger records: ${formatAed(data.unassignedRevenue)} revenue and ${formatAed(data.unassignedCosts)} costs require property/contract reconciliation.`, `سجلات غير مرتبطة: إيرادات ${formatAed(data.unassignedRevenue)} وتكاليف ${formatAed(data.unassignedCosts)} تحتاج إلى ربط بالعقار أو العقد.`)}</Alert>}

        <Grid container spacing={2.5}>
          <MetricCard label={copy('Actual Revenue', 'الإيراد الفعلي')} value={formatAed(data.totalRevenue)} icon={<AccountBalance />} tone="#3b82f6" />
          <MetricCard label={copy('Actual Costs', 'التكاليف الفعلية')} value={formatAed(data.totalCosts)} icon={<Payments />} tone="#f59e0b" />
          <MetricCard label={copy('Gross Profit', 'إجمالي الربح')} value={formatAed(data.grossProfit)} icon={<PieChart />} tone={data.grossProfit >= 0 ? '#10b981' : '#ef4444'} />
          <MetricCard label={copy('Profit Margin', 'هامش الربح')} value={`${data.profitMargin.toFixed(1)}%`} icon={<Scale />} tone={data.profitMargin >= 0 ? '#10b981' : '#ef4444'} />
          <MetricCard label={copy('Contract ARR', 'قيمة العقود السنوية')} value={formatAed(data.arr)} icon={<ReceiptLong />} tone="#a78bfa" />
          <MetricCard label={copy('Contract MRR', 'قيمة العقود الشهرية')} value={formatAed(data.mrr)} icon={<ReceiptLong />} tone="#38bdf8" />
          <MetricCard label={copy('Outstanding Invoices', 'الفواتير المستحقة')} value={formatAed(data.outstandingInvoices)} icon={<ReceiptLong />} tone="#f59e0b" />
          <MetricCard label={copy('Overdue Invoices', 'الفواتير المتأخرة')} value={formatAed(data.overdueInvoices)} icon={<Security />} tone="#ef4444" />
        </Grid>

        <Grid container spacing={3}>
          <Grid item xs={12} lg={8}>
            <Paper sx={{ bgcolor: 'rgba(15,23,42,0.92)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 5, overflow: 'hidden' }}>
              <Box sx={{ p: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><Box><Typography variant="h6" sx={{ color: '#fff', fontWeight: 950 }}>{copy('Property Profitability', 'ربحية العقارات')}</Typography><Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.48)' }}>{copy(`${data.activeContracts} active contracts · ${data.portfolioCount} properties`, `${data.activeContracts} عقود نشطة · ${data.portfolioCount} عقارات`)}</Typography></Box><Chip label={`${copy('Churn', 'الإلغاء')}: ${data.churnRate.toFixed(1)}%`} color={data.churnRate > 10 ? 'warning' : 'success'} /></Box>
              <TableContainer><Table><TableHead><TableRow>{[copy('Property', 'العقار'), copy('Annual Contract', 'العقد السنوي'), copy('Revenue', 'الإيراد'), copy('Costs', 'التكاليف'), copy('Profit', 'الربح'), copy('Margin', 'الهامش')].map((label) => <TableCell key={label} sx={{ color: '#DAA520', fontWeight: 950 }}>{label}</TableCell>)}</TableRow></TableHead><TableBody>{data.portfolioRows.length ? data.portfolioRows.map((row) => <TableRow key={row.id} sx={{ '& td': { color: '#fff', borderColor: 'rgba(255,255,255,0.07)' } }}><TableCell sx={{ fontWeight: 900 }}>{row.name}</TableCell><TableCell>{formatAed(row.contractValue)}</TableCell><TableCell>{formatAed(row.revenue)}</TableCell><TableCell>{formatAed(row.costs)}</TableCell><TableCell sx={{ color: `${row.profit >= 0 ? '#10b981' : '#ef4444'} !important`, fontWeight: 950 }}>{formatAed(row.profit)}</TableCell><TableCell><Stack spacing={0.5}><Typography variant="caption" sx={{ fontWeight: 900 }}>{row.margin.toFixed(1)}%</Typography><LinearProgress variant="determinate" value={Math.max(0, Math.min(100, row.margin))} sx={{ height: 5, borderRadius: 5, bgcolor: 'rgba(255,255,255,0.07)', '& .MuiLinearProgress-bar': { bgcolor: row.margin >= 0 ? '#10b981' : '#ef4444' } }} /></Stack></TableCell></TableRow>) : <TableRow><TableCell colSpan={6} align="center" sx={{ color: 'rgba(255,255,255,0.5)', py: 6 }}>{copy('No property ledger data is available yet.', 'لا توجد بيانات مالية للعقارات حتى الآن.')}</TableCell></TableRow>}</TableBody></Table></TableContainer>
            </Paper>
          </Grid>

          <Grid item xs={12} lg={4}>
            <Card sx={{ height: '100%', bgcolor: 'rgba(15,23,42,0.92)', color: '#fff', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 5 }}><CardContent sx={{ p: 3 }}><Typography variant="h6" sx={{ fontWeight: 950, mb: 3 }}>{copy('Actual Expense Breakdown', 'توزيع المصروفات الفعلية')}</Typography><Stack spacing={2.5}>{expenseBreakdown.length ? expenseBreakdown.map((item) => { const pct = data.totalCosts > 0 ? (item.amount / data.totalCosts) * 100 : 0; return <Box key={item.label}><Stack direction={isRTL ? 'row-reverse' : 'row'} justifyContent="space-between"><Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.62)', fontWeight: 900 }}>{item.label}</Typography><Typography variant="caption" sx={{ color: '#fff', fontWeight: 950 }}>{formatAed(item.amount)}</Typography></Stack><LinearProgress variant="determinate" value={pct} sx={{ mt: 1, height: 5, borderRadius: 5, bgcolor: 'rgba(255,255,255,0.07)' }} /></Box>; }) : <Typography sx={{ color: 'rgba(255,255,255,0.5)' }}>{copy('No expense records found.', 'لا توجد سجلات مصروفات.')}</Typography>}</Stack></CardContent></Card>
          </Grid>
        </Grid>
      </Stack>
    </Container>
  );
}

function MetricCard({ label, value, icon, tone }: { label: string; value: string; icon: React.ReactNode; tone: string }) {
  return <Grid item xs={12} sm={6} md={4} lg={3}><Card sx={{ height: '100%', bgcolor: alpha(tone, 0.07), border: `1px solid ${alpha(tone, 0.24)}`, color: '#fff', borderRadius: 4 }}><CardContent><Stack direction="row" justifyContent="space-between" alignItems="center"><Box><Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.52)', fontWeight: 900 }}>{label.toUpperCase()}</Typography><Typography variant="h5" sx={{ fontWeight: 950, mt: 0.8 }}>{value}</Typography></Box><Box sx={{ color: tone }}>{icon}</Box></Stack></CardContent></Card></Grid>;
}

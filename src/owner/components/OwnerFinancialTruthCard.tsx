import React from 'react';
import { Alert, Box, Button, Chip, CircularProgress, Paper, Stack, Typography, alpha } from '@mui/material';
import { Calculator, Clock3, ReceiptText, Wallet } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useRole } from '../../context/RoleContext';
import { useLanguage } from '@bin/shared';
import SafeIcon from '../../components/SafeIcon';
import { binThemeTokens } from '../../theme/binGroupTheme';
import { useOwnerFinancialTruthData } from '../hooks/useOwnerFinancialTruthData';

// Payable equation source: Owner-scoped propertyPassports with the same 5%
// management-fee rule as /owner/financials. Paid invoices and VERIFIED NOI are
// shown alongside, never folded into the payable equation.
const MANAGEMENT_FEE_RATE = 0.05;
const money = (value: number) => `AED ${Number(value || 0).toLocaleString('en-AE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function OwnerFinancialTruthCard() {
  const navigate = useNavigate();
  const { user } = useRole();
  const { lang } = useLanguage();
  const [refreshedAt, setRefreshedAt] = React.useState<Date | null>(null);
  const { summary, loading, error: dataError } = useOwnerFinancialTruthData(user, { feeRate: MANAGEMENT_FEE_RATE });

  React.useEffect(() => {
    if (!loading) setRefreshedAt(new Date());
  }, [loading, summary.primaryKind, summary.primaryValue, summary.paidInvoiceTotal, summary.verifiedNoi, summary.netPayout]);

  const copy = lang === 'ar'
    ? {
        eyebrow: 'الحقيقة المالية للمالك',
        titlePayable: 'المبلغ المستحق لك حالياً',
        titleNoi: 'صافي الدخل التشغيلي الموثّق',
        titlePaidInvoices: 'الفواتير المدفوعة المسجّلة',
        titleEmpty: 'لا توجد حالياً أرقام مالية موثقة',
        empty: 'لا توجد حالياً إيجارات محصّلة أو فواتير مدفوعة أو صافي دخل تشغيلي موثّق لهذا الحساب.',
        equation: 'الإيجار المستلم − المصروفات/الصيانة − رسوم إدارة BIN = المبلغ المستحق',
        paidNote: 'هذا إجمالي فواتير المالك المسجّلة كمدفوعة (مثل دفعة التجهيز). ليس إيجاراً محصّلاً ولا مبلغاً مستحقاً لك.',
        noiNote: 'نفس أساس صافي الدخل التشغيلي VERIFIED في لوحة الذكاء المتقدم: الإيجار السنوي المسجّل ناقص المصروفات المسجّلة.',
        source: 'مصدر المبلغ المستحق: propertyPassports الخاصة بالمالك وفق قاعدة رسوم الإدارة 5%. الفواتير المدفوعة وصافي الدخل التشغيلي الموثّق من الفواتير وسجلات العقار.',
        refreshed: 'آخر تحديث',
        pending: 'قيد التحقق',
        paidInvoices: 'فواتير مدفوعة',
        verifiedNoi: 'صافي دخل تشغيلي موثّق',
        rentCollected: 'إيجار محصّل',
        open: 'فتح التفاصيل المالية',
      }
    : {
        eyebrow: 'OWNER FINANCIAL TRUTH',
        titlePayable: 'Current amount payable to you',
        titleNoi: 'Verified net operating income',
        titlePaidInvoices: 'Paid invoices on record',
        titleEmpty: 'No verified financial totals yet',
        empty: 'No collected rent, paid invoices, or verified net operating income are currently recorded for this Owner account.',
        equation: 'Rent received − maintenance/expenses − BIN management fee = amount payable',
        paidNote: 'This is the total of Owner invoices marked paid (for example mobilization). It is not rent collected and not an amount payable to you.',
        noiNote: 'Same VERIFIED NOI basis as advanced Owner intelligence: recorded annual rent minus recorded expenses.',
        source: 'Payable source: Owner-scoped propertyPassports with the 5% management-fee rule used by the Financials page. Paid invoices and Verified NOI come from invoices and property records.',
        refreshed: 'Refreshed',
        pending: 'Pending verification',
        paidInvoices: 'Paid invoices',
        verifiedNoi: 'Verified NOI',
        rentCollected: 'Rent collected',
        open: 'Open financial details',
      };

  const title = summary.primaryKind === 'net_payout'
    ? copy.titlePayable
    : summary.primaryKind === 'verified_noi'
      ? copy.titleNoi
      : summary.primaryKind === 'paid_invoices'
        ? copy.titlePaidInvoices
        : copy.titleEmpty;

  const error = dataError
    ? (lang === 'ar'
      ? 'تعذر تحميل المصدر المالي المباشر. لا تعتمد على رقم قديم لاتخاذ قرار.'
      : 'The live financial source could not be loaded. Do not rely on a stale number for a decision.')
    : '';

  return (
    <Paper
      data-testid="owner-financial-truth-card"
      data-primary-kind={summary.primaryKind}
      data-source-count={summary.propertyCount}
      data-paid-invoice-count={summary.paidInvoiceCount}
      data-verified-noi-status={summary.verifiedNoiStatus}
      sx={{ p: { xs: 2.5, md: 3.5 }, borderRadius: 6, bgcolor: '#111827', color: '#fff', border: `1px solid ${alpha(binThemeTokens.gold, 0.34)}` }}
    >
      <Stack spacing={2.25}>
        <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" spacing={2} alignItems={{ xs: 'flex-start', md: 'center' }}>
          <Box>
            <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 950, letterSpacing: 2.5 }}>{copy.eyebrow}</Typography>
            <Typography variant="h5" sx={{ fontWeight: 950, mt: 0.5 }}>{title}</Typography>
          </Box>
          <Button onClick={() => navigate('/owner/financials')} sx={{ color: '#111827', bgcolor: binThemeTokens.gold, fontWeight: 950, borderRadius: 3, '&:hover': { bgcolor: binThemeTokens.goldHover } }}>{copy.open}</Button>
        </Stack>

        {loading ? (
          <Stack direction="row" spacing={1.5} alignItems="center"><CircularProgress size={20} sx={{ color: binThemeTokens.gold }} /><Typography variant="body2">Loading live Owner financial source…</Typography></Stack>
        ) : error ? (
          <Alert severity="warning">{error}</Alert>
        ) : summary.primaryKind === 'empty' ? (
          <Alert severity="info">{copy.empty}</Alert>
        ) : (
          <>
            <Typography variant="h3" sx={{ fontWeight: 950, color: binThemeTokens.gold }}>{money(summary.primaryValue)}</Typography>
            {summary.primaryKind === 'net_payout' && (
              <Paper sx={{ p: 2, bgcolor: 'rgba(255,255,255,0.045)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 3 }}>
                <Stack spacing={0.8}>
                  <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.72)', fontWeight: 800 }}>{copy.equation}</Typography>
                  <Typography sx={{ fontWeight: 950 }}>
                    {money(summary.totalRevenue)} − {money(summary.maintenanceDeductions)} − {money(summary.managementFees)} = {money(summary.netPayout)}
                  </Typography>
                </Stack>
              </Paper>
            )}
            {summary.primaryKind === 'verified_noi' && (
              <Alert severity="info" sx={{ bgcolor: 'rgba(56,189,248,0.08)', color: '#E0F2FE' }}>{copy.noiNote}</Alert>
            )}
            {summary.primaryKind === 'paid_invoices' && (
              <Alert severity="info" sx={{ bgcolor: 'rgba(16,185,129,0.08)', color: '#D1FAE5' }}>{copy.paidNote}</Alert>
            )}
          </>
        )}

        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} useFlexGap flexWrap="wrap" alignItems={{ xs: 'flex-start', sm: 'center' }}>
          <Chip icon={<SafeIcon icon={ReceiptText} size={14} />} label={`${copy.rentCollected}: ${money(summary.totalRevenue)}`} size="small" sx={{ bgcolor: 'rgba(255,255,255,0.08)', color: '#fff' }} />
          <Chip icon={<SafeIcon icon={Wallet} size={14} />} label={`${copy.verifiedNoi}: ${summary.verifiedNoi === null ? '—' : money(summary.verifiedNoi)}`} size="small" sx={{ bgcolor: alpha('#38bdf8', 0.14), color: '#E0F2FE' }} />
          <Chip icon={<SafeIcon icon={ReceiptText} size={14} />} label={`${copy.paidInvoices}: ${money(summary.paidInvoiceTotal)} (${summary.paidInvoiceCount})`} size="small" sx={{ bgcolor: alpha('#10b981', 0.14), color: '#D1FAE5' }} />
          <Chip icon={<SafeIcon icon={Calculator} size={14} />} label={`${copy.pending}: ${money(summary.pendingVerification)}`} size="small" sx={{ bgcolor: 'rgba(255,255,255,0.08)', color: '#fff' }} />
          <Chip icon={<SafeIcon icon={Calculator} size={14} />} label={copy.source} size="small" sx={{ maxWidth: '100%', height: 'auto', bgcolor: alpha(binThemeTokens.gold, 0.12), color: '#F8E7A6', '& .MuiChip-label': { whiteSpace: 'normal', py: 0.7 } }} />
          {refreshedAt && <Chip icon={<SafeIcon icon={Clock3} size={14} />} label={`${copy.refreshed}: ${refreshedAt.toLocaleString(lang === 'ar' ? 'ar-AE' : 'en-AE')}`} size="small" sx={{ bgcolor: 'rgba(255,255,255,0.08)', color: '#fff' }} />}
        </Stack>
      </Stack>
    </Paper>
  );
}

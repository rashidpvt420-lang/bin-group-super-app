import React from 'react';
import { Alert, Box, Button, Chip, CircularProgress, Paper, Stack, Typography, alpha } from '@mui/material';
import { Calculator, Clock3, ReceiptText } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { collection, db, onSnapshot, query, where } from '../../lib/firebase';
import { useRole } from '../../context/RoleContext';
import { useLanguage } from '@bin/shared';
import SafeIcon from '../../components/SafeIcon';
import { binThemeTokens } from '../../theme/binGroupTheme';

const MANAGEMENT_FEE_RATE = 0.05;
const money = (value: number) => `AED ${Number(value || 0).toLocaleString('en-AE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function OwnerFinancialTruthCard() {
  const navigate = useNavigate();
  const { user } = useRole();
  const { lang } = useLanguage();
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState('');
  const [sourceCount, setSourceCount] = React.useState(0);
  const [refreshedAt, setRefreshedAt] = React.useState<Date | null>(null);
  const [summary, setSummary] = React.useState({ rentReceived: 0, expenses: 0, binFees: 0, payable: 0, pendingVerification: 0 });

  React.useEffect(() => {
    if (!user?.email) {
      setLoading(false);
      setError('Authenticated Owner email is unavailable.');
      return undefined;
    }

    setLoading(true);
    setError('');
    const ownerEmail = user.email.toLowerCase();
    const sourceQuery = query(collection(db, 'propertyPassports'), where('ownerEmail', '==', ownerEmail));
    return onSnapshot(sourceQuery, (snapshot) => {
      let rentReceived = 0;
      let expenses = 0;
      let pendingVerification = 0;
      snapshot.docs.forEach((record) => {
        const data = record.data() as Record<string, any>;
        rentReceived += Number(data.rentCollectedTotal || data.grossRentCollected || data.grossRent || 0);
        expenses += Number(data.maintenanceCostTotal || data.outstandingMaintenanceInvoices || data.maintenanceDeductions || 0);
        pendingVerification += Number(data.pendingRentVerification || data.pendingVerification || 0);
      });
      const binFees = rentReceived * MANAGEMENT_FEE_RATE;
      setSourceCount(snapshot.size);
      setSummary({
        rentReceived,
        expenses,
        binFees,
        payable: Math.max(rentReceived - expenses - binFees, 0),
        pendingVerification,
      });
      setRefreshedAt(new Date());
      setLoading(false);
    }, () => {
      setLoading(false);
      setError(lang === 'ar'
        ? 'تعذر تحميل المصدر المالي المباشر. لا تعتمد على رقم قديم لاتخاذ قرار.'
        : 'The live financial source could not be loaded. Do not rely on a stale number for a decision.');
    });
  }, [lang, user?.email]);

  const copy = lang === 'ar'
    ? {
        eyebrow: 'الحقيقة المالية للمالك',
        title: 'المبلغ المستحق لك حالياً',
        empty: 'لا توجد حالياً سجلات مالية موثقة في جوازات العقارات لهذا الحساب.',
        equation: 'الإيجار المستلم − المصروفات/الصيانة − رسوم إدارة BIN = المبلغ المستحق',
        source: 'المصدر: propertyPassports الخاصة بالمالك. تستخدم نفس قاعدة رسوم الإدارة الحالية 5% المعروضة في صفحة المالية.',
        refreshed: 'آخر تحديث',
        pending: 'قيد التحقق',
        open: 'فتح التفاصيل المالية',
      }
    : {
        eyebrow: 'OWNER FINANCIAL TRUTH',
        title: 'Current amount payable to you',
        empty: 'No verified property-passport financial records are currently available for this Owner account.',
        equation: 'Rent received − maintenance/expenses − BIN management fee = amount payable',
        source: 'Source: Owner-scoped propertyPassports. This mirrors the current 5% management-fee rule used by the Financials page.',
        refreshed: 'Refreshed',
        pending: 'Pending verification',
        open: 'Open financial details',
      };

  return (
    <Paper
      data-testid="owner-financial-truth-card"
      data-source-count={sourceCount}
      sx={{ p: { xs: 2.5, md: 3.5 }, borderRadius: 6, bgcolor: '#111827', color: '#fff', border: `1px solid ${alpha(binThemeTokens.gold, 0.34)}` }}
    >
      <Stack spacing={2.25}>
        <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" spacing={2} alignItems={{ xs: 'flex-start', md: 'center' }}>
          <Box>
            <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 950, letterSpacing: 2.5 }}>{copy.eyebrow}</Typography>
            <Typography variant="h5" sx={{ fontWeight: 950, mt: 0.5 }}>{copy.title}</Typography>
          </Box>
          <Button onClick={() => navigate('/owner/financials')} sx={{ color: '#111827', bgcolor: binThemeTokens.gold, fontWeight: 950, borderRadius: 3, '&:hover': { bgcolor: binThemeTokens.goldHover } }}>{copy.open}</Button>
        </Stack>

        {loading ? (
          <Stack direction="row" spacing={1.5} alignItems="center"><CircularProgress size={20} sx={{ color: binThemeTokens.gold }} /><Typography variant="body2">Loading live Owner financial source…</Typography></Stack>
        ) : error ? (
          <Alert severity="warning">{error}</Alert>
        ) : sourceCount === 0 ? (
          <Alert severity="info">{copy.empty}</Alert>
        ) : (
          <>
            <Typography variant="h3" sx={{ fontWeight: 950, color: binThemeTokens.gold }}>{money(summary.payable)}</Typography>
            <Paper sx={{ p: 2, bgcolor: 'rgba(255,255,255,0.045)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 3 }}>
              <Stack spacing={0.8}>
                <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.72)', fontWeight: 800 }}>{copy.equation}</Typography>
                <Typography sx={{ fontWeight: 950 }}>
                  {money(summary.rentReceived)} − {money(summary.expenses)} − {money(summary.binFees)} = {money(summary.payable)}
                </Typography>
              </Stack>
            </Paper>
          </>
        )}

        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} useFlexGap flexWrap="wrap" alignItems={{ xs: 'flex-start', sm: 'center' }}>
          <Chip icon={<SafeIcon icon={ReceiptText} size={14} />} label={`${copy.pending}: ${money(summary.pendingVerification)}`} size="small" sx={{ bgcolor: 'rgba(255,255,255,0.08)', color: '#fff' }} />
          <Chip icon={<SafeIcon icon={Calculator} size={14} />} label={copy.source} size="small" sx={{ maxWidth: '100%', height: 'auto', bgcolor: alpha(binThemeTokens.gold, 0.12), color: '#F8E7A6', '& .MuiChip-label': { whiteSpace: 'normal', py: 0.7 } }} />
          {refreshedAt && <Chip icon={<SafeIcon icon={Clock3} size={14} />} label={`${copy.refreshed}: ${refreshedAt.toLocaleString(lang === 'ar' ? 'ar-AE' : 'en-AE')}`} size="small" sx={{ bgcolor: 'rgba(255,255,255,0.08)', color: '#fff' }} />}
        </Stack>
      </Stack>
    </Paper>
  );
}

import React, { useState, useEffect } from 'react';
import {
  Alert,
  Box,
  Chip,
  CircularProgress,
  Divider,
  Grid,
  Paper,
  Stack,
  Typography,
  alpha,
} from '@mui/material';
import { CalendarClock, RefreshCw, ShieldCheck } from 'lucide-react';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useRole } from '../../context/RoleContext';
import { useLanguage } from '../../context/LanguageContext';
import { binThemeTokens } from '../../theme/binGroupTheme';

type ContractRow = {
  id: string;
  propertyName?: string;
  tenantName?: string;
  expiresAt?: any;
  status?: string;
  contractCycle?: string;
  daysRemaining?: number;
};

function daysUntil(value: any): number {
  if (!value) return Infinity;
  const d = typeof value?.toDate === 'function' ? value.toDate() : new Date(value.seconds ? value.seconds * 1000 : value);
  return isNaN(d.getTime()) ? Infinity : Math.ceil((d.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
}

function urgencyColor(days: number): string {
  if (days <= 7) return '#ef4444';
  if (days <= 30) return '#f59e0b';
  if (days <= 60) return '#3b82f6';
  return '#10b981';
}

function urgencyLabel(days: number, label: (en: string, ar: string) => string): string {
  if (days <= 0) return label('Expired', 'منتهي');
  if (days <= 7) return label('Critical', 'حرج');
  if (days <= 30) return label('Urgent', 'عاجل');
  if (days <= 60) return label('Upcoming', 'قادم');
  return label('On Track', 'على المسار');
}

export default function OwnerRenewalsPage() {
  const { user } = useRole();
  const { isRTL, lang } = useLanguage();
  const label = (en: string, ar: string) => (lang === 'ar' ? ar : en);
  const [contracts, setContracts] = useState<ContractRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!user?.uid) { setLoading(false); return; }
    const load = async () => {
      try {
        const snap = await getDocs(
          query(collection(db, 'contracts'), where('ownerId', '==', user.uid), where('status', 'in', ['ACTIVE', 'active']))
        );
        const rows: ContractRow[] = snap.docs.map((d) => {
          const data = d.data();
          const days = daysUntil(data.expiresAt || data.validTo || data.effectiveTo);
          return { id: d.id, ...data, daysRemaining: days } as ContractRow;
        });
        rows.sort((a, b) => (a.daysRemaining ?? Infinity) - (b.daysRemaining ?? Infinity));
        setContracts(rows);
      } catch (err: any) {
        setError(label('Could not load renewal status.', 'تعذر تحميل حالة التجديد.'));
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [user?.uid]);

  const formatDate = (value: any) => {
    if (!value) return '—';
    const d = typeof value?.toDate === 'function' ? value.toDate() : new Date(value.seconds ? value.seconds * 1000 : value);
    return isNaN(d.getTime()) ? '—' : d.toLocaleDateString(isRTL ? 'ar-AE' : 'en-AE', { year: 'numeric', month: 'long', day: 'numeric' });
  };

  if (loading) return <Box sx={{ display: 'flex', justifyContent: 'center', py: 12 }}><CircularProgress /></Box>;

  return (
    <Box sx={{ p: { xs: 2, md: 4 }, direction: isRTL ? 'rtl' : 'ltr' }}>
      <Box sx={{ mb: 4, textAlign: isRTL ? 'right' : 'left' }}>
        <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 900, letterSpacing: 3 }}>
          {label('CONTRACT MANAGEMENT', 'إدارة العقود')}
        </Typography>
        <Typography variant="h4" fontWeight={950} color={binThemeTokens.textPrimary} sx={{ mt: 0.5 }}>
          {label('Contract Renewals', 'تجديدات العقود')}
        </Typography>
        <Typography variant="body2" color={binThemeTokens.textSecondary} sx={{ mt: 1 }}>
          {label('Track expiry timelines and renewal status for all active service contracts.', 'تتبع مواعيد انتهاء صلاحية العقود وحالة التجديد لجميع عقود الخدمة النشطة.')}
        </Typography>
      </Box>
      <Box>
        {error && <Alert severity="error" sx={{ mb: 3 }}>{error}</Alert>}

        {!loading && contracts.length === 0 && (
          <Paper sx={{ p: 6, textAlign: 'center', borderRadius: 6, border: '1px solid #E5E7EB' }}>
            <CalendarClock size={40} color={binThemeTokens.textSecondary} style={{ marginBottom: 12 }} />
            <Typography color="text.secondary" fontWeight={700}>
              {label('No active contracts nearing renewal.', 'لا توجد عقود نشطة قريبة من التجديد.')}
            </Typography>
          </Paper>
        )}

        <Grid container spacing={3}>
          {contracts.map((c) => {
            const days = c.daysRemaining ?? Infinity;
            const color = urgencyColor(days);
            const expired = days <= 0;
            return (
              <Grid item xs={12} md={6} key={c.id}>
                <Paper sx={{ p: 4, borderRadius: 6, border: `1px solid ${alpha(color, 0.22)}`, bgcolor: alpha(color, 0.03) }}>
                  <Stack direction={isRTL ? 'row-reverse' : 'row'} spacing={2} alignItems="flex-start" justifyContent="space-between">
                    <Box sx={{ textAlign: isRTL ? 'right' : 'left', flex: 1 }}>
                      <Typography variant="h6" fontWeight={900} color={binThemeTokens.textPrimary}>
                        {c.propertyName || label('Property', 'العقار')}
                      </Typography>
                      <Typography variant="body2" color={binThemeTokens.textSecondary} sx={{ mt: 0.5 }}>
                        {label('Tenant: ', 'المستأجر: ')}{c.tenantName || '—'}
                      </Typography>
                    </Box>
                    <Chip
                      label={urgencyLabel(days, label)}
                      size="small"
                      sx={{ bgcolor: alpha(color, 0.12), color, fontWeight: 900, border: `1px solid ${alpha(color, 0.3)}` }}
                    />
                  </Stack>

                  <Divider sx={{ my: 2, borderColor: alpha(color, 0.12) }} />

                  <Grid container spacing={2}>
                    <Grid item xs={6}>
                      <Typography variant="caption" color={binThemeTokens.textSecondary} fontWeight={700} display="block">
                        {label('EXPIRES', 'تنتهي في')}
                      </Typography>
                      <Typography variant="body2" fontWeight={800} color={expired ? '#ef4444' : binThemeTokens.textPrimary}>
                        {formatDate(c.expiresAt || (c as any).validTo || (c as any).effectiveTo)}
                      </Typography>
                    </Grid>
                    <Grid item xs={6} sx={{ textAlign: isRTL ? 'left' : 'right' }}>
                      <Typography variant="caption" color={binThemeTokens.textSecondary} fontWeight={700} display="block">
                        {label('DAYS LEFT', 'الأيام المتبقية')}
                      </Typography>
                      <Typography variant="h5" fontWeight={950} color={color}>
                        {expired ? label('Expired', 'منتهي') : days === Infinity ? '—' : days}
                      </Typography>
                    </Grid>
                    <Grid item xs={6}>
                      <Typography variant="caption" color={binThemeTokens.textSecondary} fontWeight={700} display="block">
                        {label('CYCLE', 'الدورة')}
                      </Typography>
                      <Typography variant="body2" fontWeight={800} color={binThemeTokens.textPrimary}>
                        {c.contractCycle === 'RENEWAL' ? label('Renewal', 'تجديد') : label('Initial', 'أولي')}
                      </Typography>
                    </Grid>
                    <Grid item xs={6} sx={{ textAlign: isRTL ? 'left' : 'right' }}>
                      <Typography variant="caption" color={binThemeTokens.textSecondary} fontWeight={700} display="block">
                        {label('CONTRACT ID', 'رقم العقد')}
                      </Typography>
                      <Typography variant="caption" fontWeight={700} color={binThemeTokens.textSecondary} sx={{ fontFamily: 'monospace' }}>
                        {c.id.substring(0, 10).toUpperCase()}
                      </Typography>
                    </Grid>
                  </Grid>

                  {days <= 30 && !expired && (
                    <Alert severity="warning" icon={<RefreshCw size={16} />} sx={{ mt: 2, borderRadius: 3, fontSize: '0.8rem' }}>
                      {label('Contact BIN GROUP admin to initiate renewal before expiry.', 'تواصل مع إدارة BIN GROUP لبدء التجديد قبل انتهاء الصلاحية.')}
                    </Alert>
                  )}
                  {expired && (
                    <Alert severity="error" icon={<ShieldCheck size={16} />} sx={{ mt: 2, borderRadius: 3, fontSize: '0.8rem' }}>
                      {label('This contract has expired. Contact admin immediately.', 'انتهت صلاحية هذا العقد. تواصل مع الإدارة فورًا.')}
                    </Alert>
                  )}
                </Paper>
              </Grid>
            );
          })}
        </Grid>
      </Box>
    </Box>
  );
}

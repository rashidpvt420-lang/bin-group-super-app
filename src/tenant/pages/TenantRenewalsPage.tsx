import React, { useState, useEffect } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Divider,
  Grid,
  Paper,
  Stack,
  Typography,
  alpha,
} from '@mui/material';
import { CalendarClock, MessageCircle, Phone, RefreshCw } from 'lucide-react';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useRole } from '../../context/RoleContext';
import { useLanguage } from '../../context/LanguageContext';
import { binThemeTokens } from '../../theme/binGroupTheme';

type LeaseRow = {
  id: string;
  propertyName?: string;
  unitNumber?: string;
  ownerName?: string;
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

export default function TenantRenewalsPage() {
  const { user } = useRole();
  const { isRTL, lang } = useLanguage();
  const label = (en: string, ar: string) => (lang === 'ar' ? ar : en);
  const [leases, setLeases] = useState<LeaseRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!user?.uid) { setLoading(false); return; }
    const load = async () => {
      try {
        const snap = await getDocs(
          query(collection(db, 'contracts'), where('tenantId', '==', user.uid), where('status', 'in', ['ACTIVE', 'active']))
        );
        const rows: LeaseRow[] = snap.docs.map((d) => {
          const data = d.data();
          return { id: d.id, ...data, daysRemaining: daysUntil(data.expiresAt || data.validTo || data.effectiveTo) } as LeaseRow;
        });
        rows.sort((a, b) => (a.daysRemaining ?? Infinity) - (b.daysRemaining ?? Infinity));
        setLeases(rows);
      } catch (err: any) {
        setError(label('Could not load lease renewal status.', 'تعذر تحميل حالة تجديد الإيجار.'));
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
          {label('TENANCY MANAGEMENT', 'إدارة الإيجار')}
        </Typography>
        <Typography variant="h4" fontWeight={950} color={binThemeTokens.textPrimary} sx={{ mt: 0.5 }}>
          {label('Lease Renewal Status', 'حالة تجديد عقد الإيجار')}
        </Typography>
        <Typography variant="body2" color={binThemeTokens.textSecondary} sx={{ mt: 1 }}>
          {label('Your lease expiry countdown and renewal options.', 'العد التنازلي لانتهاء عقد إيجارك وخيارات التجديد.')}
        </Typography>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 3 }}>{error}</Alert>}

      {leases.length === 0 && (
        <Paper sx={{ p: 6, textAlign: 'center', borderRadius: 6, border: '1px solid #E5E7EB' }}>
          <CalendarClock size={40} color={binThemeTokens.textSecondary} style={{ marginBottom: 12 }} />
          <Typography color="text.secondary" fontWeight={700}>
            {label('No active lease contracts found.', 'لا توجد عقود إيجار نشطة.')}
          </Typography>
        </Paper>
      )}

      {leases.map((lease) => {
        const days = lease.daysRemaining ?? Infinity;
        const color = urgencyColor(days);
        const expired = days <= 0;

        return (
          <Paper key={lease.id} sx={{ p: 4, borderRadius: 6, mb: 3, border: `1px solid ${alpha(color, 0.22)}`, bgcolor: alpha(color, 0.03) }}>
            <Stack direction={isRTL ? 'row-reverse' : 'row'} spacing={2} alignItems="flex-start" justifyContent="space-between">
              <Box sx={{ textAlign: isRTL ? 'right' : 'left', flex: 1 }}>
                <Typography variant="h6" fontWeight={900} color={binThemeTokens.textPrimary}>
                  {lease.propertyName || label('Your Property', 'عقارك')}
                  {lease.unitNumber ? ` — ${label('Unit ', 'وحدة ')}${lease.unitNumber}` : ''}
                </Typography>
                {lease.ownerName && (
                  <Typography variant="body2" color={binThemeTokens.textSecondary} sx={{ mt: 0.5 }}>
                    {label('Owner: ', 'المالك: ')}{lease.ownerName}
                  </Typography>
                )}
              </Box>
              <Box sx={{ textAlign: 'center' }}>
                <Typography variant="h3" fontWeight={950} color={color} sx={{ lineHeight: 1 }}>
                  {expired ? '!' : days === Infinity ? '—' : days}
                </Typography>
                <Typography variant="caption" color={color} fontWeight={700}>
                  {expired ? label('EXPIRED', 'منتهي') : label('DAYS LEFT', 'يوم متبقٍ')}
                </Typography>
              </Box>
            </Stack>

            <Divider sx={{ my: 2.5, borderColor: alpha(color, 0.12) }} />

            <Grid container spacing={2} sx={{ mb: 2 }}>
              <Grid item xs={6}>
                <Typography variant="caption" color={binThemeTokens.textSecondary} fontWeight={700} display="block">
                  {label('LEASE EXPIRES', 'ينتهي الإيجار')}
                </Typography>
                <Typography variant="body2" fontWeight={800} color={expired ? '#ef4444' : binThemeTokens.textPrimary}>
                  {formatDate(lease.expiresAt || (lease as any).validTo || (lease as any).effectiveTo)}
                </Typography>
              </Grid>
              <Grid item xs={6} sx={{ textAlign: isRTL ? 'left' : 'right' }}>
                <Typography variant="caption" color={binThemeTokens.textSecondary} fontWeight={700} display="block">
                  {label('CONTRACT CYCLE', 'دورة العقد')}
                </Typography>
                <Typography variant="body2" fontWeight={800} color={binThemeTokens.textPrimary}>
                  {lease.contractCycle === 'RENEWAL' ? label('Renewal', 'تجديد') : label('Initial', 'أولي')}
                </Typography>
              </Grid>
            </Grid>

            {(days <= 60 || expired) && (
              <>
                <Typography variant="caption" color={binThemeTokens.textSecondary} fontWeight={700} display="block" sx={{ mb: 1.5 }}>
                  {label('YOUR OPTIONS', 'خياراتك')}
                </Typography>
                <Stack direction={{ xs: 'column', sm: isRTL ? 'row-reverse' : 'row' }} spacing={1.5} flexWrap="wrap">
                  <Button
                    variant="contained"
                    startIcon={<RefreshCw size={15} />}
                    href="mailto:renewals@bin-groups.com"
                    sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 900, borderRadius: 2, fontSize: '0.8rem' }}
                  >
                    {label('Request Renewal', 'طلب التجديد')}
                  </Button>
                  <Button
                    variant="outlined"
                    startIcon={<MessageCircle size={15} />}
                    href="/tenant/messages"
                    sx={{ borderColor: binThemeTokens.gold, color: binThemeTokens.gold, fontWeight: 900, borderRadius: 2, fontSize: '0.8rem' }}
                  >
                    {label('Message Admin', 'راسل الإدارة')}
                  </Button>
                  <Button
                    variant="outlined"
                    startIcon={<Phone size={15} />}
                    href="tel:+97142000000"
                    sx={{ borderColor: '#6366f1', color: '#6366f1', fontWeight: 900, borderRadius: 2, fontSize: '0.8rem' }}
                  >
                    {label('Call BIN GROUP', 'اتصل بـ BIN GROUP')}
                  </Button>
                </Stack>
              </>
            )}

            {expired && (
              <Alert severity="error" sx={{ mt: 2, borderRadius: 3 }}>
                {label('Your lease has expired. Contact BIN GROUP immediately to avoid service disruption.', 'انتهت صلاحية عقد إيجارك. تواصل مع BIN GROUP فورًا لتجنب انقطاع الخدمة.')}
              </Alert>
            )}

            {!expired && days <= 30 && (
              <Chip
                label={days <= 7 ? label('Action required urgently', 'مطلوب إجراء عاجل') : label('Renewal due soon', 'التجديد قريبًا')}
                size="small"
                sx={{ mt: 2, bgcolor: alpha(color, 0.12), color, fontWeight: 900, border: `1px solid ${alpha(color, 0.3)}` }}
              />
            )}
          </Paper>
        );
      })}
    </Box>
  );
}

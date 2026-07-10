import React from 'react';
import {
  Alert,
  Avatar,
  Box,
  Button,
  Chip,
  CircularProgress,
  Divider,
  Grid,
  IconButton,
  InputAdornment,
  Paper,
  Stack,
  TextField,
  Typography,
  alpha,
} from '@mui/material';
import { Activity, CheckCircle2, Mail, MapPin, MessageSquare, Search, Shield, Users } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { collection, db, onSnapshot, query, where } from '../../lib/firebase';
import { useRole } from '../../context/RoleContext';
import { useLanguage } from '../../context/LanguageContext';
import { binThemeTokens } from '../../theme/binGroupTheme';

const normalizeEmail = (value: unknown) => String(value || '').trim().toLowerCase();
const timestamp = (value: any) => value?.toDate?.()?.getTime?.() || value?.seconds * 1000 || 0;
const uniqueRows = (rows: any[]) => Array.from(new Map(rows.map((row) => [String(row.id), row])).values());

export default function OwnerTenantsPage() {
  const navigate = useNavigate();
  const { user } = useRole();
  const { lang, isRTL } = useLanguage();
  const ar = lang === 'ar';
  const copy = (en: string, arText: string) => ar ? arText : en;
  const [loading, setLoading] = React.useState(true);
  const [tenants, setTenants] = React.useState<any[]>([]);
  const [properties, setProperties] = React.useState<Record<string, any>>({});
  const [search, setSearch] = React.useState('');
  const [warning, setWarning] = React.useState('');

  React.useEffect(() => {
    if (!user?.uid) {
      setLoading(false);
      return undefined;
    }

    const ownerEmail = normalizeEmail(user.email);
    const propertyBuckets = new Map<string, any[]>();
    const tenantBuckets = new Map<string, any[]>();
    let propertyReady = false;
    let tenantReady = false;

    const publishProperties = () => {
      const merged = uniqueRows([...propertyBuckets.values()].flat());
      setProperties(Object.fromEntries(merged.map((item) => [String(item.id), item])));
      propertyReady = true;
      if (tenantReady) setLoading(false);
    };
    const publishTenants = () => {
      const merged = uniqueRows([...tenantBuckets.values()].flat())
        .sort((a, b) => timestamp(b.createdAt || b.updatedAt) - timestamp(a.createdAt || a.updatedAt));
      setTenants(merged);
      tenantReady = true;
      if (propertyReady) setLoading(false);
    };

    const unsubs: Array<() => void> = [];
    const propertySources = [
      { field: 'ownerId', value: user.uid },
      { field: 'ownerUid', value: user.uid },
      { field: 'ownerEmail', value: ownerEmail },
    ].filter((source) => source.value);
    const tenantSources = [
      { field: 'ownerId', value: user.uid },
      { field: 'ownerUid', value: user.uid },
      { field: 'ownerEmail', value: ownerEmail },
    ].filter((source) => source.value);

    propertySources.forEach((source) => {
      const key = `${source.field}:${source.value}`;
      unsubs.push(onSnapshot(
        query(collection(db, 'properties'), where(source.field, '==', source.value)),
        (snapshot) => {
          propertyBuckets.set(key, snapshot.docs.map((item) => ({ id: item.id, ...item.data() })));
          publishProperties();
          setWarning('');
        },
        (error) => {
          console.warn(`[OwnerTenants] property ${key} listener failed`, error);
          propertyBuckets.set(key, []);
          publishProperties();
          setWarning(copy('Some property links could not load.', 'تعذر تحميل بعض روابط العقارات.'));
        },
      ));
    });

    tenantSources.forEach((source) => {
      const key = `${source.field}:${source.value}`;
      unsubs.push(onSnapshot(
        query(collection(db, 'tenants'), where(source.field, '==', source.value)),
        (snapshot) => {
          tenantBuckets.set(key, snapshot.docs.map((item) => ({ id: item.id, ...item.data() })));
          publishTenants();
          setWarning('');
        },
        (error) => {
          console.warn(`[OwnerTenants] tenant ${key} listener failed`, error);
          tenantBuckets.set(key, []);
          publishTenants();
          setWarning(copy('Some tenant records could not load. Admin may need to complete tenant-property linking.', 'تعذر تحميل بعض سجلات المستأجرين. قد تحتاج الإدارة إلى إكمال ربط المستأجر بالعقار.'));
        },
      ));
    });

    if (!propertySources.length) propertyReady = true;
    if (!tenantSources.length) tenantReady = true;
    if (propertyReady && tenantReady) setLoading(false);

    return () => unsubs.forEach((unsubscribe) => unsubscribe());
  }, [ar, user?.email, user?.uid]);

  const rows = tenants.map((tenant) => {
    const property = properties[String(tenant.propertyId || '')] || {};
    return {
      ...tenant,
      propertyName: tenant.propertyName || property.propertyName || property.name || copy('Linked Property', 'العقار المرتبط'),
      displayName: tenant.displayName || tenant.fullName || tenant.name || copy('Unnamed Tenant', 'مستأجر بدون اسم'),
      email: tenant.email || tenant.tenantEmail || '',
      phone: tenant.phone || tenant.phoneNumber || tenant.mobile || '',
      unitNumber: tenant.unitNumber || tenant.unitNo || tenant.unitLabel || '—',
    };
  });

  const filtered = rows.filter((tenant) => {
    const needle = search.trim().toLowerCase();
    if (!needle) return true;
    return [tenant.displayName, tenant.email, tenant.phone, tenant.propertyName, tenant.unitNumber]
      .some((value) => String(value || '').toLowerCase().includes(needle));
  });

  if (loading) {
    return <Box sx={{ height: '50vh', display: 'grid', placeItems: 'center' }}><Stack spacing={2} alignItems="center"><CircularProgress sx={{ color: binThemeTokens.gold }} /><Typography variant="overline" sx={{ color: 'rgba(255,255,255,0.55)', fontWeight: 900 }}>{copy('Mapping tenant relationships...', 'جاري ربط علاقات المستأجرين...')}</Typography></Stack></Box>;
  }

  return (
    <Box sx={{ direction: isRTL ? 'rtl' : 'ltr' }}>
      <Stack direction={{ xs: 'column', md: isRTL ? 'row-reverse' : 'row' }} justifyContent="space-between" alignItems={{ xs: 'stretch', md: 'center' }} spacing={3} sx={{ mb: 5 }}>
        <Box sx={{ textAlign: isRTL ? 'right' : 'left' }}>
          <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 900, letterSpacing: 4 }}>{copy('TENANT RELATIONSHIP NODES', 'علاقات المستأجرين')}</Typography>
          <Typography variant="h4" fontWeight="950" sx={{ color: '#FFF', mt: 1 }}>{copy('Owner Tenant Directory', 'دليل مستأجري المالك')}</Typography>
          <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.55)', mt: 1 }}>{copy('Only tenants linked to your owner identity are visible.', 'تظهر فقط سجلات المستأجرين المرتبطة بهوية المالك الخاصة بك.')}</Typography>
        </Box>
        <TextField
          size="small"
          placeholder={copy('Search name, email, property or unit...', 'ابحث بالاسم أو البريد أو العقار أو الوحدة...')}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          InputProps={{ startAdornment: <InputAdornment position="start"><Search size={16} color="rgba(255,255,255,0.4)" /></InputAdornment> }}
          sx={{ width: { xs: '100%', md: 360 } }}
        />
      </Stack>

      {warning && <Alert severity="warning" sx={{ mb: 3 }}>{warning}</Alert>}

      {filtered.length === 0 ? (
        <Paper sx={{ p: 8, textAlign: 'center', bgcolor: 'rgba(15,23,42,0.4)', border: '1px dashed rgba(255,255,255,0.12)', borderRadius: 6 }}>
          <Users size={48} color="rgba(255,255,255,0.15)" />
          <Typography sx={{ color: 'rgba(255,255,255,0.48)', fontWeight: 900, mt: 2 }}>{copy('NO LINKED TENANTS FOUND', 'لا يوجد مستأجرون مرتبطون')}</Typography>
          <Button onClick={() => navigate('/owner/community-operations')} sx={{ mt: 2, color: binThemeTokens.gold, fontWeight: 900 }}>{copy('Open Community Operations', 'فتح عمليات المجتمع')}</Button>
        </Paper>
      ) : (
        <Grid container spacing={3}>
          {filtered.map((tenant) => (
            <Grid item xs={12} md={6} lg={4} key={tenant.id}>
              <Paper sx={{ p: 3, height: '100%', bgcolor: 'rgba(15,23,42,0.4)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 6, '&:hover': { borderColor: binThemeTokens.gold } }}>
                <Stack spacing={2.5}>
                  <Stack direction={isRTL ? 'row-reverse' : 'row'} justifyContent="space-between" alignItems="flex-start">
                    <Stack direction={isRTL ? 'row-reverse' : 'row'} spacing={2} alignItems="center">
                      <Avatar sx={{ width: 56, height: 56, bgcolor: alpha(binThemeTokens.gold, 0.1), color: binThemeTokens.gold, fontWeight: 950, border: `1px solid ${alpha(binThemeTokens.gold, 0.2)}` }}>{String(tenant.displayName || 'T').charAt(0)}</Avatar>
                      <Box sx={{ textAlign: isRTL ? 'right' : 'left' }}>
                        <Typography variant="subtitle1" fontWeight="950" sx={{ color: '#FFF' }}>{tenant.displayName}</Typography>
                        <Chip label={String(tenant.status || 'active').toUpperCase()} size="small" color={String(tenant.status || '').toLowerCase() === 'inactive' ? 'default' : 'success'} sx={{ height: 19, mt: 0.5, fontWeight: 900 }} />
                      </Box>
                    </Stack>
                    <IconButton size="small" sx={{ color: 'rgba(255,255,255,0.35)' }}><Activity size={18} /></IconButton>
                  </Stack>
                  <Divider sx={{ borderColor: 'rgba(255,255,255,0.08)' }} />
                  <Stack spacing={1.3}>
                    <Stack direction={isRTL ? 'row-reverse' : 'row'} spacing={1.5} alignItems="center"><MapPin size={14} color={binThemeTokens.gold} /><Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.68)', fontWeight: 700 }}>{tenant.propertyName} · {copy('Unit', 'الوحدة')} {tenant.unitNumber}</Typography></Stack>
                    {tenant.email && <Stack direction={isRTL ? 'row-reverse' : 'row'} spacing={1.5} alignItems="center"><Mail size={14} color="rgba(255,255,255,0.45)" /><Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.55)' }}>{tenant.email}</Typography></Stack>}
                  </Stack>
                  <Stack direction={isRTL ? 'row-reverse' : 'row'} spacing={1}>
                    <Button fullWidth variant="outlined" size="small" startIcon={<Mail size={14} />} disabled={!tenant.email} href={tenant.email ? `mailto:${tenant.email}` : undefined} sx={{ fontWeight: 900 }}>{copy('EMAIL', 'بريد')}</Button>
                    <Button fullWidth variant="outlined" size="small" startIcon={<MessageSquare size={14} />} onClick={() => navigate('/owner/bin-connect')} sx={{ fontWeight: 900 }}>{copy('CHAT', 'محادثة')}</Button>
                  </Stack>
                </Stack>
              </Paper>
            </Grid>
          ))}
        </Grid>
      )}

      <Paper sx={{ p: 3, mt: 6, bgcolor: alpha(binThemeTokens.gold, 0.04), border: `1px solid ${alpha(binThemeTokens.gold, 0.18)}`, borderRadius: 6 }}>
        <Grid container spacing={3} alignItems="center">
          <Grid item xs={12} md={8}><Typography variant="subtitle2" fontWeight="950" sx={{ color: binThemeTokens.gold, mb: 1, display: 'flex', alignItems: 'center', gap: 1 }}><Shield size={16} /> {copy('PRIVACY CONTROL', 'ضوابط الخصوصية')}</Typography><Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.52)', lineHeight: 1.7 }}>{copy('Tenant contact data is restricted to linked property operations. Communication should remain asset-related and auditable through BIN Connect.', 'بيانات اتصال المستأجر مقيدة بعمليات العقار المرتبط. يجب أن تظل المراسلات متعلقة بالعقار وقابلة للتدقيق عبر تواصل BIN.')}</Typography></Grid>
          <Grid item xs={12} md={4} sx={{ textAlign: isRTL ? 'left' : 'right' }}><Chip icon={<CheckCircle2 size={16} />} label={copy('OWNER-SCOPED ACCESS', 'وصول مقيّد للمالك')} sx={{ color: binThemeTokens.gold, fontWeight: 900 }} /></Grid>
        </Grid>
      </Paper>
    </Box>
  );
}

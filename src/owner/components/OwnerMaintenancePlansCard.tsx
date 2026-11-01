import React from 'react';
import { Alert, Box, Button, Card, CardContent, Chip, MenuItem, Stack, TextField, Typography } from '@mui/material';
import { auth, collection, db, functions, getDocs, httpsCallable, limit, query, where } from '../../lib/firebase';
import { useLanguage } from '../../context/LanguageContext';

type Template = { id: string; nameEn: string; nameAr: string; visitsPerYear: number; annualPriceAed: number; scope: 'UNIT' | 'PROPERTY'; descriptionEn?: string; descriptionAr?: string };
type Visit = { index: number; date: string; ticketId: string | null };
type Subscription = { id: string; nameEn: string; nameAr: string; status: string; propertyId: string; unitId?: string | null; annualPriceAed: number; invoiceId: string; startDate?: string; endDate?: string; visits?: Visit[] };

const STATUS: Record<string, [string, string]> = {
  PENDING_PAYMENT: ['Awaiting cash/cheque payment', 'بانتظار الدفع نقداً أو بشيك'],
  ACTIVE: ['Active', 'نشطة'],
  CANCELLED: ['Cancelled', 'ملغاة'],
  EXPIRED: ['Expired', 'منتهية'],
};
const dubaiToday = () => new Date(Date.now() + 4 * 3600 * 1000).toISOString().slice(0, 10);
const aed = (n: number) => `AED ${Number(n || 0).toLocaleString('en-AE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Owner: annual preventive maintenance plans (AC service, water tank cleaning, pest control...). */
export default function OwnerMaintenancePlansCard() {
  const { isRTL, lang } = useLanguage();
  const t = (en: string, ar: string) => (lang === 'ar' ? ar : en);
  const uid = auth.currentUser?.uid;
  const [templates, setTemplates] = React.useState<Template[]>([]);
  const [subs, setSubs] = React.useState<Subscription[]>([]);
  const [properties, setProperties] = React.useState<{ id: string; name: string }[]>([]);
  const [units, setUnits] = React.useState<{ id: string; label: string }[]>([]);
  const [templateId, setTemplateId] = React.useState('');
  const [propertyId, setPropertyId] = React.useState('');
  const [unitId, setUnitId] = React.useState('');
  const [startDate, setStartDate] = React.useState(dubaiToday());
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState('');
  const [notice, setNotice] = React.useState('');

  const load = React.useCallback(async () => {
    if (!uid) return;
    try {
      const [ts, ss, ps] = await Promise.all([
        getDocs(query(collection(db, 'pm_plan_templates'), where('active', '==', true), limit(50))),
        getDocs(query(collection(db, 'pm_subscriptions'), where('ownerId', '==', uid), limit(100))),
        getDocs(query(collection(db, 'properties'), where('ownerId', '==', uid), limit(100))),
      ]);
      setTemplates(ts.docs.map((d) => ({ id: d.id, ...(d.data() as any) })));
      setSubs(ss.docs.map((d) => ({ id: d.id, ...(d.data() as any) })));
      setProperties(ps.docs.map((d) => ({ id: d.id, name: String(d.get('name') || d.get('propertyName') || d.id) })));
    } catch (e: any) {
      setError(e?.message || t('Could not load maintenance plans.', 'تعذر تحميل خطط الصيانة.'));
    }
  }, [uid]); // eslint-disable-line react-hooks/exhaustive-deps
  React.useEffect(() => { void load(); }, [load]);

  React.useEffect(() => {
    setUnitId('');
    if (!uid || !propertyId) { setUnits([]); return; }
    getDocs(query(collection(db, 'units'), where('ownerId', '==', uid), where('propertyId', '==', propertyId), limit(200)))
      .then((s) => setUnits(s.docs.map((d) => ({ id: d.id, label: String(d.get('unitNumber') || d.get('name') || d.id) }))))
      .catch(() => setUnits([]));
  }, [uid, propertyId]);

  const selected = templates.find((x) => x.id === templateId);
  const canSubmit = Boolean(selected && propertyId && (selected.scope !== 'UNIT' || unitId) && startDate && !busy);

  const subscribe = async () => {
    setBusy(true); setError(''); setNotice('');
    try {
      const requestId = (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`).replace(/[^A-Za-z0-9_-]/g, '');
      await httpsCallable(functions, 'ownerSubscribePmPlan')({ templateId, propertyId, unitId: unitId || null, startDate, requestId });
      setNotice(t('Plan requested. Your invoice is ready - pay by cash or cheque to BIN GROUP finance to activate it.', 'تم طلب الخطة. فاتورتك جاهزة - ادفع نقداً أو بشيك لقسم المالية في مجموعة بن لتفعيلها.'));
      await load();
    } catch (e: any) { setError(e?.message || t('Something went wrong.', 'حدث خطأ ما.')); } finally { setBusy(false); }
  };
  const cancel = async (id: string) => {
    setBusy(true); setError('');
    try { await httpsCallable(functions, 'ownerCancelPendingPmSubscription')({ subscriptionId: id }); await load(); }
    catch (e: any) { setError(e?.message || t('Something went wrong.', 'حدث خطأ ما.')); } finally { setBusy(false); }
  };
  const propName = (id: string) => properties.find((p) => p.id === id)?.name || id;

  return (
    <Card data-testid="owner-maintenance-plans" dir={isRTL ? 'rtl' : 'ltr'} sx={{ bgcolor: '#ffffff', color: '#0f172a' }}>
      <CardContent>
        <Typography variant="h6" sx={{ fontWeight: 800, color: '#0f172a' }}>{t('Preventive maintenance plans', 'خطط الصيانة الوقائية')}</Typography>
        <Typography variant="body2" sx={{ color: '#334155', mb: 1.5 }}>
          {t('Annual scheduled visits for your property or unit. Paid by cash or cheque invoice; visits are booked automatically.', 'زيارات مجدولة سنوية لعقارك أو وحدتك. الدفع بفاتورة نقداً أو بشيك، وتُحجز الزيارات تلقائياً.')}
        </Typography>
        {error && <Alert severity="error" sx={{ mb: 1 }}>{error}</Alert>}
        {notice && <Alert severity="success" sx={{ mb: 1 }}>{notice}</Alert>}

        {subs.length === 0 ? (
          <Typography variant="body2" sx={{ color: '#475569', mb: 1.5 }} data-testid="pm-empty">{t('You have no maintenance plans yet.', 'لا توجد لديك خطط صيانة بعد.')}</Typography>
        ) : (
          <Stack spacing={1} sx={{ mb: 2 }}>
            {subs.map((s) => {
              const next = (s.visits || []).find((v) => v.date >= dubaiToday());
              const label = STATUS[s.status] || [s.status, s.status];
              return (
                <Box key={s.id} sx={{ border: '1px solid #cbd5e1', borderRadius: 2, p: 1.25 }}>
                  <Stack direction={isRTL ? 'row-reverse' : 'row'} justifyContent="space-between" alignItems="center" spacing={1}>
                    <Typography sx={{ fontWeight: 700, color: '#0f172a' }}>{lang === 'ar' ? s.nameAr : s.nameEn}</Typography>
                    <Chip size="small" label={t(label[0], label[1])} color={s.status === 'ACTIVE' ? 'success' : s.status === 'PENDING_PAYMENT' ? 'warning' : 'default'} />
                  </Stack>
                  <Typography variant="body2" sx={{ color: '#334155' }}>
                    {propName(s.propertyId)}{s.unitId ? ` · ${t('Unit', 'وحدة')} ${s.unitId}` : ''} · {aed(s.annualPriceAed)} {t('per year', 'سنوياً')}
                  </Typography>
                  {s.status === 'ACTIVE' && (
                    <Typography variant="body2" sx={{ color: '#334155' }}>
                      {s.startDate} → {s.endDate} · {next ? t(`Next visit: ${next.date}`, `الزيارة القادمة: ${next.date}`) : t('No more visits this term', 'لا زيارات متبقية في هذه المدة')}
                    </Typography>
                  )}
                  {s.status === 'PENDING_PAYMENT' && (
                    <Stack direction={isRTL ? 'row-reverse' : 'row'} spacing={1} sx={{ mt: 1 }}>
                      <Typography variant="body2" sx={{ color: '#334155', flex: 1 }}>{t(`Invoice ${s.invoiceId}: pay by cash or cheque. Card payments are not available.`, `الفاتورة ${s.invoiceId}: الدفع نقداً أو بشيك. الدفع بالبطاقة غير متاح.`)}</Typography>
                      <Button size="small" variant="outlined" disabled={busy} onClick={() => cancel(s.id)}>{t('Cancel request', 'إلغاء الطلب')}</Button>
                    </Stack>
                  )}
                </Box>
              );
            })}
          </Stack>
        )}

        {templates.length === 0 ? (
          <Typography variant="body2" sx={{ color: '#475569' }}>{t('No plans are offered right now.', 'لا توجد خطط معروضة حالياً.')}</Typography>
        ) : properties.length === 0 ? (
          <Typography variant="body2" sx={{ color: '#475569' }}>{t('Add a property first to subscribe to a plan.', 'أضف عقاراً أولاً للاشتراك في خطة.')}</Typography>
        ) : (
          <Stack spacing={1.25}>
            <TextField select size="small" label={t('Plan', 'الخطة')} value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
              {templates.map((x) => (
                <MenuItem key={x.id} value={x.id}>{`${lang === 'ar' ? x.nameAr : x.nameEn} · ${x.visitsPerYear} ${t('visits/yr', 'زيارات/سنة')} · ${aed(x.annualPriceAed)}`}</MenuItem>
              ))}
            </TextField>
            <TextField select size="small" label={t('Property', 'العقار')} value={propertyId} onChange={(e) => setPropertyId(e.target.value)}>
              {properties.map((p) => <MenuItem key={p.id} value={p.id}>{p.name}</MenuItem>)}
            </TextField>
            {selected?.scope === 'UNIT' && (
              <TextField select size="small" label={t('Unit', 'الوحدة')} value={unitId} onChange={(e) => setUnitId(e.target.value)} helperText={units.length === 0 && propertyId ? t('No units found on this property.', 'لا توجد وحدات في هذا العقار.') : ''}>
                {units.map((u) => <MenuItem key={u.id} value={u.id}>{u.label}</MenuItem>)}
              </TextField>
            )}
            <TextField size="small" type="date" label={t('First visit', 'الزيارة الأولى')} value={startDate} onChange={(e) => setStartDate(e.target.value)} InputLabelProps={{ shrink: true }} />
            <Button variant="contained" disabled={!canSubmit} onClick={subscribe}>{t('Request plan (cash/cheque invoice)', 'طلب الخطة (فاتورة نقداً أو بشيك)')}</Button>
          </Stack>
        )}
      </CardContent>
    </Card>
  );
}

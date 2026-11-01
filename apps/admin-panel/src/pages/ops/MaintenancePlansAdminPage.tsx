import React from 'react';
import { Alert, Box, Button, Card, CardContent, Chip, FormControlLabel, MenuItem, Stack, Switch, TextField, Typography } from '@mui/material';
import { useLanguage } from '@bin/shared';
import { collection, db, functions, getDocs, httpsCallable, limit, query, where } from '../../lib/firebase';

type Template = { id: string; serviceCode: string; nameEn: string; nameAr: string; visitsPerYear: number; annualPriceAed: number; scope: string; active: boolean; version?: number; descriptionEn?: string; descriptionAr?: string };
type Sub = { id: string; ownerId: string; propertyId: string; unitId?: string | null; nameEn: string; annualPriceAed: number; invoiceId: string; status: string };

const SERVICES: Array<[string, string, string]> = [
  ['AC_SERVICE', 'AC service', 'صيانة المكيفات'],
  ['WATER_TANK_CLEANING', 'Water tank cleaning', 'تنظيف خزان المياه'],
  ['PEST_CONTROL', 'Pest control', 'مكافحة الحشرات'],
  ['ELECTRICAL_INSPECTION', 'Electrical safety inspection', 'فحص السلامة الكهربائية'],
  ['PLUMBING_INSPECTION', 'Plumbing inspection', 'فحص السباكة'],
  ['FIRE_SAFETY_CHECK', 'Fire safety check', 'فحص السلامة من الحرائق'],
];
const EMPTY = { templateId: '', serviceCode: 'AC_SERVICE', nameEn: '', nameAr: '', visitsPerYear: '2', annualPriceAed: '', scope: 'UNIT', descriptionEn: '', descriptionAr: '', active: true };

/** Admin: preventive maintenance plan templates (AED) + cash/cheque activation queue. */
export default function MaintenancePlansAdminPage() {
  const { isRTL } = useLanguage();
  const t = (en: string, ar: string) => (isRTL ? ar : en);
  const [templates, setTemplates] = React.useState<Template[]>([]);
  const [pending, setPending] = React.useState<Sub[]>([]);
  const [form, setForm] = React.useState<typeof EMPTY>(EMPTY);
  const [recordIds, setRecordIds] = React.useState<Record<string, string>>({});
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState('');
  const [notice, setNotice] = React.useState('');

  const load = React.useCallback(async () => {
    try {
      const [ts, ps] = await Promise.all([
        getDocs(query(collection(db, 'pm_plan_templates'), limit(200))),
        getDocs(query(collection(db, 'pm_subscriptions'), where('status', '==', 'PENDING_PAYMENT'), limit(200))),
      ]);
      setTemplates(ts.docs.map((d) => ({ id: d.id, ...(d.data() as any) })));
      setPending(ps.docs.map((d) => ({ id: d.id, ...(d.data() as any) })));
    } catch (e: any) { setError(e?.message || 'Load failed'); }
  }, []);
  React.useEffect(() => { void load(); }, [load]);

  const run = async (fn: () => Promise<string>) => {
    setBusy(true); setError(''); setNotice('');
    try { setNotice(await fn()); await load(); } catch (e: any) { setError(e?.message || 'Failed'); } finally { setBusy(false); }
  };
  const save = () => run(async () => {
    const { templateId, ...rest } = form;
    const r: any = await httpsCallable(functions, 'adminUpsertPmPlanTemplate')({ ...rest, visitsPerYear: Number(form.visitsPerYear), ...(templateId ? { templateId } : {}) });
    setForm(EMPTY);
    return t(`Saved template version ${r.data.version}.`, `تم حفظ النموذج - الإصدار ${r.data.version}.`);
  });
  const activate = (s: Sub) => run(async () => {
    await httpsCallable(functions, 'financeActivatePmSubscription')({ subscriptionId: s.id, collectionRecordId: (recordIds[s.id] || '').trim() });
    return t('Plan activated. Visits will be scheduled automatically.', 'تم تفعيل الخطة. ستُجدول الزيارات تلقائياً.');
  });
  const set = (k: keyof typeof EMPTY) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <Box dir={isRTL ? 'rtl' : 'ltr'} sx={{ p: 3, color: '#0f172a' }}>
      <Typography variant="h5" sx={{ fontWeight: 800, mb: 2 }}>{t('Preventive Maintenance Plans', 'خطط الصيانة الوقائية')}</Typography>
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      {notice && <Alert severity="success" sx={{ mb: 2 }}>{notice}</Alert>}

      <Card sx={{ mb: 3, bgcolor: '#ffffff' }}><CardContent>
        <Typography variant="h6" sx={{ mb: 1.5 }}>{form.templateId ? t('Edit template', 'تعديل النموذج') : t('New template', 'نموذج جديد')}</Typography>
        <Stack spacing={1.5}>
          <TextField select size="small" label={t('Service', 'الخدمة')} value={form.serviceCode} onChange={set('serviceCode')}>
            {SERVICES.map(([v, en, ar]) => <MenuItem key={v} value={v}>{t(en, ar)}</MenuItem>)}
          </TextField>
          <TextField size="small" label={t('Name (English)', 'الاسم (إنجليزي)')} value={form.nameEn} onChange={set('nameEn')} />
          <TextField size="small" label={t('Name (Arabic)', 'الاسم (عربي)')} value={form.nameAr} onChange={set('nameAr')} inputProps={{ dir: 'rtl' }} />
          <TextField select size="small" label={t('Visits per year', 'الزيارات سنوياً')} value={form.visitsPerYear} onChange={set('visitsPerYear')}>
            {['1', '2', '3', '4', '6', '12'].map((v) => <MenuItem key={v} value={v}>{v}</MenuItem>)}
          </TextField>
          <TextField size="small" label={t('Annual price (AED)', 'السعر السنوي (درهم)')} value={form.annualPriceAed} onChange={set('annualPriceAed')} inputProps={{ inputMode: 'decimal' }} />
          <TextField select size="small" label={t('Scope', 'النطاق')} value={form.scope} onChange={set('scope')}>
            <MenuItem value="UNIT">{t('Per unit', 'لكل وحدة')}</MenuItem>
            <MenuItem value="PROPERTY">{t('Per property', 'لكل عقار')}</MenuItem>
          </TextField>
          <TextField size="small" multiline label={t('Description (English)', 'الوصف (إنجليزي)')} value={form.descriptionEn} onChange={set('descriptionEn')} />
          <TextField size="small" multiline label={t('Description (Arabic)', 'الوصف (عربي)')} value={form.descriptionAr} onChange={set('descriptionAr')} inputProps={{ dir: 'rtl' }} />
          <FormControlLabel control={<Switch checked={form.active} onChange={(e) => setForm((f) => ({ ...f, active: e.target.checked }))} />} label={t('Offered to owners', 'معروض للملاك')} />
          <Stack direction="row" spacing={1}>
            <Button variant="contained" disabled={busy} onClick={save}>{t('Save (MFA required)', 'حفظ (يتطلب التحقق المتعدد)')}</Button>
            {form.templateId && <Button disabled={busy} onClick={() => setForm(EMPTY)}>{t('New', 'جديد')}</Button>}
          </Stack>
        </Stack>
      </CardContent></Card>

      <Typography variant="h6" sx={{ mb: 1 }}>{t('Templates', 'النماذج')}</Typography>
      {templates.length === 0 && <Typography sx={{ color: '#475569', mb: 2 }}>{t('No templates yet.', 'لا توجد نماذج بعد.')}</Typography>}
      <Stack spacing={1} sx={{ mb: 3 }}>
        {templates.map((x) => (
          <Card key={x.id} sx={{ bgcolor: '#ffffff' }}><CardContent>
            <Stack direction="row" justifyContent="space-between" alignItems="center">
              <Box>
                <Typography sx={{ fontWeight: 700 }}>{isRTL ? x.nameAr : x.nameEn} <Chip size="small" label={x.active ? t('Active', 'نشط') : t('Hidden', 'مخفي')} color={x.active ? 'success' : 'default'} /></Typography>
                <Typography variant="body2" sx={{ color: '#334155' }}>{x.serviceCode} · {x.visitsPerYear} {t('visits/yr', 'زيارات/سنة')} · AED {Number(x.annualPriceAed).toFixed(2)} · v{x.version || 1}</Typography>
              </Box>
              <Button size="small" onClick={() => setForm({ templateId: x.id, serviceCode: x.serviceCode, nameEn: x.nameEn, nameAr: x.nameAr, visitsPerYear: String(x.visitsPerYear), annualPriceAed: String(x.annualPriceAed), scope: x.scope, descriptionEn: x.descriptionEn || '', descriptionAr: x.descriptionAr || '', active: x.active })}>{t('Edit', 'تعديل')}</Button>
            </Stack>
          </CardContent></Card>
        ))}
      </Stack>

      <Typography variant="h6" sx={{ mb: 1 }}>{t('Awaiting cash/cheque payment', 'بانتظار الدفع نقداً أو بشيك')}</Typography>
      <Typography variant="body2" sx={{ color: '#334155', mb: 1 }}>{t('Record the collection in Payment Collections first, then paste its record ID here. Card is not accepted.', 'سجّل التحصيل في سجلات التحصيل أولاً ثم الصق رقم السجل هنا. البطاقة غير مقبولة.')}</Typography>
      {pending.length === 0 && <Typography sx={{ color: '#475569' }}>{t('Nothing awaiting payment.', 'لا شيء بانتظار الدفع.')}</Typography>}
      <Stack spacing={1}>
        {pending.map((s) => (
          <Card key={s.id} sx={{ bgcolor: '#ffffff' }}><CardContent>
            <Typography sx={{ fontWeight: 700 }}>{s.nameEn} · AED {Number(s.annualPriceAed).toFixed(2)}</Typography>
            <Typography variant="body2" sx={{ color: '#334155' }}>{t('Owner', 'المالك')} {s.ownerId} · {t('Property', 'العقار')} {s.propertyId}{s.unitId ? ` / ${s.unitId}` : ''} · {t('Invoice', 'الفاتورة')} {s.invoiceId}</Typography>
            <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
              <TextField size="small" label={t('Collection record ID', 'رقم سجل التحصيل')} value={recordIds[s.id] || ''} onChange={(e) => setRecordIds((r) => ({ ...r, [s.id]: e.target.value }))} sx={{ flex: 1 }} />
              <Button variant="contained" disabled={busy || !(recordIds[s.id] || '').trim()} onClick={() => activate(s)}>{t('Activate', 'تفعيل')}</Button>
            </Stack>
          </CardContent></Card>
        ))}
      </Stack>
    </Box>
  );
}

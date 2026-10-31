import React from 'react';
import { Alert, Box, Button, Card, CardContent, Chip, CircularProgress, Grid, MenuItem, Stack, TextField, Typography } from '@mui/material';
import { useLanguage } from '@bin/shared';
import { collection, db, functions, getDocs, httpsCallable, limit, query, ref, storage, uploadBytes } from '../../lib/firebase';

type Project = { id: string; ownerId: string; propertyId: string; scope: string; status: string; quoteVersion?: number; approvedQuoteVersion?: number | null; beforePhotoPaths?: string[]; afterPhotoPaths?: string[] };

const NUM_FIELDS: Array<[string, string, string]> = [
  ['materialsAed', 'Materials (AED)', 'المواد (درهم)'],
  ['labourAed', 'Labour (AED)', 'العمالة (درهم)'],
  ['prepAed', 'Preparation (AED)', 'التحضير (درهم)'],
  ['accessScaffoldAed', 'Access / scaffold (AED)', 'السقالات والوصول (درهم)'],
  ['permitsNocAed', 'Permits / NOC (AED)', 'التصاريح / عدم الممانعة (درهم)'],
];

export default function PaintingProjectsAdminPage() {
  const { isRTL } = useLanguage();
  const t = (en: string, ar: string) => (isRTL ? ar : en);
  const [projects, setProjects] = React.useState<Project[]>([]);
  const [selected, setSelected] = React.useState<Project | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState('');
  const [notice, setNotice] = React.useState('');
  const [cost, setCost] = React.useState<Record<string, string>>({ materialsAed: '', labourAed: '', prepAed: '0', accessScaffoldAed: '0', permitsNocAed: '0' });
  const [survey, setSurvey] = React.useState({ wallAreaSqm: '', condition: 'GOOD', paintGrade: 'STANDARD' });
  const [priceAed, setPriceAed] = React.useState('');
  const [months, setMonths] = React.useState('12');
  const [reason, setReason] = React.useState('');

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const snap = await getDocs(query(collection(db, 'painting_projects'), limit(200)));
      const list = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as Project[];
      setProjects(list);
      setSelected((s) => (s ? list.find((p) => p.id === s.id) || null : null));
    } catch (e: any) { setError(e?.message || 'Load failed'); } finally { setLoading(false); }
  }, []);
  React.useEffect(() => { void load(); }, [load]);

  const act = async (name: string, data: Record<string, unknown>, ok: string) => {
    setBusy(true); setError(''); setNotice('');
    try { await httpsCallable(functions, name)(data); setNotice(ok); await load(); }
    catch (e: any) { setError(e?.message || t('Action failed.', 'فشل الإجراء.')); }
    finally { setBusy(false); }
  };

  const uploadPhotos = async (kind: 'BEFORE' | 'AFTER', files: FileList | null) => {
    if (!selected || !files?.length) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const paths: string[] = [];
      for (const f of Array.from(files).slice(0, 20)) {
        if (!/^image\//.test(f.type) || f.size > 15 * 1024 * 1024) throw new Error(t('Images only, up to 15 MB each.', 'صور فقط، حتى 15 ميغابايت لكل صورة.'));
        const path = `painting-projects/${selected.id}/${kind.toLowerCase()}/${Date.now()}-${f.name.replace(/[^\w.-]/g, '_').slice(0, 80)}`;
        await uploadBytes(ref(storage, path), f, { contentType: f.type });
        paths.push(path); // Storage paths only - never download/token URLs.
      }
      await httpsCallable(functions, 'adminRecordPaintingPhotos')({ projectId: selected.id, kind, paths });
      setNotice(t(`${paths.length} photo(s) recorded.`, `تم تسجيل ${paths.length} صورة.`));
      await load();
    } catch (e: any) { setError(e?.message || t('Upload failed.', 'فشل الرفع.')); } finally { setBusy(false); }
  };

  const p = selected;
  return (
    <Box dir={isRTL ? 'rtl' : 'ltr'} sx={{ p: 3 }}>
      <Typography variant="h4" fontWeight={800} gutterBottom>{t('Painting projects', 'مشاريع الدهان')}</Typography>
      <Typography color="text.secondary" sx={{ mb: 2 }}>
        {t('One-time jobs. Quotes enforce the minimum margin on the server; only the owner can approve, by email code.',
          'أعمال لمرة واحدة. يفرض الخادم الحد الأدنى للهامش؛ الموافقة للمالك فقط عبر رمز البريد الإلكتروني.')}
      </Typography>
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      {notice && <Alert severity="success" sx={{ mb: 2 }}>{notice}</Alert>}
      <Grid container spacing={2}>
        <Grid item xs={12} md={4}>
          {loading ? <CircularProgress /> : (
            <Stack spacing={1}>
              {projects.length === 0 && <Typography color="text.secondary">{t('No projects.', 'لا توجد مشاريع.')}</Typography>}
              {projects.map((x) => (
                <Card key={x.id} variant={selected?.id === x.id ? 'elevation' : 'outlined'} sx={{ cursor: 'pointer' }} onClick={() => setSelected(x)}>
                  <CardContent sx={{ py: 1.5 }}>
                    <Typography fontWeight={700}>{x.scope}</Typography>
                    <Typography variant="body2" color="text.secondary">{x.propertyId}</Typography>
                    <Chip size="small" label={x.status} sx={{ mt: 1 }} />
                  </CardContent>
                </Card>
              ))}
            </Stack>
          )}
        </Grid>
        <Grid item xs={12} md={8}>
          {!p ? <Typography color="text.secondary">{t('Select a project.', 'اختر مشروعًا.')}</Typography> : (
            <Card><CardContent>
              <Typography variant="h6">{p.scope} - {p.status}</Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                {t('Quote', 'العرض')} v{p.quoteVersion ?? '-'} · {t('approved', 'المعتمد')} v{p.approvedQuoteVersion ?? '-'} · {t('before', 'قبل')} {p.beforePhotoPaths?.length ?? 0} · {t('after', 'بعد')} {p.afterPhotoPaths?.length ?? 0}
              </Typography>

              {['REQUESTED', 'SURVEYED', 'QUOTED', 'OWNER_APPROVED', 'WORK_ORDER_OPEN'].includes(p.status) && (
                <Box sx={{ mb: 3 }}>
                  <Typography fontWeight={700} gutterBottom>{p.status === 'REQUESTED' || p.status === 'SURVEYED' ? t('Survey & quote', 'المعاينة والعرض') : t('Issue variation quote', 'إصدار عرض معدل')}</Typography>
                  <Grid container spacing={1}>
                    <Grid item xs={4}><TextField size="small" fullWidth label={t('Wall area (sqm)', 'مساحة الجدران (م²)')} value={survey.wallAreaSqm} onChange={(e) => setSurvey({ ...survey, wallAreaSqm: e.target.value })} /></Grid>
                    <Grid item xs={4}><TextField select size="small" fullWidth label={t('Condition', 'الحالة')} value={survey.condition} onChange={(e) => setSurvey({ ...survey, condition: e.target.value })}>
                      {['GOOD', 'FAIR', 'POOR'].map((c) => <MenuItem key={c} value={c}>{c}</MenuItem>)}</TextField></Grid>
                    <Grid item xs={4}><TextField select size="small" fullWidth label={t('Paint grade', 'درجة الطلاء')} value={survey.paintGrade} onChange={(e) => setSurvey({ ...survey, paintGrade: e.target.value })}>
                      {['ECONOMY', 'STANDARD', 'PREMIUM'].map((c) => <MenuItem key={c} value={c}>{c}</MenuItem>)}</TextField></Grid>
                    {NUM_FIELDS.map(([k, en, ar]) => (
                      <Grid item xs={6} md={4} key={k}><TextField size="small" fullWidth label={t(en, ar)} value={cost[k]} onChange={(e) => setCost({ ...cost, [k]: e.target.value })} /></Grid>
                    ))}
                    <Grid item xs={6} md={4}><TextField size="small" fullWidth label={t('Price to owner (AED)', 'السعر للمالك (درهم)')} value={priceAed} onChange={(e) => setPriceAed(e.target.value)} /></Grid>
                  </Grid>
                  <Button sx={{ mt: 1 }} variant="contained" disabled={busy} onClick={() => act('adminIssuePaintingQuote', {
                    projectId: p.id, priceAed: Number(priceAed),
                    costSheet: Object.fromEntries(Object.entries(cost).map(([k, v]) => [k, Number(v || 0)])),
                    surveyMeasurements: { wallAreaSqm: Number(survey.wallAreaSqm || 0), condition: survey.condition, paintGrade: survey.paintGrade },
                  }, t('Quote issued.', 'تم إصدار العرض.'))}>{t('Issue quote', 'إصدار العرض')}</Button>
                </Box>
              )}

              {['OWNER_APPROVED', 'WORK_ORDER_OPEN'].includes(p.status) && (
                <Stack direction="row" spacing={1} sx={{ mb: 2 }} flexWrap="wrap">
                  <Button component="label" variant="outlined" disabled={busy}>{t('Upload BEFORE photos', 'رفع صور قبل العمل')}
                    <input hidden type="file" accept="image/*" multiple onChange={(e) => uploadPhotos('BEFORE', e.target.files)} /></Button>
                  {p.status === 'WORK_ORDER_OPEN' && (
                    <Button component="label" variant="outlined" disabled={busy}>{t('Upload AFTER photos', 'رفع صور بعد العمل')}
                      <input hidden type="file" accept="image/*" multiple onChange={(e) => uploadPhotos('AFTER', e.target.files)} /></Button>
                  )}
                </Stack>
              )}

              <Stack direction="row" spacing={1} flexWrap="wrap" sx={{ mb: 2 }}>
                {p.status === 'OWNER_APPROVED' && <Button variant="contained" disabled={busy} onClick={() => act('adminOpenPaintingWorkOrder', { projectId: p.id }, t('Work order opened.', 'تم فتح أمر العمل.'))}>{t('Open work order', 'فتح أمر العمل')}</Button>}
                {p.status === 'WORK_ORDER_OPEN' && <Button variant="contained" disabled={busy} onClick={() => act('adminCompletePaintingProject', { projectId: p.id }, t('Marked completed.', 'تم وضع علامة مكتمل.'))}>{t('Mark completed', 'وضع علامة مكتمل')}</Button>}
                {p.status === 'COMPLETED' && (
                  <>
                    <TextField size="small" label={t('Warranty months (1-60)', 'أشهر الضمان (1-60)')} value={months} onChange={(e) => setMonths(e.target.value)} />
                    <Button variant="contained" disabled={busy} onClick={() => act('adminIssuePaintingWarranty', { projectId: p.id, months: Number(months) }, t('Warranty issued.', 'تم إصدار الضمان.'))}>{t('Issue warranty', 'إصدار الضمان')}</Button>
                  </>
                )}
              </Stack>

              {['REQUESTED', 'SURVEYED', 'QUOTED', 'OWNER_APPROVED'].includes(p.status) && (
                <Stack direction="row" spacing={1}>
                  <TextField size="small" fullWidth label={t('Cancellation reason (min 8 chars)', 'سبب الإلغاء (8 أحرف على الأقل)')} value={reason} onChange={(e) => setReason(e.target.value)} />
                  <Button color="error" disabled={busy || reason.trim().length < 8} onClick={() => act('adminCancelPaintingProject', { projectId: p.id, reason }, t('Project cancelled.', 'تم إلغاء المشروع.'))}>{t('Cancel', 'إلغاء')}</Button>
                </Stack>
              )}
            </CardContent></Card>
          )}
        </Grid>
      </Grid>
    </Box>
  );
}

import React from 'react';
import { Alert, Box, Button, Card, CardContent, Chip, CircularProgress, MenuItem, Stack, TextField, Typography } from '@mui/material';
import { auth, collection, db, doc, functions, getDoc, getDocs, httpsCallable, limit, query, where } from '../lib/firebase';
import { useLanguage } from '../context/LanguageContext';

type Project = { id: string; status: string; scope: string; propertyId: string; quoteVersion?: number; approvedQuoteVersion?: number | null; warranty?: { months: number } };
type Quote = { version: number; priceAed: number; permits?: Record<string, unknown> };

const SCOPES = [
  { v: 'ROOM', en: 'Single room', ar: 'غرفة واحدة' },
  { v: 'FULL_UNIT', en: 'Full unit', ar: 'الوحدة كاملة' },
  { v: 'BUILDING_COMMON_AREAS', en: 'Building common areas', ar: 'المناطق المشتركة في المبنى' },
  { v: 'EXTERIOR_FACADE', en: 'Exterior / facade', ar: 'الواجهة الخارجية' },
];
const STATUS: Record<string, [string, string]> = {
  REQUESTED: ['Requested - site survey pending', 'تم الطلب - بانتظار المعاينة'],
  SURVEYED: ['Surveyed', 'تمت المعاينة'],
  QUOTED: ['Quote ready for your approval', 'العرض جاهز لموافقتك'],
  OWNER_APPROVED: ['Approved - scheduling work', 'تمت الموافقة - جارٍ جدولة العمل'],
  WORK_ORDER_OPEN: ['Work in progress', 'العمل قيد التنفيذ'],
  COMPLETED: ['Completed', 'مكتمل'],
  WARRANTY_ACTIVE: ['Completed - warranty active', 'مكتمل - الضمان ساري'],
  CANCELLED: ['Cancelled', 'ملغى'],
};

export default function PaintingProjectsPage() {
  const { isRTL, lang } = useLanguage();
  const t = (en: string, ar: string) => (lang === 'ar' ? ar : en);
  const uid = auth.currentUser?.uid;
  const [projects, setProjects] = React.useState<Project[]>([]);
  const [properties, setProperties] = React.useState<{ id: string; name: string }[]>([]);
  const [quotes, setQuotes] = React.useState<Record<string, Quote>>({});
  const [loading, setLoading] = React.useState(true);
  const [busy, setBusy] = React.useState('');
  const [error, setError] = React.useState('');
  const [notice, setNotice] = React.useState('');
  const [propertyId, setPropertyId] = React.useState('');
  const [scope, setScope] = React.useState('ROOM');
  const [otpState, setOtpState] = React.useState<Record<string, { otpId: string; quoteVersion: number; code: string }>>({});

  const load = React.useCallback(async () => {
    if (!uid) return;
    setLoading(true);
    try {
      const [ps, props] = await Promise.all([
        getDocs(query(collection(db, 'painting_projects'), where('ownerId', '==', uid), limit(50))),
        getDocs(query(collection(db, 'properties'), where('ownerId', '==', uid), limit(100))),
      ]);
      const list = ps.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as Project[];
      setProjects(list);
      setProperties(props.docs.map((d) => ({ id: d.id, name: String(d.get('name') || d.get('propertyName') || d.id) })));
      const q: Record<string, Quote> = {};
      await Promise.all(list.filter((p) => p.quoteVersion).map(async (p) => {
        const s = await getDoc(doc(db, 'painting_projects', p.id, 'quotes', `v${p.quoteVersion}`));
        if (s.exists()) q[p.id] = s.data() as Quote;
      }));
      setQuotes(q);
    } catch (e: any) {
      setError(e?.message || t('Could not load painting projects.', 'تعذر تحميل مشاريع الدهان.'));
    } finally { setLoading(false); }
  }, [uid]);
  React.useEffect(() => { void load(); }, [load]);

  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key); setError(''); setNotice('');
    try { await fn(); } catch (e: any) { setError(e?.message || t('Something went wrong.', 'حدث خطأ ما.')); } finally { setBusy(''); }
  };

  const requestProject = () => run('new', async () => {
    await httpsCallable(functions, 'ownerRequestPaintingProject')({ propertyId, scope });
    setNotice(t('Request sent. We will contact you to book a site survey.', 'تم إرسال الطلب. سنتواصل معك لحجز موعد المعاينة.'));
    await load();
  });
  const requestOtp = (p: Project) => run(`otp-${p.id}`, async () => {
    const r: any = await httpsCallable(functions, 'ownerRequestPaintingApprovalOtp')({ projectId: p.id });
    setOtpState((s) => ({ ...s, [p.id]: { otpId: r.data.otpId, quoteVersion: r.data.quoteVersion, code: '' } }));
    setNotice(t('We emailed you a 6-digit approval code.', 'أرسلنا إلى بريدك رمز موافقة من 6 أرقام.'));
  });
  const approve = (p: Project) => run(`approve-${p.id}`, async () => {
    const o = otpState[p.id];
    await httpsCallable(functions, 'ownerApprovePaintingQuote')({ projectId: p.id, otpId: o.otpId, quoteVersion: o.quoteVersion, otp: o.code });
    setOtpState((s) => { const n = { ...s }; delete n[p.id]; return n; });
    setNotice(t('Quote approved. We will schedule the work.', 'تمت الموافقة على العرض. سنقوم بجدولة العمل.'));
    await load();
  });
  const cancel = (p: Project) => run(`cancel-${p.id}`, async () => {
    if (!window.confirm(t('Cancel this painting project?', 'هل تريد إلغاء مشروع الدهان هذا؟'))) return;
    await httpsCallable(functions, 'ownerCancelPaintingProject')({ projectId: p.id });
    await load();
  });

  return (
    <Box dir={isRTL ? 'rtl' : 'ltr'} sx={{ maxWidth: 880, mx: 'auto', p: { xs: 2, md: 4 } }}>
      <Typography variant="h4" fontWeight={800} gutterBottom>{t('Painting projects', 'مشاريع الدهان')}</Typography>
      <Typography color="text.secondary" sx={{ mb: 3 }}>
        {t('One-time painting, priced after a site survey. You approve the exact quote with a code sent to your email.',
          'خدمة دهان لمرة واحدة، تُسعَّر بعد المعاينة. توافق على العرض نفسه برمز يُرسل إلى بريدك الإلكتروني.')}
      </Typography>
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      {notice && <Alert severity="success" sx={{ mb: 2 }}>{notice}</Alert>}

      <Card sx={{ mb: 3 }}><CardContent>
        <Typography fontWeight={700} gutterBottom>{t('Request a painting survey', 'طلب معاينة للدهان')}</Typography>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
          <TextField select fullWidth size="small" label={t('Property', 'العقار')} value={propertyId} onChange={(e) => setPropertyId(e.target.value)}>
            {properties.map((p) => <MenuItem key={p.id} value={p.id}>{p.name}</MenuItem>)}
          </TextField>
          <TextField select fullWidth size="small" label={t('Scope', 'النطاق')} value={scope} onChange={(e) => setScope(e.target.value)}>
            {SCOPES.map((s) => <MenuItem key={s.v} value={s.v}>{t(s.en, s.ar)}</MenuItem>)}
          </TextField>
          <Button variant="contained" disabled={!propertyId || busy === 'new'} onClick={requestProject}>{t('Request', 'إرسال الطلب')}</Button>
        </Stack>
      </CardContent></Card>

      {loading ? <CircularProgress /> : projects.length === 0 ? (
        <Typography color="text.secondary">{t('No painting projects yet.', 'لا توجد مشاريع دهان بعد.')}</Typography>
      ) : (
        <Stack spacing={2}>
          {projects.map((p) => {
            const q = quotes[p.id];
            const o = otpState[p.id];
            const label = STATUS[p.status] || [p.status, p.status];
            return (
              <Card key={p.id}><CardContent>
                <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
                  <Typography fontWeight={700}>{t(SCOPES.find((s) => s.v === p.scope)?.en || p.scope, SCOPES.find((s) => s.v === p.scope)?.ar || p.scope)}</Typography>
                  <Chip size="small" label={t(label[0], label[1])} />
                </Stack>
                {q && <Typography>{t('Quote', 'العرض')} v{q.version}: <b>AED {Number(q.priceAed).toLocaleString()}</b> ({t('one-time', 'لمرة واحدة')})</Typography>}
                {p.warranty && <Typography>{t('Warranty', 'الضمان')}: {p.warranty.months} {t('months', 'شهرًا')}</Typography>}
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ mt: 2 }}>
                  {p.status === 'QUOTED' && !o && <Button variant="contained" disabled={!!busy} onClick={() => requestOtp(p)}>{t('Approve quote', 'الموافقة على العرض')}</Button>}
                  {p.status === 'QUOTED' && o && (
                    <>
                      <TextField size="small" label={t('6-digit code', 'رمز من 6 أرقام')} value={o.code} inputProps={{ inputMode: 'numeric', maxLength: 6 }}
                        onChange={(e) => setOtpState((s) => ({ ...s, [p.id]: { ...o, code: e.target.value.replace(/\D/g, '').slice(0, 6) } }))} />
                      <Button variant="contained" disabled={o.code.length !== 6 || !!busy} onClick={() => approve(p)}>{t('Confirm approval', 'تأكيد الموافقة')}</Button>
                      <Button disabled={!!busy} onClick={() => requestOtp(p)}>{t('Resend code', 'إعادة إرسال الرمز')}</Button>
                    </>
                  )}
                  {['REQUESTED', 'SURVEYED', 'QUOTED', 'OWNER_APPROVED'].includes(p.status) && (
                    <Button color="error" disabled={!!busy} onClick={() => cancel(p)}>{t('Cancel', 'إلغاء')}</Button>
                  )}
                </Stack>
              </CardContent></Card>
            );
          })}
        </Stack>
      )}
    </Box>
  );
}

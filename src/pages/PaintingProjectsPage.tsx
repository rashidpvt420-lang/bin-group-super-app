import React from 'react';
import { Alert, Box, Button, Card, CardContent, Chip, CircularProgress, MenuItem, Stack, TextField, Typography } from '@mui/material';
import { auth, collection, db, doc, functions, getDoc, getDocs, httpsCallable, limit, query, ref, storage, uploadBytes, where } from '../lib/firebase';
import { useLanguage } from '../context/LanguageContext';

type Project = { id: string; status: string; scope: string; propertyId: string; quoteVersion?: number; approvedQuoteVersion?: number | null; warranty?: { months: number }; completionAcceptance?: { acceptedBy: string } | null };
type Quote = {
  version: number; priceAed: number; permits?: Record<string, unknown>;
  lines?: { category: string; amountAed: number }[];
  billingSchedule?: Record<string, number>; billingPlan?: { depositPct: number; progressPct: number; finalPct: number };
  surveySummary?: { wallAreaSqm: number; ceilingAreaSqm: number; areaCount?: number };
};
type Invoice = { id: string; stage: string; amountAed: number; status: string; rejection?: { reason: string } | null };
type AreaDraft = {
  kind: string; label: string; floor: string; unitRef: string; wallAreaSqm: string; ceilingAreaSqm: string;
  wallColour: string; ceilingColour: string; finish: string; condition: string; files: File[];
};
type ProofDraft = { method: 'CASH' | 'CHEQUE'; chequeNo: string; bank: string; chequeDate: string; file: File | null };

const newKey = () => {
  const c = globalThis.crypto;
  if (c?.randomUUID) return c.randomUUID().replace(/[^A-Za-z0-9_-]/g, '').slice(0, 64);
  const bytes = c.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
};
const emptyArea = (): AreaDraft => ({ kind: 'ROOM', label: '', floor: '', unitRef: '', wallAreaSqm: '', ceilingAreaSqm: '', wallColour: '', ceilingColour: '', finish: 'MATT', condition: 'GOOD', files: [] });
const AREA_KINDS = [
  { v: 'ROOM', en: 'Room', ar: 'غرفة' }, { v: 'UNIT', en: 'Unit / apartment', ar: 'وحدة / شقة' },
  { v: 'FLOOR', en: 'Floor / corridor', ar: 'طابق / ممر' }, { v: 'COMMON_AREA', en: 'Common area', ar: 'منطقة مشتركة' },
  { v: 'EXTERIOR', en: 'Exterior / facade', ar: 'خارجي / واجهة' },
];
const FINISHES = [
  { v: 'MATT', en: 'Matt', ar: 'مطفي' }, { v: 'EGGSHELL', en: 'Eggshell', ar: 'نصف مطفي' }, { v: 'SATIN', en: 'Satin', ar: 'ساتان' },
  { v: 'GLOSS', en: 'Gloss', ar: 'لامع' }, { v: 'TEXTURED', en: 'Textured', ar: 'محبب' },
];
const CONDITIONS = [
  { v: 'GOOD', en: 'Good', ar: 'جيدة' }, { v: 'FAIR', en: 'Fair - minor cracks or stains', ar: 'متوسطة - شقوق أو بقع بسيطة' },
  { v: 'POOR', en: 'Poor - damp, peeling or big cracks', ar: 'سيئة - رطوبة أو تقشر أو شقوق كبيرة' },
];
const LINE_LABELS: Record<string, [string, string]> = {
  LABOUR: ['Labour', 'العمالة'], MATERIALS: ['Paint & materials', 'الدهان والمواد'], PREP: ['Surface preparation', 'تجهيز الأسطح'],
  ACCESS: ['Access / scaffolding', 'الوصول / السقالات'], PERMIT: ['Permits & NOC', 'التصاريح وعدم الممانعة'],
};
const STAGE_LABELS: Record<string, [string, string]> = { DEPOSIT: ['Deposit', 'الدفعة المقدمة'], PROGRESS: ['Progress payment', 'دفعة مرحلية'], FINAL: ['Final payment', 'الدفعة النهائية'] };
const INVOICE_STATUS: Record<string, [string, string]> = {
  ISSUED: ['Due - pay by cash or cheque', 'مستحقة - الدفع نقدًا أو بشيك'], PROOF_SUBMITTED: ['Proof sent - Finance is checking', 'تم إرسال الإثبات - قيد مراجعة المالية'],
  PAID: ['Paid', 'مدفوعة'], REJECTED: ['Proof rejected - please resend', 'تم رفض الإثبات - يرجى الإرسال مجددًا'],
};

const SCOPES = [
  { v: 'ROOM', en: 'Single room', ar: 'غرفة واحدة' },
  { v: 'FULL_UNIT', en: 'Full unit', ar: 'الوحدة كاملة' },
  { v: 'BUILDING_COMMON_AREAS', en: 'Building common areas', ar: 'المناطق المشتركة في المبنى' },
  { v: 'EXTERIOR_FACADE', en: 'Exterior / facade', ar: 'الواجهة الخارجية' },
  { v: 'FULL_BUILDING', en: 'Full building (inside and outside)', ar: 'المبنى بالكامل (داخلي وخارجي)' },
];
const STATUS: Record<string, [string, string]> = {
  REQUESTED: ['Requested - site survey pending', 'تم الطلب - بانتظار المعاينة'],
  SURVEYED: ['Surveyed', 'تمت المعاينة'],
  QUOTED: ['Quote ready for your approval', 'العرض جاهز لموافقتك'],
  OWNER_APPROVED: ['Approved - scheduling work', 'تمت الموافقة - جارٍ جدولة العمل'],
  WORK_ORDER_OPEN: ['Work in progress', 'العمل قيد التنفيذ'],
  COMPLETED: ['Completed', 'مكتمل'],
  REWORK_REQUIRED: ['Rework requested - our team is fixing it', 'طُلبت إعادة العمل - فريقنا يعالج الملاحظات'],
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
  const [areas, setAreas] = React.useState<AreaDraft[]>([]);
  const [notes, setNotes] = React.useState('');
  const [invoices, setInvoices] = React.useState<Record<string, Invoice[]>>({});
  const [proofs, setProofs] = React.useState<Record<string, ProofDraft>>({});
  const requestKey = React.useRef(newKey());
  const [rejects, setRejects] = React.useState<Record<string, { open: boolean; reason: string; files: File[] }>>({});
  const rejectKeys = React.useRef<Record<string, string>>({});
  const proofKeys = React.useRef<Record<string, string>>({});
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
      const inv: Record<string, Invoice[]> = {};
      await Promise.all(list.filter((p) => p.approvedQuoteVersion).map(async (p) => {
        const s = await getDocs(collection(db, 'painting_projects', p.id, 'invoices'));
        inv[p.id] = s.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as Invoice[];
      }));
      setInvoices(inv);
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
    if (!uid) return;
    // Stable per submission so retries/double-clicks cannot create duplicate projects.
    const requestId = requestKey.current;
    const payloadAreas = [];
    for (let i = 0; i < areas.length; i += 1) {
      const a = areas[i];
      const photoPaths: string[] = [];
      for (let j = 0; j < a.files.length; j += 1) {
        const f = a.files[j];
        const path = `painting-owner-uploads/${uid}/${requestId}/area-${i}-${j}.${(f.name.split('.').pop() || 'jpg').replace(/[^a-z0-9]/gi, '').slice(0, 5)}`;
        await uploadBytes(ref(storage, path), f, { contentType: f.type || 'image/jpeg' }).catch((e: any) => {
          // Owner uploads are create-only; a retry of the same submission reuses the file already uploaded.
          if (!String(e?.code || '').includes('unauthorized')) throw e;
        });
        photoPaths.push(path);
      }
      payloadAreas.push({
        kind: a.kind, label: a.label, floor: a.floor || undefined, unitRef: a.unitRef || undefined,
        wallAreaSqm: Number(a.wallAreaSqm || 0), ceilingAreaSqm: Number(a.ceilingAreaSqm || 0),
        surfaces: Number(a.ceilingAreaSqm || 0) > 0 ? ['WALLS', 'CEILING'] : ['WALLS'],
        wallColour: a.wallColour || undefined, ceilingColour: a.ceilingColour || undefined, finish: a.finish, condition: a.condition, photoPaths,
      });
    }
    await httpsCallable(functions, 'ownerRequestPaintingProject')({ propertyId, scope, requestId, areas: payloadAreas, notes: notes || undefined });
    requestKey.current = newKey();
    setAreas([]); setNotes('');
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
  const acceptCompletion = (p: Project) => run(`accept-${p.id}`, async () => {
    if (!window.confirm(t('Confirm the painting work is complete and acceptable? Your 12-month warranty starts from this acceptance.', 'هل تؤكد أن أعمال الدهان مكتملة ومقبولة؟ يبدأ ضمانك لمدة 12 شهرًا من هذا القبول.'))) return;
    await httpsCallable(functions, 'ownerAcceptPaintingCompletion')({ projectId: p.id });
    setNotice(t('Thank you. Completion accepted.', 'شكرًا. تم قبول الإنجاز.'));
    await load();
  });
  const rejectCompletion = (p: Project) => run(`reject-${p.id}`, async () => {
    if (!uid) return;
    const d = rejects[p.id];
    const reason = (d?.reason || '').trim();
    if (reason.length < 8) throw new Error(t('Please describe what needs fixing (at least 8 characters).', 'يرجى وصف ما يحتاج إلى إصلاح (8 أحرف على الأقل).'));
    if ((d?.files || []).length > 10) throw new Error(t('Attach at most 10 photos.', 'أرفق 10 صور كحد أقصى.'));
    rejectKeys.current[p.id] = rejectKeys.current[p.id] || newKey();
    const requestId = rejectKeys.current[p.id];
    const photoPaths: string[] = [];
    for (const [i, f] of (d?.files || []).entries()) {
      const ext = (f.name.split('.').pop() || 'jpg').replace(/[^a-z0-9]/gi, '').slice(0, 5);
      const path = `painting-owner-uploads/${uid}/${p.id}/rework-${requestId}-${i}.${ext}`;
      await uploadBytes(ref(storage, path), f, { contentType: f.type || 'image/jpeg' }).catch((e: any) => {
        if (!String(e?.code || '').includes('unauthorized')) throw e; // already uploaded on a retry
      });
      photoPaths.push(path);
    }
    await httpsCallable(functions, 'ownerRejectPaintingCompletion')({ projectId: p.id, requestId, reason, photoPaths });
    delete rejectKeys.current[p.id];
    setRejects((s) => { const n = { ...s }; delete n[p.id]; return n; });
    setNotice(t('Thank you. We have logged your concerns and will fix the work before final billing.', 'شكرًا. سجلنا ملاحظاتك وسنعالج العمل قبل الفاتورة النهائية.'));
    await load();
  });
  const cancel = (p: Project) => run(`cancel-${p.id}`, async () => {
    if (!window.confirm(t('Cancel this painting project?', 'هل تريد إلغاء مشروع الدهان هذا؟'))) return;
    await httpsCallable(functions, 'ownerCancelPaintingProject')({ projectId: p.id });
    await load();
  });

  const submitProof = (p: Project, inv: Invoice) => run(`proof-${p.id}-${inv.stage}`, async () => {
    if (!uid) return;
    const k = `${p.id}_${inv.stage}`;
    const d = proofs[k];
    if (!d?.file) throw new Error(t('Attach a photo of the receipt or cheque.', 'أرفق صورة الإيصال أو الشيك.'));
    proofKeys.current[k] = proofKeys.current[k] || newKey();
    const requestId = proofKeys.current[k];
    const ext = (d.file.name.split('.').pop() || 'jpg').replace(/[^a-z0-9]/gi, '').slice(0, 5);
    const proofPath = `painting-owner-uploads/${uid}/${p.id}/${inv.stage}-${requestId}.${ext}`;
    await uploadBytes(ref(storage, proofPath), d.file, { contentType: d.file.type || 'image/jpeg' }).catch((e: any) => {
      if (!String(e?.code || '').includes('unauthorized')) throw e;
    });
    await httpsCallable(functions, 'ownerSubmitPaintingPaymentProof')({
      projectId: p.id, stage: inv.stage, requestId, method: d.method, proofPath,
      ...(d.method === 'CHEQUE' ? { chequeNo: d.chequeNo, bank: d.bank, chequeDate: d.chequeDate } : {}),
    });
    delete proofKeys.current[k];
    setProofs((s) => { const n = { ...s }; delete n[k]; return n; });
    setNotice(t('Payment proof sent. Our finance team will confirm it.', 'تم إرسال إثبات الدفع. سيؤكده فريق المالية.'));
    await load();
  });
  const setArea = (i: number, patch: Partial<AreaDraft>) => setAreas((list) => list.map((a, j) => (j === i ? { ...a, ...patch } : a)));
  const areaValid = areas.every((a) => a.label.trim() && (Number(a.wallAreaSqm) > 0 || Number(a.ceilingAreaSqm) > 0));

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
        </Stack>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
          {t('Optional: list the rooms, floors or units with rough sizes, colours and photos. We still measure everything at the site survey before we price.',
            'اختياري: أضف الغرف أو الطوابق أو الوحدات مع المساحات التقريبية والألوان والصور. سنقيس كل شيء أثناء المعاينة قبل التسعير.')}
        </Typography>
        <Stack spacing={2} sx={{ mt: 2 }}>
          {areas.map((a, i) => (
            <Box key={i} sx={{ border: 1, borderColor: 'divider', borderRadius: 2, p: 2 }}>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ mb: 1 }}>
                <TextField select size="small" label={t('Type', 'النوع')} value={a.kind} onChange={(e) => setArea(i, { kind: e.target.value })} sx={{ minWidth: 160 }}>
                  {AREA_KINDS.map((k) => <MenuItem key={k.v} value={k.v}>{t(k.en, k.ar)}</MenuItem>)}
                </TextField>
                <TextField size="small" fullWidth label={t('Name (e.g. Master bedroom, Lobby)', 'الاسم (مثل غرفة النوم الرئيسية، الردهة)')} value={a.label} onChange={(e) => setArea(i, { label: e.target.value })} />
                <TextField size="small" label={t('Floor', 'الطابق')} value={a.floor} onChange={(e) => setArea(i, { floor: e.target.value })} sx={{ maxWidth: 110 }} />
                <TextField size="small" label={t('Unit no.', 'رقم الوحدة')} value={a.unitRef} onChange={(e) => setArea(i, { unitRef: e.target.value })} sx={{ maxWidth: 130 }} />
              </Stack>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ mb: 1 }}>
                <TextField size="small" type="number" label={t('Wall area (m²)', 'مساحة الجدران (م²)')} value={a.wallAreaSqm} onChange={(e) => setArea(i, { wallAreaSqm: e.target.value })} />
                <TextField size="small" type="number" label={t('Ceiling area (m²)', 'مساحة السقف (م²)')} value={a.ceilingAreaSqm} onChange={(e) => setArea(i, { ceilingAreaSqm: e.target.value })} />
                <TextField size="small" label={t('Wall colour', 'لون الجدران')} value={a.wallColour} onChange={(e) => setArea(i, { wallColour: e.target.value })} />
                <TextField size="small" label={t('Ceiling colour', 'لون السقف')} value={a.ceilingColour} onChange={(e) => setArea(i, { ceilingColour: e.target.value })} />
              </Stack>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ sm: 'center' }}>
                <TextField select size="small" label={t('Finish', 'التشطيب')} value={a.finish} onChange={(e) => setArea(i, { finish: e.target.value })} sx={{ minWidth: 140 }}>
                  {FINISHES.map((k) => <MenuItem key={k.v} value={k.v}>{t(k.en, k.ar)}</MenuItem>)}
                </TextField>
                <TextField select size="small" label={t('Current condition', 'الحالة الحالية')} value={a.condition} onChange={(e) => setArea(i, { condition: e.target.value })} sx={{ minWidth: 220 }}>
                  {CONDITIONS.map((k) => <MenuItem key={k.v} value={k.v}>{t(k.en, k.ar)}</MenuItem>)}
                </TextField>
                <Button component="label" variant="outlined" size="small">
                  {t('Add photos', 'إضافة صور')} ({a.files.length})
                  <input hidden type="file" accept="image/*" multiple onChange={(e) => setArea(i, { files: Array.from(e.target.files || []).filter((f) => f.size < 15 * 1024 * 1024).slice(0, 10) })} />
                </Button>
                <Button color="error" size="small" onClick={() => setAreas((l) => l.filter((_, j) => j !== i))}>{t('Remove', 'حذف')}</Button>
              </Stack>
            </Box>
          ))}
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
            <Button variant="outlined" onClick={() => setAreas((l) => [...l, emptyArea()])} disabled={areas.length >= 300}>{t('Add room / floor / unit', 'إضافة غرفة / طابق / وحدة')}</Button>
          </Stack>
          <TextField multiline minRows={2} size="small" label={t('Notes for the surveyor (optional)', 'ملاحظات للمعاين (اختياري)')} value={notes} onChange={(e) => setNotes(e.target.value.slice(0, 2000))} />
          <Box><Button variant="contained" disabled={!propertyId || busy === 'new' || !areaValid} onClick={requestProject}>{t('Request survey', 'طلب المعاينة')}</Button></Box>
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
                {q && <Typography>{t('Quote', 'العرض')} v{q.version}: <b>AED {Number(q.priceAed).toLocaleString()}</b> ({t('one-time, not part of your annual maintenance fee', 'لمرة واحدة، ولا تدخل ضمن رسوم الصيانة السنوية')})</Typography>}
                {q?.surveySummary && (
                  <Typography variant="body2" color="text.secondary">
                    {t('Measured at survey', 'المقاس أثناء المعاينة')}: {t('walls', 'الجدران')} {q.surveySummary.wallAreaSqm} m², {t('ceilings', 'الأسقف')} {q.surveySummary.ceilingAreaSqm} m²
                  </Typography>
                )}
                {q?.lines && q.lines.length > 0 && (
                  <Box component="table" sx={{ mt: 1, width: '100%', borderCollapse: 'collapse', '& td': { py: 0.5, borderBottom: 1, borderColor: 'divider', color: 'text.primary' } }}>
                    <tbody>
                      {q.lines.map((l) => (
                        <tr key={l.category}><td>{t(...(LINE_LABELS[l.category] || [l.category, l.category]))}</td><td style={{ textAlign: isRTL ? 'left' : 'right' }}>AED {Number(l.amountAed).toLocaleString()}</td></tr>
                      ))}
                    </tbody>
                  </Box>
                )}
                {q?.billingSchedule && (
                  <Typography variant="body2" sx={{ mt: 1 }}>
                    {t('Payment stages (cash or cheque)', 'مراحل الدفع (نقدًا أو بشيك)')}: {(['DEPOSIT', 'PROGRESS', 'FINAL'] as const).filter((k) => Number(q.billingSchedule?.[k]) > 0).map((k) => `${t(...STAGE_LABELS[k])} AED ${Number(q.billingSchedule?.[k]).toLocaleString()}`).join(' · ')}
                  </Typography>
                )}
                {(invoices[p.id] || []).map((inv) => {
                  const k = `${p.id}_${inv.stage}`;
                  const d = proofs[k] || { method: 'CASH', chequeNo: '', bank: '', chequeDate: '', file: null };
                  const setD = (patch: Partial<ProofDraft>) => setProofs((s) => ({ ...s, [k]: { ...d, ...patch } }));
                  const st = INVOICE_STATUS[inv.status] || [inv.status, inv.status];
                  const canPay = inv.status === 'ISSUED' || inv.status === 'REJECTED';
                  return (
                    <Box key={inv.id} sx={{ mt: 2, p: 1.5, borderRadius: 2, border: 1, borderColor: 'divider' }}>
                      <Stack direction="row" justifyContent="space-between" alignItems="center">
                        <Typography fontWeight={700}>{t(...(STAGE_LABELS[inv.stage] || [inv.stage, inv.stage]))}: AED {Number(inv.amountAed).toLocaleString()}</Typography>
                        <Chip size="small" color={inv.status === 'PAID' ? 'success' : inv.status === 'REJECTED' ? 'error' : 'default'} label={t(st[0], st[1])} />
                      </Stack>
                      {inv.status === 'REJECTED' && inv.rejection?.reason && <Typography variant="body2" color="error.main">{inv.rejection.reason}</Typography>}
                      {canPay && (
                        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ mt: 1 }} alignItems={{ sm: 'center' }}>
                          <TextField select size="small" label={t('Paid by', 'طريقة الدفع')} value={d.method} onChange={(e) => setD({ method: e.target.value as 'CASH' | 'CHEQUE' })} sx={{ minWidth: 120 }}>
                            <MenuItem value="CASH">{t('Cash', 'نقدًا')}</MenuItem>
                            <MenuItem value="CHEQUE">{t('Cheque', 'شيك')}</MenuItem>
                          </TextField>
                          {d.method === 'CHEQUE' && (
                            <>
                              <TextField size="small" label={t('Cheque no.', 'رقم الشيك')} value={d.chequeNo} onChange={(e) => setD({ chequeNo: e.target.value })} />
                              <TextField size="small" label={t('Bank', 'البنك')} value={d.bank} onChange={(e) => setD({ bank: e.target.value })} />
                              <TextField size="small" type="date" label={t('Cheque date', 'تاريخ الشيك')} InputLabelProps={{ shrink: true }} value={d.chequeDate} onChange={(e) => setD({ chequeDate: e.target.value })} />
                            </>
                          )}
                          <Button component="label" variant="outlined" size="small">
                            {d.file ? d.file.name.slice(0, 24) : t('Receipt / cheque photo', 'صورة الإيصال / الشيك')}
                            <input hidden type="file" accept="image/*,application/pdf" onChange={(e) => setD({ file: e.target.files?.[0] || null })} />
                          </Button>
                          <Button variant="contained" size="small" disabled={!!busy || !d.file} onClick={() => submitProof(p, inv)}>{t('Send proof', 'إرسال الإثبات')}</Button>
                        </Stack>
                      )}
                    </Box>
                  );
                })}
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
                  {p.status === 'COMPLETED' && !p.completionAcceptance?.acceptedBy && (
                    <>
                      <Button variant="contained" disabled={!!busy} onClick={() => acceptCompletion(p)}>{t('Accept completed work', 'قبول العمل المنجز')}</Button>
                      {!rejects[p.id]?.open && (
                        <Button color="warning" disabled={!!busy} onClick={() => setRejects((s) => ({ ...s, [p.id]: { open: true, reason: '', files: [] } }))}>{t('Report a problem', 'الإبلاغ عن مشكلة')}</Button>
                      )}
                    </>
                  )}
                  {p.status === 'COMPLETED' && !p.completionAcceptance?.acceptedBy && rejects[p.id]?.open && (
                    <Stack spacing={1} sx={{ width: '100%' }}>
                      <TextField multiline minRows={2} size="small" label={t('What needs fixing? (required)', 'ما الذي يحتاج إلى إصلاح؟ (مطلوب)')}
                        value={rejects[p.id].reason} inputProps={{ maxLength: 1000 }}
                        onChange={(e) => setRejects((s) => ({ ...s, [p.id]: { ...s[p.id], reason: e.target.value } }))} />
                      <Button component="label" size="small" variant="outlined">
                        {t('Add photos (optional)', 'إضافة صور (اختياري)')} ({rejects[p.id].files.length})
                        <input hidden type="file" accept="image/*" multiple onChange={(e) => {
                          const files = Array.from(e.target.files || []).slice(0, 10);
                          setRejects((s) => ({ ...s, [p.id]: { ...s[p.id], files } }));
                        }} />
                      </Button>
                      <Stack direction="row" spacing={1}>
                        <Button color="warning" variant="contained" disabled={!!busy || rejects[p.id].reason.trim().length < 8} onClick={() => rejectCompletion(p)}>{t('Send for rework', 'إرسال لإعادة العمل')}</Button>
                        <Button disabled={!!busy} onClick={() => setRejects((s) => { const n = { ...s }; delete n[p.id]; return n; })}>{t('Back', 'رجوع')}</Button>
                      </Stack>
                    </Stack>
                  )}
                  {p.status === 'REWORK_REQUIRED' && (
                    <Alert severity="warning" sx={{ width: '100%' }}>{t('You asked for rework. We will notify you when it is done so you can review again.', 'لقد طلبت إعادة العمل. سنبلغك عند الانتهاء لتراجعه مجددًا.')}</Alert>
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

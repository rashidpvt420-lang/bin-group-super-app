import React from 'react';
import { Alert, Box, Button, Card, CardContent, Chip, CircularProgress, Grid, MenuItem, Stack, TextField, Typography } from '@mui/material';
import { useLanguage } from '@bin/shared';
import { collection, db, functions, getDocs, getDownloadURL, httpsCallable, limit, query, ref, storage, uploadBytes } from '../../lib/firebase';

type Project = {
  id: string; ownerId: string; propertyId: string; scope: string; status: string; quoteVersion?: number; approvedQuoteVersion?: number | null;
  beforePhotoPaths?: string[]; afterPhotoPaths?: string[]; approvedPriceAed?: number;
  contractor?: { name: string; agreedCostAed?: number | null } | null;
  costs?: { actualCostAed: number; quotedCostAed: number; varianceAed: number; actualMarginPct: number };
  payments?: Record<string, { status: string; amountAed: number }>;
  billingSchedule?: Record<string, number>;
  reserves?: { contingencyHeldAed: number; contingencyUsedAed: number; contingencyRemainingAed: number; overrunBeyondContingencyAed: number; warrantyHeldAed: number };
  milestones?: { PROGRESS?: { percentComplete: number; photoPaths: string[]; note: string } };
  completionAcceptance?: { acceptedBy: string } | null;
  reworkRound?: number;
  completionRejection?: { round: number; reason: string; photoPaths: string[]; rejectedBy: string } | null;
  completionReviews?: Record<string, { rework?: { note: string; photoPaths: string[]; recordedBy: string } }>;
  ownerAreas?: Array<{ kind: string; label: string; floor?: string | null; unitRef?: string | null; wallAreaSqm: number; ceilingAreaSqm: number; wallColour?: string | null; condition: string; photoPaths: string[] }>;
  ownerNotes?: string | null;
};
type Invoice = { id: string; stage: string; amountAed: number; status: string; issuedBy?: string; proof?: { method: string; proofPath: string; chequeNo?: string; bank?: string; chequeDate?: string } };
type Line = { category: string; description: string; qty: string; unit: string; unitCostAed: string };
const LINE_CATS: Array<[string, string, string]> = [
  ['LABOUR', 'Labour', 'العمالة'], ['MATERIALS', 'Materials', 'المواد'], ['PREP', 'Preparation', 'التحضير'],
  ['ACCESS', 'Access / scaffold', 'الوصول / السقالات'], ['PERMIT', 'Permit / NOC', 'تصريح / عدم ممانعة'],
];
const COST_CATS = ['CONTRACTOR', 'MATERIALS', 'LABOUR', 'ACCESS', 'PERMIT', 'OTHER'];
const STAGES = ['DEPOSIT', 'PROGRESS', 'FINAL'] as const;
// One key per form submission: a retry or double-click replays the first result on the server.
const newKey = () => {
  const c = globalThis.crypto;
  if (c?.randomUUID) return c.randomUUID().replace(/[^A-Za-z0-9_-]/g, '').slice(0, 64);
  const bytes = c.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
};

type RateRow = { id: string; category: string; label: string; unit: string; rateAed: number; currency?: string; version: number; updatedBy?: string; updatedAt?: { toDate?: () => Date } };
type RateHistory = { id: string; version: number; rateAed: number; unit: string; label: string; category: string; changedBy: string; changedAt?: { toDate?: () => Date }; previous?: { rateAed: number; unit: string; label: string; category: string } | null };
const fmtTs = (v?: { toDate?: () => Date }) => (v?.toDate ? v.toDate().toLocaleString() : '-');
const blankLine = (category: string): Line => ({ category, description: '', qty: '1', unit: 'lot', unitCostAed: '' });

export default function PaintingProjectsAdminPage() {
  const { isRTL } = useLanguage();
  const t = (en: string, ar: string) => (isRTL ? ar : en);
  const [projects, setProjects] = React.useState<Project[]>([]);
  const [selected, setSelected] = React.useState<Project | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState('');
  const [notice, setNotice] = React.useState('');
  const [survey, setSurvey] = React.useState({ wallAreaSqm: '', condition: 'GOOD', paintGrade: 'STANDARD' });
  const [priceAed, setPriceAed] = React.useState('');
  const [belowTargetReason, setBelowTargetReason] = React.useState('');
  const [milestone, setMilestone] = React.useState({ percentComplete: '50', note: '' });
  const [rate, setRate] = React.useState({ rateId: '', category: 'LABOUR', unit: 'day', rateAed: '', label: '' });
  const [reason, setReason] = React.useState('');
  const [lines, setLines] = React.useState<Line[]>(['LABOUR', 'MATERIALS', 'PREP'].map(blankLine));
  const [contractor, setContractor] = React.useState({ name: '', tradeLicenseNo: '', phone: '', agreedCostAed: '' });
  const [costLine, setCostLine] = React.useState({ category: 'CONTRACTOR', amountAed: '', description: '', vendor: '' });
  const [invoices, setInvoices] = React.useState<Invoice[]>([]);
  const [decisionNote, setDecisionNote] = React.useState('');
  const [reworkNote, setReworkNote] = React.useState('');
  const [rates, setRates] = React.useState<RateRow[]>([]);
  const [rateHistory, setRateHistory] = React.useState<{ rateId: string; rows: RateHistory[] } | null>(null);
  const keys = React.useRef<Record<string, string>>({});
  const keyFor = (action: string) => { keys.current[action] = keys.current[action] || newKey(); return keys.current[action]; };

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
  // Read-only rate book: current AED rates plus the append-only history/v{n} (who, when, old -> new).
  const loadRates = React.useCallback(async () => {
    try {
      const s = await getDocs(query(collection(db, 'painting_rates'), limit(200)));
      const rows = s.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as RateRow[];
      setRates(rows.sort((a, b) => `${a.category}${a.id}`.localeCompare(`${b.category}${b.id}`)));
    } catch { setRates([]); }
  }, []);
  React.useEffect(() => { void loadRates(); }, [loadRates]);
  const showRateHistory = async (rateId: string) => {
    try {
      const s = await getDocs(collection(db, 'painting_rates', rateId, 'history'));
      setRateHistory({ rateId, rows: (s.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as RateHistory[]).sort((a, b) => b.version - a.version) });
    } catch (e: any) { setError(e?.message || 'Could not load history'); }
  };
  React.useEffect(() => {
    if (!selected?.id) { setInvoices([]); return; }
    getDocs(collection(db, 'painting_projects', selected.id, 'invoices'))
      .then((s) => setInvoices(s.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as Invoice[]))
      .catch(() => setInvoices([]));
  }, [selected?.id, selected?.payments]);

  const act = async (name: string, data: Record<string, unknown>, ok: string, keyAction?: string) => {
    setBusy(true); setError(''); setNotice('');
    try {
      await httpsCallable(functions, name)(keyAction ? { ...data, requestId: keyFor(keyAction) } : data);
      if (keyAction) delete keys.current[keyAction];
      setNotice(ok); await load(); if (name === 'adminSetPaintingRate') await loadRates();
    }
    catch (e: any) { setError(e?.message || t('Action failed.', 'فشل الإجراء.')); }
    finally { setBusy(false); }
  };

  const recordMilestone = async (files: FileList | null) => {
    if (!selected || !files?.length) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const photoPaths: string[] = [];
      for (const f of Array.from(files).slice(0, 20)) {
        if (!/^image\//.test(f.type) || f.size > 15 * 1024 * 1024) throw new Error(t('Images only, up to 15 MB each.', 'صور فقط، حتى 15 ميغابايت لكل صورة.'));
        const path = `painting-projects/${selected.id}/progress/${Date.now()}-${f.name.replace(/[^\w.-]/g, '_').slice(0, 80)}`;
        await uploadBytes(ref(storage, path), f, { contentType: f.type });
        photoPaths.push(path);
      }
      await httpsCallable(functions, 'adminRecordPaintingProgressMilestone')({ projectId: selected.id, percentComplete: Number(milestone.percentComplete), note: milestone.note, photoPaths });
      setNotice(t('Progress milestone recorded.', 'تم تسجيل مرحلة التقدم.'));
      await load();
    } catch (e: any) { setError(e?.message || t('Upload failed.', 'فشل الرفع.')); } finally { setBusy(false); }
  };

  const recordRework = async (files: FileList | null) => {
    if (!selected || !files?.length) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const photoPaths: string[] = [];
      for (const f of Array.from(files).slice(0, 20)) {
        if (!/^image\//.test(f.type) || f.size > 15 * 1024 * 1024) throw new Error(t('Images only, up to 15 MB each.', 'صور فقط، حتى 15 ميغابايت لكل صورة.'));
        const path = `painting-projects/${selected.id}/rework/${Date.now()}-${f.name.replace(/[^\w.-]/g, '_').slice(0, 80)}`;
        await uploadBytes(ref(storage, path), f, { contentType: f.type });
        photoPaths.push(path);
      }
      await httpsCallable(functions, 'adminRecordPaintingReworkMilestone')({ projectId: selected.id, note: reworkNote, photoPaths });
      setReworkNote('');
      setNotice(t('Rework recorded. The owner can now review and accept.', 'تم تسجيل إعادة العمل. يمكن للمالك الآن المراجعة والقبول.'));
      await load();
    } catch (e: any) { setError(e?.message || t('Upload failed.', 'فشل الرفع.')); } finally { setBusy(false); }
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

  const openProof = async (path: string) => {
    try { window.open(await getDownloadURL(ref(storage, path)), '_blank', 'noopener'); } catch (e: any) { setError(e?.message || 'Could not open proof'); }
  };
  const lineTotal = lines.reduce((sum, l) => sum + Number(l.qty || 0) * Number(l.unitCostAed || 0), 0);
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

              {p.ownerAreas && p.ownerAreas.length > 0 && (
                <Box sx={{ mb: 2 }}>
                  <Typography fontWeight={700} gutterBottom>{t('Owner areas (estimate - verify at survey)', 'مناطق المالك (تقديرية - تحقق أثناء المعاينة)')}</Typography>
                  {p.ownerAreas.map((a, i) => (
                    <Typography key={i} variant="body2">
                      {a.kind} · {a.label}{a.floor ? ` · F${a.floor}` : ''}{a.unitRef ? ` · ${a.unitRef}` : ''} · {t('walls', 'جدران')} {a.wallAreaSqm} m² · {t('ceiling', 'سقف')} {a.ceilingAreaSqm} m² · {a.wallColour || '-'} · {a.condition} · {a.photoPaths.length} {t('photos', 'صور')}
                      {a.photoPaths.map((ph, j) => <Button key={ph} size="small" onClick={() => openProof(ph)}>#{j + 1}</Button>)}
                    </Typography>
                  ))}
                  {p.ownerNotes && <Typography variant="body2" color="text.secondary">{p.ownerNotes}</Typography>}
                </Box>
              )}

              {['REQUESTED', 'SURVEYED', 'QUOTED', 'OWNER_APPROVED', 'WORK_ORDER_OPEN'].includes(p.status) && (
                <Box sx={{ mb: 3 }}>
                  <Typography fontWeight={700} gutterBottom>{p.status === 'REQUESTED' || p.status === 'SURVEYED' ? t('Survey & quote', 'المعاينة والعرض') : t('Issue variation quote', 'إصدار عرض معدل')}</Typography>
                  <Grid container spacing={1}>
                    <Grid item xs={4}><TextField size="small" fullWidth label={t('Wall area (sqm)', 'مساحة الجدران (م²)')} value={survey.wallAreaSqm} onChange={(e) => setSurvey({ ...survey, wallAreaSqm: e.target.value })} /></Grid>
                    <Grid item xs={4}><TextField select size="small" fullWidth label={t('Condition', 'الحالة')} value={survey.condition} onChange={(e) => setSurvey({ ...survey, condition: e.target.value })}>
                      {['GOOD', 'FAIR', 'POOR'].map((c) => <MenuItem key={c} value={c}>{c}</MenuItem>)}</TextField></Grid>
                    <Grid item xs={4}><TextField select size="small" fullWidth label={t('Paint grade', 'درجة الطلاء')} value={survey.paintGrade} onChange={(e) => setSurvey({ ...survey, paintGrade: e.target.value })}>
                      {['ECONOMY', 'STANDARD', 'PREMIUM'].map((c) => <MenuItem key={c} value={c}>{c}</MenuItem>)}</TextField></Grid>
                    {lines.map((l, i) => (
                      <React.Fragment key={i}>
                        <Grid item xs={6} md={2}><TextField select size="small" fullWidth label={t('Category', 'الفئة')} value={l.category} onChange={(e) => setLines((x) => x.map((y, j) => (j === i ? { ...y, category: e.target.value } : y)))}>
                          {LINE_CATS.map(([v, en, ar]) => <MenuItem key={v} value={v}>{t(en, ar)}</MenuItem>)}</TextField></Grid>
                        <Grid item xs={6} md={4}><TextField size="small" fullWidth label={t('Description', 'الوصف')} value={l.description} onChange={(e) => setLines((x) => x.map((y, j) => (j === i ? { ...y, description: e.target.value } : y)))} /></Grid>
                        <Grid item xs={3} md={1.5}><TextField size="small" fullWidth label={t('Qty', 'الكمية')} value={l.qty} onChange={(e) => setLines((x) => x.map((y, j) => (j === i ? { ...y, qty: e.target.value } : y)))} /></Grid>
                        <Grid item xs={3} md={1.5}><TextField size="small" fullWidth label={t('Unit', 'الوحدة')} value={l.unit} onChange={(e) => setLines((x) => x.map((y, j) => (j === i ? { ...y, unit: e.target.value } : y)))} /></Grid>
                        <Grid item xs={4} md={2}><TextField size="small" fullWidth label={t('Unit cost (AED)', 'تكلفة الوحدة (درهم)')} value={l.unitCostAed} onChange={(e) => setLines((x) => x.map((y, j) => (j === i ? { ...y, unitCostAed: e.target.value } : y)))} /></Grid>
                        <Grid item xs={2} md={1}><Button color="error" size="small" onClick={() => setLines((x) => x.filter((_, j) => j !== i))}>×</Button></Grid>
                      </React.Fragment>
                    ))}
                    <Grid item xs={12}>
                      <Button size="small" onClick={() => setLines((x) => [...x, blankLine('ACCESS')])}>{t('Add itemised cost line', 'إضافة بند تكلفة')}</Button>
                      {lines.length > 0 && <Typography component="span" variant="body2" sx={{ mx: 1 }}>{t('Direct cost', 'التكلفة المباشرة')}: AED {lineTotal.toLocaleString()} ({t('margin = (price - direct cost) / price; 10% contingency and 3% warranty reserve are held separately, not added to cost. Block below 20%, target 35%.', 'الهامش = (السعر - التكلفة المباشرة) / السعر؛ احتياطي 10% و3% ضمان منفصلان. الحد الأدنى 20% والمستهدف 35%.')})</Typography>}
                    </Grid>
                    <Grid item xs={6} md={4}><TextField size="small" fullWidth label={t('Price to owner (AED)', 'السعر للمالك (درهم)')} value={priceAed} onChange={(e) => setPriceAed(e.target.value)} /></Grid>
                    <Grid item xs={12} md={8}><TextField size="small" fullWidth label={t('Reason if margin is below the 35% target (never below 20%)', 'السبب إذا كان الهامش أقل من 35% (لا يقل عن 20%)')} value={belowTargetReason} onChange={(e) => setBelowTargetReason(e.target.value)} /></Grid>
                  </Grid>
                  <Button sx={{ mt: 1 }} variant="contained" disabled={busy} onClick={() => act('adminIssuePaintingQuote', {
                    projectId: p.id, priceAed: Number(priceAed),
                    lines: lines.map((l) => ({ ...l, qty: Number(l.qty || 0), unitCostAed: Number(l.unitCostAed || 0), currency: 'AED' })),
                    ...(belowTargetReason.trim() ? { belowTargetReason } : {}),
                    surveyMeasurements: { wallAreaSqm: Number(survey.wallAreaSqm || 0), condition: survey.condition, paintGrade: survey.paintGrade },
                  }, t('Quote issued.', 'تم إصدار العرض.'), `quote_${p.id}`)}>{t('Issue quote', 'إصدار العرض')}</Button>
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

              <Box sx={{ mb: 2 }}>
                <Typography fontWeight={700} gutterBottom>{t('Contractor', 'المقاول')}: {p.contractor?.name || t('not assigned', 'غير معيّن')}</Typography>
                {['QUOTED', 'OWNER_APPROVED'].includes(p.status) && (
                  <Stack direction={{ xs: 'column', md: 'row' }} spacing={1}>
                    <TextField size="small" label={t('Company name', 'اسم الشركة')} value={contractor.name} onChange={(e) => setContractor({ ...contractor, name: e.target.value })} />
                    <TextField size="small" label={t('Trade licence no.', 'رقم الرخصة التجارية')} value={contractor.tradeLicenseNo} onChange={(e) => setContractor({ ...contractor, tradeLicenseNo: e.target.value })} />
                    <TextField size="small" label={t('Phone', 'الهاتف')} value={contractor.phone} onChange={(e) => setContractor({ ...contractor, phone: e.target.value })} />
                    <TextField size="small" label={t('Agreed cost (AED)', 'التكلفة المتفق عليها (درهم)')} value={contractor.agreedCostAed} onChange={(e) => setContractor({ ...contractor, agreedCostAed: e.target.value })} />
                    <Button variant="outlined" disabled={busy || contractor.name.trim().length < 2} onClick={() => act('adminAssignPaintingContractor', {
                      projectId: p.id, name: contractor.name, tradeLicenseNo: contractor.tradeLicenseNo || undefined, phone: contractor.phone || undefined,
                      ...(contractor.agreedCostAed ? { agreedCostAed: Number(contractor.agreedCostAed) } : {}),
                    }, t('Contractor assigned.', 'تم تعيين المقاول.'), `contractor_${p.id}`)}>{t('Assign', 'تعيين')}</Button>
                  </Stack>
                )}
              </Box>

              {['OWNER_APPROVED', 'WORK_ORDER_OPEN', 'COMPLETED', 'REWORK_REQUIRED', 'WARRANTY_ACTIVE'].includes(p.status) && (
                <Box sx={{ mb: 2 }}>
                  <Typography fontWeight={700} gutterBottom>{t('Actual costs', 'التكاليف الفعلية')}</Typography>
                  {p.costs && (
                    <Typography variant="body2">
                      {t('Price', 'السعر')} AED {Number(p.approvedPriceAed ?? 0).toLocaleString()} · {t('quoted cost', 'التكلفة المقدرة')} AED {p.costs.quotedCostAed.toLocaleString()} · {t('actual', 'الفعلية')} AED {p.costs.actualCostAed.toLocaleString()} · {t('variance', 'الفرق')} AED {p.costs.varianceAed.toLocaleString()} · {t('actual margin', 'الهامش الفعلي')} <b style={{ color: p.costs.actualMarginPct < 20 ? '#b00020' : undefined }}>{p.costs.actualMarginPct}%</b>
                    </Typography>
                  )}
                  {p.reserves && (
                    <Typography variant="body2" color="text.secondary">
                      {t('Reserves (held separately, not cost)', 'الاحتياطيات (منفصلة عن التكلفة)')}: {t('contingency', 'طوارئ')} AED {p.reserves.contingencyHeldAed.toLocaleString()} ({t('used', 'مستخدم')} {p.reserves.contingencyUsedAed.toLocaleString()}) · {t('warranty', 'ضمان')} AED {p.reserves.warrantyHeldAed.toLocaleString()}{p.reserves.overrunBeyondContingencyAed > 0 ? ` · ${t('overrun beyond contingency', 'تجاوز بعد الاحتياطي')} AED ${p.reserves.overrunBeyondContingencyAed.toLocaleString()}` : ''}
                    </Typography>
                  )}
                  <Stack direction={{ xs: 'column', md: 'row' }} spacing={1} sx={{ mt: 1 }}>
                    <TextField select size="small" label={t('Category', 'الفئة')} value={costLine.category} onChange={(e) => setCostLine({ ...costLine, category: e.target.value })} sx={{ minWidth: 140 }}>
                      {COST_CATS.map((c) => <MenuItem key={c} value={c}>{c}</MenuItem>)}</TextField>
                    <TextField size="small" label={t('Amount (AED)', 'المبلغ (درهم)')} value={costLine.amountAed} onChange={(e) => setCostLine({ ...costLine, amountAed: e.target.value })} />
                    <TextField size="small" label={t('Description', 'الوصف')} value={costLine.description} onChange={(e) => setCostLine({ ...costLine, description: e.target.value })} />
                    <TextField size="small" label={t('Vendor', 'المورد')} value={costLine.vendor} onChange={(e) => setCostLine({ ...costLine, vendor: e.target.value })} />
                    <Button variant="outlined" disabled={busy || !(Number(costLine.amountAed) > 0) || costLine.description.trim().length < 3} onClick={async () => {
                      await act('adminRecordPaintingCost', { projectId: p.id, category: costLine.category, amountAed: Number(costLine.amountAed), description: costLine.description, vendor: costLine.vendor || undefined }, t('Cost recorded.', 'تم تسجيل التكلفة.'), `cost_${p.id}`);
                      setCostLine({ category: 'CONTRACTOR', amountAed: '', description: '', vendor: '' });
                    }}>{t('Record cost', 'تسجيل التكلفة')}</Button>
                  </Stack>
                </Box>
              )}

              {p.approvedQuoteVersion && (
                <Box sx={{ mb: 2 }}>
                  <Typography fontWeight={700} gutterBottom>{t('Billing (cash or cheque only)', 'الفوترة (نقدًا أو بشيك فقط)')}</Typography>
                  {STAGES.map((stage) => {
                    const inv = invoices.find((i) => i.stage === stage);
                    return (
                      <Stack key={stage} direction={{ xs: 'column', md: 'row' }} spacing={1} alignItems={{ md: 'center' }} sx={{ mb: 1 }}>
                        <Typography sx={{ minWidth: 220 }}>{stage}: AED {Number(inv?.amountAed ?? p.billingSchedule?.[stage] ?? 0).toLocaleString()}</Typography>
                        <Chip size="small" label={inv?.status || t('not issued', 'لم تصدر')} color={inv?.status === 'PAID' ? 'success' : inv?.status === 'REJECTED' ? 'error' : 'default'} />
                        {!inv && <Button size="small" variant="outlined" disabled={busy} onClick={() => act('adminIssuePaintingInvoice', { projectId: p.id, stage }, t('Invoice issued.', 'تم إصدار الفاتورة.'), `invoice_${p.id}_${stage}`)}>{t('Issue invoice', 'إصدار فاتورة')}</Button>}
                        {inv?.proof && (
                          <Typography variant="body2">
                            {inv.proof.method}{inv.proof.chequeNo ? ` #${inv.proof.chequeNo} · ${inv.proof.bank} · ${inv.proof.chequeDate}` : ''}
                            <Button size="small" onClick={() => openProof(inv.proof!.proofPath)}>{t('View proof', 'عرض الإثبات')}</Button>
                          </Typography>
                        )}
                        {inv?.status === 'PROOF_SUBMITTED' && (
                          <>
                            <TextField size="small" label={t('Finance note / rejection reason', 'ملاحظة المالية / سبب الرفض')} value={decisionNote} onChange={(e) => setDecisionNote(e.target.value)} />
                            <Button size="small" variant="contained" color="success" disabled={busy} onClick={() => act('financeDecidePaintingPayment', { projectId: p.id, stage, decision: 'APPROVE', note: decisionNote || undefined }, t('Payment approved.', 'تمت الموافقة على الدفعة.'), `finance_${p.id}_${stage}`)}>{t('Approve (Finance)', 'موافقة (المالية)')}</Button>
                            <Button size="small" color="error" disabled={busy || decisionNote.trim().length < 8} onClick={() => act('financeDecidePaintingPayment', { projectId: p.id, stage, decision: 'REJECT', note: decisionNote }, t('Proof rejected.', 'تم رفض الإثبات.'), `finance_${p.id}_${stage}`)}>{t('Reject', 'رفض')}</Button>
                          </>
                        )}
                      </Stack>
                    );
                  })}
                  {p.status === 'WORK_ORDER_OPEN' && !p.milestones?.PROGRESS && (
                    <Stack direction={{ xs: 'column', md: 'row' }} spacing={1} sx={{ my: 1 }}>
                      <TextField size="small" label={t('% complete (10-95)', 'نسبة الإنجاز (10-95)')} value={milestone.percentComplete} onChange={(e) => setMilestone({ ...milestone, percentComplete: e.target.value })} />
                      <TextField size="small" label={t('Milestone note', 'ملاحظة المرحلة')} value={milestone.note} onChange={(e) => setMilestone({ ...milestone, note: e.target.value })} />
                      <Button component="label" variant="outlined" disabled={busy || milestone.note.trim().length < 8}>{t('Upload progress photos & record milestone', 'رفع صور التقدم وتسجيل المرحلة')}
                        <input hidden type="file" accept="image/*" multiple onChange={(e) => recordMilestone(e.target.files)} /></Button>
                    </Stack>
                  )}
                  {p.milestones?.PROGRESS && <Typography variant="body2">{t('Progress milestone', 'مرحلة التقدم')}: {p.milestones.PROGRESS.percentComplete}% · {p.milestones.PROGRESS.photoPaths.length} {t('photos', 'صور')}</Typography>}
                  <Typography variant="body2">{t('Owner acceptance of completed work', 'قبول المالك للعمل المنجز')}: {p.completionAcceptance?.acceptedBy ? t('recorded', 'مسجل') : t('pending', 'معلق')}</Typography>
                  <Typography variant="caption" color="text.secondary">{t('Card payments are off for painting. 40% deposit on quote acceptance; 30% progress after a recorded milestone with photos; 30% final after completion and the owner\'s acceptance. Only a Finance Manager or Finance Controller (MFA), who did not issue the invoice, can approve.', 'الدفع بالبطاقة غير مفعّل للدهان. 40% عند قبول العرض، 30% بعد تسجيل مرحلة التقدم بالصور، 30% بعد الإنجاز وقبول المالك. الموافقة لمدير أو مراقب مالي (MFA) لم يُصدر الفاتورة.')}</Typography>
                </Box>
              )}

              <Stack direction="row" spacing={1} flexWrap="wrap" sx={{ mb: 2 }}>
                {p.status === 'OWNER_APPROVED' && <Button variant="contained" disabled={busy} onClick={() => act('adminOpenPaintingWorkOrder', { projectId: p.id }, t('Work order opened.', 'تم فتح أمر العمل.'))}>{t('Open work order', 'فتح أمر العمل')}</Button>}
                {p.status === 'WORK_ORDER_OPEN' && <Button variant="contained" disabled={busy} onClick={() => act('adminCompletePaintingProject', { projectId: p.id }, t('Marked completed.', 'تم وضع علامة مكتمل.'))}>{t('Mark completed', 'وضع علامة مكتمل')}</Button>}
                {p.status === 'COMPLETED' && (
                  <>
                    <Button variant="contained" disabled={busy || !p.completionAcceptance?.acceptedBy} onClick={() => act('adminIssuePaintingWarranty', { projectId: p.id, months: 12 }, t('Warranty issued.', 'تم إصدار الضمان.'))}>{t('Issue 12-month warranty (from owner acceptance)', 'إصدار ضمان 12 شهرًا (من قبول المالك)')}</Button>
                  </>
                )}
              </Stack>

              {p.completionRejection && (
                <Box sx={{ mb: 2 }}>
                  <Alert severity={p.status === 'REWORK_REQUIRED' ? 'warning' : 'info'} sx={{ mb: 1 }}>
                    {t('Owner rejected the completed work', 'رفض المالك العمل المنجز')} ({t('round', 'الجولة')} {p.completionRejection.round}): {p.completionRejection.reason}
                    {p.completionRejection.photoPaths.map((ph, j) => <Button key={ph} size="small" onClick={() => openProof(ph)}>#{j + 1}</Button>)}
                  </Alert>
                  {p.status === 'REWORK_REQUIRED' && (
                    <Stack direction={{ xs: 'column', md: 'row' }} spacing={1}>
                      <TextField size="small" fullWidth label={t('Rework note (min 8 chars)', 'ملاحظة إعادة العمل (8 أحرف على الأقل)')} value={reworkNote} onChange={(e) => setReworkNote(e.target.value)} />
                      <Button component="label" variant="contained" disabled={busy || reworkNote.trim().length < 8}>{t('Upload rework photos & record', 'رفع صور إعادة العمل والتسجيل')}
                        <input hidden type="file" accept="image/*" multiple onChange={(e) => recordRework(e.target.files)} /></Button>
                    </Stack>
                  )}
                  {p.completionReviews?.[`R${p.completionRejection.round}`]?.rework && (
                    <Typography variant="body2">{t('Rework recorded', 'تم تسجيل إعادة العمل')}: {p.completionReviews[`R${p.completionRejection.round}`].rework?.note}</Typography>
                  )}
                </Box>
              )}

              <Box sx={{ mb: 2 }}>
                <Typography fontWeight={700} gutterBottom>{t('Rate book (AED, every change is logged)', 'دليل الأسعار (درهم، كل تغيير مسجل)')}</Typography>
                <Stack direction={{ xs: 'column', md: 'row' }} spacing={1}>
                  <TextField size="small" label={t('Rate id', 'معرّف السعر')} value={rate.rateId} onChange={(e) => setRate({ ...rate, rateId: e.target.value })} />
                  <TextField select size="small" label={t('Category', 'الفئة')} value={rate.category} onChange={(e) => setRate({ ...rate, category: e.target.value })} sx={{ minWidth: 140 }}>
                    {LINE_CATS.map(([v, en, ar]) => <MenuItem key={v} value={v}>{t(en, ar)}</MenuItem>)}</TextField>
                  <TextField size="small" label={t('Label', 'الاسم')} value={rate.label} onChange={(e) => setRate({ ...rate, label: e.target.value })} />
                  <TextField size="small" label={t('Unit', 'الوحدة')} value={rate.unit} onChange={(e) => setRate({ ...rate, unit: e.target.value })} />
                  <TextField size="small" label={t('Rate (AED)', 'السعر (درهم)')} value={rate.rateAed} onChange={(e) => setRate({ ...rate, rateAed: e.target.value })} />
                  <Button variant="outlined" disabled={busy || !rate.rateId || !rate.label || rate.rateAed === ''} onClick={() => act('adminSetPaintingRate', { ...rate, rateAed: Number(rate.rateAed), currency: 'AED' }, t('Rate saved.', 'تم حفظ السعر.'))}>{t('Save rate', 'حفظ السعر')}</Button>
                </Stack>
              </Box>

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

      <Card variant="outlined" sx={{ mt: 3 }}><CardContent>
        <Stack direction="row" justifyContent="space-between" alignItems="center">
          <Typography variant="h6" fontWeight={800}>{t('Rate book (read-only)', 'دليل الأسعار (للعرض فقط)')}</Typography>
          <Button size="small" onClick={() => void loadRates()}>{t('Refresh', 'تحديث')}</Button>
        </Stack>
        {rates.length === 0 ? <Typography color="text.secondary">{t('No rates yet.', 'لا توجد أسعار بعد.')}</Typography> : (
          <Box component="table" sx={{ width: '100%', borderCollapse: 'collapse', '& td, & th': { borderBottom: '1px solid #eee', p: 0.75, textAlign: 'start' } }}>
            <thead><tr>
              <th>{t('Rate id', 'المعرّف')}</th><th>{t('Category', 'الفئة')}</th><th>{t('Label', 'الاسم')}</th><th>{t('Unit', 'الوحدة')}</th>
              <th>{t('Rate (AED)', 'السعر (درهم)')}</th><th>{t('Version', 'الإصدار')}</th><th>{t('Last changed by', 'آخر تعديل بواسطة')}</th><th>{t('When', 'متى')}</th><th />
            </tr></thead>
            <tbody>{rates.map((r) => (
              <tr key={r.id}>
                <td>{r.id}</td><td>{r.category}</td><td>{r.label}</td><td>{r.unit}</td><td>{Number(r.rateAed).toLocaleString()} {r.currency || 'AED'}</td>
                <td>v{r.version}</td><td>{r.updatedBy || '-'}</td><td>{fmtTs(r.updatedAt)}</td>
                <td><Button size="small" onClick={() => void showRateHistory(r.id)}>{t('History', 'السجل')}</Button></td>
              </tr>
            ))}</tbody>
          </Box>
        )}
        {rateHistory && (
          <Box sx={{ mt: 2 }}>
            <Typography fontWeight={700}>{t('History', 'السجل')}: {rateHistory.rateId}</Typography>
            {rateHistory.rows.map((h) => (
              <Typography key={h.id} variant="body2">
                v{h.version} · {fmtTs(h.changedAt)} · {h.changedBy} · {h.previous ? `${h.previous.rateAed} AED / ${h.previous.unit} (${h.previous.label})` : t('created', 'إنشاء')} → {h.rateAed} AED / {h.unit} ({h.label})
              </Typography>
            ))}
          </Box>
        )}
      </CardContent></Card>
    </Box>
  );
}

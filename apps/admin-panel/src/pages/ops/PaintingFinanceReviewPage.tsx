import React from 'react';
import { Alert, Box, Button, Card, CardContent, Chip, CircularProgress, Stack, TextField, Typography } from '@mui/material';
import { useLanguage } from '@bin/shared';
import { functions, getDownloadURL, httpsCallable, ref, storage } from '../../lib/firebase';

// Painting payment review for Finance Manager / Finance Controller (MFA). Shows invoices, payment
// proofs and the minimum project context from financeListPaintingInvoices - never cost, margin,
// reserves, contractor or rates. The only write is financeDecidePaintingPayment.
type FinInvoice = {
  stage: string; amountAed: number; currency: string; status: string; issuedBy: string | null;
  proof: { method: string; proofPath: string; chequeNo: string | null; bank: string | null; chequeDate: string | null } | null;
  rejectionReason: string | null;
};
type FinProject = {
  projectId: string; propertyId: string | null; scope: string | null; status: string; approvedPriceAed: number | null;
  billingSchedule: Record<string, number> | null; progressMilestone: { percentComplete: number; photoCount: number } | null;
  completionDocumented: boolean; completionAccepted: boolean; reworkRequired: boolean; invoices: FinInvoice[];
};
const newKey = () => {
  const c = globalThis.crypto;
  if (c?.randomUUID) return c.randomUUID().replace(/[^A-Za-z0-9_-]/g, '').slice(0, 64);
  return Array.from(c.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, '0')).join('');
};

export default function PaintingFinanceReviewPage() {
  const { isRTL } = useLanguage();
  const t = (en: string, ar: string) => (isRTL ? ar : en);
  const [projects, setProjects] = React.useState<FinProject[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState('');
  const [notice, setNotice] = React.useState('');
  const [notes, setNotes] = React.useState<Record<string, string>>({});
  const keys = React.useRef<Record<string, string>>({});

  const load = React.useCallback(async () => {
    setLoading(true); setError('');
    try {
      const r: any = await httpsCallable(functions, 'financeListPaintingInvoices')({});
      setProjects((r.data?.projects || []) as FinProject[]);
    } catch (e: any) { setError(e?.message || 'Load failed'); } finally { setLoading(false); }
  }, []);
  React.useEffect(() => { void load(); }, [load]);

  const openProof = async (path: string) => {
    try { window.open(await getDownloadURL(ref(storage, path)), '_blank', 'noopener'); } catch (e: any) { setError(e?.message || 'Could not open proof'); }
  };
  const decide = async (p: FinProject, inv: FinInvoice, decision: 'APPROVE' | 'REJECT') => {
    const k = `${p.projectId}_${inv.stage}_${decision}`;
    const note = (notes[`${p.projectId}_${inv.stage}`] || '').trim();
    if (decision === 'REJECT' && note.length < 8) { setError(t('A rejection reason of at least 8 characters is required.', 'سبب الرفض مطلوب (8 أحرف على الأقل).')); return; }
    setBusy(true); setError(''); setNotice('');
    try {
      keys.current[k] = keys.current[k] || newKey();
      await httpsCallable(functions, 'financeDecidePaintingPayment')({ projectId: p.projectId, stage: inv.stage, decision, requestId: keys.current[k], ...(note ? { note } : {}) });
      delete keys.current[k];
      setNotice(decision === 'APPROVE' ? t('Payment approved.', 'تمت الموافقة على الدفعة.') : t('Payment rejected.', 'تم رفض الدفعة.'));
      await load();
    } catch (e: any) { setError(e?.message || t('Action failed.', 'فشل الإجراء.')); } finally { setBusy(false); }
  };

  return (
    <Box dir={isRTL ? 'rtl' : 'ltr'} sx={{ p: 3 }}>
      <Typography variant="h4" fontWeight={800} gutterBottom>{t('Painting payments review', 'مراجعة دفعات الدهان')}</Typography>
      <Typography color="text.secondary" sx={{ mb: 2 }}>{t('Cash and cheque proofs only. You cannot approve an invoice you issued.', 'إثباتات النقد والشيكات فقط. لا يمكنك الموافقة على فاتورة أصدرتها.')}</Typography>
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      {notice && <Alert severity="success" sx={{ mb: 2 }}>{notice}</Alert>}
      {loading ? <CircularProgress /> : projects.length === 0 ? <Typography>{t('No painting invoices.', 'لا توجد فواتير دهان.')}</Typography> : (
        <Stack spacing={2}>
          {projects.map((p) => (
            <Card key={p.projectId} variant="outlined"><CardContent>
              <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                <Typography variant="h6">{p.scope} · {p.projectId}</Typography>
                <Chip size="small" label={p.status} color={p.reworkRequired ? 'warning' : 'default'} />
                {p.approvedPriceAed != null && <Chip size="small" label={`${t('Contract', 'العقد')}: AED ${p.approvedPriceAed.toLocaleString()}`} />}
              </Stack>
              <Typography variant="body2" color="text.secondary">
                {t('Property', 'العقار')}: {p.propertyId || '-'} · {t('Progress milestone', 'مرحلة التقدم')}: {p.progressMilestone ? `${p.progressMilestone.percentComplete}% (${p.progressMilestone.photoCount} ${t('photos', 'صور')})` : '-'}
                {' · '}{t('Completion', 'الإنجاز')}: {p.completionAccepted ? t('accepted by owner', 'قبله المالك') : p.reworkRequired ? t('rework requested', 'طُلبت إعادة العمل') : p.completionDocumented ? t('awaiting owner', 'بانتظار المالك') : '-'}
              </Typography>
              {p.invoices.map((inv) => {
                const nk = `${p.projectId}_${inv.stage}`;
                return (
                  <Box key={inv.stage} sx={{ mt: 1.5, p: 1.5, border: '1px solid #eee', borderRadius: 1 }}>
                    <Typography fontWeight={700}>{inv.stage} · {inv.currency} {Number(inv.amountAed).toLocaleString()} · {inv.status}</Typography>
                    {inv.proof && (
                      <Typography variant="body2">
                        {inv.proof.method}{inv.proof.chequeNo ? ` · #${inv.proof.chequeNo} ${inv.proof.bank || ''} ${inv.proof.chequeDate || ''}` : ''}
                        <Button size="small" onClick={() => openProof(inv.proof!.proofPath)}>{t('View proof', 'عرض الإثبات')}</Button>
                      </Typography>
                    )}
                    {inv.rejectionReason && <Typography variant="body2" color="error">{t('Rejected', 'مرفوض')}: {inv.rejectionReason}</Typography>}
                    {inv.status === 'PROOF_SUBMITTED' && (
                      <Stack direction={{ xs: 'column', md: 'row' }} spacing={1} sx={{ mt: 1 }}>
                        <TextField size="small" fullWidth label={t('Note (required to reject)', 'ملاحظة (مطلوبة للرفض)')} value={notes[nk] || ''} onChange={(e) => setNotes({ ...notes, [nk]: e.target.value })} />
                        <Button variant="contained" color="success" disabled={busy} onClick={() => decide(p, inv, 'APPROVE')}>{t('Approve', 'موافقة')}</Button>
                        <Button variant="outlined" color="error" disabled={busy} onClick={() => decide(p, inv, 'REJECT')}>{t('Reject', 'رفض')}</Button>
                      </Stack>
                    )}
                  </Box>
                );
              })}
            </CardContent></Card>
          ))}
        </Stack>
      )}
    </Box>
  );
}

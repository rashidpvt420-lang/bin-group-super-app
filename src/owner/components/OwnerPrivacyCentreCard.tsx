import { useCallback, useEffect, useState } from 'react';
import { MenuItem, Stack, TextField, Typography } from '@mui/material';
import { useLanguage } from '@bin/shared';
import { functions, httpsCallable } from '../../lib/firebase';
import { EmptyState, ErrorState, ListRow, StatusChip, UiButton, UiCard } from '../../components/ui';

type Centre = {
  accessLog: { id: string; action: string; actorRole: string | null; byYou: boolean; at: string | null }[];
  shares: { shareId: string; granteeEmail: string; scope: string; expiresAt: string | null; state: 'ACTIVE' | 'EXPIRED' | 'REVOKED' }[];
  corrections: { requestId: string; field: string; status: string; details: string }[];
};

/** Privacy Centre: recorded access events, data export, correction requests and time-limited sharing. */
export default function OwnerPrivacyCentreCard() {
  const { lang, isRTL } = useLanguage();
  const t = (en: string, ar: string) => (lang === 'ar' ? ar : en);
  const [data, setData] = useState<Centre | null>(null);
  const [failed, setFailed] = useState(false);
  const [msg, setMsg] = useState('');
  const [corr, setCorr] = useState({ field: 'PROFILE', details: '' });
  const [share, setShare] = useState({ granteeEmail: '', scope: 'PROPERTY_PASSPORT', expiresInDays: 7 });
  const load = useCallback(() => {
    httpsCallable(functions, 'getOwnerPrivacyCentre')({}).then((r: any) => { setData(r?.data ?? null); setFailed(false); }).catch(() => setFailed(true));
  }, []);
  useEffect(() => { load(); }, [load]);
  const run = async (name: string, payload: unknown, ok: string) => {
    setMsg('');
    try { await httpsCallable(functions, name)(payload); setMsg(ok); load(); } catch { setMsg(t('That did not go through. Check the fields and try again.', 'لم تتم العملية. تحقق من الحقول وحاول مرة أخرى.')); }
  };
  const exportData = async () => {
    setMsg('');
    try {
      const r: any = await httpsCallable(functions, 'ownerExportMyData')({});
      const url = URL.createObjectURL(new Blob([JSON.stringify(r?.data ?? {}, null, 2)], { type: 'application/json' }));
      const a = document.createElement('a'); a.href = url; a.download = 'bin-owner-data.json'; a.click(); URL.revokeObjectURL(url);
    } catch { setMsg(t('Export failed. Try again.', 'فشل التصدير. حاول مرة أخرى.')); }
  };
  const sTone = (s: string) => (s === 'ACTIVE' ? 'ok' as const : 'neutral' as const);
  const sLabel = (s: string) => ({ ACTIVE: t('Active', 'نشطة'), EXPIRED: t('Expired', 'منتهية'), REVOKED: t('Revoked', 'ملغاة') }[s] ?? s);
  return (
    <UiCard isRTL={isRTL} testId="owner-privacy-centre" label={t('Privacy Centre', 'مركز الخصوصية')}>
      {failed && <ErrorState isRTL={isRTL} title={t('Privacy Centre could not load. Refresh to retry.', 'تعذر تحميل مركز الخصوصية. حدّث الصفحة للمحاولة.')} />}
      {msg && <Typography variant="body2" sx={{ mb: 1 }}>{msg}</Typography>}
      <Typography variant="subtitle2">{t('Recorded access to your data', 'سجل الوصول إلى بياناتك')}</Typography>
      {data && data.accessLog.length === 0 && <EmptyState isRTL={isRTL} title={t('No recorded access events yet', 'لا توجد أحداث وصول مسجلة بعد')} />}
      {data?.accessLog.slice(0, 10).map((e) => <ListRow key={e.id} isRTL={isRTL} title={e.action} subtitle={`${e.byYou ? t('You', 'أنت') : e.actorRole ?? '—'} · ${e.at ?? ''}`} />)}
      <UiButton tone="outline" onClick={exportData} sx={{ my: 1 }}>{t('Download my data (JSON)', 'تنزيل بياناتي (JSON)')}</UiButton>
      <Typography variant="subtitle2" sx={{ mt: 1 }}>{t('Shares', 'المشاركات')}</Typography>
      {data?.shares.map((s) => (
        <ListRow key={s.shareId} isRTL={isRTL} title={`${s.granteeEmail} · ${s.scope}`} subtitle={s.expiresAt ?? ''}
          trailing={s.state === 'ACTIVE'
            ? <UiButton tone="outline" onClick={() => run('ownerRevokeDataShare', { shareId: s.shareId }, t('Share revoked.', 'تم إلغاء المشاركة.'))}>{t('Revoke', 'إلغاء')}</UiButton>
            : <StatusChip tone={sTone(s.state)} label={sLabel(s.state)} />} />
      ))}
      <Stack spacing={1} sx={{ mt: 1 }}>
        <TextField size="small" label={t('Share with (email)', 'المشاركة مع (البريد)')} value={share.granteeEmail} onChange={(e) => setShare({ ...share, granteeEmail: e.target.value })} />
        <TextField select size="small" label={t('What to share', 'ما تريد مشاركته')} value={share.scope} onChange={(e) => setShare({ ...share, scope: e.target.value })}>
          <MenuItem value="PROPERTY_PASSPORT">{t('Property Passport', 'جواز العقار')}</MenuItem>
          <MenuItem value="STATEMENTS">{t('Statements', 'الكشوفات')}</MenuItem>
          <MenuItem value="COMPLIANCE_CALENDAR">{t('Compliance calendar', 'تقويم الالتزامات')}</MenuItem>
        </TextField>
        <TextField size="small" type="number" inputProps={{ min: 1, max: 90 }} label={t('Expires after (days, 1–90)', 'تنتهي بعد (أيام، 1–90)')} value={share.expiresInDays} onChange={(e) => setShare({ ...share, expiresInDays: Number(e.target.value) })} />
        <UiButton disabled={!share.granteeEmail} onClick={() => run('ownerCreateDataShare', share, t('Share created.', 'تم إنشاء المشاركة.'))}>{t('Create share', 'إنشاء مشاركة')}</UiButton>
      </Stack>
      <Typography variant="subtitle2" sx={{ mt: 2 }}>{t('Ask for a correction', 'طلب تصحيح')}</Typography>
      {data?.corrections.map((c) => <ListRow key={c.requestId} isRTL={isRTL} title={c.field} subtitle={c.details} trailing={<StatusChip label={c.status} />} />)}
      <Stack spacing={1} sx={{ mt: 1 }}>
        <TextField select size="small" label={t('What is wrong', 'ما الخطأ')} value={corr.field} onChange={(e) => setCorr({ ...corr, field: e.target.value })}>
          {['PROFILE', 'PROPERTY', 'LEASE', 'PAYMENT_RECORD', 'OTHER'].map((f) => <MenuItem key={f} value={f}>{f}</MenuItem>)}
        </TextField>
        <TextField size="small" multiline minRows={2} label={t('Details', 'التفاصيل')} value={corr.details} onChange={(e) => setCorr({ ...corr, details: e.target.value })} />
        <UiButton disabled={corr.details.trim().length < 5} onClick={() => run('ownerSubmitCorrectionRequest', corr, t('Request sent to BIN.', 'تم إرسال الطلب إلى BIN.'))}>{t('Send request', 'إرسال الطلب')}</UiButton>
      </Stack>
    </UiCard>
  );
}

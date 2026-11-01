import React from 'react';
import { Alert, Button, Card, CardContent, Chip, Stack, TextField, Typography } from '@mui/material';
import { auth, collection, db, doc, functions, getDoc, getDocs, httpsCallable, limit, query, where } from '../../lib/firebase';
import { useLanguage } from '../../context/LanguageContext';

type Referral = { id: string; referredUid: string; referrerUid: string; status: string; rewardAed?: number };
const STATUS: Record<string, [string, string]> = {
  PENDING_VERIFIED_PAYMENT: ['Waiting for their first verified payment', 'بانتظار أول دفعة موثقة'],
  REWARD_APPROVED: ['Reward approved', 'تمت الموافقة على المكافأة'],
  REJECTED: ['Not approved', 'لم تتم الموافقة'],
};
const aed = (n: number) => `AED ${Number(n || 0).toLocaleString('en-AE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Owner: invite other owners. Rewards are service credit, approved by BIN GROUP Finance only. */
export default function OwnerReferralCard() {
  const { isRTL, lang } = useLanguage();
  const t = (en: string, ar: string) => (lang === 'ar' ? ar : en);
  const uid = auth.currentUser?.uid;
  const [program, setProgram] = React.useState<{ enabled: boolean; rewardAed: number } | null>(null);
  const [code, setCode] = React.useState('');
  const [sent, setSent] = React.useState<Referral[]>([]);
  const [mine, setMine] = React.useState<Referral | null>(null);
  const [entry, setEntry] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState('');
  const [notice, setNotice] = React.useState('');

  const load = React.useCallback(async () => {
    if (!uid) return;
    try {
      const [cfg, prof, out, own] = await Promise.all([
        getDoc(doc(db, 'owner_referral_program', 'config')),
        getDoc(doc(db, 'owner_referral_profiles', uid)),
        getDocs(query(collection(db, 'owner_referrals'), where('referrerUid', '==', uid), limit(100))),
        getDoc(doc(db, 'owner_referrals', uid)),
      ]);
      setProgram(cfg.exists() ? { enabled: cfg.get('enabled') === true, rewardAed: Number(cfg.get('rewardAed') || 0) } : { enabled: false, rewardAed: 0 });
      setCode(prof.exists() ? String(prof.get('code') || '') : '');
      setSent(out.docs.map((d) => ({ id: d.id, ...(d.data() as any) })));
      setMine(own.exists() ? ({ id: own.id, ...(own.data() as any) }) : null);
    } catch (e: any) {
      setError(e?.message || t('Could not load referrals.', 'تعذر تحميل الإحالات.'));
    }
  }, [uid]); // eslint-disable-line react-hooks/exhaustive-deps
  React.useEffect(() => { void load(); }, [load]);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true); setError(''); setNotice('');
    try { await fn(); await load(); } catch (e: any) { setError(e?.message || t('Something went wrong.', 'حدث خطأ.')); } finally { setBusy(false); }
  };
  const getCode = () => run(async () => {
    const res: any = await httpsCallable(functions, 'ownerGetReferralCode')({});
    setCode(String(res?.data?.code || ''));
  });
  const apply = () => run(async () => {
    await httpsCallable(functions, 'ownerApplyReferralCode')({ code: entry });
    setNotice(t('Code saved. The reward is reviewed by BIN GROUP Finance after your first verified payment.', 'تم حفظ الرمز. يراجع قسم المالية في مجموعة بن المكافأة بعد أول دفعة موثقة لك.'));
  });

  if (!program) return null;
  return (
    <Card dir={isRTL ? 'rtl' : 'ltr'} sx={{ mt: 2 }}>
      <CardContent>
        <Typography variant="h6">{t('Refer an owner', 'أحِل مالكاً')}</Typography>
        {!program.enabled ? (
          <Typography variant="body2" color="text.secondary">{t('The referral programme is not open right now.', 'برنامج الإحالة غير متاح حالياً.')}</Typography>
        ) : (
          <Stack spacing={1.5} sx={{ mt: 1 }}>
            <Typography variant="body2">
              {t(`When an owner you invite makes their first verified payment, BIN GROUP Finance can approve ${aed(program.rewardAed)} service credit for you.`,
                `عندما يقوم مالك دعوته بأول دفعة موثقة، يمكن لقسم المالية في مجموعة بن اعتماد رصيد خدمات بقيمة ${aed(program.rewardAed)} لك.`)}
            </Typography>
            {code ? (
              <Chip label={code} color="primary" sx={{ alignSelf: 'flex-start', fontWeight: 700, letterSpacing: 1 }} />
            ) : (
              <Button variant="outlined" disabled={busy} onClick={getCode} sx={{ alignSelf: 'flex-start' }}>{t('Get my code', 'احصل على رمزي')}</Button>
            )}
            {sent.map((r) => (
              <Typography key={r.id} variant="body2">
                {t('Invited owner', 'مالك مدعو')}: {(STATUS[r.status] || [r.status, r.status])[lang === 'ar' ? 1 : 0]}
                {r.status === 'REWARD_APPROVED' && r.rewardAed ? ` - ${aed(r.rewardAed)}` : ''}
              </Typography>
            ))}
            {!mine && (
              <Stack direction="row" spacing={1}>
                <TextField size="small" label={t('Have a code?', 'لديك رمز؟')} value={entry} onChange={(e) => setEntry(e.target.value)} />
                <Button variant="contained" disabled={busy || !entry.trim()} onClick={apply}>{t('Apply', 'تطبيق')}</Button>
              </Stack>
            )}
          </Stack>
        )}
        {error && <Alert severity="error" sx={{ mt: 1 }}>{error}</Alert>}
        {notice && <Alert severity="success" sx={{ mt: 1 }}>{notice}</Alert>}
      </CardContent>
    </Card>
  );
}

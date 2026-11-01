import { useCallback, useEffect, useState } from 'react';
import { Alert, Checkbox, FormControlLabel, MenuItem, Stack, TextField, Typography } from '@mui/material';
import { useLanguage } from '@bin/shared';
import { functions, httpsCallable } from '../../lib/firebase';
import { EmptyState, ListRow, StatusChip, UiButton, UiCard } from '../../components/ui';

type Authority = { id: string; type: string; holderName: string; holderEmail: string; scope: string; permissions: string[]; expiresAtMs: number | null; state: 'ACTIVE' | 'EXPIRED' | 'REVOKED' };
const PERMS: [string, string, string][] = [
  ['VIEW_STATEMENTS', 'View statements', 'عرض الكشوف'], ['VIEW_MAINTENANCE', 'View maintenance', 'عرض الصيانة'],
  ['REQUEST_MAINTENANCE', 'Request maintenance', 'طلب صيانة'], ['MANAGE_TENANTS', 'Manage tenants', 'إدارة المستأجرين'], ['DISCUSS_LEASES', 'Discuss leases', 'مناقشة العقود'],
];

/** Owner Authority Register: PoA / management agreement records with scope, permissions, expiry and history. */
export default function OwnerAuthorityRegisterCard() {
  const { lang, isRTL } = useLanguage();
  const t = (en: string, ar: string) => (lang === 'ar' ? ar : en);
  const [list, setList] = useState<Authority[] | null>(null);
  const [form, setForm] = useState({ type: 'POWER_OF_ATTORNEY', holderName: '', holderEmail: '', scope: '', expiresOn: '', permissions: [] as string[] });
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const load = useCallback(() => {
    httpsCallable(functions, 'getOwnerAuthorityRegister')({}).then((r: any) => setList(r?.data?.authorities ?? [])).catch(() => setMsg({ ok: false, text: t('Could not load the register.', 'تعذر تحميل السجل.') }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(load, [load]);
  const grant = async () => {
    setMsg(null);
    try { await httpsCallable(functions, 'ownerGrantAuthority')(form); setMsg({ ok: true, text: t('Recorded.', 'تم التسجيل.') }); load(); } catch (e: any) { setMsg({ ok: false, text: e?.message || '' }); }
  };
  const revoke = async (authorityId: string) => {
    try { await httpsCallable(functions, 'ownerRevokeAuthority')({ authorityId }); load(); } catch (e: any) { setMsg({ ok: false, text: e?.message || '' }); }
  };
  const tone = (s: string) => (s === 'ACTIVE' ? 'ok' : s === 'EXPIRED' ? 'warn' : 'neutral');
  return (
    <UiCard isRTL={isRTL} testId="owner-authority-register" label={t('Authority register', 'سجل التفويضات')}>
      <Stack spacing={1.5}>
        <Typography variant="caption" color="text.secondary">{t('Your own records of who may act for you. The platform does not verify legal validity.', 'سجلاتك لمن يحق له التصرف نيابة عنك. المنصة لا تتحقق من الصلاحية القانونية.')}</Typography>
        {list && list.length === 0 && <EmptyState isRTL={isRTL} title={t('No authorities recorded', 'لا توجد تفويضات مسجلة')} />}
        {list?.map((a) => (
          <ListRow key={a.id} isRTL={isRTL} title={`${a.holderName} · ${a.type === 'POWER_OF_ATTORNEY' ? t('Power of Attorney', 'وكالة') : t('Management agreement', 'اتفاقية إدارة')}`}
            subtitle={`${a.scope} · ${a.expiresAtMs ? new Date(a.expiresAtMs).toLocaleDateString(lang === 'ar' ? 'ar-AE' : 'en-AE') : ''}`}
            trailing={<Stack direction="row" spacing={1}><StatusChip tone={tone(a.state)} label={a.state === 'ACTIVE' ? t('Active', 'سارية') : a.state === 'EXPIRED' ? t('Expired', 'منتهية') : t('Revoked', 'ملغاة')} />{a.state === 'ACTIVE' && <UiButton tone="outline" size="small" onClick={() => revoke(a.id)}>{t('Revoke', 'إلغاء')}</UiButton>}</Stack>} />
        ))}
        <TextField select size="small" label={t('Type', 'النوع')} value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
          <MenuItem value="POWER_OF_ATTORNEY">{t('Power of Attorney', 'وكالة')}</MenuItem>
          <MenuItem value="MANAGEMENT_AGREEMENT">{t('Management agreement', 'اتفاقية إدارة')}</MenuItem>
        </TextField>
        <TextField size="small" label={t('Holder name', 'اسم المفوَّض')} value={form.holderName} onChange={(e) => setForm({ ...form, holderName: e.target.value })} />
        <TextField size="small" label={t('Holder email', 'بريد المفوَّض')} value={form.holderEmail} onChange={(e) => setForm({ ...form, holderEmail: e.target.value })} />
        <TextField size="small" label={t('Scope', 'النطاق')} value={form.scope} onChange={(e) => setForm({ ...form, scope: e.target.value })} />
        <TextField size="small" type="date" label={t('Expires on', 'تاريخ الانتهاء')} InputLabelProps={{ shrink: true }} value={form.expiresOn} onChange={(e) => setForm({ ...form, expiresOn: e.target.value })} />
        <Stack direction="row" flexWrap="wrap">
          {PERMS.map(([k, en, ar]) => (
            <FormControlLabel key={k} label={t(en, ar)} control={<Checkbox size="small" checked={form.permissions.includes(k)} onChange={(e) => setForm({ ...form, permissions: e.target.checked ? [...form.permissions, k] : form.permissions.filter((p) => p !== k) })} />} />
          ))}
        </Stack>
        <UiButton tone="primary" onClick={grant}>{t('Record authority', 'تسجيل التفويض')}</UiButton>
        {msg && <Alert severity={msg.ok ? 'success' : 'error'}>{msg.text}</Alert>}
      </Stack>
    </UiCard>
  );
}

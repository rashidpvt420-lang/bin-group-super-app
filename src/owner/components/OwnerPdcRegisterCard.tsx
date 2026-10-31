import { useEffect, useState } from 'react';
import { Alert, Box, Chip, MenuItem, Paper, Stack, TextField, Typography } from '@mui/material';
import { useLanguage } from '@bin/shared';
import { functions, httpsCallable } from '../../lib/firebase';
import { CHECKLIST_DISCLAIMER, EMIRATE_CHECKLISTS } from '../data/emirateLeaseChecklists';

type Cheque = { installmentId: string; chequeNumber: string; amount: number; dueDate: string; chequeStatus: string; maturity: string; bounceCount: number };

const STATUS: Record<string, [string, string]> = {
  PENDING: ['Not yet deposited', 'لم يُودع بعد'], DEPOSITED: ['Deposited', 'تم الإيداع'], CLEARED: ['Cleared', 'تم التحصيل'],
  BOUNCED: ['Bounced', 'مرتجع'], REPLACED: ['Replaced', 'تم الاستبدال'],
};
const MATURITY: Record<string, [string, string]> = {
  PAST_DUE: ['Past date', 'تجاوز التاريخ'], THIS_WEEK: ['This week', 'هذا الأسبوع'], THIS_MONTH: ['This month', 'هذا الشهر'],
  NEXT_90_DAYS: ['Next 90 days', 'خلال 90 يوماً'], LATER: ['Later', 'لاحقاً'], UNKNOWN: ['Unknown', 'غير معروف'],
};

/** Owner post-dated cheque register (getPdcRegister) plus non-official emirate lease checklists. */
export default function OwnerPdcRegisterCard() {
  const { lang } = useLanguage();
  const ar = lang === 'ar';
  const pick = (pair: [string, string] | undefined, fallback: string) => (pair ? pair[ar ? 1 : 0] : fallback);
  const [cheques, setCheques] = useState<Cheque[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [emirate, setEmirate] = useState('DUBAI');
  useEffect(() => {
    httpsCallable(functions, 'getPdcRegister')({})
      .then((res: any) => setCheques(res?.data?.cheques || []))
      .catch(() => setFailed(true));
  }, []);
  const list = EMIRATE_CHECKLISTS.find((e) => e.emirate === emirate) || EMIRATE_CHECKLISTS[0];
  return (
    <Paper sx={{ p: 3, mb: 4, borderRadius: 4 }} dir={ar ? 'rtl' : 'ltr'}>
      <Typography variant="h6" fontWeight={900} sx={{ mb: 2 }}>{ar ? 'سجل الشيكات المؤجلة' : 'Post-dated cheque register'}</Typography>
      {failed && <Alert severity="warning" sx={{ mb: 2 }}>{ar ? 'تعذر تحميل سجل الشيكات.' : 'The cheque register could not load.'}</Alert>}
      {cheques === null && !failed && <Typography variant="body2">…</Typography>}
      {cheques?.length === 0 && <Typography variant="body2">{ar ? 'لا توجد شيكات مسجلة.' : 'No cheques on record.'}</Typography>}
      <Stack spacing={1} sx={{ mb: 3 }}>
        {cheques?.map((c) => (
          <Stack key={c.installmentId} direction="row" spacing={1} alignItems="center" justifyContent="space-between">
            <Typography variant="body2">#{c.chequeNumber} · {c.dueDate} · AED {c.amount.toLocaleString(ar ? 'ar-AE' : 'en-AE')}</Typography>
            <Stack direction="row" spacing={1}>
              <Chip size="small" label={pick(MATURITY[c.maturity], c.maturity)} />
              <Chip size="small" color={c.chequeStatus === 'BOUNCED' ? 'error' : c.chequeStatus === 'CLEARED' ? 'success' : 'default'} label={pick(STATUS[c.chequeStatus], c.chequeStatus)} />
            </Stack>
          </Stack>
        ))}
      </Stack>
      <Typography variant="subtitle1" fontWeight={900}>{ar ? 'قائمة تحقق عقد الإيجار حسب الإمارة' : 'Lease checklist by emirate'}</Typography>
      <Alert severity="info" sx={{ my: 1 }}>{ar ? CHECKLIST_DISCLAIMER.ar : CHECKLIST_DISCLAIMER.en}</Alert>
      <TextField select size="small" value={emirate} onChange={(e) => setEmirate(e.target.value)} sx={{ mb: 1, minWidth: 200 }}>
        {EMIRATE_CHECKLISTS.map((e) => <MenuItem key={e.emirate} value={e.emirate}>{ar ? e.ar : e.en}</MenuItem>)}
      </TextField>
      <Box component="ul" sx={{ m: 0, ps: 3 }}>
        {list.items.map((i) => <li key={i.en}><Typography variant="body2">{ar ? i.ar : i.en}</Typography></li>)}
      </Box>
    </Paper>
  );
}

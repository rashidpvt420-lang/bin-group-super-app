import { useState } from 'react';
import { Box, Button, Stack, Typography } from '@mui/material';
import { useLanguage } from '@bin/shared';
import { functions, httpsCallable } from '../../lib/firebase';

type Ledger = {
  asOf: string;
  rent: { dueOpen: number; receivedVerified: number };
  chequeMaturities: { dueDate: string; amount: number; chequeNumber: string; overdue: boolean }[];
  outstandingInvoices: { total: number };
  maintenanceSpendVerified: number;
  approvedQuotes: { count: number; estimateBandTotal: number };
  noiVerified: number;
};

/**
 * Per-property owner ledger (getOwnerPropertyLedger). Loaded on demand; verified records only.
 * Approved quotes are shown as estimates and are never counted in net income.
 */
export default function OwnerPropertyLedgerCard({ propertyId }: { propertyId: string }) {
  const { lang } = useLanguage();
  const ar = lang === 'ar';
  const t = (en: string, arText: string) => (ar ? arText : en);
  const [data, setData] = useState<Ledger | null>(null);
  const [state, setState] = useState<'idle' | 'loading' | 'error'>('idle');
  const aed = (n: number) => `AED ${Number(n || 0).toLocaleString(ar ? 'ar-AE' : 'en-AE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const load = () => {
    setState('loading');
    httpsCallable(functions, 'getOwnerPropertyLedger')({ propertyId })
      .then((res: any) => { setData(res?.data || null); setState('idle'); })
      .catch(() => { setData(null); setState('error'); });
  };
  if (!data) {
    return (
      <Box sx={{ mb: 2 }} dir={ar ? 'rtl' : 'ltr'}>
        <Button size="small" variant="text" onClick={load} disabled={state === 'loading'} sx={{ color: '#D4AF37', fontWeight: 800 }}>
          {state === 'loading' ? '…' : t('Show property ledger', 'عرض دفتر العقار')}
        </Button>
        {state === 'error' && <Typography variant="caption" sx={{ color: '#f87171', display: 'block' }}>{t('The ledger could not load. Nothing is shown as zero until it does.', 'تعذر تحميل الدفتر. لن يظهر أي رقم كصفر حتى يتم التحميل.')}</Typography>}
      </Box>
    );
  }
  const row = (label: string, value: string) => (
    <Stack direction="row" justifyContent="space-between"><Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.6)' }}>{label}</Typography><Typography variant="caption" sx={{ color: '#FFF', fontWeight: 800 }}>{value}</Typography></Stack>
  );
  return (
    <Box sx={{ mb: 2, p: 1.5, borderRadius: 2, border: '1px solid rgba(255,255,255,0.08)' }} dir={ar ? 'rtl' : 'ltr'}>
      <Typography variant="caption" sx={{ color: '#D4AF37', fontWeight: 900, display: 'block', mb: 1 }}>{t('Property ledger (verified records only)', 'دفتر العقار (سجلات موثقة فقط)')} · {data.asOf}</Typography>
      {row(t('Rent received (verified)', 'الإيجار المستلم (موثق)'), aed(data.rent.receivedVerified))}
      {row(t('Rent still due', 'الإيجار المستحق'), aed(data.rent.dueOpen))}
      {row(t('Outstanding invoices', 'فواتير غير مسددة'), aed(data.outstandingInvoices.total))}
      {row(t('Maintenance spend (verified)', 'مصاريف الصيانة (موثقة)'), aed(data.maintenanceSpendVerified))}
      {row(t('Net income (verified)', 'صافي الدخل (موثق)'), aed(data.noiVerified))}
      {row(`${t('Approved quotes — estimate, not spent', 'عروض معتمدة — تقدير وليست مصروفة')} (${data.approvedQuotes.count})`, aed(data.approvedQuotes.estimateBandTotal))}
      <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.6)', display: 'block', mt: 1 }}>{t('Cheques maturing in 90 days', 'شيكات تستحق خلال 90 يوماً')}</Typography>
      {data.chequeMaturities.length === 0
        ? <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)' }}>{t('None', 'لا يوجد')}</Typography>
        : data.chequeMaturities.map((c) => row(`#${c.chequeNumber} · ${c.dueDate}${c.overdue ? ` · ${t('overdue', 'متأخر')}` : ''}`, aed(c.amount)))}
    </Box>
  );
}

import { useState } from 'react';
import { Alert, Box, Button, Card, CardContent, MenuItem, Stack, TextField, Typography } from '@mui/material';
import { functions, httpsCallable } from '../lib/firebase';
import { useLanguage } from '../context/LanguageContext';

type StatementResponse = {
  documentId: string;
  format: 'pdf' | 'csv';
  fileName: string;
  contentType: string;
  base64: string;
  sha256: string;
  verifyUrl: string;
};

function dubaiToday(): string {
  return new Date(Date.now() + 4 * 3600 * 1000).toISOString().slice(0, 10);
}

function downloadBase64(base64: string, contentType: string, fileName: string) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  const url = URL.createObjectURL(new Blob([bytes], { type: contentType }));
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.rel = 'noopener';
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/**
 * Official, server-issued statement of the signed-in user's own money records (PDF or CSV,
 * English or Arabic). The server always uses the caller's own account, stamps the document and
 * registers its fingerprint so it can be checked at /verify/document.
 */
export default function MoneyStatementDownload({ title, compact = false }: { title?: string; compact?: boolean }) {
  const { phrase, lang, isRTL } = useLanguage();
  const today = dubaiToday();
  const [from, setFrom] = useState(`${today.slice(0, 4)}-01-01`);
  const [to, setTo] = useState(today);
  const [format, setFormat] = useState<'pdf' | 'csv'>('pdf');
  const [language, setLanguage] = useState<'en' | 'ar'>(lang === 'ar' ? 'ar' : 'en');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [issued, setIssued] = useState<StatementResponse | null>(null);
  const heading = title && title !== 'Official statement' ? title : phrase('Official statement', 'البيان الرسمي');

  const download = async () => {
    setBusy(true);
    setError('');
    try {
      const call = httpsCallable<{ from: string; to: string; format: string; language: string }, StatementResponse>(functions, 'generateMyMoneyStatement');
      const { data } = await call({ from, to, format, language });
      downloadBase64(data.base64, data.contentType, data.fileName);
      setIssued(data);
    } catch (err: any) {
      setError(err?.message || phrase('Statement could not be generated.', 'تعذر إنشاء البيان.'));
    } finally {
      setBusy(false);
    }
  };

  const body = (
    <Stack spacing={1.5} data-testid="money-statement-download" dir={isRTL ? 'rtl' : 'ltr'} lang={lang === 'ar' ? 'ar' : 'en'}>
      {!compact && <Typography variant="h6" fontWeight={800}>{heading}</Typography>}
      {!compact && (
        <Typography variant="body2" color="text.secondary">
          {phrase('Stamped BIN GROUP statement of your own invoices, payments, receipts, cash/cheque records and payouts. Voided records are shown as void.', 'بيان مجموعة بن الرسمي لفواتيرك ومدفوعاتك وإيصالاتك وسجلات النقد والشيكات والمبالغ المدفوعة. تظهر السجلات الملغاة كملغاة.')}
        </Typography>
      )}
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
        <TextField size="small" type="date" label={phrase('From', 'من')} value={from} onChange={(e) => setFrom(e.target.value)} InputLabelProps={{ shrink: true }} />
        <TextField size="small" type="date" label={phrase('To', 'إلى')} value={to} onChange={(e) => setTo(e.target.value)} InputLabelProps={{ shrink: true }} />
        <TextField size="small" select label={phrase('Format', 'الصيغة')} value={format} onChange={(e) => setFormat(e.target.value as 'pdf' | 'csv')}>
          <MenuItem value="pdf">PDF</MenuItem>
          <MenuItem value="csv">CSV</MenuItem>
        </TextField>
        <TextField size="small" select label={phrase('Language', 'اللغة')} value={language} onChange={(e) => setLanguage(e.target.value as 'en' | 'ar')}>
          <MenuItem value="en">English</MenuItem>
          <MenuItem value="ar">العربية</MenuItem>
        </TextField>
        <Button variant="contained" disabled={busy || !from || !to} onClick={download} data-testid="money-statement-download-button">
          {busy ? phrase('Preparing…', 'جارٍ التحضير…') : phrase('Download statement', 'تنزيل البيان')}
        </Button>
      </Stack>
      {error && <Alert severity="error">{error}</Alert>}
      {issued && (
        <Alert severity="success">
          {phrase('Statement issued.', 'تم إصدار البيان.')} {issued.documentId}. {phrase('Anyone you share it with can check it at', 'يمكن لأي شخص تشاركه معه التحقق منه على')} <a href={issued.verifyUrl}>{issued.verifyUrl}</a>.
        </Alert>
      )}
    </Stack>
  );

  if (compact) return <Box>{body}</Box>;
  return <Card variant="outlined" sx={{ borderRadius: 3 }}><CardContent>{body}</CardContent></Card>;
}

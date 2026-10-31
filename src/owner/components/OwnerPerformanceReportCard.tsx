import { useState } from 'react';
import { Alert, Button, Card, CardContent, MenuItem, Stack, TextField, Typography } from '@mui/material';
import { functions, httpsCallable } from '../../lib/firebase';

type ReportResponse = {
  documentId: string; fileName: string; contentType: string; base64: string; sha256: string; verifyUrl: string;
  summary: { hasAnyData: boolean };
};

const T = {
  en: {
    title: 'Monthly performance report', intro: 'Stamped PDF of your own rental income, costs, occupancy and repairs for one month. Only your recorded data is used; empty sections say so.',
    month: 'Month', language: 'Report language', download: 'Download report', busy: 'Preparing…', fail: 'Report could not be generated.',
    done: 'Report issued. It can be checked at', empty: 'No records were found for this month, so the report shows empty sections.',
  },
  ar: {
    title: 'تقرير الأداء الشهري', intro: 'ملف PDF مختوم لإيرادات الإيجار والتكاليف والإشغال والإصلاحات الخاصة بك لشهر واحد. تُستخدم بياناتك المسجلة فقط.',
    month: 'الشهر', language: 'لغة التقرير', download: 'تنزيل التقرير', busy: 'جارٍ التحضير…', fail: 'تعذر إنشاء التقرير.',
    done: 'تم إصدار التقرير. يمكن التحقق منه عبر', empty: 'لا توجد سجلات لهذا الشهر، لذلك تظهر أقسام التقرير فارغة.',
  },
};

function previousMonth(): string {
  const d = new Date(Date.now() + 4 * 3600 * 1000);
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() - 1);
  return d.toISOString().slice(0, 7);
}

function downloadBase64(base64: string, contentType: string, fileName: string) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  const url = URL.createObjectURL(new Blob([bytes], { type: contentType }));
  const link = document.createElement('a');
  link.href = url; link.download = fileName; link.rel = 'noopener';
  document.body.appendChild(link); link.click(); link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/** Owner dashboard card: downloads the server-generated, QR-verifiable monthly report for the signed-in owner only. */
export default function OwnerPerformanceReportCard() {
  const [month, setMonth] = useState(previousMonth());
  const [language, setLanguage] = useState<'en' | 'ar'>('en');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [issued, setIssued] = useState<ReportResponse | null>(null);
  const t = T[language];

  const download = async () => {
    setBusy(true); setError('');
    try {
      const call = httpsCallable<{ month: string; language: string }, ReportResponse>(functions, 'generateMyOwnerPerformanceReport');
      const { data } = await call({ month, language });
      downloadBase64(data.base64, data.contentType, data.fileName);
      setIssued(data);
    } catch (err: any) {
      setError(err?.message || t.fail);
    } finally { setBusy(false); }
  };

  return (
    <Card variant="outlined" sx={{ borderRadius: 3 }} data-testid="owner-performance-report-card">
      <CardContent>
        <Stack spacing={1.5} dir={language === 'ar' ? 'rtl' : 'ltr'}>
          <Typography variant="h6" fontWeight={800} color="text.primary">{t.title}</Typography>
          <Typography variant="body2" color="text.primary">{t.intro}</Typography>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
            <TextField size="small" type="month" label={t.month} value={month} onChange={(e) => setMonth(e.target.value)} InputLabelProps={{ shrink: true }} inputProps={{ 'data-testid': 'owner-report-month' }} />
            <TextField size="small" select label={t.language} value={language} onChange={(e) => setLanguage(e.target.value as 'en' | 'ar')}>
              <MenuItem value="en">English</MenuItem>
              <MenuItem value="ar">العربية</MenuItem>
            </TextField>
            <Button variant="contained" disabled={busy || !/^\d{4}-\d{2}$/.test(month)} onClick={download} data-testid="owner-report-download-button">
              {busy ? t.busy : t.download}
            </Button>
          </Stack>
          {error && <Alert severity="error">{error}</Alert>}
          {issued && !issued.summary?.hasAnyData && <Alert severity="info">{t.empty}</Alert>}
          {issued && <Alert severity="success">{t.done} <a href={issued.verifyUrl}>{issued.verifyUrl}</a> ({issued.documentId})</Alert>}
        </Stack>
      </CardContent>
    </Card>
  );
}

import { useState } from 'react';
import { Alert, Box, Button, Card, CardContent, MenuItem, Stack, TextField, Typography } from '@mui/material';
import { functions, httpsCallable } from '../lib/firebase';

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
export default function MoneyStatementDownload({ title = 'Official statement', compact = false }: { title?: string; compact?: boolean }) {
  const today = dubaiToday();
  const [from, setFrom] = useState(`${today.slice(0, 4)}-01-01`);
  const [to, setTo] = useState(today);
  const [format, setFormat] = useState<'pdf' | 'csv'>('pdf');
  const [language, setLanguage] = useState<'en' | 'ar'>('en');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [issued, setIssued] = useState<StatementResponse | null>(null);

  const download = async () => {
    setBusy(true);
    setError('');
    try {
      const call = httpsCallable<{ from: string; to: string; format: string; language: string }, StatementResponse>(functions, 'generateMyMoneyStatement');
      const { data } = await call({ from, to, format, language });
      downloadBase64(data.base64, data.contentType, data.fileName);
      setIssued(data);
    } catch (err: any) {
      setError(err?.message || 'Statement could not be generated.');
    } finally {
      setBusy(false);
    }
  };

  const body = (
    <Stack spacing={1.5} data-testid="money-statement-download">
      {!compact && <Typography variant="h6" fontWeight={800}>{title}</Typography>}
      {!compact && (
        <Typography variant="body2" color="text.secondary">
          Stamped BIN GROUP statement of your own invoices, payments, receipts, cash/cheque records and payouts. Voided records are shown as void.
        </Typography>
      )}
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
        <TextField size="small" type="date" label="From" value={from} onChange={(e) => setFrom(e.target.value)} InputLabelProps={{ shrink: true }} />
        <TextField size="small" type="date" label="To" value={to} onChange={(e) => setTo(e.target.value)} InputLabelProps={{ shrink: true }} />
        <TextField size="small" select label="Format" value={format} onChange={(e) => setFormat(e.target.value as 'pdf' | 'csv')}>
          <MenuItem value="pdf">PDF</MenuItem>
          <MenuItem value="csv">CSV</MenuItem>
        </TextField>
        <TextField size="small" select label="Language" value={language} onChange={(e) => setLanguage(e.target.value as 'en' | 'ar')}>
          <MenuItem value="en">English</MenuItem>
          <MenuItem value="ar">العربية</MenuItem>
        </TextField>
        <Button variant="contained" disabled={busy || !from || !to} onClick={download} data-testid="money-statement-download-button">
          {busy ? 'Preparing…' : 'Download statement'}
        </Button>
      </Stack>
      {error && <Alert severity="error">{error}</Alert>}
      {issued && (
        <Alert severity="success">
          Statement {issued.documentId} issued. Anyone you share it with can check it at <a href={issued.verifyUrl}>{issued.verifyUrl}</a>.
        </Alert>
      )}
    </Stack>
  );

  if (compact) return <Box>{body}</Box>;
  return <Card variant="outlined" sx={{ borderRadius: 3 }}><CardContent>{body}</CardContent></Card>;
}

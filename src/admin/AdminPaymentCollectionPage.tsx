import { useState } from 'react';
import { Alert, Box, Button, MenuItem, Stack, TextField, Typography } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { functions, httpsCallable } from '../lib/firebase';

const MAX_PROOF_BYTES = 5 * 1024 * 1024;

const fileToBase64 = (file: File) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result || '').split(',')[1] || '');
  reader.onerror = () => reject(reader.error);
  reader.readAsDataURL(file);
});

/** Finance admin (MFA) form: record a cash/cheque payment that was collected. Server validates everything. */
export default function AdminPaymentCollectionPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ payerUid: '', targetType: 'contract', targetId: '', amount: '', method: 'cheque', collectedOn: '', chequeNumber: '', collectedBy: '' });
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [idempotencyKey] = useState(() => `pc_${crypto.randomUUID()}`);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async () => {
    setResult(null);
    if (!file) { setResult({ ok: false, text: 'Attach the proof (PDF, JPEG or PNG).' }); return; }
    if (file.size > MAX_PROOF_BYTES) { setResult({ ok: false, text: 'Proof must be 5 MB or smaller.' }); return; }
    setBusy(true);
    try {
      const call = httpsCallable(functions, 'financeRecordPaymentCollection');
      const res: any = await call({ ...form, idempotencyKey, proof: { contentType: file.type, base64: await fileToBase64(file) } });
      setResult({ ok: true, text: res?.data?.duplicate ? 'Already recorded (no duplicate created).' : `Recorded. Reference ${res?.data?.recordId}.` });
    } catch (error: any) {
      setResult({ ok: false, text: String(error?.message || 'Could not record this payment.') });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Box sx={{ mb: 3 }}>
      <Button size="small" onClick={() => navigate('/admin')}>Back</Button>
      <Typography variant="h6" sx={{ fontWeight: 800, mt: 1 }}>Record cash / cheque collection</Typography>
      <Alert severity="info" sx={{ my: 1.5 }}>Finance admins with MFA only. Records are permanent; mistakes are corrected with a void entry. Card payments are off.</Alert>
      <Stack spacing={1.5} sx={{ maxWidth: 520 }}>
        <TextField label="Payer user ID" value={form.payerUid} onChange={set('payerUid')} required />
        <TextField select label="For" value={form.targetType} onChange={set('targetType')}>
          <MenuItem value="contract">Contract</MenuItem>
          <MenuItem value="invoice">Invoice</MenuItem>
        </TextField>
        <TextField label="Contract / invoice ID" value={form.targetId} onChange={set('targetId')} required />
        <TextField label="Amount (AED)" value={form.amount} onChange={set('amount')} inputProps={{ inputMode: 'decimal' }} required />
        <TextField select label="Method" value={form.method} onChange={set('method')}>
          <MenuItem value="cheque">Cheque</MenuItem>
          <MenuItem value="cash">Cash</MenuItem>
        </TextField>
        <TextField type="date" label="Collected on" value={form.collectedOn} onChange={set('collectedOn')} InputLabelProps={{ shrink: true }} required />
        {form.method === 'cheque' && <TextField label="Cheque number (optional)" value={form.chequeNumber} onChange={set('chequeNumber')} />}
        <TextField label="Collected by" value={form.collectedBy} onChange={set('collectedBy')} required />
        <Button variant="outlined" component="label">
          {file ? `Proof: ${file.name}` : 'Attach proof (required)'}
          <input hidden type="file" accept="application/pdf,image/jpeg,image/png" onChange={(e) => setFile(e.target.files?.[0] || null)} />
        </Button>
        {result && <Alert severity={result.ok ? 'success' : 'error'}>{result.text}</Alert>}
        <Button variant="contained" disabled={busy} onClick={() => void submit()}>{busy ? 'Recording…' : 'Record collection'}</Button>
      </Stack>
    </Box>
  );
}

import { useState } from 'react';
import { Alert, Box, Button, Container, Paper, Stack, TextField, Typography } from '@mui/material';
import { useParams } from 'react-router-dom';
import { functions, httpsCallable } from '../../lib/firebase';

type VerifyResult = {
  found: boolean;
  documentId: string;
  issuer?: string;
  documentType?: string;
  format?: string;
  issuedAt?: string;
  periodFrom?: string | null;
  periodTo?: string | null;
  status?: string;
  hashChecked?: boolean;
  hashMatches?: boolean | null;
};

async function sha256Hex(file: File): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Public check for BIN GROUP issued statements and contracts. The file never leaves the device:
 * only its SHA-256 fingerprint and the printed document ID are sent to verifyIssuedDocument.
 */
export default function DocumentVerificationPage() {
  const { id } = useParams();
  const [documentId, setDocumentId] = useState(id || '');
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<VerifyResult | null>(null);

  const verify = async () => {
    setBusy(true);
    setError('');
    setResult(null);
    try {
      const sha256 = file ? await sha256Hex(file) : '';
      const call = httpsCallable<{ documentId: string; sha256?: string }, VerifyResult>(functions, 'verifyIssuedDocument');
      const { data } = await call({ documentId: documentId.trim(), ...(sha256 ? { sha256 } : {}) });
      setResult(data);
    } catch (err: any) {
      setError(err?.message || 'Verification failed.');
    } finally {
      setBusy(false);
    }
  };

  const genuine = Boolean(result?.found && result.hashMatches === true);
  return (
    <Container maxWidth="sm" sx={{ py: 6 }}>
      <Paper sx={{ p: 4, borderRadius: 4 }}>
        <Typography variant="h5" fontWeight={800} gutterBottom>Verify a BIN GROUP document</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
          Enter the document ID printed next to the QR code and choose the file you received. The file stays on your device; only its fingerprint is checked.
          {' '}تحقق من مستند صادر عن مجموعة بن.
        </Typography>
        <Stack spacing={2}>
          <TextField label="Document ID" value={documentId} onChange={(e) => setDocumentId(e.target.value)} placeholder="stmt_… or ctr_…" />
          <Button variant="outlined" component="label">
            {file ? file.name : 'Choose PDF / CSV file (optional)'}
            <input hidden type="file" accept=".pdf,.csv,application/pdf,text/csv" onChange={(e) => setFile(e.target.files?.[0] || null)} />
          </Button>
          <Button variant="contained" disabled={busy || !documentId.trim()} onClick={verify} data-testid="verify-document-button">
            {busy ? 'Checking…' : 'Verify'}
          </Button>
          {error && <Alert severity="error">{error}</Alert>}
          {result && !result.found && <Alert severity="error">No document with this ID was issued by BIN GROUP.</Alert>}
          {result?.found && (
            <Alert severity={genuine ? 'success' : result.hashChecked ? 'error' : 'info'}>
              <Box>
                {genuine && <strong>Genuine: this file matches the document BIN GROUP issued.</strong>}
                {result.hashChecked && result.hashMatches === false && <strong>This file does NOT match the issued document. It may have been changed.</strong>}
                {!result.hashChecked && <strong>This ID was issued by BIN GROUP. Choose the file to confirm it has not been changed.</strong>}
                <div>{result.documentType} · {result.issuer}</div>
                <div>Issued: {result.issuedAt}</div>
                {result.periodFrom && <div>Period: {result.periodFrom} – {result.periodTo}</div>}
                <div>Status: {result.status}</div>
              </Box>
            </Alert>
          )}
        </Stack>
      </Paper>
    </Container>
  );
}

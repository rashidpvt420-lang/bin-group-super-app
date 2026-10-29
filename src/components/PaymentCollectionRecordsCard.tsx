import { useEffect, useState } from 'react';
import { Alert, Box, Button, Card, CardContent, Chip, Stack, Typography } from '@mui/material';
import { auth, collection, db, doc, getDoc, getDocs, getDownloadURL, query, ref, storage, where } from '../lib/firebase';

export type CollectionRecordRow = {
  id: string;
  amount: number;
  method: string;
  collectedOn: string;
  chequeNumber: string | null;
  proofPath: string;
  voidReason: string | null;
};

export const PAID_BY_FINANCE_LABEL = 'Paid – collected by finance';

export function formatAed(amount: number): string {
  return `AED ${Number(amount || 0).toLocaleString('en-AE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** Payer-only view of cash/cheque payments that BIN GROUP finance recorded as collected. */
export default function PaymentCollectionRecordsCard() {
  const [rows, setRows] = useState<CollectionRecordRow[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid) return undefined;
    let cancelled = false;
    (async () => {
      try {
        const snap = await getDocs(query(collection(db, 'payment_collection_records'), where('payerUid', '==', uid)));
        const list = await Promise.all(snap.docs.map(async (d) => {
          const data = d.data();
          const voidSnap = await getDoc(doc(db, 'payment_collection_voids', d.id)).catch(() => null);
          return {
            id: d.id,
            amount: Number(data.amount || 0),
            method: String(data.method || ''),
            collectedOn: String(data.collectedOn || ''),
            chequeNumber: data.chequeNumber ? String(data.chequeNumber) : null,
            proofPath: String(data.proofPath || ''),
            voidReason: voidSnap?.exists() ? String(voidSnap.data()?.reason || 'Voided') : null,
          };
        }));
        if (!cancelled) setRows(list.sort((a, b) => b.collectedOn.localeCompare(a.collectedOn)));
      } catch {
        if (!cancelled) setError('Payment records could not be loaded right now.');
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const openProof = async (path: string) => {
    try {
      window.open(await getDownloadURL(ref(storage, path)), '_blank', 'noopener');
    } catch {
      setError('The proof file could not be opened.');
    }
  };

  if (!rows.length && !error) return null;
  return (
    <Card sx={{ mb: 2, borderRadius: 3 }}>
      <CardContent>
        <Typography variant="subtitle1" sx={{ fontWeight: 800, mb: 1 }}>Payments collected by finance</Typography>
        {error && <Alert severity="warning" sx={{ mb: 1 }}>{error}</Alert>}
        <Stack spacing={1.5}>
          {rows.map((r) => (
            <Box key={r.id} sx={{ p: 1.5, border: '1px solid rgba(0,0,0,0.12)', borderRadius: 2 }}>
              <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                <Chip size="small" color={r.voidReason ? 'default' : 'success'} label={r.voidReason ? 'Voided by finance' : PAID_BY_FINANCE_LABEL} />
                <Typography variant="body2" sx={{ fontWeight: 700 }}>{formatAed(r.amount)}</Typography>
                <Typography variant="body2">{r.method === 'cheque' ? `Cheque${r.chequeNumber ? ` #${r.chequeNumber}` : ''}` : 'Cash'}</Typography>
                <Typography variant="body2">{r.collectedOn}</Typography>
              </Stack>
              {r.voidReason && <Typography variant="caption" display="block">Reason: {r.voidReason}</Typography>}
              {r.proofPath && <Button size="small" sx={{ mt: 0.5 }} onClick={() => void openProof(r.proofPath)}>View proof</Button>}
            </Box>
          ))}
        </Stack>
      </CardContent>
    </Card>
  );
}

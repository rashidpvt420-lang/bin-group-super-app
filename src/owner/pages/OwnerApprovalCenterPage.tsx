import React from 'react';
import { Alert, Box, Button, Card, CardContent, Chip, Grid, Stack, TextField, Typography } from '@mui/material';
import { auth, collection, db, doc, limit, onSnapshot, orderBy, query, serverTimestamp, updateDoc, where } from '../../lib/firebase';
import { binThemeTokens } from '../../theme/binGroupTheme';

type ApprovalRequest = {
  id: string;
  rfqId?: string;
  ticketId?: string;
  propertyId?: string;
  trade?: string;
  standardScope?: string;
  estimateBandAed?: number;
  quotesReceived?: number;
  status?: string;
  decision?: string;
  decisionNote?: string;
  createdAt?: any;
};

const decisions = [
  { key: 'APPROVED', label: 'Approve quote' },
  { key: 'REJECTED', label: 'Reject quote' },
  { key: 'REQUEST_MORE_QUOTES', label: 'Request more quotes' },
  { key: 'EMERGENCY_APPROVED', label: 'Emergency approval' },
];

export default function OwnerApprovalCenterPage() {
  const [items, setItems] = React.useState<ApprovalRequest[]>([]);
  const [notes, setNotes] = React.useState<Record<string, string>>({});
  const [notice, setNotice] = React.useState('');
  const ownerId = auth.currentUser?.uid || '';

  React.useEffect(() => {
    if (!ownerId) return undefined;
    const q = query(collection(db, 'owner_approval_requests'), where('ownerId', '==', ownerId), orderBy('createdAt', 'desc'), limit(50));
    return onSnapshot(q, (snap) => {
      const rows = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<ApprovalRequest, 'id'>) }));
      setItems(rows);
      setNotes((current) => {
        const next = { ...current };
        rows.forEach((row) => { if (next[row.id] === undefined) next[row.id] = row.decisionNote || ''; });
        return next;
      });
    });
  }, [ownerId]);

  const decide = async (request: ApprovalRequest, decision: string) => {
    try {
      await updateDoc(doc(db, 'owner_approval_requests', request.id), {
        status: decision === 'APPROVED' || decision === 'EMERGENCY_APPROVED' ? 'owner_approved' : decision === 'REJECTED' ? 'owner_rejected' : 'more_quotes_requested',
        decision,
        decisionNote: notes[request.id] || '',
        ownerDecisionBy: ownerId,
        decidedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      setNotice(`Decision recorded: ${decision}. Audit ledger sync is handled by the secured backend workflow.`);
    } catch (error: any) {
      setNotice(error?.message || 'Failed to record owner decision.');
    }
  };

  return (
    <Box>
      <Stack spacing={1} sx={{ mb: 3 }}>
        <Typography variant="overline" sx={{ color: binThemeTokens.goldHover, fontWeight: 950, letterSpacing: 3 }}>OWNER TRUST CENTER</Typography>
        <Typography variant="h4" sx={{ fontWeight: 950, color: binThemeTokens.textPrimary }}>Approval Center</Typography>
        <Typography sx={{ color: binThemeTokens.textSecondary, maxWidth: 880 }}>
          Review quote requests, emergency overrides, quote-count compliance, and standard scopes before BIN GROUP awards work.
        </Typography>
      </Stack>
      {notice && <Alert severity={notice.includes('Failed') ? 'warning' : 'success'} sx={{ mb: 3 }}>{notice}</Alert>}
      <Grid container spacing={2}>
        {items.length === 0 && <Grid item xs={12}><Alert severity="info">No pending owner approval requests found for this owner account.</Alert></Grid>}
        {items.map((request) => (
          <Grid item xs={12} key={request.id}>
            <Card sx={{ borderRadius: 4, border: `1px solid ${binThemeTokens.border}`, boxShadow: '0 20px 50px rgba(17,24,39,0.06)' }}>
              <CardContent>
                <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" spacing={2} sx={{ mb: 2 }}>
                  <Box>
                    <Typography variant="h6" sx={{ fontWeight: 950 }}>{request.trade || 'Maintenance approval'} · {request.ticketId}</Typography>
                    <Typography sx={{ color: binThemeTokens.textSecondary }}>{request.standardScope || 'No scope provided'}</Typography>
                  </Box>
                  <Stack direction="row" spacing={1} flexWrap="wrap">
                    <Chip label={request.status || 'pending'} color={String(request.status || '').includes('approved') ? 'success' : 'warning'} />
                    <Chip label={`AED ${Number(request.estimateBandAed || 0).toLocaleString()}`} variant="outlined" />
                    <Chip label={`${request.quotesReceived || 0} quote(s)`} variant="outlined" />
                  </Stack>
                </Stack>
                <TextField fullWidth multiline minRows={2} label="Owner decision note" value={notes[request.id] || ''} onChange={(e) => setNotes({ ...notes, [request.id]: e.target.value })} sx={{ mb: 2 }} />
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
                  {decisions.map((decision) => (
                    <Button key={decision.key} variant={decision.key === 'APPROVED' ? 'contained' : 'outlined'} onClick={() => decide(request, decision.key)} sx={decision.key === 'APPROVED' ? { bgcolor: binThemeTokens.goldHover, color: '#111827', fontWeight: 950 } : { fontWeight: 900 }}>
                      {decision.label}
                    </Button>
                  ))}
                </Stack>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>
    </Box>
  );
}

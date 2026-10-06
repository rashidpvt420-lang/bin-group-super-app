import React from 'react';
import { Alert, Box, Button, Card, CardContent, Chip, Grid, Stack, TextField, Typography } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { auth, collection, db, functions, httpsCallable, limit, onSnapshot, orderBy, query, where } from '../../lib/firebase';
import { binThemeTokens } from '../../theme/binGroupTheme';
import { isOwnerPendingSignOff } from '../utils/ownerPendingSignOff';
import { useOwnerPropertyLabels } from '../hooks/useOwnerPropertyLabels';

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

type SignOffTicket = {
  id: string;
  status?: string;
  title?: string;
  category?: string;
  trade?: string;
  propertyId?: string;
  propertyName?: string;
  ownerApproved?: boolean;
};

const decisions = [
  { key: 'APPROVED', label: 'Approve quote' },
  { key: 'REJECTED', label: 'Reject quote' },
  { key: 'REQUEST_MORE_QUOTES', label: 'Request more quotes' },
  { key: 'EMERGENCY_APPROVED', label: 'Emergency approval' },
];

const submitDecision = httpsCallable(functions, 'submitOwnerApprovalDecision');
const reviewTicketCompletion = httpsCallable(functions, 'ownerReviewTicketCompletion');

export default function OwnerApprovalCenterPage() {
  const navigate = useNavigate();
  const [items, setItems] = React.useState<ApprovalRequest[]>([]);
  const [signOffs, setSignOffs] = React.useState<SignOffTicket[]>([]);
  const [notes, setNotes] = React.useState<Record<string, string>>({});
  const [notice, setNotice] = React.useState('');
  const [submittingId, setSubmittingId] = React.useState('');
  const ownerId = auth.currentUser?.uid || '';
  const { ticketPropertyLabel } = useOwnerPropertyLabels(ownerId);

  React.useEffect(() => {
    if (!ownerId) return undefined;
    const q = query(collection(db, 'owner_approval_requests'), where('ownerId', '==', ownerId), orderBy('createdAt', 'desc'), limit(50));
    const unsubRequests = onSnapshot(q, (snap) => {
      const rows = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<ApprovalRequest, 'id'>) }));
      setItems(rows);
      setNotes((current) => {
        const next = { ...current };
        rows.forEach((row) => { if (next[row.id] === undefined) next[row.id] = row.decisionNote || ''; });
        return next;
      });
    }, (err) => {
      console.warn('[OwnerApprovalCenter] approval requests listener failed:', err);
      setItems([]);
    });

    const ticketQuery = query(collection(db, 'maintenanceTickets'), where('ownerId', '==', ownerId), limit(150));
    const unsubTickets = onSnapshot(ticketQuery, (snap) => {
      const rows = snap.docs
        .map((d) => ({ id: d.id, ...(d.data() as Omit<SignOffTicket, 'id'>) }))
        .filter((ticket) => isOwnerPendingSignOff(ticket));
      setSignOffs(rows);
    }, (err) => {
      console.warn('[OwnerApprovalCenter] ticket sign-off listener failed:', err);
      setSignOffs([]);
    });

    return () => {
      unsubRequests();
      unsubTickets();
    };
  }, [ownerId]);

  const decide = async (request: ApprovalRequest, decision: string) => {
    try {
      setSubmittingId(`${request.id}:${decision}`);
      const result = await submitDecision({ approvalRequestId: request.id, decision, decisionNote: notes[request.id] || '' });
      const data = result.data as any;
      setNotice(`Decision recorded: ${data?.decision || decision}. Secured backend workflow will sync the RFQ, ticket, and ledger.`);
    } catch (error: any) {
      setNotice(error?.message || 'Failed to record owner decision.');
    } finally {
      setSubmittingId('');
    }
  };

  const approveSignOff = async (ticket: SignOffTicket) => {
    try {
      setSubmittingId(`signoff:${ticket.id}`);
      await reviewTicketCompletion({ ticketId: ticket.id, action: 'APPROVE_CLOSE', reason: '' });
      setNotice(`Ticket ${ticket.id.slice(0, 8).toUpperCase()} approved and closed.`);
      setSignOffs((current) => current.filter((row) => row.id !== ticket.id));
    } catch (error: any) {
      setNotice(error?.message || 'Failed to approve ticket sign-off.');
    } finally {
      setSubmittingId('');
    }
  };

  return (
    <Box>
      <Stack spacing={1} sx={{ mb: 3 }}>
        <Typography variant="overline" sx={{ color: binThemeTokens.goldHover, fontWeight: 950, letterSpacing: 3 }}>OWNER TRUST CENTER</Typography>
        <Typography variant="h4" sx={{ fontWeight: 950, color: binThemeTokens.textPrimary }}>Approval Center</Typography>
        <Typography sx={{ color: binThemeTokens.textSecondary, maxWidth: 880 }}>
          Review completed ticket sign-offs, quote requests, emergency overrides, and standard scopes before BIN GROUP closes or awards work.
        </Typography>
      </Stack>
      {notice && <Alert severity={notice.includes('Failed') ? 'warning' : 'success'} sx={{ mb: 3 }}>{notice}</Alert>}

      <Stack spacing={1} sx={{ mb: 2 }}>
        <Typography variant="h6" sx={{ fontWeight: 950, color: binThemeTokens.textPrimary }}>
          Ticket sign-offs ({signOffs.length})
        </Typography>
        <Typography variant="body2" sx={{ color: binThemeTokens.textSecondary }}>
          Completed work waiting for Approve &amp; Close. These also drive the Owner command strip pending-approvals count.
        </Typography>
      </Stack>
      <Grid container spacing={2} sx={{ mb: 4 }}>
        {signOffs.length === 0 && (
          <Grid item xs={12}>
            <Alert severity="info">No completed tickets are waiting for owner sign-off.</Alert>
          </Grid>
        )}
        {signOffs.map((ticket) => (
          <Grid item xs={12} key={`signoff-${ticket.id}`}>
            <Card sx={{ borderRadius: 4, border: `1px solid ${binThemeTokens.border}`, boxShadow: '0 20px 50px rgba(17,24,39,0.06)' }}>
              <CardContent>
                <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" spacing={2} sx={{ mb: 2 }}>
                  <Box>
                    <Typography variant="h6" sx={{ fontWeight: 950 }}>
                      {ticket.title || ticket.category || ticket.trade || 'Completed ticket'} · {ticket.id.slice(0, 8).toUpperCase()}
                    </Typography>
                    <Typography sx={{ color: binThemeTokens.textSecondary }}>
                      {ticketPropertyLabel(ticket)} · status {String(ticket.status || '').replace(/_/g, ' ')}
                    </Typography>
                  </Box>
                  <Chip label="COMPLETED PENDING APPROVAL" color="warning" />
                </Stack>
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
                  <Button
                    variant="contained"
                    color="success"
                    disabled={Boolean(submittingId)}
                    onClick={() => approveSignOff(ticket)}
                    sx={{ fontWeight: 950 }}
                  >
                    {submittingId === `signoff:${ticket.id}` ? 'Submitting...' : 'Approve & Close'}
                  </Button>
                  <Button
                    variant="outlined"
                    disabled={Boolean(submittingId)}
                    onClick={() => navigate(`/owner/ticket/${ticket.id}`)}
                    sx={{ fontWeight: 900 }}
                  >
                    Open ticket
                  </Button>
                </Stack>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      <Stack spacing={1} sx={{ mb: 2 }}>
        <Typography variant="h6" sx={{ fontWeight: 950, color: binThemeTokens.textPrimary }}>
          Cost / quote approvals ({items.length})
        </Typography>
      </Stack>
      <Grid container spacing={2}>
        {items.length === 0 && (
          <Grid item xs={12}>
            <Alert severity="info">No pending cost / quote approval requests for this owner account.</Alert>
          </Grid>
        )}
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
                  {decisions.map((decision) => {
                    const busy = submittingId === `${request.id}:${decision.key}`;
                    return (
                      <Button key={decision.key} variant={decision.key === 'APPROVED' ? 'contained' : 'outlined'} disabled={Boolean(submittingId)} onClick={() => decide(request, decision.key)} sx={decision.key === 'APPROVED' ? { bgcolor: binThemeTokens.goldHover, color: '#111827', fontWeight: 950 } : { fontWeight: 900 }}>
                        {busy ? 'Submitting...' : decision.label}
                      </Button>
                    );
                  })}
                </Stack>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>
    </Box>
  );
}

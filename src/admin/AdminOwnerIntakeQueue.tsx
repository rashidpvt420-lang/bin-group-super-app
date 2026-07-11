import React from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Stack,
  Typography,
  Divider,
  TextField,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
} from '@mui/material';
import { Building2, CheckCircle2, MapPin, XCircle, ShieldCheck } from 'lucide-react';
import { auth, collection, db, getDocs, httpsCallable, functions, limit, query, where, updateDoc, doc } from '../lib/firebase';
import SafeIcon from '../components/SafeIcon';
import { logAuditAction } from '../utils/auditLogger';

type IntakeRow = {
  id: string;
  status?: string;
  ownerEmail?: string;
  ownerName?: string;
  paymentAmount?: number;
  activationDeposit?: number;
  properties?: any[];
  requiresGeoReview?: boolean;
};

type ContractRow = {
  id: string;
  status?: string;
  ownerId?: string;
  ownerUid?: string;
  ownerName?: string;
  ownerEmail?: string;
  propertyName?: string;
  intakeId?: string;
  intakeSubmissionId?: string;
  paymentId?: string;
  propertyIds?: string[];
  requiresGeoReview?: boolean;
};

export default function AdminOwnerIntakeQueue() {
  const [rows, setRows] = React.useState<IntakeRow[]>([]);
  const [pendingActivations, setPendingActivations] = React.useState<ContractRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [actingId, setActingId] = React.useState<string | null>(null);
  const [message, setMessage] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  // Reject / Request Info Modal state
  const [rejectId, setRejectId] = React.useState<string | null>(null);
  const [rejectType, setRejectType] = React.useState<'intake' | 'contract' | null>(null);
  const [rejectReason, setRejectReason] = React.useState('');

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // 1. Load Intakes
      const statuses = ['payment_pending_approval', 'AWAITING_VERIFICATION', 'PENDING_OWNER_APPROVAL'];
      const snaps = await Promise.all(
        statuses.map((status) => getDocs(query(collection(db, 'intake_submissions'), where('status', '==', status), limit(12))))
      );
      const merged = new Map<string, IntakeRow>();
      for (const snap of snaps) {
        for (const docSnap of snap.docs) {
          const data = docSnap.data() as Omit<IntakeRow, 'id'>;
          merged.set(docSnap.id, { id: docSnap.id, ...data });
        }
      }
      const list = [...merged.values()].sort((a, b) => String(b.id).localeCompare(String(a.id)));
      setRows(list.slice(0, 20));

      // 2. Load Contracts pending final activation
      const contractStatuses = ['READY_FOR_ACTIVATION', 'PAYMENT_VERIFIED_PENDING_ADMIN_APPROVAL'];
      const contractSnaps = await Promise.all(
        contractStatuses.map((status) => getDocs(query(collection(db, 'contracts'), where('status', '==', status), limit(12))))
      );
      const contractMerged = new Map<string, ContractRow>();
      for (const snap of contractSnaps) {
        for (const docSnap of snap.docs) {
          const data = docSnap.data() as Omit<ContractRow, 'id'>;
          contractMerged.set(docSnap.id, { id: docSnap.id, ...data });
        }
      }
      const contractList = [...contractMerged.values()].sort((a, b) => String(b.id).localeCompare(String(a.id)));
      setPendingActivations(contractList.slice(0, 20));

    } catch (err: any) {
      console.error('[ADMIN-INTAKE-QUEUE]', err);
      setError(err?.message || 'Unable to load owner intake queue.');
      setRows([]);
      setPendingActivations([]);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  const approveIntake = async (intakeId: string) => {
    if (!auth.currentUser) {
      setError('Admin session expired. Sign in again.');
      return;
    }
    setActingId(intakeId);
    setError(null);
    setMessage(null);
    try {
      const approve = httpsCallable(functions, 'approveOwnerSubmissionOperationalFlow');
      const result = await approve({ intakeId });
      const data = result.data as { status?: string; ownerId?: string; propertyIds?: string[]; contractId?: string };
      setMessage(
        `Provisioned ${intakeId} → ${data.status || 'OK'}. Owner: ${data.ownerId || '—'}, properties: ${(data.propertyIds || []).join(', ') || '—'}`
      );
      await load();
    } catch (err: any) {
      console.error('[ADMIN-INTAKE-APPROVE]', err);
      setError(err?.message || 'Approval failed. Check intake has properties[] with geo and payment fields.');
    } finally {
      setActingId(null);
    }
  };

  const activateDashboard = async (contract: ContractRow) => {
    if (!auth.currentUser) {
      setError('Admin session expired.');
      return;
    }
    setActingId(contract.id);
    setError(null);
    setMessage(null);
    try {
      const activate = httpsCallable(functions, 'approveOwnerActivation');
      const payload = {
        intakeId: contract.intakeId || contract.intakeSubmissionId || contract.id,
        ownerId: contract.ownerId || contract.ownerUid,
        contractId: contract.id,
        paymentId: contract.paymentId || null,
        propertyIds: contract.propertyIds || [],
      };
      await activate(payload);
      setMessage(`Successfully activated dashboard for owner ${payload.ownerId}. Workspace unlocked.`);
      await load();
    } catch (err: any) {
      console.error('[ADMIN-OWNER-ACTIVATE]', err);
      setError(err?.message || 'Final activation failed. Ensure owner and intake exist.');
    } finally {
      setActingId(null);
    }
  };

  const handleOpenReject = (id: string, type: 'intake' | 'contract') => {
    setRejectId(id);
    setRejectType(type);
    setRejectReason('');
  };

  const handleConfirmReject = async () => {
    if (!rejectId || !rejectType) return;
    setActingId(rejectId);
    setError(null);
    setMessage(null);
    try {
      const coll = rejectType === 'intake' ? 'intake_submissions' : 'contracts';
      const docRef = doc(db, coll, rejectId);
      
      await updateDoc(docRef, {
        status: 'REJECTED',
        rejectionReason: rejectReason,
        rejectedAt: new Date().toISOString(),
        rejectedBy: auth.currentUser?.uid || 'system_admin',
      });

      await logAuditAction({
        action: rejectType === 'intake' ? 'ADMIN_INTAKE_REJECTED' : 'ADMIN_CONTRACT_REJECTED',
        targetType: rejectType === 'intake' ? 'intake_submissions' : 'contracts',
        targetId: rejectId,
        metadata: { reason: rejectReason, rejectedBy: auth.currentUser?.uid },
      });

      setMessage(`Marked ${rejectType === 'intake' ? 'Intake' : 'Contract'} ${rejectId} as Rejected.`);
      setRejectId(null);
      setRejectType(null);
      await load();
    } catch (err: any) {
      console.error('[REJECT-FAIL]', err);
      setError(`Failed to reject: ${err.message}`);
    } finally {
      setActingId(null);
    }
  };

  return (
    <Card sx={{ bgcolor: 'rgba(15, 23, 42, 0.94)', border: '1px solid rgba(201,166,70,0.22)', borderRadius: 4, color: '#fff' }}>
      <CardContent>
        <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
          <Typography variant="h6" sx={{ fontWeight: 950, color: '#E5C86B' }}>
            Owner Intake &amp; Activation Hub
          </Typography>
          <Button onClick={load} disabled={loading} size="small" sx={{ color: '#E5C86B', fontWeight: 900 }}>
            Refresh
          </Button>
        </Stack>

        {message && (
          <Alert severity="success" sx={{ mb: 2, bgcolor: 'rgba(34,197,94,0.10)', color: '#BBF7D0' }}>
            {message}
          </Alert>
        )}
        {error && (
          <Alert severity="warning" sx={{ mb: 2, bgcolor: 'rgba(245,158,11,0.10)', color: '#FDE68A' }}>
            {error}
          </Alert>
        )}

        {loading ? (
          <Box sx={{ py: 4, display: 'grid', placeItems: 'center' }}>
            <CircularProgress sx={{ color: '#E5C86B' }} />
          </Box>
        ) : (
          <Stack spacing={4}>
            {/* Section 1: New Intake Queue */}
            <Box>
              <Typography variant="subtitle1" fontWeight="950" sx={{ color: '#E5C86B', mb: 1.5 }}>
                1. New Intake Approvals ({rows.length})
              </Typography>
              <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.48)', display: 'block', mb: 2 }}>
                Reviews new submission profiles and provisions property passports/contracts.
              </Typography>

              {rows.length === 0 ? (
                <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.4)', fontStyle: 'italic', pl: 1 }}>
                  No intakes pending initial approval.
                </Typography>
              ) : (
                <Stack spacing={1.5}>
                  {rows.map((row) => {
                    const propertyCount = Array.isArray(row.properties) ? row.properties.length : 0;
                    const geoPending = row.properties?.some((p) => p?.requiresGeoReview || p?.dispatchReady === false);
                    return (
                      <Box
                        key={row.id}
                        sx={{
                          p: 2,
                          borderRadius: 2,
                          bgcolor: 'rgba(255,255,255,0.02)',
                          border: '1px solid rgba(255,255,255,0.05)',
                        }}
                      >
                        <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" spacing={1.5} alignItems={{ md: 'center' }}>
                          <Box>
                            <Typography variant="subtitle2" sx={{ fontWeight: 950, color: '#FFF' }}>
                              {row.ownerName || row.ownerEmail || 'Owner intake'}
                            </Typography>
                            <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)', fontFamily: 'monospace' }}>
                              Intake ID: {row.id}
                            </Typography>
                            <Stack direction="row" spacing={1} sx={{ mt: 1, flexWrap: 'wrap', gap: 0.5 }}>
                              <Chip size="small" label={row.status || 'unknown'} sx={{ fontWeight: 800 }} />
                              <Chip size="small" icon={<SafeIcon icon={Building2} size={14} />} label={`${propertyCount} properties`} />
                              {geoPending && (
                                <Chip size="small" icon={<SafeIcon icon={MapPin} size={14} />} label="Geo review" color="warning" />
                              )}
                              <Chip
                                size="small"
                                label={`AED ${Number(row.activationDeposit || row.paymentAmount || 0).toLocaleString('en-AE')}`}
                                sx={{ color: '#E5C86B' }}
                              />
                            </Stack>
                          </Box>
                          <Stack direction="row" spacing={1}>
                            <Button
                              variant="contained"
                              disabled={actingId === row.id}
                              onClick={() => approveIntake(row.id)}
                              startIcon={actingId === row.id ? <CircularProgress size={16} color="inherit" /> : <CheckCircle2 size={16} />}
                              sx={{ bgcolor: '#E5C86B', color: '#111', fontWeight: 950 }}
                            >
                              Approve &amp; Provision
                            </Button>
                            <Button
                              variant="outlined"
                              color="error"
                              disabled={actingId === row.id}
                              onClick={() => handleOpenReject(row.id, 'intake')}
                              startIcon={<XCircle size={16} />}
                              sx={{ fontWeight: 950 }}
                            >
                              Request Info
                            </Button>
                          </Stack>
                        </Stack>
                      </Box>
                    );
                  })}
                </Stack>
              )}
            </Box>

            <Divider sx={{ borderColor: 'rgba(255,255,255,0.06)' }} />

            {/* Section 2: Dashboard Activation Queue */}
            <Box>
              <Typography variant="subtitle1" fontWeight="950" sx={{ color: '#E5C86B', mb: 1.5 }}>
                2. Final Activation &amp; Dashboard Unlock ({pendingActivations.length})
              </Typography>
              <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.48)', display: 'block', mb: 2 }}>
                Signed and paid contracts ready for full portfolio activation.
              </Typography>

              {pendingActivations.length === 0 ? (
                <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.4)', fontStyle: 'italic', pl: 1 }}>
                  No contracts pending final dashboard activation.
                </Typography>
              ) : (
                <Stack spacing={1.5}>
                  {pendingActivations.map((contract) => (
                    <Box
                      key={contract.id}
                      sx={{
                        p: 2,
                        borderRadius: 2,
                        bgcolor: 'rgba(255,255,255,0.02)',
                        border: '1px solid rgba(198,167,94,0.15)',
                      }}
                    >
                      <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" spacing={1.5} alignItems={{ md: 'center' }}>
                        <Box>
                          <Typography variant="subtitle2" sx={{ fontWeight: 950, color: '#FFF' }}>
                            {contract.ownerName || contract.ownerEmail || 'Pending Owner'}
                          </Typography>
                          <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.7)', mt: 0.5 }}>
                            Asset: {contract.propertyName || 'Multiple properties'}
                          </Typography>
                          <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)', fontFamily: 'monospace', display: 'block', mt: 0.5 }}>
                            Contract ID: {contract.id}
                          </Typography>
                          <Stack direction="row" spacing={1} sx={{ mt: 1, flexWrap: 'wrap', gap: 0.5 }}>
                            <Chip size="small" label={contract.status || 'unknown'} sx={{ fontWeight: 800, bgcolor: 'rgba(229,200,107,0.15)', color: '#E5C86B' }} />
                            {contract.paymentId && <Chip size="small" label={`Payment: ${contract.paymentId.slice(0, 10)}...`} />}
                          </Stack>
                        </Box>
                        <Stack direction="row" spacing={1}>
                          <Button
                            variant="contained"
                            disabled={actingId === contract.id}
                            onClick={() => activateDashboard(contract)}
                            startIcon={actingId === contract.id ? <CircularProgress size={16} color="inherit" /> : <ShieldCheck size={16} />}
                            sx={{ bgcolor: '#10b981', color: '#FFF', fontWeight: 950, '&:hover': { bgcolor: '#059669' } }}
                          >
                            Verify &amp; Activate
                          </Button>
                          <Button
                            variant="outlined"
                            color="error"
                            disabled={actingId === contract.id}
                            onClick={() => handleOpenReject(contract.id, 'contract')}
                            startIcon={<XCircle size={16} />}
                            sx={{ fontWeight: 950 }}
                          >
                            Request Info
                          </Button>
                        </Stack>
                      </Stack>
                    </Box>
                  ))}
                </Stack>
              )}
            </Box>
          </Stack>
        )}
      </CardContent>

      {/* Reject Reason Dialog */}
      <Dialog
        open={Boolean(rejectId)}
        onClose={() => setRejectId(null)}
        PaperProps={{
          sx: { bgcolor: '#0f172a', color: '#FFF', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 3 }
        }}
      >
        <DialogTitle sx={{ fontWeight: 950, color: '#E5C86B' }}>
          Request Information / Reject Submission
        </DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.6)', mb: 2 }}>
            Provide the rejection reason or requested details. This will be recorded in the audit trail.
          </Typography>
          <TextField
            autoFocus
            fullWidth
            multiline
            rows={3}
            label="Reason / Message"
            variant="outlined"
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            InputLabelProps={{ style: { color: 'rgba(255,255,255,0.5)' } }}
            inputProps={{ style: { color: '#FFF' } }}
            sx={{
              '& .MuiOutlinedInput-root': {
                '& fieldset': { borderColor: 'rgba(255,255,255,0.2)' },
                '&:hover fieldset': { borderColor: '#E5C86B' },
                '&.Mui-focused fieldset': { borderColor: '#E5C86B' },
              }
            }}
          />
        </DialogContent>
        <DialogActions sx={{ p: 2.5 }}>
          <Button onClick={() => setRejectId(null)} sx={{ color: 'rgba(255,255,255,0.5)', fontWeight: 900 }}>
            Cancel
          </Button>
          <Button
            onClick={handleConfirmReject}
            variant="contained"
            color="error"
            disabled={!rejectReason.trim()}
            sx={{ fontWeight: 950 }}
          >
            Confirm Rejection
          </Button>
        </DialogActions>
      </Dialog>
    </Card>
  );
}

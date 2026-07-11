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
} from '@mui/material';
import { Building2, CheckCircle2, MapPin } from 'lucide-react';
import { auth, collection, db, getDocs, httpsCallable, functions, limit, query, where } from '../lib/firebase';
import SafeIcon from '../components/SafeIcon';

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

export default function AdminOwnerIntakeQueue() {
  const [rows, setRows] = React.useState<IntakeRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [actingId, setActingId] = React.useState<string | null>(null);
  const [message, setMessage] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
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
    } catch (err: any) {
      console.error('[ADMIN-INTAKE-QUEUE]', err);
      setError(err?.message || 'Unable to load owner intake queue. Ensure Firestore index exists for status + updatedAt.');
      setRows([]);
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
        `Approved ${intakeId} → ${data.status || 'OK'}. Owner ${data.ownerId || '—'}, properties: ${(data.propertyIds || []).join(', ') || '—'}`
      );
      await load();
    } catch (err: any) {
      console.error('[ADMIN-INTAKE-APPROVE]', err);
      setError(err?.message || 'Approval failed. Check intake has properties[] with geo and payment fields.');
    } finally {
      setActingId(null);
    }
  };

  return (
    <Card sx={{ bgcolor: 'rgba(15, 23, 42, 0.94)', border: '1px solid rgba(201,166,70,0.22)', borderRadius: 4, color: '#fff' }}>
      <CardContent>
        <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
          <Typography variant="h6" sx={{ fontWeight: 950, color: '#E5C86B' }}>
            Owner Intake Activation Queue
          </Typography>
          <Button onClick={load} disabled={loading} size="small" sx={{ color: '#E5C86B', fontWeight: 900 }}>
            Refresh
          </Button>
        </Stack>

        <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.62)', mb: 2, fontWeight: 700 }}>
          Approves payment package intakes via <code>approveOwnerSubmissionOperationalFlow</code> — creates properties, passports, contracts, and owner records.
        </Typography>

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
        ) : rows.length === 0 ? (
          <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.55)', fontWeight: 700 }}>
            No pending owner intakes in payment_pending_approval / AWAITING_VERIFICATION.
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
                    bgcolor: 'rgba(255,255,255,0.03)',
                    border: '1px solid rgba(255,255,255,0.06)',
                  }}
                >
                  <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" spacing={1.5} alignItems={{ sm: 'center' }}>
                    <Box>
                      <Typography variant="subtitle2" sx={{ fontWeight: 950, color: '#FFF' }}>
                        {row.ownerName || row.ownerEmail || 'Owner intake'}
                      </Typography>
                      <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.5)', fontFamily: 'monospace' }}>
                        {row.id}
                      </Typography>
                      <Stack direction="row" spacing={1} sx={{ mt: 1, flexWrap: 'wrap' }}>
                        <Chip size="small" label={row.status || 'unknown'} sx={{ fontWeight: 800 }} />
                        <Chip size="small" icon={<SafeIcon icon={Building2} size={14} />} label={`${propertyCount} properties`} />
                        {geoPending ? (
                          <Chip size="small" icon={<SafeIcon icon={MapPin} size={14} />} label="Geo review" color="warning" />
                        ) : null}
                        <Chip
                          size="small"
                          label={`AED ${Number(row.activationDeposit || row.paymentAmount || 0).toLocaleString('en-AE')}`}
                          sx={{ color: '#E5C86B' }}
                        />
                      </Stack>
                    </Box>
                    <Button
                      variant="contained"
                      disabled={actingId === row.id}
                      onClick={() => approveIntake(row.id)}
                      startIcon={actingId === row.id ? <CircularProgress size={16} color="inherit" /> : <CheckCircle2 size={16} />}
                      sx={{ bgcolor: '#E5C86B', color: '#111', fontWeight: 950, whiteSpace: 'nowrap' }}
                    >
                      Approve &amp; Provision
                    </Button>
                  </Stack>
                </Box>
              );
            })}
          </Stack>
        )}
      </CardContent>
    </Card>
  );
}

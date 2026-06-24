// apps/admin-panel/src/pages/admin/AdminPropertyApprovalsPage.tsx

import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Grid,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
  alpha,
} from '@mui/material';
import { Building2, CheckCircle2, FileText, Shield, XCircle } from 'lucide-react';
import AdminPageFrame from '../../components/AdminPageFrame';
import { addDoc, collection, db, doc, onSnapshot, serverTimestamp, updateDoc } from '../../lib/firebase';
import { binThemeTokens } from '../../theme/adminTheme';

type PropertyRecord = {
  id: string;
  propertyName?: string;
  name?: string;
  title?: string;
  ownerEmail?: string;
  ownerName?: string;
  address?: string;
  emirate?: string;
  city?: string;
  status?: string;
  approvalStatus?: string;
  onboardingStatus?: string;
  units?: number;
  totalUnits?: number;
  createdAt?: any;
  updatedAt?: any;
};

type Decision = 'APPROVED' | 'REJECTED';

const REVIEW_STATUSES = ['PENDING', 'PENDING_REVIEW', 'ADMIN_REVIEW', 'SUBMITTED', 'DRAFT', 'UNKNOWN'];

const normalizeStatus = (value: any) => String(value || 'UNKNOWN').replace(/_/g, ' ').toUpperCase();

const getMillis = (value: any) => {
  if (!value) return 0;
  if (typeof value?.toMillis === 'function') return value.toMillis();
  if (typeof value?.toDate === 'function') return value.toDate().getTime();
  if (value?.seconds) return value.seconds * 1000;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
};

const displayDate = (value: any) => {
  const millis = getMillis(value);
  return millis ? new Date(millis).toLocaleString('en-AE') : 'Not recorded';
};

const statusTone = (value: any) => {
  const status = normalizeStatus(value);
  if (status.includes('APPROVED') || status.includes('ACTIVE')) return '#10b981';
  if (status.includes('REJECTED') || status.includes('BLOCKED')) return '#ef4444';
  return '#f59e0b';
};

export default function AdminPropertyApprovalsPage() {
  const [properties, setProperties] = useState<PropertyRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<PropertyRecord | null>(null);
  const [decision, setDecision] = useState<Decision>('APPROVED');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    const unsubscribe = onSnapshot(
      collection(db, 'properties'),
      (snapshot) => {
        const rows = snapshot.docs.map((item: any) => ({ id: item.id, ...(item.data() as Record<string, any>) })) as PropertyRecord[];
        rows.sort((a, b) => getMillis(b.createdAt || b.updatedAt) - getMillis(a.createdAt || a.updatedAt));
        setProperties(rows);
        setLoading(false);
      },
      () => {
        setLoading(false);
        setMessage({ type: 'error', text: 'Could not load property approval queue. Check Firestore permissions.' });
      }
    );
    return () => unsubscribe();
  }, []);

  const pendingRows = useMemo(() => properties.filter((row) => {
    const status = normalizeStatus(row.approvalStatus || row.status || row.onboardingStatus);
    return REVIEW_STATUSES.some((item) => status.includes(item));
  }), [properties]);

  const approvedRows = useMemo(() => properties.filter((row) => normalizeStatus(row.approvalStatus || row.status).includes('APPROVED') || normalizeStatus(row.status).includes('ACTIVE')), [properties]);
  const rejectedRows = useMemo(() => properties.filter((row) => normalizeStatus(row.approvalStatus || row.status).includes('REJECTED')), [properties]);

  const openDecision = (row: PropertyRecord, nextDecision: Decision) => {
    setSelected(row);
    setDecision(nextDecision);
    setNote('');
  };

  const closeDecision = () => {
    if (saving) return;
    setSelected(null);
    setNote('');
  };

  const applyDecision = async () => {
    if (!selected) return;
    setSaving(true);
    try {
      const approved = decision === 'APPROVED';
      await updateDoc(doc(db, 'properties', selected.id), {
        approvalStatus: decision,
        status: approved ? 'ACTIVE' : 'REJECTED',
        adminReviewNote: note.trim(),
        reviewedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      await addDoc(collection(db, 'auditLogs'), {
        action: approved ? 'PROPERTY_APPROVED' : 'PROPERTY_REJECTED',
        entityType: 'property',
        entityId: selected.id,
        propertyName: selected.propertyName || selected.name || selected.title || selected.id,
        ownerEmail: selected.ownerEmail || '',
        note: note.trim(),
        createdAt: serverTimestamp(),
        source: 'admin_property_approvals',
      });
      setMessage({ type: 'success', text: `Property ${approved ? 'approved' : 'rejected'} successfully.` });
      closeDecision();
    } catch {
      setMessage({ type: 'error', text: 'Failed to update property approval status.' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <AdminPageFrame title="Property Approval Command" subtitle="OWNER PROPERTY REVIEW · APPROVE / REJECT" lastUpdated={new Date()} onRefresh={() => window.location.reload()}>
      <Stack spacing={3} sx={{ pb: 8 }}>
        {message && <Alert severity={message.type}>{message.text}</Alert>}

        <Grid container spacing={2}>
          <SummaryCard label="Pending Review" value={pendingRows.length} icon={<Shield size={20} />} tone="#f59e0b" />
          <SummaryCard label="Approved" value={approvedRows.length} icon={<CheckCircle2 size={20} />} tone="#10b981" />
          <SummaryCard label="Rejected" value={rejectedRows.length} icon={<XCircle size={20} />} tone="#ef4444" />
          <SummaryCard label="Total Properties" value={properties.length} icon={<Building2 size={20} />} tone={binThemeTokens.gold} />
        </Grid>

        <Paper sx={{ bgcolor: '#0f172a', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 4, overflow: 'hidden' }}>
          <Box sx={{ p: 3, borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
            <Typography variant="h6" sx={{ color: '#fff', fontWeight: 950, display: 'flex', gap: 1, alignItems: 'center' }}>
              <FileText color={binThemeTokens.gold} /> Property Review Queue
            </Typography>
            <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.55)', mt: 0.5 }}>
              Review submitted properties before they become operationally active.
            </Typography>
          </Box>

          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Property</TableCell>
                  <TableCell>Owner</TableCell>
                  <TableCell>Location</TableCell>
                  <TableCell>Units</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell>Submitted</TableCell>
                  <TableCell align="right">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {pendingRows.map((row) => {
                  const status = row.approvalStatus || row.status || row.onboardingStatus || 'PENDING_REVIEW';
                  return (
                    <TableRow key={row.id} hover>
                      <TableCell>
                        <Typography sx={{ color: '#fff', fontWeight: 900 }}>{row.propertyName || row.name || row.title || row.id}</Typography>
                        <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.42)' }}>{row.id}</Typography>
                      </TableCell>
                      <TableCell>{row.ownerName || row.ownerEmail || 'Not linked'}</TableCell>
                      <TableCell>{row.address || row.city || row.emirate || 'Not recorded'}</TableCell>
                      <TableCell>{Number(row.units || row.totalUnits || 0)}</TableCell>
                      <TableCell><Chip size="small" label={normalizeStatus(status)} sx={{ color: statusTone(status), bgcolor: alpha(statusTone(status), 0.12), fontWeight: 900 }} /></TableCell>
                      <TableCell>{displayDate(row.createdAt || row.updatedAt)}</TableCell>
                      <TableCell align="right">
                        <Stack direction="row" justifyContent="flex-end" spacing={1}>
                          <Button size="small" variant="contained" onClick={() => openDecision(row, 'APPROVED')}>Approve</Button>
                          <Button size="small" color="error" variant="outlined" onClick={() => openDecision(row, 'REJECTED')}>Reject</Button>
                        </Stack>
                      </TableCell>
                    </TableRow>
                  );
                })}
                {!loading && pendingRows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} align="center" sx={{ py: 6, color: 'rgba(255,255,255,0.42)' }}>
                      No properties pending review.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>
      </Stack>

      <Dialog open={Boolean(selected)} onClose={closeDecision} fullWidth maxWidth="sm">
        <DialogTitle>{decision === 'APPROVED' ? 'Approve Property' : 'Reject Property'}</DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ mb: 2 }}>
            {selected?.propertyName || selected?.name || selected?.title || selected?.id}
          </Typography>
          <TextField
            fullWidth
            multiline
            minRows={4}
            label="Admin review note"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Record reason, missing document, approval condition, or operational note."
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={closeDecision} disabled={saving}>Cancel</Button>
          <Button onClick={applyDecision} disabled={saving} color={decision === 'APPROVED' ? 'success' : 'error'} variant="contained">
            {decision === 'APPROVED' ? 'Approve' : 'Reject'}
          </Button>
        </DialogActions>
      </Dialog>
    </AdminPageFrame>
  );
}

function SummaryCard({ label, value, icon, tone }: { label: string; value: number; icon: React.ReactNode; tone: string }) {
  return (
    <Grid item xs={12} sm={6} md={3}>
      <Paper sx={{ p: 2.5, bgcolor: '#0f172a', border: `1px solid ${alpha(tone, 0.25)}`, borderRadius: 4 }}>
        <Box sx={{ color: tone, mb: 1 }}>{icon}</Box>
        <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.48)', fontWeight: 900 }}>{label.toUpperCase()}</Typography>
        <Typography variant="h5" sx={{ color: '#fff', fontWeight: 950 }}>{value}</Typography>
      </Paper>
    </Grid>
  );
}

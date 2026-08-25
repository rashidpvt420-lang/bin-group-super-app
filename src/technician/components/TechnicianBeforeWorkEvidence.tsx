import React from 'react';
import { Alert, Box, Button, CircularProgress, Paper, Stack, Typography, alpha } from '@mui/material';
import { Camera, CheckCircle2 } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import {
  db,
  doc,
  functions,
  getDownloadURL,
  httpsCallable,
  onSnapshot,
  ref,
  storage,
  uploadBytes,
} from '../../lib/firebase';
import { useRole } from '../../context/RoleContext';
import { binThemeTokens } from '../../theme/binGroupTheme';
import {
  isRetryableTechnicianEvidenceError,
  queueTechnicianEvidence,
} from '../utils/offlineEvidenceQueue';

const assignedTechnicianId = (data: Record<string, any>) => String(
  data.assignedTechnicianId || data.technicianId || data.assignedTechId || data.technicianUid || data.techId || '',
);

export default function TechnicianBeforeWorkEvidence() {
  const location = useLocation();
  const { user } = useRole();
  const ticketId = React.useMemo(() => {
    const match = location.pathname.match(/^\/technician\/job\/([^/]+)$/);
    return match ? decodeURIComponent(match[1]) : '';
  }, [location.pathname]);
  const [ticket, setTicket] = React.useState<Record<string, any> | null>(null);
  const [uploading, setUploading] = React.useState(false);
  const [awaitingProofConvergence, setAwaitingProofConvergence] = React.useState(false);
  const [queuedLocally, setQueuedLocally] = React.useState(false);
  const [error, setError] = React.useState('');
  const [success, setSuccess] = React.useState('');

  React.useEffect(() => {
    setAwaitingProofConvergence(false);
    setQueuedLocally(false);
    setSuccess('');
    if (!ticketId || !user?.uid) {
      setTicket(null);
      return undefined;
    }
    return onSnapshot(doc(db, 'maintenanceTickets', ticketId), (snapshot) => {
      if (!snapshot.exists()) {
        setTicket(null);
        return;
      }
      const data = snapshot.data() as Record<string, any>;
      setTicket(assignedTechnicianId(data) === user.uid ? data : null);
    }, () => setTicket(null));
  }, [ticketId, user?.uid]);

  const status = String(ticket?.status || '').toUpperCase();
  const existingProof = Boolean(ticket?.technicianBeforePhotoUrl)
    || (Array.isArray(ticket?.technicianBeforePhotos) && ticket.technicianBeforePhotos.length > 0);

  React.useEffect(() => {
    if (!awaitingProofConvergence || !existingProof) return;
    const frame = window.requestAnimationFrame(() => {
      setAwaitingProofConvergence(false);
      setQueuedLocally(false);
      setSuccess('Before-work site evidence verified. Work can now begin after PPE and safety confirmation.');
    });
    return () => window.cancelAnimationFrame(frame);
  }, [awaitingProofConvergence, existingProof]);

  if (!ticketId || !ticket || status !== 'ARRIVED') return null;

  const queueForDurableSync = async (file: File, storagePath: string, safeName: string) => {
    if (!user?.uid) throw new Error('Technician identity is unavailable.');
    await queueTechnicianEvidence({
      ticketId,
      technicianId: user.uid,
      kind: 'before_work',
      blob: file,
      fileName: safeName,
      contentType: file.type,
      storagePath,
    });
    setAwaitingProofConvergence(false);
    setQueuedLocally(true);
    setSuccess('Photo saved on this device for durable sync. Start Work remains locked until the upload and server verification both succeed.');
  };

  const handleFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !user?.uid) return;
    if (!file.type.startsWith('image/')) {
      setError('Before-work evidence must be an image.');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setError('Before-work evidence must be 10 MB or smaller.');
      return;
    }

    const safeName = file.name.replace(/[^A-Za-z0-9._-]+/g, '-').slice(-120) || 'before-work.jpg';
    const storagePath = `maintenanceTickets/${ticketId}/proofPhotos/before_work_${Date.now()}_${safeName}`;

    setUploading(true);
    setAwaitingProofConvergence(false);
    setQueuedLocally(false);
    setError('');
    setSuccess('');
    try {
      if (!navigator.onLine) {
        await queueForDurableSync(file, storagePath, safeName);
        return;
      }

      const objectRef = ref(storage, storagePath);
      await uploadBytes(objectRef, file, {
        contentType: file.type,
        customMetadata: {
          ticketId,
          technicianId: user.uid,
          evidenceType: 'technician_before_work',
        },
      });
      const downloadUrl = await getDownloadURL(objectRef);
      const submitEvidence = httpsCallable(functions, 'submitTechnicianBeforeWorkEvidence');
      await submitEvidence({ ticketId, storagePath, downloadUrl });
      setAwaitingProofConvergence(true);
    } catch (err: any) {
      setAwaitingProofConvergence(false);
      if (isRetryableTechnicianEvidenceError(err)) {
        try {
          await queueForDurableSync(file, storagePath, safeName);
        } catch (queueError: any) {
          setQueuedLocally(false);
          setError(queueError?.message || 'The photo upload failed and the device queue could not preserve it. Keep the photo and retry before starting work.');
        }
      } else {
        setError(err?.message || 'Before-work evidence could not be verified. Check the connection and retry.');
      }
    } finally {
      setUploading(false);
    }
  };

  return (
    <Paper
      data-testid="technician-before-work-evidence"
      data-evidence-queued={queuedLocally ? 'true' : 'false'}
      sx={{
        p: 2.5,
        mb: 3,
        borderRadius: 4,
        bgcolor: alpha(existingProof ? '#10b981' : binThemeTokens.gold, 0.08),
        border: `1px solid ${alpha(existingProof ? '#10b981' : binThemeTokens.gold, 0.35)}`,
      }}
    >
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems={{ xs: 'stretch', sm: 'center' }} justifyContent="space-between">
        <Box>
          <Typography sx={{ color: '#111827', fontWeight: 950, display: 'flex', alignItems: 'center', gap: 1 }}>
            {existingProof ? <CheckCircle2 size={18} /> : <Camera size={18} />}
            BEFORE-WORK SITE EVIDENCE
          </Typography>
          <Typography variant="body2" sx={{ color: '#667085', mt: 0.5 }}>
            Capture the actual work area after verified arrival. Tenant fault evidence alone does not replace this technician proof.
          </Typography>
        </Box>
        <Button
          component="label"
          variant={existingProof ? 'outlined' : 'contained'}
          disabled={uploading || awaitingProofConvergence}
          startIcon={(uploading || awaitingProofConvergence) ? <CircularProgress size={18} color="inherit" /> : <Camera size={18} />}
          sx={{ bgcolor: existingProof ? 'transparent' : binThemeTokens.gold, color: existingProof ? '#047857' : '#111827', fontWeight: 950 }}
        >
          {awaitingProofConvergence ? 'VERIFYING EVIDENCE' : existingProof ? 'REPLACE EVIDENCE' : queuedLocally ? 'CAPTURE REPLACEMENT' : 'CAPTURE BEFORE WORK'}
          <input
            data-testid="technician-before-work-file"
            hidden
            type="file"
            accept="image/*"
            capture="environment"
            onChange={handleFile}
          />
        </Button>
      </Stack>
      {success && <Alert data-testid="technician-before-work-success" severity={queuedLocally ? 'warning' : 'success'} sx={{ mt: 2 }}>{success}</Alert>}
      {error && <Alert data-testid="technician-before-work-error" severity="error" sx={{ mt: 2 }}>{error}</Alert>}
    </Paper>
  );
}

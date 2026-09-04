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

export default function TechnicianAfterWorkEvidence() {
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
  const [pendingStoragePath, setPendingStoragePath] = React.useState('');
  const [error, setError] = React.useState('');
  const [success, setSuccess] = React.useState('');

  React.useEffect(() => {
    setAwaitingProofConvergence(false);
    setQueuedLocally(false);
    setPendingStoragePath('');
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
  const existingProof = Boolean(ticket?.technicianAfterConfirmationId)
    && ticket?.technicianAfterEvidenceState === 'CONFIRMED'
    && (
      Boolean(ticket?.technicianAfterPhotoUrl)
      || (Array.isArray(ticket?.technicianAfterPhotos) && ticket.technicianAfterPhotos.length > 0)
    );
  const confirmedStoragePath = String(ticket?.technicianAfterStoragePath || '');
  const pendingProofConverged = Boolean(pendingStoragePath)
    && existingProof
    && confirmedStoragePath === pendingStoragePath;

  React.useEffect(() => {
    if (!pendingProofConverged) return;
    const frame = window.requestAnimationFrame(() => {
      setAwaitingProofConvergence(false);
      setQueuedLocally(false);
      setPendingStoragePath('');
      setSuccess('After-work completion evidence verified. The protected completion gate can now evaluate notes and parts disposition.');
    });
    return () => window.cancelAnimationFrame(frame);
  }, [pendingProofConverged]);

  if (!ticketId || !ticket || status !== 'IN_PROGRESS') return null;

  const queueForDurableSync = async (file: File, storagePath: string, safeName: string) => {
    if (!user?.uid) throw new Error('Technician identity is unavailable.');
    await queueTechnicianEvidence({
      ticketId,
      technicianId: user.uid,
      kind: 'after_work',
      blob: file,
      fileName: safeName,
      contentType: file.type,
      storagePath,
    });
    setPendingStoragePath(storagePath);
    setAwaitingProofConvergence(false);
    setQueuedLocally(true);
    setSuccess('After-work photo saved on this device for durable sync. Mission completion remains locked until upload and protected server verification both succeed.');
  };

  const handleFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !user?.uid) return;
    if (!file.type.startsWith('image/')) {
      setError('After-work completion evidence must be an image.');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setError('After-work completion evidence must be 10 MB or smaller.');
      return;
    }

    const safeName = file.name.replace(/[^A-Za-z0-9._-]+/g, '-').slice(-120) || 'after-work.jpg';
    const storagePath = `maintenanceTickets/${ticketId}/proofPhotos/after_work_${Date.now()}_${safeName}`;

    setUploading(true);
    setAwaitingProofConvergence(false);
    setQueuedLocally(false);
    setPendingStoragePath(storagePath);
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
          evidenceType: 'technician_after_work',
        },
      });
      const downloadUrl = await getDownloadURL(objectRef);
      const submitEvidence = httpsCallable(functions, 'submitTechnicianAfterWorkEvidence');
      await submitEvidence({ ticketId, storagePath, downloadUrl });
      setAwaitingProofConvergence(true);
    } catch (err: any) {
      setAwaitingProofConvergence(false);
      if (isRetryableTechnicianEvidenceError(err)) {
        try {
          await queueForDurableSync(file, storagePath, safeName);
        } catch (queueError: any) {
          setQueuedLocally(false);
          setPendingStoragePath('');
          setError(queueError?.message || 'The after-work upload failed and the durable device queue could not preserve it. Keep the photo and retry before completing the mission.');
        }
      } else {
        setPendingStoragePath('');
        setError(err?.message || 'After-work evidence could not be verified. Check the mission state and retry.');
      }
    } finally {
      setUploading(false);
    }
  };

  return (
    <Paper
      data-testid="technician-after-work-evidence"
      data-evidence-queued={queuedLocally ? 'true' : 'false'}
      data-server-confirmed={existingProof ? 'true' : 'false'}
      data-pending-storage-path={pendingStoragePath}
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
            AFTER-WORK COMPLETION EVIDENCE
          </Typography>
          <Typography variant="body2" sx={{ color: '#667085', mt: 0.5 }}>
            Capture the repaired work area before closing the mission. A local photo alone never authorizes completion.
          </Typography>
        </Box>
        <Button
          component="label"
          variant={existingProof ? 'outlined' : 'contained'}
          disabled={uploading || awaitingProofConvergence}
          startIcon={(uploading || awaitingProofConvergence) ? <CircularProgress size={18} color="inherit" /> : <Camera size={18} />}
          sx={{ bgcolor: existingProof ? 'transparent' : binThemeTokens.gold, color: existingProof ? '#047857' : '#111827', fontWeight: 950 }}
        >
          {awaitingProofConvergence ? 'VERIFYING EVIDENCE' : existingProof ? 'REPLACE EVIDENCE' : queuedLocally ? 'CAPTURE REPLACEMENT' : 'CAPTURE AFTER WORK'}
          <input
            data-testid="technician-after-work-file"
            hidden
            type="file"
            accept="image/*"
            capture="environment"
            onChange={handleFile}
          />
        </Button>
      </Stack>
      {existingProof && !success && !queuedLocally && (
        <Alert data-testid="technician-after-work-confirmed" severity="success" sx={{ mt: 2 }}>
          Server-confirmed after-work evidence is attached to this mission.
        </Alert>
      )}
      {success && <Alert data-testid="technician-after-work-success" severity={queuedLocally ? 'warning' : 'success'} sx={{ mt: 2 }}>{success}</Alert>}
      {error && <Alert data-testid="technician-after-work-error" severity="error" sx={{ mt: 2 }}>{error}</Alert>}
    </Paper>
  );
}

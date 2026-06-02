import React, { useEffect, useMemo, useState } from 'react';
import {
    Alert,
    Box,
    Button,
    Chip,
    CircularProgress,
    Grid,
    IconButton,
    Paper,
    Stack,
    TextField,
    Typography,
    alpha
} from '@mui/material';
import { useNavigate, useParams } from 'react-router-dom';
import { AlertTriangle, Camera, Check, ChevronLeft, MapPin, MessageSquare, Navigation, Phone, Play, ShieldCheck, X } from 'lucide-react';
import { db, doc, functions, getDownloadURL, httpsCallable, onSnapshot, ref, storage, uploadBytes, updateDoc, serverTimestamp } from '../../lib/firebase';
import { useRole } from '../../context/RoleContext';
import { binThemeTokens } from '../../theme/binGroupTheme';
import { resolvePropertyLocation } from '../../utils/propertyLocationResolver';
import { startLiveTracking, stopLiveTracking } from '../../utils/liveTracking';

type Step = 'ACCEPTED' | 'EN_ROUTE' | 'ARRIVED' | 'IN_PROGRESS' | 'COMPLETED';

const norm = (status?: string) => String(status || '').toUpperCase();

export default function TechnicianJobDetailPage() {
    const { id } = useParams();
    const navigate = useNavigate();
    const { user } = useRole();

    const [ticket, setTicket] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [actionLoading, setActionLoading] = useState(false);
    const [notes, setNotes] = useState('');
    const [materials, setMaterials] = useState('');
    const [photos, setPhotos] = useState<File[]>([]);
    const [previews, setPreviews] = useState<string[]>([]);
    const [gpsError, setGpsError] = useState<string | null>(null);
    const [isTracking, setIsTracking] = useState(false);
    const [message, setMessage] = useState<string | null>(null);

    useEffect(() => {
        if (!id || !user?.uid) return;
        const unsub = onSnapshot(doc(db, 'maintenanceTickets', id), (snap) => {
            if (!snap.exists()) {
                setTicket(null);
                setLoading(false);
                return;
            }
            const data = { id: snap.id, ...snap.data() };
            const assigned = data.assignedTechnicianId || data.technicianId;
            if (assigned && assigned !== user.uid) {
                alert('This mission is assigned to another technician.');
                navigate('/technician/jobs');
                return;
            }
            setTicket(data);
            setLoading(false);
        });
        return () => unsub();
    }, [id, user?.uid, navigate]);

    useEffect(() => {
        return () => {
            previews.forEach((url) => URL.revokeObjectURL(url));
            if (user?.uid) stopLiveTracking(user.uid).catch(() => undefined);
        };
    }, []);

    const resolved = useMemo(() => resolvePropertyLocation(ticket || {}), [ticket]);
    const status = norm(ticket?.status);
    const hasAnyPhoto = photos.length > 0;
    const hasExistingProof = Boolean(ticket?.beforePhotoUrl || ticket?.afterPhotoUrl)
        || (Array.isArray(ticket?.proofPhotos) && ticket.proofPhotos.length > 0)
        || (Array.isArray(ticket?.evidencePhotos) && ticket.evidencePhotos.length > 0)
        || (Array.isArray(ticket?.completionPhotos) && ticket.completionPhotos.length > 0);
    const hasTenantBeforeProof = (Array.isArray(ticket?.tenantPhotos) && ticket.tenantPhotos.length > 0)
        || (Array.isArray(ticket?.photos) && ticket.photos.length > 0)
        || (Array.isArray(ticket?.initialPhotoUrls) && ticket.initialPhotoUrls.length > 0);
    const canComplete = notes.trim().length >= 10 && (hasAnyPhoto || hasExistingProof) && hasTenantBeforeProof;

    const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const next = Array.from(e.target.files || []).slice(0, 5);
        previews.forEach((url) => URL.revokeObjectURL(url));
        setPhotos(next);
        setPreviews(next.map((file) => URL.createObjectURL(file)));
    };

    const uploadCompletionPhotos = async () => {
        if (!id || photos.length === 0) return [] as string[];
        const urls: string[] = [];
        for (const file of photos) {
            const fileRef = ref(storage, `maintenanceTickets/${id}/completionPhotos/${Date.now()}_${file.name}`);
            await uploadBytes(fileRef, file);
            urls.push(await getDownloadURL(fileRef));
        }
        return urls;
    };

    const acceptJob = async () => {
        if (!id) return;
        setActionLoading(true);
        try {
            const acceptTechnicianTicket = httpsCallable(functions, 'acceptTechnicianTicket');
            await acceptTechnicianTicket({ ticketId: id });
            setMessage('Mission accepted.');
        } catch (err: any) {
            alert(err?.message || 'Could not accept mission.');
        } finally {
            setActionLoading(false);
        }
    };

    const updateLifecycle = async (nextStatus: Step) => {
        if (!id || !user?.uid) return;
        setActionLoading(true);
        setGpsError(null);
        try {
            if (nextStatus === 'EN_ROUTE') {
                startLiveTracking(id, user.uid, () => undefined, (err) => {
                    setGpsError(err);
                    setIsTracking(false);
                });
                setIsTracking(true);
            }

            if (nextStatus !== 'EN_ROUTE' && isTracking) {
                await stopLiveTracking(user.uid);
                setIsTracking(false);
            }

            if (nextStatus === 'COMPLETED') {
                const uploaded = await uploadCompletionPhotos();
                const mergedProof = [...(ticket?.proofPhotos || []), ...uploaded];
                const mergedEvidence = [...(ticket?.evidencePhotos || []), ...uploaded];
                const mergedCompletion = [...(ticket?.completionPhotos || []), ...uploaded];

                await updateDoc(doc(db, 'maintenanceTickets', id), {
                    technicianNotes: notes.trim(),
                    notes: notes.trim(),
                    materialsUsed: materials.split(',').map((x) => x.trim()).filter(Boolean),
                    proofPhotos: mergedProof,
                    evidencePhotos: mergedEvidence,
                    completionPhotos: mergedCompletion,
                    afterPhotos: mergedCompletion,
                    afterPhotoUrl: mergedCompletion[0] || ticket?.afterPhotoUrl || null,
                    updatedAt: serverTimestamp()
                });
            }

            const updateTicketLifecycle = httpsCallable(functions, 'updateTicketLifecycle');
            await updateTicketLifecycle({ ticketId: id, status: nextStatus, notes: notes.trim() });
            setMessage(nextStatus === 'COMPLETED' ? 'Completed. Tenant approval requested.' : `Status updated: ${nextStatus.replace(/_/g, ' ')}`);
            if (nextStatus === 'COMPLETED') navigate('/technician/jobs');
        } catch (err: any) {
            alert(err?.message || 'Status update failed.');
        } finally {
            setActionLoading(false);
        }
    };

    if (loading) {
        return <Box sx={{ display: 'flex', justifyContent: 'center', py: 10 }}><CircularProgress sx={{ color: binThemeTokens.gold }} /></Box>;
    }

    if (!ticket) return <Alert severity="warning">Mission not found.</Alert>;

    const contactPhone = ticket.tenantPhone || ticket.ownerPhone || ticket.requesterPhone;
    const requesterName = ticket.tenantName || ticket.ownerName || 'Resident';

    return (
        <Box>
            {message && <Alert severity="success" onClose={() => setMessage(null)} sx={{ mb: 2, borderRadius: 3 }}>{message}</Alert>}
            {gpsError && <Alert severity="warning" onClose={() => setGpsError(null)} sx={{ mb: 2, borderRadius: 3 }}>{gpsError}</Alert>}

            <Paper sx={{ p: 3, mb: 3, bgcolor: 'rgba(15,23,42,0.7)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 5 }}>
                <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={2}>
                    <Stack direction="row" spacing={2} alignItems="center">
                        <IconButton onClick={() => navigate('/technician/jobs')} sx={{ color: '#FFF' }}><ChevronLeft /></IconButton>
                        <Box>
                            <Typography variant="caption" sx={{ color: binThemeTokens.gold, fontWeight: 950 }}>MISSION REF {ticket.id.substring(0, 8).toUpperCase()}</Typography>
                            <Typography variant="h5" fontWeight="950" color="#FFF">{ticket.category || ticket.complaintCategory || 'Maintenance Mission'}</Typography>
                        </Box>
                    </Stack>
                    <Chip label={status.replace(/_/g, ' ')} sx={{ bgcolor: alpha(binThemeTokens.gold, 0.15), color: binThemeTokens.gold, fontWeight: 950 }} />
                </Stack>
            </Paper>

            <Grid container spacing={3}>
                <Grid item xs={12} lg={8}>
                    <Paper sx={{ p: 4, mb: 3, bgcolor: 'rgba(22,22,24,0.72)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 5 }}>
                        <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 950 }}>Tenant / Property Details</Typography>
                        <Grid container spacing={3} sx={{ mt: 1 }}>
                            <Grid item xs={12} md={6}>
                                <Typography variant="caption" color="textSecondary">Resident</Typography>
                                <Typography variant="h6" fontWeight="900" color="#FFF">{requesterName}</Typography>
                                <Typography variant="body2" color="textSecondary">{contactPhone || 'Phone not available'}</Typography>
                            </Grid>
                            <Grid item xs={12} md={6}>
                                <Typography variant="caption" color="textSecondary">Property / Unit</Typography>
                                <Typography variant="h6" fontWeight="900" color="#FFF">{ticket.propertyName || 'Property'}</Typography>
                                <Typography variant="body2" color="textSecondary">Unit {ticket.unitNumber || ticket.unitLabel || 'N/A'} · Floor {ticket.floorNumber || ticket.floor || 'N/A'}</Typography>
                            </Grid>
                            <Grid item xs={12}>
                                <Typography variant="caption" color="textSecondary">Address</Typography>
                                <Typography variant="body1" color="#FFF">{ticket.address || ticket.propertyLocation?.address || 'Address not available'}</Typography>
                                <Typography variant="body2" color="textSecondary">Access: {ticket.permissionToEnter || 'CALL_FIRST'} · Anyone home: {ticket.isAnyoneHome || 'UNKNOWN'} · Notes: {ticket.accessNotes || '—'}</Typography>
                            </Grid>
                        </Grid>
                    </Paper>

                    <Paper sx={{ p: 4, mb: 3, bgcolor: 'rgba(22,22,24,0.72)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 5 }}>
                        <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 950 }}>Complaint</Typography>
                        <Typography variant="body1" color="#FFF" sx={{ mt: 1, lineHeight: 1.8 }}>{ticket.description || 'No description provided.'}</Typography>
                        {(ticket.tenantPhotos || ticket.photos || ticket.initialPhotoUrls)?.length > 0 && (
                            <Stack direction="row" spacing={1.5} flexWrap="wrap" sx={{ mt: 3 }}>
                                {(ticket.tenantPhotos || ticket.photos || ticket.initialPhotoUrls).map((url: string, i: number) => (
                                    <Box key={i} component="img" src={url} onClick={() => window.open(url, '_blank')} sx={{ width: 92, height: 92, borderRadius: 2, objectFit: 'cover', cursor: 'pointer', border: '1px solid rgba(255,255,255,0.12)' }} />
                                ))}
                            </Stack>
                        )}
                    </Paper>

                    <Paper sx={{ p: 4, bgcolor: 'rgba(22,22,24,0.72)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 5 }}>
                        <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 950 }}>Mission Lifecycle</Typography>
                        <Stack direction="row" flexWrap="wrap" gap={2} sx={{ mt: 2 }}>
                            {!ticket.assignedTechnicianId ? (
                                <Button variant="contained" disabled={actionLoading} onClick={acceptJob} sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950 }}>Accept Mission</Button>
                            ) : (
                                <>
                                    <Button variant="outlined" disabled={actionLoading || !['AUTO_ASSIGNED', 'ASSIGNED', 'ACCEPTED'].includes(status)} startIcon={<Navigation />} onClick={() => updateLifecycle('EN_ROUTE')} sx={{ color: binThemeTokens.gold, borderColor: binThemeTokens.gold, fontWeight: 950 }}>On The Way</Button>
                                    <Button variant="outlined" disabled={actionLoading || status !== 'EN_ROUTE'} startIcon={<MapPin />} onClick={() => updateLifecycle('ARRIVED')} sx={{ color: '#8b5cf6', borderColor: '#8b5cf6', fontWeight: 950 }}>Arrived</Button>
                                    <Button variant="outlined" disabled={actionLoading || status !== 'ARRIVED'} startIcon={<Play />} onClick={() => updateLifecycle('IN_PROGRESS')} sx={{ color: '#10b981', borderColor: '#10b981', fontWeight: 950 }}>Start Work</Button>
                                </>
                            )}
                        </Stack>

                        {status === 'IN_PROGRESS' && (
                            <Box sx={{ mt: 4, p: 3, borderRadius: 4, border: `1px dashed ${alpha(binThemeTokens.gold, 0.35)}` }}>
                                {!hasTenantBeforeProof && <Alert severity="warning" sx={{ mb: 2 }}>Tenant before-photo proof is missing. Ask tenant/admin to add a fault photo before closing.</Alert>}
                                <TextField fullWidth multiline rows={3} label="Resolution notes — minimum 10 characters" value={notes} onChange={(e) => setNotes(e.target.value)} sx={{ mb: 2, '& .MuiOutlinedInput-root': { color: '#FFF' }, '& label': { color: 'rgba(255,255,255,0.5)' } }} />
                                <TextField fullWidth label="Materials used" value={materials} onChange={(e) => setMaterials(e.target.value)} sx={{ mb: 2, '& .MuiOutlinedInput-root': { color: '#FFF' }, '& label': { color: 'rgba(255,255,255,0.5)' } }} />
                                <Button component="label" variant="outlined" startIcon={<Camera />} sx={{ color: '#FFF', borderColor: 'rgba(255,255,255,0.25)', mb: 2 }}>
                                    Add after-work proof photos
                                    <input hidden type="file" accept="image/*" multiple onChange={handlePhotoChange} />
                                </Button>
                                <Stack direction="row" spacing={1.5} flexWrap="wrap" sx={{ mb: 2 }}>
                                    {previews.map((url, i) => <Box key={i} component="img" src={url} sx={{ width: 82, height: 82, borderRadius: 2, objectFit: 'cover' }} />)}
                                </Stack>
                                <Button fullWidth variant="contained" disabled={actionLoading || !canComplete} startIcon={actionLoading ? <CircularProgress size={18} color="inherit" /> : <Check />} onClick={() => updateLifecycle('COMPLETED')} sx={{ bgcolor: '#10b981', color: '#FFF', fontWeight: 950, py: 1.6 }}>
                                    Complete Mission & Request Tenant Feedback
                                </Button>
                            </Box>
                        )}
                    </Paper>
                </Grid>

                <Grid item xs={12} lg={4}>
                    <Stack spacing={3}>
                        <Paper sx={{ p: 3, bgcolor: 'rgba(15,23,42,0.7)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 5 }}>
                            <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 950 }}>Location</Typography>
                            {resolved.hasExactCoordinates ? (
                                <Button fullWidth variant="contained" startIcon={<Navigation />} onClick={() => window.open(resolved.googleMapsUrl, '_blank', 'noopener,noreferrer')} sx={{ mt: 2, bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950 }}>
                                    Navigate to Tenant Property
                                </Button>
                            ) : <Alert severity="warning" sx={{ mt: 2 }}>Exact GPS pin missing. Use address and contact resident/admin.</Alert>}
                            <Typography variant="body2" color="textSecondary" sx={{ mt: 2 }}>{ticket.address || ticket.propertyLocation?.address || 'No address'}</Typography>
                        </Paper>

                        <Paper sx={{ p: 3, bgcolor: 'rgba(15,23,42,0.7)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 5 }}>
                            <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 950 }}>Contact</Typography>
                            <Stack spacing={1.5} sx={{ mt: 2 }}>
                                <Button fullWidth variant="outlined" startIcon={<MessageSquare />} onClick={() => navigate(`/technician/chat/${id}`)} sx={{ color: binThemeTokens.gold, borderColor: alpha(binThemeTokens.gold, 0.5), fontWeight: 950 }}>Chat with Tenant</Button>
                                <Button fullWidth variant="outlined" disabled={!contactPhone} startIcon={<Phone />} onClick={() => window.open(`tel:${contactPhone}`)} sx={{ color: '#FFF', borderColor: 'rgba(255,255,255,0.25)', fontWeight: 950 }}>Call Tenant</Button>
                                <Button fullWidth variant="outlined" disabled={!contactPhone} startIcon={<MessageSquare />} onClick={() => window.open(`https://wa.me/${String(contactPhone).replace(/\D/g, '')}`, '_blank')} sx={{ color: '#25D366', borderColor: alpha('#25D366', 0.5), fontWeight: 950 }}>WhatsApp Tenant</Button>
                                <Button fullWidth variant="outlined" startIcon={<ShieldCheck />} onClick={() => navigate('/technician/support')} sx={{ color: 'rgba(255,255,255,0.7)', borderColor: 'rgba(255,255,255,0.18)', fontWeight: 950 }}>Contact Admin Base</Button>
                            </Stack>
                        </Paper>

                        {isTracking && <Alert icon={<Navigation />} severity="info">Live GPS is active and visible to the tenant.</Alert>}
                        <Alert icon={<AlertTriangle />} severity="warning">Do not enter unless access permission allows it or the tenant confirms by call/chat.</Alert>
                    </Stack>
                </Grid>
            </Grid>
        </Box>
    );
}

import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { 
  Box, Typography, Container, Paper, Button, Stack, Chip, TextField, Grid, 
  alpha, Dialog, DialogTitle, DialogContent, DialogActions, Divider, CircularProgress,
  Alert, IconButton
} from '@mui/material';
import { 
    ArrowLeft, Camera, CheckCircle2, MapPin, Clock, Navigation, 
    ShieldCheck, Phone, MessageSquare, ImageIcon, RefreshCcw, 
    AlertTriangle, ExternalLink, Play
} from 'lucide-react';
import { 
    db, doc, getDoc, onSnapshot, storage, ref, uploadBytes, 
    getDownloadURL, functions, httpsCallable 
} from '../lib/firebase';
import SignaturePad from '../components/SignaturePad';
import { binThemeTokens } from '../theme/binGroupTheme';
import { useLanguage } from '../context/LanguageContext';
import { useRole } from '../context/RoleContext';

export default function TicketDetailPage() {
    const { id } = useParams();
    const navigate = useNavigate();
    const { t, isRTL } = useLanguage();
    const { user, role } = useRole();
    const [ticket, setTicket] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [notes, setNotes] = useState('');
    const [updating, setUpdating] = useState(false);
    const [showCompleteModal, setShowCompleteModal] = useState(false);
    const [signature, setSignature] = useState<string | null>(null);

    useEffect(() => {
        if (!id) return;
        const docRef = doc(db, 'maintenanceTickets', id);
        const unsubscribe = onSnapshot(docRef, (docSnap: any) => {
            if (docSnap.exists()) {
                const data = docSnap.data();
                setTicket({ id: docSnap.id, ...data });
                setNotes(data.notes || '');
            }
            setLoading(false);
        });
        return () => unsubscribe();
    }, [id]);

    const handleStartWork = async () => {
        if (!id) return;
        setUpdating(true);
        try {
            const startWork = httpsCallable(functions, 'startTechnicianWork');
            await startWork({ ticketId: id });
        } catch (err: any) {
            console.error("Start Work Failed:", err);
            alert(err.message || "Failed to start work.");
        }
        setUpdating(false);
    };

    const handlePauseWork = async () => {
        if (!id) return;
        const reason = prompt(t('tech.pause_reason') || "Reason for pause (e.g. Waiting for parts):");
        if (!reason) return;
        setUpdating(true);
        try {
            const pauseWork = httpsCallable(functions, 'pauseTechnicianWork');
            await pauseWork({ ticketId: id, reason });
        } catch (err: any) {
            console.error("Pause Work Failed:", err);
            alert(err.message || "Failed to pause work.");
        }
        setUpdating(false);
    };

    const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>, field: 'BEFORE' | 'AFTER') => {
        const file = e.target.files?.[0];
        if (!file || !id) return;
        setUpdating(true);
        
        const fileName = `${field}_${Date.now()}.jpg`;
        try {
            const storageRef = ref(storage, `evidence/${id}/${fileName}`);
            await uploadBytes(storageRef, file);
            const url = await getDownloadURL(storageRef);
            
            // For now, we update the single photo fields which the UI expects
            const updateTicketLifecycle = httpsCallable(functions, 'updateTicketLifecycle'); // Still fallback if needed, but better to use direct firestore update for photos
            // Actually I'll use direct update to avoid needing the old function
            const { updateDoc, doc } = await import('firebase/firestore');
            await updateDoc(doc(db, 'maintenanceTickets', id), {
                [field === 'BEFORE' ? 'beforePhotoUrl' : 'afterPhotoUrl']: url,
                [`${field.toLowerCase()}Photos`]: [url] // Match the requested array schema too
            });
        } catch (err) {
            console.error("Photo Upload Failed:", err);
            alert("Upload Failed: System node busy.");
        }
        setUpdating(false);
    };

    const handleFinalizeCompletion = async () => {
        if (!ticket.beforePhotoUrl || !ticket.afterPhotoUrl || !notes.trim()) {
            alert("Protocol Violation: Before/After photos and notes are mandatory.");
            return;
        }
        setUpdating(true);
        try {
            const finishWork = httpsCallable(functions, 'finishTechnicianWork');
            await finishWork({ 
                ticketId: id, 
                afterPhotos: [ticket.afterPhotoUrl], 
                notes 
            });
            setShowCompleteModal(false);
            navigate('/technician');
        } catch (err: any) {
            console.error("Completion Failed:", err);
            alert(err.message || "Final handshake failed.");
        }
        setUpdating(false);
    };

    if (loading) return <Box sx={{ display: 'flex', justifyContent: 'center', p: 10 }}><CircularProgress sx={{ color: binThemeTokens.gold }}/></Box>;
    if (!ticket) return <Container sx={{ py: 10 }}><Typography color="error">NODE NOT FOUND</Typography></Container>;

    const isReadOnly = (role !== 'technician' && role !== 'specialist') || ticket.status === 'COMPLETED';

    return (
        <Container maxWidth="md" sx={{ py: 6, pb: 12 }}>
            <Paper sx={{ 
                p: 4, bgcolor: 'rgba(22, 22, 24, 0.7)', borderRadius: 6, 
                border: '1px solid rgba(255,255,255,0.05)',
                backdropFilter: 'blur(20px)'
            }}>
                {/* Header Section */}
                <Stack direction="row" justifyContent="space-between" alignItems="flex-start" sx={{ mb: 4 }}>
                    <Box>
                        <Button 
                            startIcon={isRTL ? null : <ArrowLeft size={16}/>} 
                            endIcon={isRTL ? <ArrowLeft size={16}/> : null}
                            onClick={() => navigate(-1)} 
                            sx={{ color: binThemeTokens.gold, mb: 1, p: 0, fontWeight: 950 }}
                        >
                            {t('btn.back')}
                        </Button>
                        <Typography variant="h4" fontWeight="950" color="#FFF">{ticket.complaintCategory?.toUpperCase() || 'MAINTENANCE'}</Typography>
                        <Typography variant="body2" color="rgba(255,255,255,0.5)">{ticket.propertyName} | {ticket.unitNumber}</Typography>
                    </Box>
                    <Chip 
                        label={t(`status.${ticket.status.toLowerCase()}`)} 
                        sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950, px: 2 }} 
                    />
                </Stack>

                {/* Evidence Matrix */}
                <Grid container spacing={3} sx={{ mb: 4 }}>
                    <Grid item xs={6}>
                        <Typography variant="caption" sx={{ color: binThemeTokens.gold, fontWeight: 950, display: 'block', mb: 1 }}>{t('tech.protocol.before_photo')}</Typography>
                        {ticket.beforePhotoUrl ? (
                            <Box component="img" src={ticket.beforePhotoUrl} sx={{ width: '100%', height: 180, objectFit: 'cover', borderRadius: 4, border: '1px solid rgba(255,255,255,0.1)' }} />
                        ) : (
                            <Paper sx={{ height: 180, bgcolor: 'rgba(255,255,255,0.02)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px dashed rgba(255,255,255,0.1)' }}>
                                <ImageIcon color="rgba(255,255,255,0.1)" size={32}/>
                            </Paper>
                        )}
                    </Grid>
                    <Grid item xs={6}>
                        <Typography variant="caption" sx={{ color: '#4ade80', fontWeight: 950, display: 'block', mb: 1 }}>{t('tech.protocol.after_photo')}</Typography>
                        {ticket.afterPhotoUrl ? (
                            <Box component="img" src={ticket.afterPhotoUrl} sx={{ width: '100%', height: 180, objectFit: 'cover', borderRadius: 4, border: '1px solid rgba(255,255,255,0.1)' }} />
                        ) : (
                            <Paper sx={{ height: 180, bgcolor: 'rgba(255,255,255,0.02)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px dashed rgba(255,255,255,0.1)' }}>
                                <ImageIcon color="rgba(255,255,255,0.1)" size={32}/>
                            </Paper>
                        )}
                    </Grid>
                </Grid>

                {/* Description */}
                <Box sx={{ mb: 4, p: 3, bgcolor: 'rgba(255,255,255,0.02)', borderRadius: 4, border: '1px solid rgba(255,255,255,0.05)' }}>
                    <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 950, display: 'block', mb: 1 }}>{t('tech.mission_brief')}</Typography>
                    <Typography variant="body1" color="#FFF">{ticket.description}</Typography>
                </Box>

                {/* Control Interface */}
                {!isReadOnly && (
                    <Stack spacing={2}>
                        {ticket.status === 'assigned' && (
                            <Button 
                                fullWidth variant="contained" 
                                startIcon={<Navigation size={20}/>}
                                onClick={() => handleStartWork()} 
                                sx={{ py: 2, bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950, borderRadius: 4 }}
                            >
                                {t('tech.action.start_work')}
                            </Button>
                        )}
                        
                        {(ticket.status === 'IN_PROGRESS' || ticket.status === 'ARRIVED') && (
                            <Button 
                                fullWidth variant="outlined" 
                                startIcon={<AlertTriangle size={20}/>}
                                onClick={() => handlePauseWork()} 
                                sx={{ py: 2, color: '#ffb74d', borderColor: '#ffb74d', fontWeight: 950, borderRadius: 4 }}
                            >
                                {t('tech.action.pause') || 'NEED PARTS / PAUSE'}
                            </Button>
                        )}
                        
                        {ticket.status === 'IN_PROGRESS' && (
                            <>
                                <Grid container spacing={2}>
                                    <Grid item xs={6}>
                                        <Button 
                                            fullWidth variant="outlined" component="label" 
                                            startIcon={<Camera/>} 
                                            sx={{ py: 2, color: binThemeTokens.gold, borderColor: binThemeTokens.gold, borderRadius: 4, fontWeight: 950 }}
                                        >
                                            {ticket.beforePhotoUrl ? 'UPDATE BEFORE' : 'CAPTURE BEFORE'}
                                            <input type="file" accept="image/*" hidden onChange={(e) => handlePhotoUpload(e, 'BEFORE')} />
                                        </Button>
                                    </Grid>
                                    <Grid item xs={6}>
                                        <Button 
                                            fullWidth variant="outlined" component="label" 
                                            startIcon={<Camera/>} 
                                            sx={{ py: 2, color: '#4ade80', borderColor: '#4ade80', borderRadius: 4, fontWeight: 950 }}
                                        >
                                            {ticket.afterPhotoUrl ? 'UPDATE AFTER' : 'CAPTURE AFTER'}
                                            <input type="file" accept="image/*" hidden onChange={(e) => handlePhotoUpload(e, 'AFTER')} />
                                        </Button>
                                    </Grid>
                                </Grid>
                                <Button 
                                    fullWidth variant="contained" 
                                    disabled={!ticket.beforePhotoUrl || !ticket.afterPhotoUrl || updating}
                                    onClick={() => setShowCompleteModal(true)} 
                                    sx={{ py: 2, bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950, borderRadius: 4 }}
                                >
                                    {t('tech.action.complete')}
                                </Button>
                            </>
                        )}
                    </Stack>
                )}
            </Paper>

            {/* Protocol Modal */}
            <Dialog 
                open={showCompleteModal} 
                onClose={() => setShowCompleteModal(false)} 
                fullWidth maxWidth="sm"
                PaperProps={{ sx: { bgcolor: '#111', color: '#FFF', borderRadius: 6, border: '1px solid rgba(255,255,255,0.1)' } }}
            >
                <DialogTitle sx={{ fontWeight: 950, color: binThemeTokens.gold }}>{t('tech.action.complete')}</DialogTitle>
                <DialogContent>
                    <Stack spacing={3} sx={{ mt: 1 }}>
                        <TextField 
                            fullWidth multiline rows={3} 
                            label={t('tech.protocol.notes')} 
                            placeholder="..." 
                            value={notes} 
                            onChange={(e) => setNotes(e.target.value)} 
                            sx={{ '& .MuiOutlinedInput-root': { color: '#FFF', '& fieldset': { borderColor: 'rgba(255,255,255,0.1)' } } }}
                        />
                        <Box>
                            <Typography variant="caption" sx={{ fontWeight: 950, color: 'rgba(255,255,255,0.5)', display: 'block', mb: 1 }}>{t('tech.protocol.signature')}</Typography>
                            <SignaturePad onSave={(sig) => setSignature(sig)} />
                        </Box>
                        <Alert severity="info" sx={{ bgcolor: 'rgba(212,175,55,0.05)', color: binThemeTokens.gold, '& .MuiAlert-icon': { color: binThemeTokens.gold } }}>
                            {t('ai.init.tech')}
                        </Alert>
                    </Stack>
                </DialogContent>
                <DialogActions sx={{ p: 3 }}>
                    <Button onClick={() => setShowCompleteModal(false)} sx={{ color: 'rgba(255,255,255,0.5)', fontWeight: 950 }}>{t('btn.back')}</Button>
                    <Button 
                        variant="contained" 
                        onClick={handleFinalizeCompletion} 
                        disabled={updating || !signature} 
                        sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950, px: 4, borderRadius: 3 }}
                    >
                        {t('btn.submit')}
                    </Button>
                </DialogActions>
            </Dialog>
        </Container>
    );
}

import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { 
  Box, Typography, Container, Paper, Button, Stack, Chip, TextField, Grid, 
  alpha, Dialog, DialogTitle, DialogContent, DialogActions, Divider, CircularProgress,
  Alert
} from '@mui/material';
import { ArrowLeft, Camera, CheckCircle2, MapPin, Clock, Navigation, ShieldCheck, PenTool, Phone, MessageSquare, User, ImageIcon, AlertTriangle, RefreshCcw } from 'lucide-react';
import { db, doc, getDoc, updateDoc, serverTimestamp, onSnapshot, storage, ref, uploadBytes, getDownloadURL } from '../lib/firebase';
import { queueMutation, queueAttachment, processQueues } from '../lib/offlineSync';
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
        const unsubscribe = onSnapshot(docRef, async (docSnap: any) => {
            if (docSnap.exists()) {
                const data = docSnap.data();
                setTicket({ id: docSnap.id, ...data });
                setNotes(data.notes || '');
            }
            setLoading(false);
        });
        return () => unsubscribe();
    }, [id]);

    const handleUpdateStatus = async (newStatus: string) => {
        if (!id) return;
        setUpdating(true);
        const updateData = { status: newStatus, updatedAt: serverTimestamp() };
        try {
            await updateDoc(doc(db, 'maintenanceTickets', id), updateData);
        } catch (err) {
            console.warn("Offline: Queueing status update.");
            await queueMutation('maintenanceTickets', id, updateData);
            setTicket((prev: any) => ({ ...prev, status: newStatus, pending_sync: true }));
        }
        setUpdating(false);
    };

    const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>, field: string) => {
        const file = e.target.files?.[0];
        if (!file || !id) return;
        setUpdating(true);
        
        const fileName = `${field}_${Date.now()}.jpg`;
        try {
            const storageRef = ref(storage, `evidence/${id}/${fileName}`);
            await uploadBytes(storageRef, file);
            const url = await getDownloadURL(storageRef);
            await updateDoc(doc(db, 'maintenanceTickets', id), { [field]: true, [`${field}Url`]: url, updatedAt: serverTimestamp() });
        } catch (err) {
            console.warn("Offline: Queueing photo.");
            await queueAttachment(id, field, file, fileName);
            setTicket((prev: any) => ({ ...prev, [field]: true, [`${field}Pending`]: true }));
        }
        setUpdating(false);
    };

    const handleFinalizeCompletion = async () => {
        if (!signature || !ticket.hasBeforePhoto || !ticket.hasAfterPhoto || !notes.trim()) {
            alert("Protocol Violation: Full Evidence Required.");
            return;
        }
        setUpdating(true);
        const updateData = { status: 'COMPLETED', notes, completedAt: serverTimestamp(), updatedAt: serverTimestamp() };
        
        try {
            await updateDoc(doc(db, 'maintenanceTickets', id!), updateData);
            // Signatures usually uploaded as separate file
            const sigRef = ref(storage, `evidence/${id}/signature_${Date.now()}.png`);
            // signature is base64 from pad
            const res = await fetch(signature);
            const blob = await res.blob();
            await uploadBytes(sigRef, blob);
            const url = await getDownloadURL(sigRef);
            await updateDoc(doc(db, 'maintenanceTickets', id!), { hasSignature: true, signatureUrl: url });
        } catch (err) {
            console.warn("Offline: Queueing completion protocol.");
            await queueMutation('maintenanceTickets', id!, updateData);
            await queueAttachment(id!, 'hasSignature', signature, `signature_${Date.now()}.png`);
            setTicket((prev: any) => ({ ...prev, status: 'COMPLETED', pending_sync: true }));
        }
        
        setShowCompleteModal(false);
        setUpdating(false);
    };

    if (loading) return <Box sx={{ display: 'flex', justifyContent: 'center', p: 10 }}><CircularProgress sx={{ color: binThemeTokens.gold }}/></Box>;
    if (!ticket) return <Container sx={{ py: 10 }}><Typography color="error">NODE NOT FOUND</Typography></Container>;

    const isReadOnly = role !== 'technician' || ticket.status === 'COMPLETED';

    return (
        <Container maxWidth="md" sx={{ py: 6 }}>
            <Paper sx={{ p: 4, bgcolor: 'rgba(22, 22, 24, 0.7)', borderRadius: 6, border: '1px solid rgba(255,255,255,0.05)' }}>
                <Stack direction="row" justifyContent="space-between" alignItems="flex-start" sx={{ mb: 4 }}>
                    <Box>
                        <Button startIcon={<ArrowLeft size={16}/>} onClick={() => navigate(-1)} sx={{ color: binThemeTokens.gold, mb: 1, p: 0 }}>BACK</Button>
                        <Typography variant="h4" fontWeight="950" color="#FFF">{ticket.category?.toUpperCase() || 'MAINTENANCE'}</Typography>
                        <Typography variant="body2" color="rgba(255,255,255,0.5)">{ticket.propertyName} | {ticket.unitNumber}</Typography>
                        {(ticket.pending_sync || ticket.hasBeforePhotoPending || ticket.hasAfterPhotoPending) && (
                            <Chip 
                                icon={<RefreshCcw size={12}/>} 
                                label="OFFLINE: PENDING SYNC" 
                                size="small" 
                                sx={{ mt: 1, bgcolor: alpha(binThemeTokens.gold, 0.1), color: binThemeTokens.gold, fontWeight: 950, border: `1px solid ${alpha(binThemeTokens.gold, 0.3)}` }} 
                            />
                        )}
                    </Box>
                    <Chip label={ticket.status} sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950 }} />
                </Stack>

                <Grid container spacing={3} sx={{ mb: 4 }}>
                    <Grid item xs={6}>
                        <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
                            <Typography variant="caption" sx={{ color: binThemeTokens.gold, fontWeight: 900 }}>BEFORE PHOTO</Typography>
                            {ticket.hasBeforePhotoPending && <Chip label="QUEUED" size="small" sx={{ height: 16, fontSize: 8 }}/>}
                        </Stack>
                        {ticket.hasBeforePhotoUrl ? <Box component="img" src={ticket.hasBeforePhotoUrl} sx={{ width: '100%', height: 180, objectFit: 'cover', borderRadius: 4 }} /> : 
                        <Paper sx={{ height: 180, bgcolor: 'rgba(255,255,255,0.02)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px dashed rgba(255,255,255,0.1)' }}>
                            <ImageIcon color="rgba(255,255,255,0.1)" size={32}/>
                        </Paper>}
                    </Grid>
                    <Grid item xs={6}>
                        <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
                            <Typography variant="caption" sx={{ color: '#4ade80', fontWeight: 900 }}>AFTER PHOTO</Typography>
                            {ticket.hasAfterPhotoPending && <Chip label="QUEUED" size="small" sx={{ height: 16, fontSize: 8 }}/>}
                        </Stack>
                        {ticket.hasAfterPhotoUrl ? <Box component="img" src={ticket.hasAfterPhotoUrl} sx={{ width: '100%', height: 180, objectFit: 'cover', borderRadius: 4 }} /> : 
                        <Paper sx={{ height: 180, bgcolor: 'rgba(255,255,255,0.02)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px dashed rgba(255,255,255,0.1)' }}>
                            <ImageIcon color="rgba(255,255,255,0.1)" size={32}/>
                        </Paper>}
                    </Grid>
                </Grid>

                <Box sx={{ mb: 4, p: 3, bgcolor: 'rgba(255,255,255,0.02)', borderRadius: 4 }}>
                    <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 950, display: 'block', mb: 1 }}>MISSION DESCRIPTION</Typography>
                    <Typography variant="body1" color="#FFF">{ticket.description}</Typography>
                </Box>

                {!isReadOnly && (
                    <Stack spacing={2}>
                        {ticket.status === 'ASSIGNED' && <Button fullWidth variant="contained" onClick={() => handleUpdateStatus('EN_ROUTE')} sx={{ py: 2, bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950 }}>ON THE WAY</Button>}
                        {ticket.status === 'EN_ROUTE' && <Button fullWidth variant="contained" onClick={() => handleUpdateStatus('ARRIVED')} sx={{ py: 2, bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950 }}>I HAVE ARRIVED</Button>}
                        {ticket.status === 'ARRIVED' && <Button fullWidth variant="contained" onClick={() => handleUpdateStatus('IN_PROGRESS')} sx={{ py: 2, bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950 }}>START MISSION</Button>}
                        
                        {ticket.status === 'IN_PROGRESS' && (
                            <>
                                <Stack direction="row" spacing={2}>
                                    <Button fullWidth variant="outlined" component="label" startIcon={<Camera/>} sx={{ py: 2, color: binThemeTokens.gold, borderColor: binThemeTokens.gold }}>
                                        {ticket.hasBeforePhoto ? 'RE-UPLOAD BEFORE' : 'CAPTURE BEFORE'}
                                        <input type="file" accept="image/*" hidden onChange={(e) => handlePhotoUpload(e, 'hasBeforePhoto')} />
                                    </Button>
                                    <Button fullWidth variant="outlined" component="label" startIcon={<Camera/>} sx={{ py: 2, color: '#4ade80', borderColor: '#4ade80' }}>
                                        {ticket.hasAfterPhoto ? 'RE-UPLOAD AFTER' : 'CAPTURE AFTER'}
                                        <input type="file" accept="image/*" hidden onChange={(e) => handlePhotoUpload(e, 'hasAfterPhoto')} />
                                    </Button>
                                </Stack>
                                <Button 
                                    fullWidth variant="contained" 
                                    disabled={!ticket.hasBeforePhoto || !ticket.hasAfterPhoto}
                                    onClick={() => setShowCompleteModal(true)} 
                                    sx={{ py: 2, bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950 }}
                                >
                                    FINALIZE MISSION
                                </Button>
                            </>
                        )}
                    </Stack>
                )}
            </Paper>

            <Dialog open={showCompleteModal} onClose={() => setShowCompleteModal(false)} fullWidth maxWidth="sm">
                <DialogTitle sx={{ fontWeight: 950 }}>FINAL EVIDENCE PROTOCOL</DialogTitle>
                <DialogContent>
                    <Stack spacing={3} sx={{ mt: 1 }}>
                        <TextField fullWidth multiline rows={3} label="Service Notes" placeholder="Detail any parts used or system findings..." value={notes} onChange={(e) => setNotes(e.target.value)} />
                        <Box>
                            <Typography variant="caption" sx={{ fontWeight: 950, color: 'text.secondary', display: 'block', mb: 1 }}>TENANT SIGNATURE REQUIRED</Typography>
                            <SignaturePad onSave={(sig) => setSignature(sig)} />
                        </Box>
                        <Alert severity="info" icon={<ShieldCheck size={18}/>} sx={{ fontSize: '0.75rem' }}>Digital evidence is locked into the Sovereign Vault upon submission.</Alert>
                    </Stack>
                </DialogContent>
                <DialogActions sx={{ p: 3 }}>
                    <Button onClick={() => setShowCompleteModal(false)} sx={{ fontWeight: 900 }}>CANCEL</Button>
                    <Button 
                        variant="contained" 
                        onClick={handleFinalizeCompletion} 
                        disabled={updating || !signature} 
                        sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950 }}
                    >
                        SUBMIT MISSION
                    </Button>
                </DialogActions>
            </Dialog>
        </Container>
    );
}

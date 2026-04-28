import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Box, Typography, Container, Paper, Button, Stack, Chip, TextField, Grid, alpha, Dialog, DialogTitle, DialogContent, DialogActions, Divider, CircularProgress } from '@mui/material';
import { ArrowLeft, Camera, CheckCircle2, MapPin, Clock, Navigation, ShieldCheck, PenTool, Phone, MessageSquare, User, ImageIcon } from 'lucide-react';
import { db, doc, getDoc, updateDoc, serverTimestamp, onSnapshot, storage, ref, uploadBytes, getDownloadURL } from '../lib/firebase';
import { queueMutation, queueAttachment } from '../lib/offlineSync';
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
    const [distanceInfo, setDistanceInfo] = useState<{ distance: string, eta: string } | null>(null);
    const [showCompleteModal, setShowCompleteModal] = useState(false);
    const [signature, setSignature] = useState<string | null>(null);

    useEffect(() => {
        if (!id) return;
        const docRef = doc(db, 'maintenanceTickets', id);
        const unsubscribe = onSnapshot(docRef, async (docSnap: any) => {
            if (docSnap.exists()) {
                const data = docSnap.data();
                const ticketData = { id: docSnap.id, ...data };
                
                if (role === 'technician' && (data.assignedTechnicianId === user?.uid)) {
                    if (!data.tenantPhone && data.tenantId) {
                        try {
                            const tenantSnap = await getDoc(doc(db, 'users', data.tenantId));
                            if (tenantSnap.exists()) {
                                ticketData.tenantPhone = tenantSnap.data()?.phone || tenantSnap.data()?.phoneNumber;
                            }
                        } catch (e) {}
                    }
                }

                setTicket(ticketData);
                setNotes(data.notes || '');
                
                if (data.status === 'EN_ROUTE' && data.techLocation && data.propertyLocation?.location) {
                    calculateDistance(data.techLocation, data.propertyLocation.location);
                } else {
                    setDistanceInfo(null);
                }
            }
        });
        setLoading(false);
        return () => unsubscribe();
    }, [id, role, user?.uid]);

    const calculateDistance = (techLoc: any, propLoc: any) => {
        const R = 6371;
        const dLat = (propLoc.lat - techLoc.lat) * Math.PI / 180;
        const dLon = (propLoc.lng - techLoc.lng) * Math.PI / 180;
        const a = Math.sin(dLat/2) * Math.sin(dLat/2) + Math.cos(techLoc.lat * Math.PI / 180) * Math.cos(propLoc.lat * Math.PI / 180) * Math.sin(dLon/2) * Math.sin(dLon/2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
        const d = R * c;
        const distStr = d < 1 ? `${(d * 1000).toFixed(0)}m` : `${d.toFixed(1)}km`;
        const etaMin = Math.ceil(d * 5);
        setDistanceInfo({ distance: distStr, eta: `${etaMin}-${etaMin + 2} mins` });
    };

    const updateStatus = async (newStatus: string) => {
        if (!id || !user?.uid) return;
        setUpdating(true);

        const updateData: any = { status: newStatus, updatedAt: serverTimestamp(), notes: notes };
        try {
            await updateDoc(doc(db, 'maintenanceTickets', id), updateData);
            setTicket({ ...ticket, ...updateData });
        } catch (err) {
            await queueMutation('maintenanceTickets', id, updateData);
            setTicket({ ...ticket, ...updateData, pending_sync: true });
        }
        setUpdating(false);
    };

    const handleFinalizeCompletion = async () => {
        if (!signature || !ticket.hasBeforePhoto || !ticket.hasAfterPhoto || !notes.trim()) {
            alert("Protocol Violation: Evidence Required.");
            return;
        }
        setUpdating(true);
        const updateData = { status: 'COMPLETED', tenantSignature: signature, notes, completedAt: serverTimestamp(), updatedAt: serverTimestamp() };
        
        try {
            await updateDoc(doc(db, 'maintenanceTickets', id!), updateData);
        } catch (err) {
            await queueMutation('maintenanceTickets', id!, updateData);
            await queueAttachment(id!, 'tenantSignature', signature, `signature_${Date.now()}.png`);
            setTicket({ ...ticket, ...updateData, pending_sync: true });
        }
        
        setShowCompleteModal(false);
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
            await queueAttachment(id, field, file, fileName);
            setTicket({ ...ticket, [field]: true, [`${field}Pending`]: true });
        }
        setUpdating(false);
    };

    if (loading) return <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '80vh' }}><CircularProgress color="inherit" sx={{ color: binThemeTokens.gold }} /></Box>;
    if (!ticket) return <Container sx={{ py: 8 }}><Typography color="white">NODE NOT FOUND.</Typography></Container>;

    const isReadOnly = role === 'owner' || role === 'ceo' || role === 'admin';

    return (
        <Container maxWidth="md" sx={{ py: 6 }}>
            <Button 
                startIcon={<ArrowLeft size={18} />} 
                onClick={() => navigate(-1)}
                sx={{ color: binThemeTokens.gold, mb: 4, fontWeight: 900 }}
            >
                {t('common.back')}
            </Button>

            <Paper sx={{ p: 4, bgcolor: 'rgba(22, 22, 24, 0.7)', border: `1px solid ${isReadOnly ? binThemeTokens.gold : 'rgba(255,255,255,0.05)'}`, borderRadius: 6 }}>
                {isReadOnly && (
                    <Box sx={{ mb: 4, p: 2, bgcolor: alpha(binThemeTokens.gold, 0.1), border: `1px solid ${binThemeTokens.gold}`, borderRadius: 2, display: 'flex', alignItems: 'center', gap: 2 }}>
                        <ShieldCheck color={binThemeTokens.gold} />
                        <Typography variant="caption" sx={{ color: binThemeTokens.gold, fontWeight: 950, letterSpacing: 2 }}>
                            SOVEREIGN EVIDENCE VAULT™ PROTOCOL ACTIVE
                        </Typography>
                    </Box>
                )}

                <Stack direction="row" justifyContent="space-between" alignItems="flex-start" sx={{ mb: 4 }}>
                    <Box>
                        <Typography variant="overline" sx={{ color: binThemeTokens.textSecondary, fontWeight: 900 }}>REF: {ticket.id.substring(0, 8)}</Typography>
                        <Typography variant="h4" fontWeight="900" sx={{ color: '#FFFFFF', mb: 1 }}>{ticket.trade || 'GENERAL'}</Typography>
                        <Typography variant="body2" sx={{ color: binThemeTokens.textSecondary }}>{ticket.propertyName} ({ticket.unitNumber})</Typography>
                        {(ticket.pending_sync || ticket.hasBeforePhotoPending || ticket.hasAfterPhotoPending) && (
                            <Chip label="OFFLINE - PENDING SYNC" size="small" sx={{ mt: 1, bgcolor: alpha(binThemeTokens.gold, 0.2), color: binThemeTokens.gold, fontWeight: 900 }} />
                        )}
                    </Box>
                    <Chip label={ticket.status} sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 900 }} />
                </Stack>

                <Grid container spacing={3} sx={{ mb: 4 }}>
                    <Grid item xs={6}>
                        <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
                            <Typography variant="caption" sx={{ color: binThemeTokens.gold, fontWeight: 900 }}>BEFORE PHOTO</Typography>
                            {ticket.hasBeforePhotoPending && <Chip label="QUEUED" size="small" sx={{ height: 16, fontSize: 10, bgcolor: 'rgba(255,255,255,0.1)' }} />}
                        </Stack>
                        {ticket.hasBeforePhotoUrl ? <Box component="img" src={ticket.hasBeforePhotoUrl} sx={{ width: '100%', height: 200, objectFit: 'cover', borderRadius: 4 }} /> : <Paper sx={{ height: 200, bgcolor: 'rgba(255,255,255,0.02)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><ImageIcon color="rgba(255,255,255,0.1)" /></Paper>}
                    </Grid>
                    <Grid item xs={6}>
                        <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
                            <Typography variant="caption" sx={{ color: '#4ade80', fontWeight: 900 }}>AFTER PHOTO</Typography>
                            {ticket.hasAfterPhotoPending && <Chip label="QUEUED" size="small" sx={{ height: 16, fontSize: 10, bgcolor: 'rgba(255,255,255,0.1)' }} />}
                        </Stack>
                        {ticket.hasAfterPhotoUrl ? <Box component="img" src={ticket.hasAfterPhotoUrl} sx={{ width: '100%', height: 200, objectFit: 'cover', borderRadius: 4 }} /> : <Paper sx={{ height: 200, bgcolor: 'rgba(255,255,255,0.02)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><ImageIcon color="rgba(255,255,255,0.1)" /></Paper>}
                    </Grid>
                </Grid>

                <Box sx={{ mb: 4, p: 3, bgcolor: 'rgba(255,255,255,0.02)', borderRadius: 4 }}>
                    <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 900, mb: 1, display: 'block' }}>DESCRIPTION</Typography>
                    <Typography variant="body1" sx={{ color: '#FFF' }}>{ticket.description}</Typography>
                </Box>

                {!isReadOnly && role === 'technician' && (
                    <Stack spacing={2}>
                        {!ticket.hasBeforePhoto && (
                            <Button variant="outlined" component="label" startIcon={<Camera />} sx={{ py: 2, color: binThemeTokens.gold, borderColor: binThemeTokens.gold }}>
                                UPLOAD BEFORE PHOTO
                                <input hidden accept="image/*" type="file" onChange={(e) => handlePhotoUpload(e, 'hasBeforePhoto')} />
                            </Button>
                        )}
                        {ticket.hasBeforePhoto && !ticket.hasAfterPhoto && (
                            <Button variant="outlined" component="label" startIcon={<Camera />} sx={{ py: 2, color: '#4ade80', borderColor: '#4ade80' }}>
                                UPLOAD AFTER PHOTO
                                <input hidden accept="image/*" type="file" onChange={(e) => handlePhotoUpload(e, 'hasAfterPhoto')} />
                            </Button>
                        )}
                        {ticket.hasBeforePhoto && ticket.hasAfterPhoto && ticket.status !== 'COMPLETED' && (
                            <Button variant="contained" fullWidth size="large" onClick={() => setShowCompleteModal(true)} sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950 }}>
                                FINALIZE MISSION
                            </Button>
                        )}
                    </Stack>
                )}
            </Paper>

            <Dialog open={showCompleteModal} onClose={() => setShowCompleteModal(false)} fullWidth maxWidth="sm">
                <DialogTitle sx={{ fontWeight: 900 }}>Final Protocol Confirmation</DialogTitle>
                <DialogContent>
                    <Stack spacing={3} sx={{ mt: 1 }}>
                        <TextField fullWidth multiline rows={3} label="Completion Notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
                        <Box>
                            <Typography variant="subtitle2" sx={{ mb: 1 }}>Digital Signature Required</Typography>
                            <SignaturePad onSave={(sig) => setSignature(sig)} />
                        </Box>
                    </Stack>
                </DialogContent>
                <DialogActions sx={{ p: 3 }}>
                    <Button onClick={() => setShowCompleteModal(false)}>Cancel</Button>
                    <Button variant="contained" onClick={handleFinalizeCompletion} disabled={updating} sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 900 }}>
                        SUBMIT TO VAULT
                    </Button>
                </DialogActions>
            </Dialog>
        </Container>
    );
}

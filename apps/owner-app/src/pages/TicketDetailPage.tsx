import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Box, Typography, Container, Paper, Button, Stack, Chip, TextField, Grid, alpha, Dialog, DialogTitle, DialogContent, DialogActions } from '@mui/material';
import { ArrowLeft, Camera, CheckCircle2, MapPin, Clock, Navigation, ShieldCheck, PenTool } from 'lucide-react';
import { db, doc, getDoc, updateDoc, serverTimestamp, onSnapshot } from '../lib/firebase';
import { queueMutation } from '../lib/offlineSync';
import SignaturePad from '../components/SignaturePad';
import { binThemeTokens } from '../theme/binGroupTheme';
import { useLanguage } from '../context/LanguageContext';
import { useRole } from '../context/RoleContext';

export default function TicketDetailPage() {
    const { id } = useParams();
    const navigate = useNavigate();
    const { t } = useLanguage();
    const { user, role } = useRole();
    const [ticket, setTicket] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [notes, setNotes] = useState('');
    const [updating, setUpdating] = useState(false);
    const [geoWatcher, setGeoWatcher] = useState<number | null>(null);
    const [distanceInfo, setDistanceInfo] = useState<{ distance: string, eta: string } | null>(null);
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
                
                // Calculate distance if techLocation exists and user is tenant or same technician
                if (data.status === 'EN_ROUTE' && data.techLocation && data.propertyLocation?.location) {
                    calculateDistance(data.techLocation, data.propertyLocation.location);
                } else {
                    setDistanceInfo(null);
                }
            }
        });
        setLoading(false);
        return () => unsubscribe();
    }, [id]);

    useEffect(() => {
        // Broadcaster Logic for Technicians
        if (ticket?.status === 'EN_ROUTE' && role === 'technician' && !geoWatcher) {
            startGeoBroadcasting();
        } else if (ticket?.status !== 'EN_ROUTE' && geoWatcher) {
            stopGeoBroadcasting();
        }

        return () => stopGeoBroadcasting();
    }, [ticket?.status, role]);

    const startGeoBroadcasting = () => {
        if (!navigator.geolocation) {
            console.error("Geolocation is not supported by this browser.");
            return;
        }

        const watcherId = navigator.geolocation.watchPosition(
            async (position) => {
                const { latitude, longitude, heading } = position.coords;
                try {
                    const ticketRef = doc(db, 'maintenanceTickets', id!);
                    await updateDoc(ticketRef, {
                        techLocation: {
                            lat: latitude,
                            lng: longitude,
                            heading: heading || 0,
                            timestamp: Date.now()
                        }
                    });
                } catch (err) {
                    console.error("Failed to update tech location:", err);
                }
            },
            (error) => {
                console.warn("Geolocation permission/error:", error);
            },
            {
                enableHighAccuracy: true,
                maximumAge: 10000,
                timeout: 5000
            }
        );
        setGeoWatcher(watcherId);
    };

    const stopGeoBroadcasting = () => {
        if (geoWatcher !== null) {
            navigator.geolocation.clearWatch(geoWatcher);
            setGeoWatcher(null);
        }
    };

    const calculateDistance = (techLoc: any, propLoc: any) => {
        const R = 6371; // Earth radius in km
        const dLat = (propLoc.lat - techLoc.lat) * Math.PI / 180;
        const dLon = (propLoc.lng - techLoc.lng) * Math.PI / 180;
        const a = 
            Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(techLoc.lat * Math.PI / 180) * Math.cos(propLoc.lat * Math.PI / 180) * 
            Math.sin(dLon/2) * Math.sin(dLon/2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
        const d = R * c;
        
        const distStr = d < 1 ? `${(d * 1000).toFixed(0)}m` : `${d.toFixed(1)}km`;
        const etaMin = Math.ceil(d * 5); // Rough estimate: 5 min per km
        setDistanceInfo({
            distance: distStr,
            eta: `${etaMin}-${etaMin + 2} mins`
        });
    };

    const handleNavigate = () => {
        if (!ticket?.propertyLocation) return;
        const loc = ticket.propertyLocation;
        let query = '';
        
        if (loc.location) {
            const lat = (loc.location as any).lat ?? (loc.location as any).latitude;
            const lng = (loc.location as any).lng ?? (loc.location as any).longitude;
            if (lat !== undefined && lng !== undefined) {
                query = `${lat},${lng}`;
            }
        }
        
        if (!query) {
            query = encodeURIComponent(`${loc.address}, ${loc.propertyName}`);
        }
        
        // Use Google Maps Direction API for seamless native deep-linking
        window.open(`https://www.google.com/maps/dir/?api=1&destination=${query}`, '_blank');
    };

    const updateStatus = async (newStatus: string) => {
        if (!id || !user?.uid) return;
        const docRef = doc(db, 'maintenanceTickets', id);
        const updateData: any = {
            status: newStatus,
            updatedAt: serverTimestamp(),
            notes: notes
        };

        try {
            // If technician is taking an OPEN ticket, assign them
            if ((ticket.status === 'OPEN' || ticket.status === 'assigned' || ticket.status === 'ASSIGNED') && (newStatus === 'EN_ROUTE' || newStatus === 'IN_PROGRESS')) {
                updateData.assignedTechnicianId = user.uid;
                updateData.technicianName = user.displayName || 'Maintenance Specialist';
                updateData.assignedAt = serverTimestamp();
            }

            await updateDoc(docRef, updateData);
            setTicket({ ...ticket, ...updateData, status: newStatus });
        } catch (err) {
            console.warn("Status Update Failed - Queuing for Offline Sync:", err);
            queueMutation('maintenanceTickets', id, updateData);
            setTicket({ ...ticket, ...updateData, status: newStatus });
        }
        setUpdating(false);
    };

    const handleFinalizeCompletion = async () => {
        if (!signature || !ticket.hasBeforePhoto || !ticket.hasAfterPhoto) return;
        setUpdating(true);
        const updateData = {
            status: 'COMPLETED',
            tenantSignature: signature,
            completedAt: serverTimestamp(),
            updatedAt: serverTimestamp()
        };
        
        try {
            await updateDoc(doc(db, 'maintenanceTickets', id!), updateData);
            setShowCompleteModal(false);
        } catch (err) {
            console.warn("Completion sync failed - offline queue active.");
            queueMutation('maintenanceTickets', id!, updateData);
            setShowCompleteModal(false);
        }
        setUpdating(false);
    };

    const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>, field: string) => {
        const file = e.target.files?.[0];
        if (!file || !id) return;

        setUpdating(true);
        // Simulate upload latency and success
        await new Promise(resolve => setTimeout(resolve, 1500));

        try {
            const docRef = doc(db, 'maintenanceTickets', id);
            await updateDoc(docRef, {
                [field]: true,
                updatedAt: serverTimestamp()
            });
            setTicket((prev: any) => prev ? { ...prev, [field]: true } : null);
        } catch (err) {
            console.error("Photo Upload Failed:", err);
        }
        setUpdating(false);
    }

    const triggerCamera = (field: string) => {
        const input = document.getElementById(`camera-input-${field}`) as HTMLInputElement;
        if (input) input.click();
    }

    if (loading) return <Container sx={{ py: 8 }}><Typography color="white">STABILIZING NODE DATA...</Typography></Container>;
    if (!ticket) return <Container sx={{ py: 8 }}><Typography color="white">NODE NOT FOUND.</Typography></Container>;

    const canComplete = ticket.hasBeforePhoto && ticket.hasAfterPhoto;

    return (
        <Container maxWidth="md" sx={{ py: 6 }}>
            <Button 
                startIcon={<ArrowLeft size={18} />} 
                onClick={() => navigate('/tech')}
                sx={{ color: binThemeTokens.gold, mb: 4, fontWeight: 900 }}
            >
                {t('common.back')}
            </Button>

            <Paper sx={{ p: 4, bgcolor: 'rgba(22, 22, 24, 0.7)', border: '1px solid rgba(198,167,94,0.15)', borderRadius: 6 }}>
                <Stack direction="row" justifyContent="space-between" alignItems="flex-start" sx={{ mb: 4 }}>
                    <Box>
                        <Typography variant="overline" sx={{ color: binThemeTokens.textSecondary, fontWeight: 900 }}>{t('tech.ticket_id')}: {ticket.id.substring(0, 8)}</Typography>
                        <Typography variant="h4" fontWeight="900" sx={{ color: '#FFFFFF', mb: 1 }}>{ticket.trade || 'GENERAL'}</Typography>
                        <Stack direction="row" spacing={2} alignItems="center">
                            <MapPin size={16} color={binThemeTokens.gold} />
                            <Typography variant="body2" sx={{ color: binThemeTokens.textSecondary }}>
                                {ticket.propertyLocation?.propertyName || ticket.propertyId || 'PORTFOLIO ASSET'} ({ticket.propertyLocation?.unitNumber || 'N/A'})
                            </Typography>
                        </Stack>
                    </Box>
                    <Stack spacing={1} alignItems="flex-end">
                        <Chip 
                            label={ticket.status} 
                            sx={{ bgcolor: binThemeTokens.gold, color: '#0B0B0C', fontWeight: 900, px: 2 }} 
                        />
                        {ticket.propertyLocation && (
                            <Button 
                                size="small"
                                startIcon={<Navigation size={14} />}
                                onClick={handleNavigate}
                                sx={{ color: binThemeTokens.gold, fontWeight: 900, fontSize: '0.7rem', border: `1px solid ${alpha(binThemeTokens.gold, 0.3)}` }}
                            >
                                Navigate
                            </Button>
                        )}
                    </Stack>
                </Stack>

                {ticket.status === 'EN_ROUTE' && (
                    <Box sx={{ mb: 4, p: 3, bgcolor: alpha(binThemeTokens.gold, 0.1), border: `1px solid ${alpha(binThemeTokens.gold, 0.3)}`, borderRadius: 4 }}>
                        <Stack spacing={3}>
                            <Stack direction="row" spacing={3} alignItems="center">
                                <Box sx={{ position: 'relative' }}>
                                    <Navigation size={32} color={binThemeTokens.gold} className="animate-pulse" />
                                </Box>
                                <Box sx={{ flexGrow: 1 }}>
                                    <Typography variant="h6" fontWeight="900" sx={{ color: binThemeTokens.gold }}>TECHNICIAN EN ROUTE</Typography>
                                    <Typography variant="body2" sx={{ color: binThemeTokens.textSecondary }}>Live tracking active via Sovereign GPS Engine.</Typography>
                                </Box>
                                {distanceInfo && (
                                    <Box sx={{ textAlign: 'right' }}>
                                        <Typography variant="h5" fontWeight="950" sx={{ color: '#FFF' }}>{distanceInfo.eta}</Typography>
                                        <Typography variant="caption" sx={{ color: binThemeTokens.gold, fontWeight: 800 }}>{distanceInfo.distance} AWAY</Typography>
                                    </Box>
                                )}
                            </Stack>
                            {role === 'technician' && (
                                <Button 
                                    fullWidth 
                                    variant="contained" 
                                    size="large"
                                    startIcon={<Navigation size={20} />}
                                    onClick={handleNavigate}
                                    sx={{ 
                                        py: 2, 
                                        bgcolor: binThemeTokens.gold, 
                                        color: '#000', 
                                        fontWeight: 950, 
                                        borderRadius: 4,
                                        boxShadow: `0 10px 20px ${alpha(binThemeTokens.gold, 0.3)}`,
                                        '&:hover': { bgcolor: '#E6C77A' }
                                    }}
                                >
                                    NAVIGATE TO PROPERTY
                                </Button>
                            )}
                        </Stack>
                    </Box>
                )}

                <Typography variant="body1" sx={{ color: '#FFFFFF', mb: 4, p: 3, bgcolor: 'rgba(255,255,255,0.03)', borderRadius: 3, border: '1px solid rgba(255,255,255,0.05)' }}>
                    {ticket.description}
                </Typography>

                <Grid container spacing={3} sx={{ mb: 4 }}>
                    <Grid item xs={6}>
                        <Box
                            component="input"
                            type="file" 
                            accept="image/*" 
                            capture="environment" 
                            sx={{ display: 'none' }} 
                            id="camera-input-hasBeforePhoto"
                            title={t('tech.photo.upload_before')}
                            aria-label={t('tech.photo.upload_before')}
                            onChange={(e: any) => handlePhotoUpload(e, 'hasBeforePhoto')}
                        />
                        <Button 
                            fullWidth 
                            variant="outlined" 
                            startIcon={<Camera />}
                            onClick={() => triggerCamera('hasBeforePhoto')}
                            disabled={updating || ticket.hasBeforePhoto}
                            sx={{ py: 4, borderRadius: 4, borderColor: ticket.hasBeforePhoto ? '#4ade80' : 'rgba(198,167,94,0.3)', color: ticket.hasBeforePhoto ? '#4ade80' : binThemeTokens.gold }}
                        >
                            {ticket.hasBeforePhoto ? t('tech.photo.before_uploaded') : t('tech.photo.upload_before')}
                        </Button>
                    </Grid>
                    <Grid item xs={6}>
                        <Box
                            component="input"
                            type="file" 
                            accept="image/*" 
                            capture="environment" 
                            sx={{ display: 'none' }} 
                            id="camera-input-hasAfterPhoto"
                            title={t('tech.photo.upload_after')}
                            aria-label={t('tech.photo.upload_after')}
                            onChange={(e: any) => handlePhotoUpload(e, 'hasAfterPhoto')}
                        />
                        <Button 
                            fullWidth 
                            variant="outlined" 
                            startIcon={<Camera />}
                            onClick={() => triggerCamera('hasAfterPhoto')}
                            disabled={updating || ticket.hasAfterPhoto}
                            sx={{ py: 4, borderRadius: 4, borderColor: ticket.hasAfterPhoto ? '#4ade80' : 'rgba(198,167,94,0.3)', color: ticket.hasAfterPhoto ? '#4ade80' : binThemeTokens.gold }}
                        >
                            {ticket.hasAfterPhoto ? t('tech.photo.after_uploaded') : t('tech.photo.upload_after')}
                        </Button>
                    </Grid>
                </Grid>

                <TextField
                    fullWidth
                    multiline
                    rows={4}
                    label={t('tech.completion_notes')}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    sx={{ 
                        mb: 4,
                        '& .MuiOutlinedInput-root': { color: '#FFFFFF', borderRadius: 4, bgcolor: 'rgba(255,255,255,0.02)' },
                        '& .MuiInputLabel-root': { color: binThemeTokens.textSecondary }
                    }}
                />

                <Stack spacing={2}>
                    {(ticket.status === 'OPEN' || ticket.status === 'ASSIGNED' || ticket.status === 'assigned') && (
                        <Button 
                            fullWidth 
                            variant="contained" 
                            onClick={() => updateStatus('EN_ROUTE')}
                            disabled={updating}
                            sx={{ py: 2, bgcolor: binThemeTokens.gold, color: '#0B0B0C', fontWeight: 900, borderRadius: 3 }}
                        >
                            {t('tech.action.en_route')}
                        </Button>
                    )}
                    {ticket.status === 'EN_ROUTE' && (
                        <Button 
                            fullWidth 
                            variant="contained" 
                            onClick={() => updateStatus('IN_PROGRESS')}
                            disabled={updating}
                            sx={{ py: 2, bgcolor: binThemeTokens.gold, color: '#0B0B0C', fontWeight: 900, borderRadius: 3 }}
                        >
                            {t('tech.action.start_work')}
                        </Button>
                    )}
                    {ticket.status === 'IN_PROGRESS' && (
                        <Button 
                            fullWidth 
                            variant="contained" 
                            onClick={() => setShowCompleteModal(true)}
                            disabled={updating || !canComplete}
                            startIcon={<CheckCircle2 />}
                            sx={{ py: 2, bgcolor: '#4ade80', color: '#0B0B0C', fontWeight: 900, borderRadius: 3 }}
                        >
                            {canComplete ? t('tech.action.complete_mission') : t('tech.action.evidence_required')}
                        </Button>
                    )}
                </Stack>
            </Paper>

            {/* Proof of Work Modal */}
            <Dialog 
                open={showCompleteModal} 
                onClose={() => !updating && setShowCompleteModal(false)}
                fullWidth
                maxWidth="sm"
                PaperProps={{ sx: { borderRadius: 6, bgcolor: '#FFF' } }}
            >
                <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 2, pt: 4 }}>
                    <ShieldCheck color={binThemeTokens.gold} />
                    <Typography variant="h5" fontWeight="950">Mission Completion Lock</Typography>
                </DialogTitle>
                <DialogContent>
                    <Stack spacing={3} sx={{ mt: 2 }}>
                        <Typography variant="body2" color="textSecondary">
                            Confirm the resolution of this sovereign mission. The following attributes are required for institutional protocol compliance.
                        </Typography>

                        <Box sx={{ p: 2, bgcolor: alpha(binThemeTokens.gold, 0.05), border: `1px solid ${alpha(binThemeTokens.gold, 0.2)}`, borderRadius: 4 }}>
                            <Stack spacing={1}>
                                <Typography variant="caption" fontWeight="950">EVIDENCE CHECKLIST</Typography>
                                <Stack direction="row" spacing={2}>
                                    <Chip label="Before Photo" color={ticket.hasBeforePhoto ? "success" : "default"} size="small" />
                                    <Chip label="After Photo" color={ticket.hasAfterPhoto ? "success" : "default"} size="small" />
                                </Stack>
                            </Stack>
                        </Box>

                        <Box>
                            <Typography variant="subtitle2" fontWeight="900" sx={{ mb: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
                                <PenTool size={16} /> TENANT SIGN-OFF (DIGITAL)
                            </Typography>
                            <SignaturePad onSave={(sig) => setSignature(sig)} />
                        </Box>
                    </Stack>
                </DialogContent>
                <DialogActions sx={{ p: 4 }}>
                    <Button onClick={() => setShowCompleteModal(false)} sx={{ color: 'text.secondary' }}>Cancel</Button>
                    <Button 
                        onClick={handleFinalizeCompletion}
                        disabled={!signature || !canComplete || updating}
                        variant="contained"
                        sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 900, borderRadius: 100, px: 4 }}
                    >
                        FINALISE MISSION
                    </Button>
                </DialogActions>
            </Dialog>
        </Container>
    );
}

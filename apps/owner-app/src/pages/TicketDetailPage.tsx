import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Box, Typography, Container, Paper, Button, Stack, Chip, TextField, Grid, alpha } from '@mui/material';
import { ArrowLeft, Camera, CheckCircle2, MapPin, Clock, Navigation } from 'lucide-react';
import { db, doc, getDoc, updateDoc, serverTimestamp } from '../lib/firebase';
import { binThemeTokens } from '../theme/binGroupTheme';
import { useLanguage } from '../context/LanguageContext';

import { useRole } from '../context/RoleContext';

export default function TicketDetailPage() {
    const { id } = useParams();
    const navigate = useNavigate();
    const { t } = useLanguage();
    const { user } = useRole();
    const [ticket, setTicket] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [notes, setNotes] = useState('');
    const [updating, setUpdating] = useState(false);

    useEffect(() => {
        if (!id) return;
        const fetchTicket = async () => {
            const docRef = doc(db, 'maintenanceTickets', id);
            const docSnap = await getDoc(docRef);
            if (docSnap.exists()) {
                setTicket({ id: docSnap.id, ...docSnap.data() });
                setNotes(docSnap.data().notes || '');
            }
            setLoading(false);
        };
        fetchTicket();
    }, [id]);

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
        
        window.open(`https://www.google.com/maps/search/?api=1&query=${query}`, '_blank');
    };

    const updateStatus = async (newStatus: string) => {
        if (!id || !user?.uid) return;
        setUpdating(true);
        try {
            const docRef = doc(db, 'maintenanceTickets', id);
            const updateData: any = {
                status: newStatus,
                updatedAt: serverTimestamp(),
                notes: notes
            };

            // If technician is taking an OPEN ticket, assign them
            if ((ticket.status === 'OPEN' || ticket.status === 'assigned' || ticket.status === 'ASSIGNED') && (newStatus === 'EN_ROUTE' || newStatus === 'IN_PROGRESS')) {
                updateData.assignedTechnicianId = user.uid;
                updateData.technicianName = user.displayName || 'Maintenance Specialist';
                updateData.assignedAt = serverTimestamp();
            }

            await updateDoc(docRef, updateData);
            setTicket({ ...ticket, ...updateData, status: newStatus });
        } catch (err) {
            console.error("Status Update Failed:", err);
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
                            onClick={() => updateStatus('COMPLETED')}
                            disabled={updating || !canComplete}
                            startIcon={<CheckCircle2 />}
                            sx={{ py: 2, bgcolor: '#4ade80', color: '#0B0B0C', fontWeight: 900, borderRadius: 3 }}
                        >
                            {canComplete ? t('tech.action.complete_mission') : t('tech.action.evidence_required')}
                        </Button>
                    )}
                </Stack>
            </Paper>
        </Container>
    );
}

import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Box, Typography, Container, Paper, Button, Stack, Chip, TextField, Grid } from '@mui/material';
import { ArrowLeft, Camera, CheckCircle2, MapPin, Clock } from 'lucide-react';
import { db, doc, getDoc, updateDoc, serverTimestamp } from '../lib/firebase';
import { binThemeTokens } from '../theme/binGroupTheme';
import { useLanguage } from '../context/LanguageContext';

export default function TicketDetailPage() {
    const { id } = useParams();
    const navigate = useNavigate();
    const { t } = useLanguage();
    const [ticket, setTicket] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [notes, setNotes] = useState('');
    const [updating, setUpdating] = useState(false);

    useEffect(() => {
        if (!id) return;
        const fetchTicket = async () => {
            const docRef = doc(db, 'tickets', id);
            const docSnap = await getDoc(docRef);
            if (docSnap.exists()) {
                setTicket({ id: docSnap.id, ...docSnap.data() });
                setNotes(docSnap.data().notes || '');
            }
            setLoading(false);
        };
        fetchTicket();
    }, [id]);

    const updateStatus = async (newStatus: string) => {
        if (!id) return;
        setUpdating(true);
        try {
            const docRef = doc(db, 'tickets', id);
            await updateDoc(docRef, {
                status: newStatus,
                updatedAt: serverTimestamp(),
                notes: notes
            });
            setTicket({ ...ticket, status: newStatus, notes });
        } catch (err) {
            console.error("Status Update Failed:", err);
        }
        setUpdating(false);
    };

    const simulatePhotoUpload = async (field: string) => {
        if (!id) return;
        setUpdating(true);
        try {
            const docRef = doc(db, 'tickets', id);
            await updateDoc(docRef, {
                [field]: true,
                updatedAt: serverTimestamp()
            });
            setTicket({ ...ticket, [field]: true });
        } catch (err) {
            console.error("Photo Upload Failed:", err);
        }
        setUpdating(false);
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
                <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 4 }}>
                    <Box>
                        <Typography variant="overline" sx={{ color: binThemeTokens.textSecondary, fontWeight: 900 }}>{t('tech.ticket_id')}: {ticket.id.substring(0, 8)}</Typography>
                        <Typography variant="h4" fontWeight="900" sx={{ color: '#FFFFFF', mb: 1 }}>{ticket.trade}</Typography>
                        <Stack direction="row" spacing={2} alignItems="center">
                            <MapPin size={16} color={binThemeTokens.gold} />
                            <Typography variant="body2" sx={{ color: binThemeTokens.textSecondary }}>{ticket.propertyId}</Typography>
                        </Stack>
                    </Box>
                    <Chip 
                        label={ticket.status} 
                        sx={{ bgcolor: binThemeTokens.gold, color: '#0B0B0C', fontWeight: 900, px: 2 }} 
                    />
                </Stack>

                <Typography variant="body1" sx={{ color: '#FFFFFF', mb: 4, p: 3, bgcolor: 'rgba(255,255,255,0.03)', borderRadius: 3, border: '1px solid rgba(255,255,255,0.05)' }}>
                    {ticket.description}
                </Typography>

                <Grid container spacing={3} sx={{ mb: 4 }}>
                    <Grid item xs={6}>
                        <Button 
                            fullWidth 
                            variant="outlined" 
                            startIcon={<Camera />}
                            onClick={() => simulatePhotoUpload('hasBeforePhoto')}
                            disabled={updating || ticket.hasBeforePhoto}
                            sx={{ py: 4, borderRadius: 4, borderColor: ticket.hasBeforePhoto ? '#4ade80' : 'rgba(198,167,94,0.3)', color: ticket.hasBeforePhoto ? '#4ade80' : binThemeTokens.gold }}
                        >
                            {ticket.hasBeforePhoto ? t('tech.photo.before_uploaded') : t('tech.photo.upload_before')}
                        </Button>
                    </Grid>
                    <Grid item xs={6}>
                        <Button 
                            fullWidth 
                            variant="outlined" 
                            startIcon={<Camera />}
                            onClick={() => simulatePhotoUpload('hasAfterPhoto')}
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
                    {ticket.status === 'OPEN' && (
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

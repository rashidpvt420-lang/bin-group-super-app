import React, { useState, useEffect } from 'react';
import {
    Box, Typography, Paper, Grid, Stack, Chip, 
    CircularProgress, Card, CardContent, Divider,
    IconButton, alpha, Button, Avatar,
    Dialog, DialogTitle, DialogContent, DialogActions
} from '@mui/material';
import { 
    Wrench, Clock, CheckCircle2, AlertTriangle, 
    ChevronRight, MapPin, Image as ImageIcon, 
    MessageSquare, Phone, Activity
} from 'lucide-react';
import { db, collection, query, where, onSnapshot, orderBy } from '../../lib/firebase';
import { useRole } from '../../context/RoleContext';
import { useLanguage } from '../../context/LanguageContext';
import { binThemeTokens } from '../../theme/binGroupTheme';

export default function OwnerMaintenancePage() {
    const { user } = useRole();
    const { t, isRTL } = useLanguage();
    const [loading, setLoading] = useState(true);
    const [tickets, setTickets] = useState<any[]>([]);
    const [selectedTicket, setSelectedTicket] = useState<any>(null);
    const [detailOpen, setDetailOpen] = useState(false);

    useEffect(() => {
        if (!user?.email) return;

        const email = user.email.toLowerCase();
        const q = query(
            collection(db, 'maintenanceTickets'),
            where('ownerEmail', '==', email),
            orderBy('createdAt', 'desc')
        );

        const unsub = onSnapshot(q, (snap) => {
            setTickets(snap.docs.map(d => ({ id: d.id, ...d.data() })));
            setLoading(false);
        }, (err) => {
            console.error("Owner tickets fetch error:", err);
            setLoading(false);
        });

        return () => unsub();
    }, [user]);

    const getStatusChip = (status: string) => {
        const s = (status || '').toLowerCase();
        let color = 'default';
        let label = status;

        if (['open', 'accepted'].includes(s)) { color = 'info'; label = 'QUEUED'; }
        else if (['on_the_way', 'arrived', 'in_progress'].includes(s)) { color = 'warning'; label = 'IN PROGRESS'; }
        else if (['completed', 'closed'].includes(s)) { color = 'success'; label = 'COMPLETED'; }
        else if (s === 'emergency_submitted') { color = 'error'; label = 'EMERGENCY'; }

        return (
            <Chip 
                label={label.toUpperCase()} 
                size="small" 
                sx={{ 
                    bgcolor: alpha(binThemeTokens.gold, 0.1), 
                    color: binThemeTokens.gold, 
                    fontWeight: 950,
                    fontSize: '0.65rem'
                }} 
            />
        );
    };

    if (loading) return (
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', py: 10 }}>
            <CircularProgress sx={{ color: binThemeTokens.gold }} />
            <Typography variant="overline" sx={{ mt: 2, color: 'rgba(255,255,255,0.4)', fontWeight: 900 }}>Synchronizing Maintenance Ledger...</Typography>
        </Box>
    );

    return (
        <Box>
            <Box sx={{ mb: 6 }}>
                <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 950, letterSpacing: 4 }}>ASSET INTEGRITY</Typography>
                <Typography variant="h4" fontWeight="950" color="#FFF">Maintenance Terminal</Typography>
            </Box>

            <Grid container spacing={4}>
                {/* Stats Summary */}
                <Grid item xs={12}>
                    <Grid container spacing={3}>
                        {[
                            { label: 'ACTIVE MISSIONS', count: tickets.filter(t => !['completed', 'closed'].includes(t.status?.toLowerCase())).length, icon: <Activity color={binThemeTokens.gold} /> },
                            { label: 'COMPLETED', count: tickets.filter(t => ['completed', 'closed'].includes(t.status?.toLowerCase())).length, icon: <CheckCircle2 color="#10b981" /> },
                            { label: 'EMERGENCY', count: tickets.filter(t => t.priority === 'emergency').length, icon: <AlertTriangle color="#ef4444" /> }
                        ].map((stat, i) => (
                            <Grid item xs={12} md={4} key={i}>
                                <Paper sx={{ p: 3, bgcolor: 'rgba(15, 23, 42, 0.6)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 6, display: 'flex', alignItems: 'center', gap: 3 }}>
                                    <Box sx={{ p: 2, bgcolor: 'rgba(255,255,255,0.02)', borderRadius: 4 }}>{stat.icon}</Box>
                                    <Box>
                                        <Typography variant="h4" fontWeight="950" color="#FFF">{stat.count}</Typography>
                                        <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 900 }}>{stat.label}</Typography>
                                    </Box>
                                </Paper>
                            </Grid>
                        ))}
                    </Grid>
                </Grid>

                {/* Ticket List */}
                <Grid item xs={12}>
                    <Stack spacing={2}>
                        {tickets.map(ticket => (
                            <Paper 
                                key={ticket.id} 
                                onClick={() => { setSelectedTicket(ticket); setDetailOpen(true); }}
                                sx={{ 
                                    p: 3, bgcolor: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', 
                                    borderRadius: 6, cursor: 'pointer', transition: 'all 0.2s',
                                    '&:hover': { bgcolor: 'rgba(255,255,255,0.04)', borderColor: binThemeTokens.gold }
                                }}
                            >
                                <Grid container spacing={2} alignItems="center">
                                    <Grid item xs={12} md={4}>
                                        <Stack direction="row" spacing={2} alignItems="center">
                                            <Box sx={{ p: 1.5, bgcolor: alpha(binThemeTokens.gold, 0.1), borderRadius: 3, color: binThemeTokens.gold }}>
                                                <Wrench size={20} />
                                            </Box>
                                            <Box>
                                                <Typography variant="body1" fontWeight="950" color="#FFF">{ticket.category || 'Maintenance'}</Typography>
                                                <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 900 }}>REF: #{ticket.id.substring(0,8).toUpperCase()}</Typography>
                                            </Box>
                                        </Stack>
                                    </Grid>
                                    <Grid item xs={6} md={3}>
                                        <Stack direction="row" spacing={1} alignItems="center">
                                            <MapPin size={14} color="rgba(255,255,255,0.3)" />
                                            <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.6)', fontWeight: 700 }}>
                                                {ticket.propertyName} · {ticket.unitNumber}
                                            </Typography>
                                        </Stack>
                                    </Grid>
                                    <Grid item xs={6} md={3}>
                                        {getStatusChip(ticket.status)}
                                    </Grid>
                                    <Grid item xs={12} md={2} sx={{ textAlign: 'right' }}>
                                        <IconButton size="small" sx={{ color: 'rgba(255,255,255,0.2)' }}><ChevronRight /></IconButton>
                                    </Grid>
                                </Grid>
                            </Paper>
                        ))}
                        {tickets.length === 0 && (
                            <Paper sx={{ p: 10, textAlign: 'center', bgcolor: 'transparent', border: '2px dashed rgba(255,255,255,0.05)', borderRadius: 10 }}>
                                <Wrench size={48} color="rgba(255,255,255,0.05)" style={{ margin: '0 auto 16px' }} />
                                <Typography sx={{ color: 'rgba(255,255,255,0.2)', fontWeight: 800 }}>NO MAINTENANCE RECORDS FOUND</Typography>
                            </Paper>
                        )}
                    </Stack>
                </Grid>
            </Grid>

            {/* Detail Dialog */}
            <Dialog 
                open={detailOpen} onClose={() => setDetailOpen(false)} maxWidth="md" fullWidth
                PaperProps={{ sx: { bgcolor: '#0f172a', color: '#FFF', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)' } }}
            >
                {selectedTicket && (
                    <>
                        <DialogTitle sx={{ borderBottom: '1px solid rgba(255,255,255,0.05)', p: 4 }}>
                            <Stack direction="row" justifyContent="space-between" alignItems="center">
                                <Box>
                                    <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 950 }}>MISSION AUDIT</Typography>
                                    <Typography variant="h5" fontWeight="950">{selectedTicket.category}</Typography>
                                </Box>
                                {getStatusChip(selectedTicket.status)}
                            </Stack>
                        </DialogTitle>
                        <DialogContent sx={{ p: 4 }}>
                            <Grid container spacing={4}>
                                <Grid item xs={12} md={7}>
                                    <Typography variant="overline" sx={{ color: 'rgba(255,255,255,0.3)', fontWeight: 900, mb: 2, display: 'block' }}>DESCRIPTION</Typography>
                                    <Typography variant="body1" sx={{ color: '#FFF', mb: 4, lineHeight: 1.8 }}>{selectedTicket.description}</Typography>
                                    
                                    <Divider sx={{ my: 4, borderColor: 'rgba(255,255,255,0.05)' }} />
                                    
                                    <Typography variant="overline" sx={{ color: 'rgba(255,255,255,0.3)', fontWeight: 900, mb: 2, display: 'block' }}>DIGITAL EVIDENCE (BEFORE/AFTER)</Typography>
                                    <Grid container spacing={2}>
                                        {(selectedTicket.beforePhotos || []).concat(selectedTicket.afterPhotos || []).length > 0 ? (
                                            (selectedTicket.beforePhotos || []).concat(selectedTicket.afterPhotos || []).map((url: string, i: number) => (
                                                <Grid item xs={4} key={i}>
                                                    <Card sx={{ bgcolor: 'rgba(255,255,255,0.02)', borderRadius: 4, border: '1px solid rgba(255,255,255,0.05)' }}>
                                                        <Box sx={{ position: 'relative', pt: '100%' }}>
                                                            <img 
                                                                src={url} alt="Evidence" 
                                                                style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', objectFit: 'cover' }} 
                                                            />
                                                        </Box>
                                                    </Card>
                                                </Grid>
                                            ))
                                        ) : (
                                            <Grid item xs={12}>
                                                <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.2)', fontStyle: 'italic' }}>No digital evidence uploaded for this mission yet.</Typography>
                                            </Grid>
                                        )}
                                    </Grid>
                                </Grid>
                                <Grid item xs={12} md={5}>
                                    <Paper sx={{ p: 3, bgcolor: 'rgba(255,255,255,0.02)', borderRadius: 6, border: '1px solid rgba(255,255,255,0.05)' }}>
                                        <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 950, mb: 2, display: 'block' }}>ASSIGNED OPERATOR</Typography>
                                        {selectedTicket.assignedTechnicianId ? (
                                            <Stack spacing={2}>
                                                <Stack direction="row" spacing={2} alignItems="center">
                                                    <Avatar sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950 }}>
                                                        {selectedTicket.assignedTechnicianName?.charAt(0) || 'T'}
                                                    </Avatar>
                                                    <Box>
                                                        <Typography variant="subtitle2" fontWeight="950">{selectedTicket.assignedTechnicianName}</Typography>
                                                        <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)' }}>Certified Technician</Typography>
                                                    </Box>
                                                </Stack>
                                                <Button fullWidth variant="outlined" startIcon={<MessageSquare />} sx={{ borderRadius: 3, color: binThemeTokens.gold, borderColor: alpha(binThemeTokens.gold, 0.3) }}>
                                                    CONTACT SUPPORT
                                                </Button>
                                            </Stack>
                                        ) : (
                                            <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.2)' }}>Awaiting operator assignment.</Typography>
                                        )}
                                    </Paper>
                                </Grid>
                            </Grid>
                        </DialogContent>
                        <DialogActions sx={{ p: 4, borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                            <Button onClick={() => setDetailOpen(false)} sx={{ color: 'rgba(255,255,255,0.5)', fontWeight: 900 }}>CLOSE AUDIT</Button>
                        </DialogActions>
                    </>
                )}
            </Dialog>
        </Box>
    );
}

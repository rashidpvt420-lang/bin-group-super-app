import React, { useState, useEffect } from 'react';
import {
    Box, Typography, Paper, Grid, Stack, Button, CircularProgress,
    Chip, Divider, alpha, Dialog, DialogTitle, DialogContent, DialogActions,
    TextField, MenuItem, Select, Alert
} from '@mui/material';
import {
    AlertTriangle, Shield, CheckCircle2, UserCheck, XCircle, RotateCcw
} from 'lucide-react';
import { db, collection, query, where, onSnapshot, functions, httpsCallable } from '../../lib/firebase';
import { useLanguage } from '@bin/shared';
import { binThemeTokens } from '../../theme/adminTheme';
import AdminPageFrame from '../../components/AdminPageFrame';

export default function DisputeQueuePage() {
    const { isRTL } = useLanguage();
    const [loading, setLoading] = useState(true);
    const [disputes, setDisputes] = useState<any[]>([]);
    const [openResolve, setOpenResolve] = useState(false);
    const [selectedDispute, setSelectedDispute] = useState<any>(null);
    const [resolutionNote, setResolutionNote] = useState('');
    const [resolutionAction, setResolutionAction] = useState('request_revisit');
    const [resolveError, setResolveError] = useState('');

    useEffect(() => {
        const q = query(
            collection(db, 'maintenanceTickets'),
            where('requiresAdminReview', '==', true),
            where('adminReviewStatus', '==', 'PENDING_DISPUTE_REVIEW')
        );

        const unsubscribe = onSnapshot(q, (snap) => {
            setDisputes(snap.docs.map(d => ({ id: d.id, ...d.data() })));
            setLoading(false);
        }, (err) => {
            console.error('Failed to load disputes:', err);
            setLoading(false);
        });

        return () => unsubscribe();
    }, []);

    const handleOpenResolve = (dispute: any) => {
        setSelectedDispute(dispute);
        setResolutionNote('');
        setResolutionAction('request_revisit');
        setOpenResolve(true);
    };

    const handleResolve = async () => {
        if (!selectedDispute) return;
        setResolveError('');
        try {
            const resolveDispute = httpsCallable(functions, 'adminResolveTicketDispute');
            await resolveDispute({
                ticketId: selectedDispute.id,
                action: resolutionAction,
                note: resolutionNote.trim(),
            });
            setOpenResolve(false);
            setSelectedDispute(null);
        } catch (err: any) {
            console.error('Failed to resolve dispute:', err);
            setResolveError(err?.message || 'Dispute resolution failed.');
        }
    };

    if (loading) return <Box sx={{ display: 'flex', justifyContent: 'center', py: 10 }}><CircularProgress sx={{ color: binThemeTokens.gold }} /></Box>;

    return (
        <AdminPageFrame title="Dispute Resolution Queue">
            <Box sx={{ mb: 4, display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 2 }}>
                <Typography variant="h5" color="#FFF" fontWeight="950" sx={{ fontSize: { xs: '1.15rem', md: '1.5rem' } }}>
                    Dispute & Escalation Queue
                </Typography>
                <Chip label={`${disputes.length} Pending`} color={disputes.length > 0 ? "error" : "success"} />
            </Box>
            {resolveError && <Alert severity="error" sx={{ mb: 3 }}>{resolveError}</Alert>}

            <Grid container spacing={{ xs: 2, md: 3 }}>
                {disputes.map(dispute => (
                    <Grid item xs={12} key={dispute.id}>
                        <Paper sx={{ p: { xs: 2, md: 3 }, bgcolor: 'rgba(22, 22, 24, 0.7)', border: `1px solid ${alpha('#ef4444', 0.2)}`, borderRadius: 4 }}>
                            <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ xs: 'stretch', sm: 'flex-start' }} spacing={2} sx={{ mb: 2 }}>
                                <Stack direction="row" spacing={2} alignItems="center">
                                    <Box sx={{ p: 1.5, borderRadius: 2, bgcolor: alpha('#ef4444', 0.1), color: '#ef4444' }}>
                                        <AlertTriangle size={24} />
                                    </Box>
                                    <Box>
                                        <Typography variant="subtitle1" color="#FFF" fontWeight="bold">
                                            Ticket #{dispute.ticketNumber || dispute.id.substring(0, 8)}
                                        </Typography>
                                        <Typography variant="body2" color="text.secondary">
                                            Tenant: {dispute.tenantName || 'Unknown'} • Technician: {dispute.technicianName || 'Unknown'}
                                        </Typography>
                                    </Box>
                                </Stack>
                                <Button variant="contained" color="error" onClick={() => handleOpenResolve(dispute)}>
                                    Resolve Dispute
                                </Button>
                            </Stack>

                            <Box sx={{ p: 2, bgcolor: 'rgba(0,0,0,0.3)', borderRadius: 2, mt: 2 }}>
                                <Typography variant="caption" color="text.secondary" fontWeight="bold">DISPUTE REASON</Typography>
                                <Typography variant="body1" color="#FFF" sx={{ mt: 1 }}>
                                    {dispute.disputeReason || 'Tenant rejected completion proof without specific reason.'}
                                </Typography>
                            </Box>
                        </Paper>
                    </Grid>
                ))}
                {disputes.length === 0 && (
                    <Grid item xs={12}>
                        <Box sx={{ p: 5, textAlign: 'center' }}>
                            <Shield size={48} color={binThemeTokens.gold} style={{ opacity: 0.5, marginBottom: 16 }} />
                            <Typography color="text.secondary" variant="h6">No pending disputes.</Typography>
                        </Box>
                    </Grid>
                )}
            </Grid>

            {/* Resolution Dialog */}
            <Dialog open={openResolve} onClose={() => setOpenResolve(false)} PaperProps={{ sx: { bgcolor: '#0f172a', color: '#FFF', borderRadius: 4, minWidth: 400 } }}>
                <DialogTitle sx={{ color: binThemeTokens.gold, fontWeight: 'bold' }}>Resolve Dispute</DialogTitle>
                <DialogContent>
                    <Typography variant="body2" sx={{ mb: 3, color: 'text.secondary' }}>
                        Choose how to resolve ticket #{selectedDispute?.ticketNumber || selectedDispute?.id?.substring(0,8)}.
                    </Typography>
                    
                    <Select fullWidth value={resolutionAction} onChange={(e) => setResolutionAction(e.target.value)} sx={{ mb: 3, bgcolor: 'rgba(255,255,255,0.05)', color: '#FFF' }}>
                        <MenuItem value="request_revisit">Request Technician Revisit (Free of charge)</MenuItem>
                        <MenuItem value="approve_credit">Approve SLA Credit / Refund</MenuItem>
                        <MenuItem value="dismiss">Dismiss Dispute (Close Ticket)</MenuItem>
                    </Select>

                    {resolutionAction === 'approve_credit' && (
                        <Alert severity="warning" sx={{ mb: 2 }}>
                            SLA credit is a payment decision. A verified Finance Admin MFA session is required.
                        </Alert>
                    )}

                    <TextField 
                        fullWidth 
                        multiline 
                        rows={4} 
                        placeholder="Resolution notes (internal only)..." 
                        value={resolutionNote} 
                        onChange={(e) => setResolutionNote(e.target.value)}
                        sx={{ bgcolor: 'rgba(255,255,255,0.05)', borderRadius: 1 }}
                        InputProps={{ style: { color: '#FFF' } }}
                    />
                </DialogContent>
                <DialogActions sx={{ p: 3 }}>
                    <Button onClick={() => setOpenResolve(false)} sx={{ color: 'text.secondary' }}>CANCEL</Button>
                    <Button variant="contained" color="primary" onClick={handleResolve} disabled={resolutionNote.trim().length < 8}>
                        CONFIRM RESOLUTION
                    </Button>
                </DialogActions>
            </Dialog>
        </AdminPageFrame>
    );
}

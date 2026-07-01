import React, { useState, useEffect } from 'react';
import {
    Box, Typography, Paper, Grid, Stack, Button, CircularProgress,
    Chip, Divider, alpha, Dialog, DialogTitle, DialogContent, DialogActions,
    TextField, MenuItem, Select
} from '@mui/material';
import {
    AlertTriangle, Shield, CheckCircle2, UserCheck, XCircle, RotateCcw
} from 'lucide-react';
import { db, collection, query, where, onSnapshot, doc, updateDoc, addDoc, serverTimestamp } from '../../lib/firebase';
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
        try {
            const updates: any = {
                adminReviewStatus: 'RESOLVED',
                requiresAdminReview: false,
                disputeResolutionAction: resolutionAction,
                disputeResolutionNote: resolutionNote,
                disputeResolvedAt: serverTimestamp(),
                disputeResolvedBy: 'admin',
                updatedAt: serverTimestamp()
            };

            if (resolutionAction === 'request_revisit') {
                updates.status = 'disputed_revisit_required';
                await addDoc(collection(db, 'maintenanceTickets'), {
                    parentId: selectedDispute.id,
                    tenantId: selectedDispute.tenantId || null,
                    tenantUid: selectedDispute.tenantUid || null,
                    ownerId: selectedDispute.ownerId || null,
                    propertyId: selectedDispute.propertyId || null,
                    unitId: selectedDispute.unitId || null,
                    title: `REVISIT: ${selectedDispute.title || 'Disputed Job'}`,
                    description: `Admin Revisit Dispatch. Reason: ${resolutionNote || 'No notes'}`,
                    status: 'OPEN',
                    priority: 'high',
                    createdAt: serverTimestamp(),
                    updatedAt: serverTimestamp()
                });
            } else if (resolutionAction === 'approve_credit') {
                updates.status = 'closed_with_credit';
                if (selectedDispute.ownerId) {
                    await addDoc(collection(db, 'payment_transactions'), {
                        ownerId: selectedDispute.ownerId,
                        type: 'SLA_CREDIT',
                        amount: 50, // Standard SLA credit or variable
                        currency: 'AED',
                        description: `SLA Credit for Disputed Ticket: ${selectedDispute.id}`,
                        status: 'PENDING_APPROVAL',
                        approved: false,
                        paymentVerified: false,
                        createdAt: serverTimestamp()
                    });
                }
            } else if (resolutionAction === 'dismiss') {
                updates.status = 'closed';
            }

            await updateDoc(doc(db, 'maintenanceTickets', selectedDispute.id), updates);
            setOpenResolve(false);
            setSelectedDispute(null);
        } catch (err) {
            console.error('Failed to resolve dispute:', err);
        }
    };

    if (loading) return <Box sx={{ display: 'flex', justifyContent: 'center', py: 10 }}><CircularProgress sx={{ color: binThemeTokens.gold }} /></Box>;

    return (
        <AdminPageFrame title="Dispute Resolution Queue">
            <Box sx={{ mb: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Typography variant="h5" color="#FFF" fontWeight="950">Dispute & Escalation Queue</Typography>
                <Chip label={`${disputes.length} Pending`} color={disputes.length > 0 ? "error" : "success"} />
            </Box>

            <Grid container spacing={3}>
                {disputes.map(dispute => (
                    <Grid item xs={12} key={dispute.id}>
                        <Paper sx={{ p: 3, bgcolor: 'rgba(22, 22, 24, 0.7)', border: `1px solid ${alpha('#ef4444', 0.2)}`, borderRadius: 4 }}>
                            <Stack direction="row" justifyContent="space-between" alignItems="flex-start" sx={{ mb: 2 }}>
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
                    <Button variant="contained" color="primary" onClick={handleResolve} disabled={!resolutionNote.trim()}>
                        CONFIRM RESOLUTION
                    </Button>
                </DialogActions>
            </Dialog>
        </AdminPageFrame>
    );
}

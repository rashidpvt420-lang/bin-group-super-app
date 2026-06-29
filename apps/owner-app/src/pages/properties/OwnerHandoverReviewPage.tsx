import React, { useState, useEffect } from 'react';
import {
    Box, Typography, Paper, Grid, Stack, Button, CircularProgress,
    Chip, Divider, alpha, Dialog, DialogTitle, DialogContent, DialogActions,
    TextField
} from '@mui/material';
import {
    ClipboardCheck, Search, Filter, CheckCircle2, AlertTriangle, PenTool
} from 'lucide-react';
import { db, collection, query, where, orderBy, onSnapshot, doc, updateDoc, serverTimestamp } from '../../lib/firebase';
import { useRole } from '../../context/RoleContext';
import { useLanguage } from '../../context/LanguageContext';
import { binThemeTokens } from '../../theme/binGroupTheme';
import OwnerPageFrame from '../../components/OwnerPageFrame';

export default function OwnerHandoverReviewPage() {
    const { user } = useRole();
    const { isRTL } = useLanguage();
    const [loading, setLoading] = useState(true);
    const [inspections, setInspections] = useState<any[]>([]);
    
    const [openAction, setOpenAction] = useState(false);
    const [selectedInspection, setSelectedInspection] = useState<any>(null);
    const [actionType, setActionType] = useState<'approve' | 'dispute'>('approve');
    const [notes, setNotes] = useState('');

    useEffect(() => {
        if (!user?.uid) return;

        const q = query(
            collection(db, 'propertyInspections'),
            where('ownerId', '==', user.uid),
            where('ownerReviewStatus', '==', 'PENDING'),
            orderBy('createdAt', 'desc')
        );

        const unsubscribe = onSnapshot(q, (snap) => {
            setInspections(snap.docs.map(d => ({ id: d.id, ...d.data() })));
            setLoading(false);
        }, (err) => {
            console.error('Failed to load handover inspections:', err);
            setLoading(false);
        });

        return () => unsubscribe();
    }, [user?.uid]);

    const handleOpenAction = (inspection: any, type: 'approve' | 'dispute') => {
        setSelectedInspection(inspection);
        setActionType(type);
        setNotes('');
        setOpenAction(true);
    };

    const handleConfirmAction = async () => {
        if (!selectedInspection) return;

        try {
            await updateDoc(doc(db, 'propertyInspections', selectedInspection.id), {
                ownerReviewStatus: actionType === 'approve' ? 'APPROVED' : 'DISPUTED',
                ownerReviewNotes: notes,
                ownerReviewedAt: serverTimestamp()
            });

            setOpenAction(false);
            setSelectedInspection(null);
        } catch (err) {
            console.error('Failed to submit inspection review:', err);
        }
    };

    if (loading) return <Box sx={{ display: 'flex', justifyContent: 'center', py: 10 }}><CircularProgress sx={{ color: binThemeTokens.gold }} /></Box>;

    return (
        <OwnerPageFrame title="Handover Review Center">
            <Box sx={{ mb: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Box>
                    <Typography variant="h5" color="#FFF" fontWeight="950">Pending Handovers</Typography>
                    <Typography variant="body2" color="text.secondary">Review tenant move-in and move-out condition reports.</Typography>
                </Box>
                <Stack direction="row" spacing={2}>
                    <Button variant="outlined" startIcon={<Filter size={18} />} sx={{ color: '#FFF', borderColor: 'rgba(255,255,255,0.2)' }}>Filter</Button>
                </Stack>
            </Box>

            <Grid container spacing={3}>
                {inspections.map(insp => (
                    <Grid item xs={12} md={6} key={insp.id}>
                        <Paper sx={{ p: 3, bgcolor: 'rgba(22, 22, 24, 0.7)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 4 }}>
                            <Stack direction="row" justifyContent="space-between" alignItems="flex-start" sx={{ mb: 2 }}>
                                <Stack direction="row" spacing={2} alignItems="center">
                                    <Box sx={{ p: 1.5, borderRadius: 2, bgcolor: alpha(binThemeTokens.gold, 0.1), color: binThemeTokens.gold }}>
                                        <ClipboardCheck size={24} />
                                    </Box>
                                    <Box>
                                        <Typography variant="subtitle1" color="#FFF" fontWeight="bold">
                                            Unit {insp.unitNumber || insp.propertyId}
                                        </Typography>
                                        <Typography variant="body2" color="text.secondary">
                                            {insp.inspectionType?.toUpperCase()} • {insp.tenantName || 'Unknown Tenant'}
                                        </Typography>
                                    </Box>
                                </Stack>
                                <Chip 
                                    label="ACTION REQUIRED" 
                                    size="small" 
                                    sx={{ bgcolor: alpha('#ef4444', 0.2), color: '#ef4444', fontWeight: 'bold' }} 
                                />
                            </Stack>
                            <Box sx={{ p: 2, bgcolor: 'rgba(0,0,0,0.3)', borderRadius: 2, mt: 2, mb: 2 }}>
                                <Typography variant="caption" color="text.secondary" fontWeight="bold">INSPECTION SUMMARY</Typography>
                                <Typography variant="body2" color="#FFF" sx={{ mt: 0.5, wordBreak: 'break-all' }}>
                                    {insp.summary || 'No summary provided by inspector/tenant.'}
                                </Typography>
                            </Box>
                            <Divider sx={{ borderColor: 'rgba(255,255,255,0.05)', mb: 2 }} />
                            <Stack direction="row" justifyContent="flex-end" spacing={2}>
                                <Button onClick={() => handleOpenAction(insp, 'dispute')} color="error" startIcon={<AlertTriangle size={18} />}>
                                    DISPUTE / CLAIM
                                </Button>
                                <Button onClick={() => handleOpenAction(insp, 'approve')} sx={{ color: '#10b981' }} startIcon={<CheckCircle2 size={18} />}>
                                    APPROVE HANDOVER
                                </Button>
                            </Stack>
                        </Paper>
                    </Grid>
                ))}
                {inspections.length === 0 && (
                    <Grid item xs={12}>
                        <Box sx={{ p: 5, textAlign: 'center' }}>
                            <ClipboardCheck size={48} color={binThemeTokens.gold} style={{ opacity: 0.5, marginBottom: 16 }} />
                            <Typography color="text.secondary">No pending handovers to review.</Typography>
                        </Box>
                    </Grid>
                )}
            </Grid>

            {/* Action Dialog */}
            <Dialog open={openAction} onClose={() => setOpenAction(false)} PaperProps={{ sx: { bgcolor: '#0f172a', color: '#FFF', borderRadius: 4, minWidth: 400 } }}>
                <DialogTitle sx={{ color: actionType === 'approve' ? '#10b981' : '#ef4444', fontWeight: 'bold' }}>
                    {actionType === 'approve' ? 'Approve Handover' : 'Dispute Inspection'}
                </DialogTitle>
                <DialogContent>
                    <Typography variant="body2" sx={{ mb: 3, color: 'text.secondary' }}>
                        {actionType === 'approve' 
                            ? 'By approving, you confirm the property condition is acceptable. This closes the handover process.'
                            : 'If you dispute this handover, state your reason below. This will block deposit release and notify the Admin team.'}
                    </Typography>
                    <Stack spacing={2}>
                        <TextField 
                            fullWidth label="Review Notes (Optional for approval, required for dispute)" 
                            multiline rows={3}
                            value={notes} onChange={e => setNotes(e.target.value)}
                            sx={{ '& .MuiInputBase-root': { color: '#FFF' }, '& label': { color: 'rgba(255,255,255,0.5)' } }}
                        />
                    </Stack>
                </DialogContent>
                <DialogActions sx={{ p: 3 }}>
                    <Button onClick={() => setOpenAction(false)} sx={{ color: 'text.secondary' }}>CANCEL</Button>
                    <Button 
                        variant="contained" 
                        onClick={handleConfirmAction} 
                        disabled={actionType === 'dispute' && !notes.trim()}
                        sx={{ bgcolor: actionType === 'approve' ? '#10b981' : '#ef4444', color: '#FFF', fontWeight: 'bold' }}
                    >
                        CONFIRM {actionType.toUpperCase()}
                    </Button>
                </DialogActions>
            </Dialog>
        </OwnerPageFrame>
    );
}

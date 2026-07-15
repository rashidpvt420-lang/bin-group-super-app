import React, { useState, useEffect } from 'react';
import {
    Box, Typography, Paper, Grid, Stack, Button, CircularProgress,
    Chip, Divider, alpha, Dialog, DialogTitle, DialogContent, DialogActions,
    TextField
} from '@mui/material';
import {
    Briefcase, Search, Filter, CheckCircle2, UserPlus, FileText
} from 'lucide-react';
import { db, collection, query, where, onSnapshot, functions, httpsCallable, limit } from '../../lib/firebase';
import { useLanguage } from '@bin/shared';
import { binThemeTokens } from '../../theme/adminTheme';
import AdminPageFrame from '../../components/AdminPageFrame';

export default function AdminBrokerAttributionQueuePage() {
    const { isRTL } = useLanguage();
    const [loading, setLoading] = useState(true);
    const [leads, setLeads] = useState<any[]>([]);
    const [notice, setNotice] = useState('');
    
    const [openLink, setOpenLink] = useState(false);
    const [selectedLead, setSelectedLead] = useState<any>(null);
    const [linkForm, setLinkForm] = useState({
        intakeId: '',
        ownerId: '',
        propertyId: '',
        contractId: ''
    });

    useEffect(() => {
        const q = query(
            collection(db, 'brokerLeads'),
            where('status', '==', 'negotiation'),
            limit(200)
        );

        const unsubscribe = onSnapshot(q, (snap) => {
            const rows = snap.docs
                .map(d => ({ id: d.id, ...d.data() } as any))
                .sort((a, b) => Number(b.updatedAt?.toMillis?.() || 0) - Number(a.updatedAt?.toMillis?.() || 0));
            setLeads(rows);
            setLoading(false);
        }, (err) => {
            console.error('Failed to load converted leads:', err);
            setNotice('Broker attribution queue could not be loaded.');
            setLoading(false);
        });

        return () => unsubscribe();
    }, []);

    const handleOpenLink = (lead: any) => {
        setSelectedLead(lead);
        setNotice('');
        setLinkForm({ intakeId: '', ownerId: '', propertyId: '', contractId: '' });
        setOpenLink(true);
    };

    const handleConfirmLink = async () => {
        if (!selectedLead || (!linkForm.intakeId && !linkForm.ownerId && !linkForm.propertyId && !linkForm.contractId)) return;

        try {
            if (!linkForm.contractId.trim()) {
                setNotice('An active contract ID is required before commission attribution.');
                return;
            }
            const matchAttribution = httpsCallable(functions, 'adminMatchBrokerAttribution');
            await matchAttribution({
                leadId: selectedLead.id,
                contractId: linkForm.contractId.trim(),
                intakeId: linkForm.intakeId.trim(),
                ownerId: linkForm.ownerId.trim(),
                propertyId: linkForm.propertyId.trim(),
            });

            setOpenLink(false);
            setSelectedLead(null);
            setNotice('Broker attribution matched to the active contract. The server-calculated commission is pending review.');
        } catch (err) {
            console.error('Failed to match lead:', err);
            setNotice('Failed to match broker attribution. Check target IDs and admin permissions.');
        }
    };

    if (loading) return <Box sx={{ display: 'flex', justifyContent: 'center', py: 10 }}><CircularProgress sx={{ color: binThemeTokens.gold }} /></Box>;

    return (
        <AdminPageFrame title="Broker Attribution Queue">
            <Box sx={{ mb: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Typography variant="h5" color="#FFF" fontWeight="950">Broker Attributions</Typography>
                <Stack direction="row" spacing={2}>
                    <Button variant="outlined" startIcon={<Filter size={18} />} sx={{ color: '#FFF', borderColor: 'rgba(255,255,255,0.2)' }}>Filter</Button>
                    <Button variant="outlined" startIcon={<Search size={18} />} sx={{ color: '#FFF', borderColor: 'rgba(255,255,255,0.2)' }}>Search</Button>
                </Stack>
            </Box>
            {notice && <Paper sx={{ p: 2, mb: 3, bgcolor: alpha(binThemeTokens.gold, 0.08), border: `1px solid ${alpha(binThemeTokens.gold, 0.18)}`, color: '#FFF' }}>{notice}</Paper>}

            <Grid container spacing={3}>
                {leads.map(lead => (
                    <Grid item xs={12} md={6} key={lead.id}>
                        <Paper sx={{ p: 3, bgcolor: 'rgba(22, 22, 24, 0.7)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 4 }}>
                            <Stack direction="row" justifyContent="space-between" alignItems="flex-start" sx={{ mb: 2 }}>
                                <Stack direction="row" spacing={2} alignItems="center">
                                    <Box sx={{ p: 1.5, borderRadius: 2, bgcolor: alpha(binThemeTokens.gold, 0.1), color: binThemeTokens.gold }}>
                                        <Briefcase size={24} />
                                    </Box>
                                    <Box>
                                        <Typography variant="subtitle1" color="#FFF" fontWeight="bold">
                                            {lead.leadName}
                                        </Typography>
                                        <Typography variant="body2" color="text.secondary">
                                            Broker: {lead.brokerEmail || lead.brokerId}
                                        </Typography>
                                    </Box>
                                </Stack>
                                <Chip 
                                    label="PENDING MATCH" 
                                    size="small" 
                                    sx={{ bgcolor: alpha('#f59e0b', 0.2), color: '#f59e0b', fontWeight: 'bold' }} 
                                />
                            </Stack>
                            <Box sx={{ p: 2, bgcolor: 'rgba(0,0,0,0.3)', borderRadius: 2, mt: 2, mb: 2 }}>
                                <Typography variant="caption" color="text.secondary" fontWeight="bold">ATTRIBUTION ID</Typography>
                                <Typography variant="body2" color="#FFF" sx={{ mt: 0.5, wordBreak: 'break-all' }}>
                                    {lead.attributionId || lead.id}
                                </Typography>
                            </Box>
                            <Divider sx={{ borderColor: 'rgba(255,255,255,0.05)', mb: 2 }} />
                            <Stack direction="row" justifyContent="flex-end">
                                <Button onClick={() => handleOpenLink(lead)} sx={{ color: binThemeTokens.gold }} startIcon={<UserPlus size={18} />}>
                                    LINK TO OWNER/CONTRACT
                                </Button>
                            </Stack>
                        </Paper>
                    </Grid>
                ))}
                {leads.length === 0 && (
                    <Grid item xs={12}>
                        <Box sx={{ p: 5, textAlign: 'center' }}>
                            <FileText size={48} color={binThemeTokens.gold} style={{ opacity: 0.5, marginBottom: 16 }} />
                            <Typography color="text.secondary">No pending broker leads to match.</Typography>
                        </Box>
                    </Grid>
                )}
            </Grid>

            {/* Link Dialog */}
            <Dialog open={openLink} onClose={() => setOpenLink(false)} PaperProps={{ sx: { bgcolor: '#0f172a', color: '#FFF', borderRadius: 4, minWidth: 400 } }}>
                <DialogTitle sx={{ color: binThemeTokens.gold, fontWeight: 'bold' }}>Match Broker Lead</DialogTitle>
                <DialogContent>
                    <Typography variant="body2" sx={{ mb: 3, color: 'text.secondary' }}>
                        Enter the matching IDs to securely attach this lead to a live record. The broker's commission will be unlocked when the contract activates.
                    </Typography>
                    <Stack spacing={2}>
                        <TextField 
                            fullWidth label="Target Intake ID" 
                            value={linkForm.intakeId} onChange={e => setLinkForm(p => ({...p, intakeId: e.target.value}))}
                            sx={{ '& .MuiInputBase-root': { color: '#FFF' }, '& label': { color: 'rgba(255,255,255,0.5)' } }}
                        />
                        <TextField 
                            fullWidth label="Target Owner ID" 
                            value={linkForm.ownerId} onChange={e => setLinkForm(p => ({...p, ownerId: e.target.value}))}
                            sx={{ '& .MuiInputBase-root': { color: '#FFF' }, '& label': { color: 'rgba(255,255,255,0.5)' } }}
                        />
                        <TextField 
                            fullWidth label="Target Property ID" 
                            value={linkForm.propertyId} onChange={e => setLinkForm(p => ({...p, propertyId: e.target.value}))}
                            sx={{ '& .MuiInputBase-root': { color: '#FFF' }, '& label': { color: 'rgba(255,255,255,0.5)' } }}
                        />
                        <TextField 
                            fullWidth label="Target Contract ID" 
                            value={linkForm.contractId} onChange={e => setLinkForm(p => ({...p, contractId: e.target.value}))}
                            sx={{ '& .MuiInputBase-root': { color: '#FFF' }, '& label': { color: 'rgba(255,255,255,0.5)' } }}
                        />
                    </Stack>
                </DialogContent>
                <DialogActions sx={{ p: 3 }}>
                    <Button onClick={() => setOpenLink(false)} sx={{ color: 'text.secondary' }}>CANCEL</Button>
                    <Button variant="contained" onClick={handleConfirmLink} disabled={!linkForm.intakeId && !linkForm.ownerId && !linkForm.propertyId && !linkForm.contractId} sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 'bold' }}>
                        CONFIRM MATCH
                    </Button>
                </DialogActions>
            </Dialog>
        </AdminPageFrame>
    );
}

import React, { useState, useEffect } from 'react';
import {
    Box, Typography, Paper, Grid, Stack, Button, CircularProgress,
    Chip, Divider, alpha, Dialog, DialogTitle, DialogContent, DialogActions,
    TextField
} from '@mui/material';
import {
    Briefcase, Search, Filter, CheckCircle2, UserPlus, FileText
} from 'lucide-react';
import { db, collection, query, where, orderBy, onSnapshot, doc, getDoc, writeBatch, serverTimestamp } from '../../lib/firebase';
import { useLanguage } from '@bin/shared';
import { binThemeTokens } from '../../theme/adminTheme';
import AdminPageFrame from '../../components/AdminPageFrame';
import { useAuth } from '../../context/AuthContext';

const BROKER_COMMISSION_RATE = 0.10;
const clean = (value: unknown) => String(value || '').trim();
const numericAmount = (value: unknown) => {
    const amount = Number(String(value || '').replace(/[^0-9.]/g, ''));
    return Number.isFinite(amount) ? amount : 0;
};

export default function AdminBrokerAttributionQueuePage() {
    const { isRTL } = useLanguage();
    const { user } = useAuth();
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
            where('status', '==', 'converted'),
            where('commissionStatus', '==', 'PENDING_REVIEW'),
            orderBy('updatedAt', 'desc')
        );

        const unsubscribe = onSnapshot(q, (snap) => {
            setLeads(snap.docs.map(d => ({ id: d.id, ...d.data() })));
            setLoading(false);
        }, (err) => {
            console.error('Failed to load converted leads:', err);
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
            const actorId = user?.uid || 'admin';
            const brokerId = clean(selectedLead.brokerId || selectedLead.brokerUid);
            const brokerName = clean(selectedLead.brokerName || selectedLead.brokerDisplayName || selectedLead.brokerEmail || 'Broker');
            const brokerEmail = clean(selectedLead.brokerEmail);
            const attributionId = clean(selectedLead.attributionId || `broker_lead_${brokerId}_${selectedLead.id}`);
            const batch = writeBatch(db);
            const leadRef = doc(db, 'brokerLeads', selectedLead.id);
            const now = serverTimestamp();
            const targetPatch = {
                brokerId,
                brokerUid: brokerId,
                brokerName,
                brokerEmail,
                brokerLeadId: selectedLead.id,
                brokerAttributionId: attributionId,
                attributionSource: 'ADMIN_BROKER_ATTRIBUTION_QUEUE',
                updatedAt: now,
            };

            batch.update(leadRef, {
                commissionStatus: 'MATCHED_TO_CONTRACT',
                commissionCreationStatus: linkForm.contractId ? 'COMMISSION_PENDING_ADMIN_APPROVAL' : 'MATCHED_PENDING_CONTRACT_ACTIVATION',
                matchedOwnerId: linkForm.ownerId,
                matchedPropertyId: linkForm.propertyId,
                matchedContractId: linkForm.contractId,
                matchedIntakeId: linkForm.intakeId,
                matchedAt: now,
                matchedBy: actorId,
                updatedAt: now,
            });

            if (linkForm.intakeId) {
                batch.set(doc(db, 'intake_submissions', linkForm.intakeId), {
                    ...targetPatch,
                    brokerMatchedAt: now,
                    brokerMatchedBy: actorId,
                }, { merge: true });
            }

            let commissionBase = numericAmount(selectedLead.budgetAmount || selectedLead.budget);
            let propertyName = clean(selectedLead.propertyInterest || selectedLead.location);
            if (linkForm.contractId) {
                const contractRef = doc(db, 'contracts', linkForm.contractId);
                const contractSnap = await getDoc(contractRef);
                const contract = contractSnap.exists() ? contractSnap.data() : {};
                commissionBase = numericAmount(contract.annualContractValue || contract.amountReceived || contract.mobilizationAmount || commissionBase);
                propertyName = clean(contract.propertyName || contract.propertyTitle || propertyName);
                batch.set(contractRef, {
                    ...targetPatch,
                    brokerMatchedAt: now,
                    brokerMatchedBy: actorId,
                }, { merge: true });

                const commissionRef = doc(db, 'broker_commissions', `lead_${selectedLead.id}`);
                const commissionAmount = Math.round(commissionBase * BROKER_COMMISSION_RATE * 100) / 100;
                batch.set(commissionRef, {
                    leadId: selectedLead.id,
                    brokerId,
                    brokerUid: brokerId,
                    brokerName,
                    brokerEmail,
                    attributionId,
                    contractId: linkForm.contractId,
                    intakeId: linkForm.intakeId || null,
                    ownerId: linkForm.ownerId || null,
                    propertyId: linkForm.propertyId || null,
                    propertyName,
                    amount: commissionAmount,
                    percentage: BROKER_COMMISSION_RATE * 100,
                    rate: BROKER_COMMISSION_RATE,
                    commissionBase,
                    currency: 'AED',
                    status: 'PENDING',
                    payoutStatus: 'NOT_REQUESTED',
                    source: 'ADMIN_ATTRIBUTION_MATCH',
                    createdAt: now,
                    updatedAt: now,
                }, { merge: true });
            }

            if (linkForm.propertyId) {
                batch.set(doc(db, 'properties', linkForm.propertyId), {
                    brokerLeadId: selectedLead.id,
                    brokerAttributionId: attributionId,
                    updatedAt: now,
                }, { merge: true });
            }

            batch.set(doc(collection(db, 'auditLogs')), {
                action: 'ADMIN_MATCH_BROKER_ATTRIBUTION',
                actorId,
                actorRole: 'admin',
                brokerId,
                targetType: 'BROKER_LEAD',
                targetId: selectedLead.id,
                attributionId,
                intakeId: linkForm.intakeId || null,
                ownerId: linkForm.ownerId || null,
                propertyId: linkForm.propertyId || null,
                contractId: linkForm.contractId || null,
                createdAt: now,
            });

            await batch.commit();

            setOpenLink(false);
            setSelectedLead(null);
            setNotice('Broker attribution matched. Commission is now pending admin approval when a contract was supplied.');
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

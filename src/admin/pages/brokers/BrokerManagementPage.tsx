import React, { useState, useEffect } from 'react';
import {
    Box, Typography, Paper, Table, TableBody, TableCell, 
    TableContainer, TableHead, TableRow, Button, Chip, 
    IconButton, Dialog, DialogTitle, DialogContent, 
    DialogActions, Grid, alpha, Stack, Avatar
} from '@mui/material';
import { 
    Users, ShieldCheck, Eye, CheckCircle, XCircle, 
    Landmark, Badge, TrendingUp, Search
} from 'lucide-react';
import { collection, query, where, onSnapshot, doc, updateDoc, orderBy } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useLanguage, binThemeTokens } from '@bin/shared';
import AdminPageFrame from '../../components/AdminPageFrame';

interface Broker {
    id: string;
    displayName?: string;
    email?: string;
    phoneNumber?: string;
    brokerCode?: string;
    affiliateCode?: string;
    role: string;
    status?: 'PENDING' | 'APPROVED' | 'REJECTED';
    bankName?: string;
    iban?: string;
    emiratesId?: string;
    kycDocumentUrl?: string;
    createdAt?: any;
}

export default function BrokerManagementPage() {
    const { t, isRTL } = useLanguage();
    const [brokers, setBrokers] = useState<Broker[]>([]);
    const [selectedBroker, setSelectedBroker] = useState<Broker | null>(null);
    const [isViewOpen, setIsViewOpen] = useState(false);
    const [loading, setLoading] = useState(true);
    const [stats, setStats] = useState({
        total: 0,
        pending: 0,
        approved: 0
    });

    useEffect(() => {
        const q = query(
            collection(db, 'users'), 
            where('role', 'in', ['BROKER', 'broker']),
            orderBy('createdAt', 'desc')
        );
        
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const fetchedBrokers = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            })) as Broker[];
            setBrokers(fetchedBrokers);

            setStats({
                total: fetchedBrokers.length,
                pending: fetchedBrokers.filter(b => b.status === 'PENDING' || !b.status).length,
                approved: fetchedBrokers.filter(b => b.status === 'APPROVED').length
            });
            setLoading(false);
        }, (error) => {
            console.error("Broker Fetch Error:", error);
            setLoading(false);
        });

        return () => unsubscribe();
    }, []);

    const handleApprove = async (id: string) => {
        try {
            await updateDoc(doc(db, 'users', id), {
                status: 'APPROVED',
                updatedAt: new Date().toISOString()
            });
        } catch (err) {
            console.error(err);
        }
    };

    const handleReject = async (id: string) => {
        if (!window.confirm("Confirm partner rejection?")) return;
        try {
            await updateDoc(doc(db, 'users', id), {
                status: 'REJECTED',
                updatedAt: new Date().toISOString()
            });
        } catch (err) {
            console.error(err);
        }
    };

    const handleView = (broker: Broker) => {
        setSelectedBroker(broker);
        setIsViewOpen(true);
    };

    return (
        <AdminPageFrame
            title={t('broker.mgt_title') || 'BROKER NETWORK'}
            subtitle="Verification and authorization of affiliate broker partners"
            loading={loading}
            breadcrumbs={[{ label: 'Brokers' }]}
        >
            <Grid container spacing={3} sx={{ mb: 4 }}>
                {[
                    { label: 'TOTAL BROKERS', val: stats.total, icon: <Users size={20} />, color: binThemeTokens.gold },
                    { label: 'PENDING VERIFICATION', val: stats.pending, icon: <TrendingUp size={20} />, color: '#f59e0b' },
                    { label: 'APPROVED PARTNERS', val: stats.approved, icon: <ShieldCheck size={20} />, color: '#10b981' }
                ].map((item, i) => (
                    <Grid item xs={12} md={4} key={i}>
                        <Paper sx={{ p: 3, borderRadius: 4, bgcolor: 'rgba(255,255,255,0.01)', border: '1px solid rgba(255,255,255,0.05)' }}>
                            <Stack direction="row" spacing={2} alignItems="center">
                                <Box sx={{ p: 1.5, bgcolor: alpha(item.color, 0.1), borderRadius: 2, color: item.color }}>
                                    {item.icon}
                                </Box>
                                <Box>
                                    <Typography variant="overline" sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 900 }}>{item.label}</Typography>
                                    <Typography variant="h4" fontWeight="950" sx={{ color: '#FFF' }}>{item.val}</Typography>
                                </Box>
                            </Stack>
                        </Paper>
                    </Grid>
                ))}
            </Grid>

            <TableContainer component={Paper} sx={{ borderRadius: 4, bgcolor: 'rgba(255,255,255,0.01)', border: '1px solid rgba(255,255,255,0.05)' }}>
                <Table>
                    <TableHead>
                        <TableRow>
                            <TableCell sx={{ bgcolor: '#020617', color: 'rgba(255,255,255,0.3)', fontWeight: 900 }}>PARTNER IDENTITY</TableCell>
                            <TableCell sx={{ bgcolor: '#020617', color: 'rgba(255,255,255,0.3)', fontWeight: 900 }}>AFFILIATE CODE</TableCell>
                            <TableCell sx={{ bgcolor: '#020617', color: 'rgba(255,255,255,0.3)', fontWeight: 900 }}>CONTACT</TableCell>
                            <TableCell sx={{ bgcolor: '#020617', color: 'rgba(255,255,255,0.3)', fontWeight: 900 }}>STATUS</TableCell>
                            <TableCell align="right" sx={{ bgcolor: '#020617', color: 'rgba(255,255,255,0.3)', fontWeight: 900 }}>ACTIONS</TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {brokers.map((broker) => (
                            <TableRow key={broker.id} hover>
                                <TableCell>
                                    <Stack direction="row" spacing={2} alignItems="center">
                                        <Avatar sx={{ bgcolor: alpha(binThemeTokens.gold, 0.1), color: binThemeTokens.gold, fontWeight: 900 }}>
                                            {broker.displayName?.charAt(0) || 'B'}
                                        </Avatar>
                                        <Box>
                                            <Typography variant="body2" sx={{ fontWeight: 800, color: '#FFF' }}>{broker.displayName}</Typography>
                                            <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.3)', fontSize: '0.65rem', fontFamily: 'monospace' }}>{broker.id.toUpperCase()}</Typography>
                                        </Box>
                                    </Stack>
                                </TableCell>
                                <TableCell>
                                    <Chip label={broker.brokerCode || broker.affiliateCode || 'PENDING'} size="small" sx={{ fontWeight: 900, bgcolor: 'rgba(255,255,255,0.05)', color: binThemeTokens.gold }} />
                                </TableCell>
                                <TableCell>
                                    <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.6)' }}>{broker.email}</Typography>
                                    <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.3)' }}>{broker.phoneNumber}</Typography>
                                </TableCell>
                                <TableCell>
                                    <Chip 
                                        label={broker.status || 'PENDING'} 
                                        size="small" 
                                        sx={{ 
                                            bgcolor: broker.status === 'APPROVED' ? alpha('#10b981', 0.1) : broker.status === 'REJECTED' ? alpha('#ef4444', 0.1) : 'rgba(255,255,255,0.05)',
                                            color: broker.status === 'APPROVED' ? '#10b981' : broker.status === 'REJECTED' ? '#ef4444' : '#f59e0b',
                                            fontWeight: 950, fontSize: '0.6rem'
                                        }} 
                                    />
                                </TableCell>
                                <TableCell align="right">
                                    <Stack direction="row" spacing={1} justifyContent="flex-end">
                                        <IconButton size="small" onClick={() => handleView(broker)} sx={{ color: binThemeTokens.gold }}><Eye size={16} /></IconButton>
                                        {broker.status !== 'APPROVED' && (
                                            <IconButton size="small" color="success" onClick={() => handleApprove(broker.id)}><CheckCircle size={16} /></IconButton>
                                        )}
                                        {broker.status !== 'REJECTED' && (
                                            <IconButton size="small" color="error" onClick={() => handleReject(broker.id)}><XCircle size={16} /></IconButton>
                                        )}
                                    </Stack>
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </TableContainer>

            {/* View Dialog */}
            <Dialog 
                open={isViewOpen} 
                onClose={() => setIsViewOpen(false)} 
                maxWidth="md" 
                fullWidth
                PaperProps={{ sx: { bgcolor: '#020617', borderRadius: 4, border: '1px solid rgba(255,255,255,0.1)' } }}
            >
                <DialogTitle sx={{ fontWeight: 950, color: binThemeTokens.gold }}>BROKER DOSSIER: {selectedBroker?.displayName?.toUpperCase()}</DialogTitle>
                <DialogContent dividers sx={{ borderColor: 'rgba(255,255,255,0.05)' }}>
                    {selectedBroker && (
                        <Grid container spacing={4}>
                            <Grid item xs={12} md={6}>
                                <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 950, mb: 2, display: 'block' }}>LEGAL IDENTITY</Typography>
                                <Stack spacing={2}>
                                    <Box>
                                        <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)', display: 'block' }}>FULL NAME</Typography>
                                        <Typography sx={{ fontWeight: 800, color: '#FFF' }}>{selectedBroker.displayName}</Typography>
                                    </Box>
                                    <Box>
                                        <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)', display: 'block' }}>EMIRATES ID</Typography>
                                        <Typography sx={{ fontWeight: 800, color: '#FFF', fontFamily: 'monospace' }}>{selectedBroker.emiratesId || 'NOT PROVIDED'}</Typography>
                                    </Box>
                                    <Box>
                                        <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)', display: 'block' }}>AFFILIATE CODE</Typography>
                                        <Typography sx={{ fontWeight: 950, color: binThemeTokens.gold }}>{selectedBroker.brokerCode || selectedBroker.affiliateCode}</Typography>
                                    </Box>
                                </Stack>
                            </Grid>
                            <Grid item xs={12} md={6}>
                                <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 950, mb: 2, display: 'block' }}>FINANCIAL HANDSHAKE</Typography>
                                <Stack spacing={2}>
                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                                        <Box sx={{ p: 1, bgcolor: 'rgba(255,255,255,0.05)', borderRadius: 1.5 }}><Landmark size={18} color="rgba(255,255,255,0.4)" /></Box>
                                        <Box>
                                            <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)', display: 'block' }}>SETTLEMENT BANK</Typography>
                                            <Typography sx={{ fontWeight: 800, color: '#FFF' }}>{selectedBroker.bankName || 'NOT CONFIGURED'}</Typography>
                                        </Box>
                                    </Box>
                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                                        <Box sx={{ p: 1, bgcolor: 'rgba(255,255,255,0.05)', borderRadius: 1.5 }}><Badge size={18} color="rgba(255,255,255,0.4)" /></Box>
                                        <Box>
                                            <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)', display: 'block' }}>IBAN</Typography>
                                            <Typography sx={{ fontWeight: 800, color: '#FFF', fontFamily: 'monospace' }}>{selectedBroker.iban || 'NOT CONFIGURED'}</Typography>
                                        </Box>
                                    </Box>
                                </Stack>
                            </Grid>
                            {selectedBroker.kycDocumentUrl && (
                                <Grid item xs={12}>
                                    <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 950, mb: 2, display: 'block' }}>VERIFICATION EVIDENCE</Typography>
                                    <Button 
                                        variant="outlined" 
                                        href={selectedBroker.kycDocumentUrl} 
                                        target="_blank"
                                        startIcon={<Search size={16} />}
                                        sx={{ borderRadius: 2, fontWeight: 900, borderColor: 'rgba(255,255,255,0.1)', color: '#FFF' }}
                                    >
                                        VIEW SIGNED CREDENTIALS
                                    </Button>
                                </Grid>
                            )}
                        </Grid>
                    )}
                </DialogContent>
                <DialogActions sx={{ p: 3 }}>
                    <Button onClick={() => setIsViewOpen(false)} sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 900 }}>CLOSE</Button>
                    {selectedBroker?.status !== 'APPROVED' && (
                        <Button 
                            variant="contained" 
                            color="success" 
                            onClick={() => { handleApprove(selectedBroker!.id); setIsViewOpen(false); }} 
                            sx={{ fontWeight: 950, borderRadius: 2 }}
                        >
                            AUTHORIZE PARTNER
                        </Button>
                    )}
                </DialogActions>
            </Dialog>
        </AdminPageFrame>
    );
}

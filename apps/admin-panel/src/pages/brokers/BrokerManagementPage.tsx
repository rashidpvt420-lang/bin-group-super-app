import React, { useState, useEffect } from 'react';
import {
    Box,
    Typography,
    Paper,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    Button,
    Chip,
    IconButton,
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    Grid,
    Card,
    CardContent,
    Avatar
} from '@mui/material';
import {
    CheckCircle as CheckCircleIcon,
    Cancel as CancelIcon,
    Visibility as VisibilityIcon,
    AccountBalance as BankIcon,
    Badge as BadgeIcon,
    TrendingUp as TrendingUpIcon,
    People as PeopleIcon
} from '@mui/icons-material';
import { collection, query, where, onSnapshot, doc, updateDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useLanguage } from '@bin/shared';

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
    kycDocumentUrl?: string; // from signup
}

export default function BrokerManagementPage() {
    const { t, isRTL } = useLanguage();
    const [brokers, setBrokers] = useState<Broker[]>([]);
    const [selectedBroker, setSelectedBroker] = useState<Broker | null>(null);
    const [isViewOpen, setIsViewOpen] = useState(false);
    const [stats, setStats] = useState({
        total: 0,
        pending: 0,
        approved: 0
    });

    useEffect(() => {
        const q = query(collection(db, 'users'), where('role', '==', 'BROKER'));
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
        });

        return () => unsubscribe();
    }, []);

    const handleApprove = async (id: string) => {
        try {
            await updateDoc(doc(db, 'users', id), {
                status: 'APPROVED',
                updatedAt: new Date().toISOString()
            });
            alert(t('broker.approve_success'));
        } catch (err) {
            console.error(err);
            alert(t('broker.approve_failed'));
        }
    };

    const handleReject = async (id: string) => {
        if (!window.confirm(t('broker.reject_confirm'))) return;
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
        <Box sx={{ p: 4, direction: isRTL ? 'rtl' : 'ltr' }}>
            <Typography variant="h4" sx={{ fontWeight: 900, mb: 4, letterSpacing: '-0.02em', textAlign: isRTL ? 'right' : 'left' }}>
                {t('broker.mgt_title')}
            </Typography>

            <Grid container spacing={3} sx={{ mb: 4, flexDirection: isRTL ? 'row-reverse' : 'row' }}>
                <Grid item xs={12} md={4}>
                    <Card sx={{ bgcolor: '#fff', borderRadius: 4, boxShadow: '0 4px 20px rgba(0,0,0,0.05)' }}>
                        <CardContent>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexDirection: isRTL ? 'row-reverse' : 'row' }}>
                                <Avatar sx={{ bgcolor: 'primary.main' }}><PeopleIcon /></Avatar>
                                <Box sx={{ textAlign: isRTL ? 'right' : 'left' }}>
                                    <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700, textTransform: 'uppercase' }}>{t('broker.total_brokers')}</Typography>
                                    <Typography variant="h4" sx={{ fontWeight: 900 }}>{stats.total}</Typography>
                                </Box>
                            </Box>
                        </CardContent>
                    </Card>
                </Grid>
                <Grid item xs={12} md={4}>
                    <Card sx={{ bgcolor: '#fff', borderRadius: 4, boxShadow: '0 4px 20px rgba(0,0,0,0.05)' }}>
                        <CardContent>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexDirection: isRTL ? 'row-reverse' : 'row' }}>
                                <Avatar sx={{ bgcolor: 'warning.main' }}><TrendingUpIcon /></Avatar>
                                <Box sx={{ textAlign: isRTL ? 'right' : 'left' }}>
                                    <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700, textTransform: 'uppercase' }}>{t('broker.pending_verification')}</Typography>
                                    <Typography variant="h4" sx={{ fontWeight: 900 }}>{stats.pending}</Typography>
                                </Box>
                            </Box>
                        </CardContent>
                    </Card>
                </Grid>
                <Grid item xs={12} md={4}>
                    <Card sx={{ bgcolor: '#fff', borderRadius: 4, boxShadow: '0 4px 20px rgba(0,0,0,0.05)' }}>
                        <CardContent>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexDirection: isRTL ? 'row-reverse' : 'row' }}>
                                <Avatar sx={{ bgcolor: 'success.main' }}><CheckCircleIcon /></Avatar>
                                <Box sx={{ textAlign: isRTL ? 'right' : 'left' }}>
                                    <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700, textTransform: 'uppercase' }}>{t('broker.approved_partners')}</Typography>
                                    <Typography variant="h4" sx={{ fontWeight: 900 }}>{stats.approved}</Typography>
                                </Box>
                            </Box>
                        </CardContent>
                    </Card>
                </Grid>
            </Grid>

            <TableContainer component={Paper} sx={{ borderRadius: 4, border: '1px solid #e2e8f0', boxShadow: 'none' }}>
                <Table>
                    <TableHead sx={{ bgcolor: '#f8fafc' }}>
                        <TableRow sx={{ flexDirection: isRTL ? 'row-reverse' : 'row' }}>
                            <TableCell sx={{ fontWeight: 800, textAlign: isRTL ? 'right' : 'left' }}>{t('broker.table.name')}</TableCell>
                            <TableCell sx={{ fontWeight: 800, textAlign: isRTL ? 'right' : 'left' }}>{t('broker.table.code')}</TableCell>
                            <TableCell sx={{ fontWeight: 800, textAlign: isRTL ? 'right' : 'left' }}>{t('broker.table.contact')}</TableCell>
                            <TableCell sx={{ fontWeight: 800, textAlign: isRTL ? 'right' : 'left' }}>{t('tech.status')}</TableCell>
                            <TableCell sx={{ fontWeight: 800 }} align={isRTL ? 'left' : 'right'}>{t('common.actions')}</TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {(brokers || []).map((broker) => (
                            <TableRow key={broker.id} hover sx={{ flexDirection: isRTL ? 'row-reverse' : 'row' }}>
                                <TableCell sx={{ textAlign: isRTL ? 'right' : 'left' }}>
                                    <Typography sx={{ fontWeight: 700 }}>{broker.displayName || t('dt.all')}</Typography>
                                    <Typography variant="caption" color="text.secondary">{broker.id}</Typography>
                                </TableCell>
                                <TableCell sx={{ textAlign: isRTL ? 'right' : 'left' }}>
                                    <Chip label={broker.brokerCode || broker.affiliateCode || 'PENDING'} size="small" sx={{ fontWeight: 700 }} />
                                </TableCell>
                                <TableCell sx={{ textAlign: isRTL ? 'right' : 'left' }}>
                                    <Typography variant="body2">{broker.email}</Typography>
                                    <Typography variant="caption" color="text.secondary">{broker.phoneNumber}</Typography>
                                </TableCell>
                                <TableCell sx={{ textAlign: isRTL ? 'right' : 'left' }}>
                                    <Chip 
                                        label={broker.status || 'PENDING'} 
                                        color={broker.status === 'APPROVED' ? 'success' : broker.status === 'REJECTED' ? 'error' : 'warning'} 
                                        size="small" 
                                        sx={{ fontWeight: 800 }}
                                    />
                                </TableCell>
                                <TableCell align={isRTL ? 'left' : 'right'}>
                                    <IconButton onClick={() => handleView(broker)}><VisibilityIcon /></IconButton>
                                    {broker.status !== 'APPROVED' && (
                                        <IconButton color="success" onClick={() => handleApprove(broker.id)}><CheckCircleIcon /></IconButton>
                                    )}
                                    {broker.status !== 'REJECTED' && (
                                        <IconButton color="error" onClick={() => handleReject(broker.id)}><CancelIcon /></IconButton>
                                    )}
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </TableContainer>

            {/* View Dialog */}
            <Dialog open={isViewOpen} onClose={() => setIsViewOpen(false)} maxWidth="md" fullWidth dir={isRTL ? 'rtl' : 'ltr'}>
                <DialogTitle sx={{ fontWeight: 900, textAlign: isRTL ? 'right' : 'left' }}>{t('broker.dossier_title', { name: selectedBroker?.displayName })}</DialogTitle>
                <DialogContent dividers>
                    {selectedBroker && (
                        <Grid container spacing={4} sx={{ flexDirection: isRTL ? 'row-reverse' : 'row' }}>
                            <Grid item xs={12} md={6}>
                                <Typography variant="h6" gutterBottom sx={{ fontWeight: 800, color: 'primary.main', textAlign: isRTL ? 'right' : 'left' }}>
                                    {t('broker.partner_details')}
                                </Typography>
                                <Box sx={{ mb: 2, textAlign: isRTL ? 'right' : 'left' }}>
                                    <Typography variant="caption" color="text.secondary" display="block">{t('broker.legal_name')}</Typography>
                                    <Typography sx={{ fontWeight: 700 }}>{selectedBroker.displayName}</Typography>
                                </Box>
                                <Box sx={{ mb: 2, textAlign: isRTL ? 'right' : 'left' }}>
                                    <Typography variant="caption" color="text.secondary" display="block">{t('field.emirate')} ID</Typography>
                                    <Typography sx={{ fontWeight: 700, fontSpace: 'monospace' }}>{selectedBroker.emiratesId || t('broker.not_provided')}</Typography>
                                </Box>
                                <Box sx={{ mb: 2, textAlign: isRTL ? 'right' : 'left' }}>
                                    <Typography variant="caption" color="text.secondary" display="block">{t('broker.affiliate_code')}</Typography>
                                    <Typography color="secondary" sx={{ fontWeight: 900 }}>{selectedBroker.brokerCode || selectedBroker.affiliateCode}</Typography>
                                </Box>
                            </Grid>
                            <Grid item xs={12} md={6}>
                                <Typography variant="h6" gutterBottom sx={{ fontWeight: 800, color: 'primary.main', textAlign: isRTL ? 'right' : 'left' }}>
                                    {t('broker.financial_handshake')}
                                </Typography>
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2, flexDirection: isRTL ? 'row-reverse' : 'row' }}>
                                    <BankIcon color="action" />
                                    <Box sx={{ textAlign: isRTL ? 'right' : 'left' }}>
                                        <Typography variant="caption" color="text.secondary" display="block">{t('broker.settlement_bank')}</Typography>
                                        <Typography sx={{ fontWeight: 700 }}>{selectedBroker.bankName || t('broker.not_configured')}</Typography>
                                    </Box>
                                </Box>
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexDirection: isRTL ? 'row-reverse' : 'row' }}>
                                    <BadgeIcon color="action" />
                                    <Box sx={{ textAlign: isRTL ? 'right' : 'left' }}>
                                        <Typography variant="caption" color="text.secondary" display="block">{t('broker.iban')}</Typography>
                                        <Typography sx={{ fontWeight: 700, fontSpace: 'monospace' }}>{selectedBroker.iban || t('broker.not_configured')}</Typography>
                                    </Box>
                                </Box>
                            </Grid>
                            {selectedBroker.kycDocumentUrl && (
                                <Grid item xs={12}>
                                    <Typography variant="h6" gutterBottom sx={{ fontWeight: 800, color: 'primary.main', textAlign: isRTL ? 'right' : 'left' }}>
                                        {t('broker.verification_evidence')}
                                    </Typography>
                                    <Button 
                                        variant="outlined" 
                                        href={selectedBroker.kycDocumentUrl} 
                                        target="_blank"
                                        startIcon={<VisibilityIcon />}
                                        sx={{ borderRadius: 2, fontWeight: 700 }}
                                    >
                                        {t('broker.view_credentials')}
                                    </Button>
                                </Grid>
                            )}
                        </Grid>
                    )}
                </DialogContent>
                <DialogActions sx={{ p: 3, justifyContent: isRTL ? 'flex-start' : 'flex-end', flexDirection: isRTL ? 'row-reverse' : 'row' }}>
                    <Button onClick={() => setIsViewOpen(false)} sx={{ fontWeight: 700 }}>{t('common.close')}</Button>
                    {selectedBroker?.status !== 'APPROVED' && (
                        <Button variant="contained" color="success" onClick={() => { handleApprove(selectedBroker!.id); setIsViewOpen(false); }} sx={{ fontWeight: 800, borderRadius: 2 }}>
                            {t('broker.approve_partner_btn')}
                        </Button>
                    )}
                </DialogActions>
            </Dialog>
        </Box>
    );
}

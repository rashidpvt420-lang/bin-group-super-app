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
            alert('Broker approved successfully.');
        } catch (err) {
            console.error(err);
            alert('Failed to approve broker.');
        }
    };

    const handleReject = async (id: string) => {
        if (!window.confirm('Are you sure you want to reject this broker?')) return;
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
        <Box sx={{ p: 4 }}>
            <Typography variant="h4" sx={{ fontWeight: 900, mb: 4, letterSpacing: '-0.02em' }}>
                BROKER INFRASTRUCTURE MANAGEMENT
            </Typography>

            <Grid container spacing={3} sx={{ mb: 4 }}>
                <Grid item xs={12} md={4}>
                    <Card sx={{ bgcolor: '#fff', borderRadius: 4, boxShadow: '0 4px 20px rgba(0,0,0,0.05)' }}>
                        <CardContent>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                                <Avatar sx={{ bgcolor: 'primary.main' }}><PeopleIcon /></Avatar>
                                <Box>
                                    <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700, textTransform: 'uppercase' }}>Total Brokers</Typography>
                                    <Typography variant="h4" sx={{ fontWeight: 900 }}>{stats.total}</Typography>
                                </Box>
                            </Box>
                        </CardContent>
                    </Card>
                </Grid>
                <Grid item xs={12} md={4}>
                    <Card sx={{ bgcolor: '#fff', borderRadius: 4, boxShadow: '0 4px 20px rgba(0,0,0,0.05)' }}>
                        <CardContent>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                                <Avatar sx={{ bgcolor: 'warning.main' }}><TrendingUpIcon /></Avatar>
                                <Box>
                                    <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700, textTransform: 'uppercase' }}>Pending Verification</Typography>
                                    <Typography variant="h4" sx={{ fontWeight: 900 }}>{stats.pending}</Typography>
                                </Box>
                            </Box>
                        </CardContent>
                    </Card>
                </Grid>
                <Grid item xs={12} md={4}>
                    <Card sx={{ bgcolor: '#fff', borderRadius: 4, boxShadow: '0 4px 20px rgba(0,0,0,0.05)' }}>
                        <CardContent>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                                <Avatar sx={{ bgcolor: 'success.main' }}><CheckCircleIcon /></Avatar>
                                <Box>
                                    <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700, textTransform: 'uppercase' }}>Approved Partners</Typography>
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
                        <TableRow>
                            <TableCell sx={{ fontWeight: 800 }}>BROKER NAME</TableCell>
                            <TableCell sx={{ fontWeight: 800 }}>CODE</TableCell>
                            <TableCell sx={{ fontWeight: 800 }}>EMAIL / PHONE</TableCell>
                            <TableCell sx={{ fontWeight: 800 }}>STATUS</TableCell>
                            <TableCell sx={{ fontWeight: 800 }} align="right">ACTIONS</TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {(brokers || []).map((broker) => (
                            <TableRow key={broker.id} hover>
                                <TableCell>
                                    <Typography sx={{ fontWeight: 700 }}>{broker.displayName || 'Unknown Broker'}</Typography>
                                    <Typography variant="caption" color="text.secondary">{broker.id}</Typography>
                                </TableCell>
                                <TableCell>
                                    <Chip label={broker.brokerCode || broker.affiliateCode || 'PENDING'} size="small" sx={{ fontWeight: 700 }} />
                                </TableCell>
                                <TableCell>
                                    <Typography variant="body2">{broker.email}</Typography>
                                    <Typography variant="caption" color="text.secondary">{broker.phoneNumber}</Typography>
                                </TableCell>
                                <TableCell>
                                    <Chip 
                                        label={broker.status || 'PENDING'} 
                                        color={broker.status === 'APPROVED' ? 'success' : broker.status === 'REJECTED' ? 'error' : 'warning'} 
                                        size="small" 
                                        sx={{ fontWeight: 800 }}
                                    />
                                </TableCell>
                                <TableCell align="right">
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
            <Dialog open={isViewOpen} onClose={() => setIsViewOpen(false)} maxWidth="md" fullWidth>
                <DialogTitle sx={{ fontWeight: 900 }}>BROKER DOSSIER: {selectedBroker?.displayName}</DialogTitle>
                <DialogContent dividers>
                    {selectedBroker && (
                        <Grid container spacing={4}>
                            <Grid item xs={12} md={6}>
                                <Typography variant="h6" gutterBottom sx={{ fontWeight: 800, color: 'primary.main' }}>
                                    Partner Details
                                </Typography>
                                <Box sx={{ mb: 2 }}>
                                    <Typography variant="caption" color="text.secondary" display="block">Legal Name</Typography>
                                    <Typography sx={{ fontWeight: 700 }}>{selectedBroker.displayName}</Typography>
                                </Box>
                                <Box sx={{ mb: 2 }}>
                                    <Typography variant="caption" color="text.secondary" display="block">Emirates ID</Typography>
                                    <Typography sx={{ fontWeight: 700, fontSpace: 'monospace' }}>{selectedBroker.emiratesId || 'Not provided'}</Typography>
                                </Box>
                                <Box sx={{ mb: 2 }}>
                                    <Typography variant="caption" color="text.secondary" display="block">Affiliate Code</Typography>
                                    <Typography color="secondary" sx={{ fontWeight: 900 }}>{selectedBroker.brokerCode || selectedBroker.affiliateCode}</Typography>
                                </Box>
                            </Grid>
                            <Grid item xs={12} md={6}>
                                <Typography variant="h6" gutterBottom sx={{ fontWeight: 800, color: 'primary.main' }}>
                                    Financial Handshake
                                </Typography>
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
                                    <BankIcon color="action" />
                                    <Box>
                                        <Typography variant="caption" color="text.secondary" display="block">Settlement Bank</Typography>
                                        <Typography sx={{ fontWeight: 700 }}>{selectedBroker.bankName || 'Not configured'}</Typography>
                                    </Box>
                                </Box>
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                                    <BadgeIcon color="action" />
                                    <Box>
                                        <Typography variant="caption" color="text.secondary" display="block">IBAN</Typography>
                                        <Typography sx={{ fontWeight: 700, fontSpace: 'monospace' }}>{selectedBroker.iban || 'Not configured'}</Typography>
                                    </Box>
                                </Box>
                            </Grid>
                            {selectedBroker.kycDocumentUrl && (
                                <Grid item xs={12}>
                                    <Typography variant="h6" gutterBottom sx={{ fontWeight: 800, color: 'primary.main' }}>
                                        Verification Evidence
                                    </Typography>
                                    <Button 
                                        variant="outlined" 
                                        href={selectedBroker.kycDocumentUrl} 
                                        target="_blank"
                                        startIcon={<VisibilityIcon />}
                                        sx={{ borderRadius: 2, fontWeight: 700 }}
                                    >
                                        View Uploaded Credentials
                                    </Button>
                                </Grid>
                            )}
                        </Grid>
                    )}
                </DialogContent>
                <DialogActions sx={{ p: 3 }}>
                    <Button onClick={() => setIsViewOpen(false)} sx={{ fontWeight: 700 }}>Close</Button>
                    {selectedBroker?.status !== 'APPROVED' && (
                        <Button variant="contained" color="success" onClick={() => { handleApprove(selectedBroker!.id); setIsViewOpen(false); }} sx={{ fontWeight: 800, borderRadius: 2 }}>
                            Approve Partner
                        </Button>
                    )}
                </DialogActions>
            </Dialog>
        </Box>
    );
}

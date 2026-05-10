import React, { useState, useEffect } from 'react';
import { Container, Typography, Box, Paper, Grid, Button, alpha, CircularProgress, Chip, Table, TableBody, TableCell, TableContainer, TableHead, TableRow } from '@mui/material';
import { db, collection, query, getDocs, orderBy, limit, doc, updateDoc, serverTimestamp } from '../../lib/firebase';
import { binThemeTokens } from '../../theme/adminTheme';

export default function BrokerCommissionHubPage() {
    const [commissions, setCommissions] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [stats, setStats] = useState({
        pending: 0,
        approved: 0,
        paid: 0
    });

    useEffect(() => {
        const fetchCommissions = async () => {
            try {
                const q = query(collection(db, 'broker_commissions'), orderBy('createdAt', 'desc'), limit(100));
                const snap = await getDocs(q);
                const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
                setCommissions(data);

                let p = 0; let a = 0; let paid = 0;
                data.forEach((c: any) => {
                    if (c.status === 'PENDING') p += c.amount;
                    else if (c.status === 'APPROVED') a += c.amount;
                    else if (c.status === 'PAID') paid += c.amount;
                });
                setStats({ pending: p, approved: a, paid: paid });
            } catch (err) {
                console.error("Commission fetch error:", err);
            } finally {
                setLoading(false);
            }
        };
        fetchCommissions();
    }, []);

    const handleApprove = async (id: string) => {
        try {
            await updateDoc(doc(db, 'broker_commissions', id), {
                status: 'APPROVED',
                approvedAt: serverTimestamp(),
                updatedAt: serverTimestamp()
            });
            setCommissions(prev => prev.map(c => c.id === id ? { ...c, status: 'APPROVED' } : c));
        } catch (e) {}
    };

    if (loading) return <Box sx={{ display: 'flex', justifyContent: 'center', p: 10 }}><CircularProgress sx={{ color: binThemeTokens.gold }}/></Box>;

    return (
        <Container maxWidth="xl" sx={{ py: 6 }}>
            <Box sx={{ mb: 6 }}>
                <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 950, letterSpacing: 4 }}>ADMINISTRY OPERATIONS</Typography>
                <Typography variant="h3" fontWeight="950" color="#FFF">Broker <Box component="span" sx={{ color: binThemeTokens.gold }}>Commission Hub</Box></Typography>
                <Typography variant="body1" color="rgba(255,255,255,0.5)">Lead attribution and payout verification for the BIN GROUP Broker Network.</Typography>
            </Box>

            <Grid container spacing={4} sx={{ mb: 6 }}>
                <Grid item xs={12} md={4}>
                    <Paper sx={{ p: 4, borderRadius: 4, bgcolor: 'rgba(22, 22, 24, 0.6)', border: '1px solid rgba(255,255,255,0.05)' }}>
                        <Typography variant="caption" color="textSecondary">PENDING APPROVAL</Typography>
                        <Typography variant="h4" fontWeight="950" color={binThemeTokens.gold}>AED {stats.pending.toLocaleString()}</Typography>
                    </Paper>
                </Grid>
                <Grid item xs={12} md={4}>
                    <Paper sx={{ p: 4, borderRadius: 4, bgcolor: 'rgba(22, 22, 24, 0.6)', border: '1px solid rgba(255,255,255,0.05)' }}>
                        <Typography variant="caption" color="textSecondary">APPROVED PIPELINE</Typography>
                        <Typography variant="h4" fontWeight="950" color="#10b981">AED {stats.approved.toLocaleString()}</Typography>
                    </Paper>
                </Grid>
                <Grid item xs={12} md={4}>
                    <Paper sx={{ p: 4, borderRadius: 4, bgcolor: 'rgba(22, 22, 24, 0.6)', border: '1px solid rgba(255,255,255,0.05)' }}>
                        <Typography variant="caption" color="textSecondary">TOTAL DISBURSED</Typography>
                        <Typography variant="h4" fontWeight="950" color="#FFF">AED {stats.paid.toLocaleString()}</Typography>
                    </Paper>
                </Grid>
            </Grid>

            <Paper sx={{ p: 4, borderRadius: 6, bgcolor: 'rgba(22, 22, 24, 0.6)', border: '1px solid rgba(255,255,255,0.05)' }}>
                <TableContainer>
                    <Table>
                        <TableHead>
                            <TableRow>
                                <TableCell sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 900 }}>BROKER</TableCell>
                                <TableCell sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 900 }}>REF / CONTRACT</TableCell>
                                <TableCell sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 900 }}>STATUS</TableCell>
                                <TableCell sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 900 }} align="right">AMOUNT (AED)</TableCell>
                                <TableCell sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 900 }} align="center">ACTIONS</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {commissions.map((c) => (
                                <TableRow key={c.id}>
                                    <TableCell sx={{ borderBottom: '1px solid rgba(255,255,255,0.02)' }}>
                                        <Typography fontWeight="900" color="#FFF">{c.brokerName}</Typography>
                                        <Typography variant="caption" color="textSecondary">Code: {c.brokerCode}</Typography>
                                    </TableCell>
                                    <TableCell sx={{ borderBottom: '1px solid rgba(255,255,255,0.02)' }}>
                                        <Typography variant="body2" color="#FFF">{c.contractId?.substring(0,8)}</Typography>
                                        <Typography variant="caption" color="textSecondary">{c.propertyName}</Typography>
                                    </TableCell>
                                    <TableCell sx={{ borderBottom: '1px solid rgba(255,255,255,0.02)' }}>
                                        <Chip 
                                            label={c.status} 
                                            size="small" 
                                            sx={{ 
                                                fontWeight: 900, fontSize: '0.6rem',
                                                bgcolor: c.status === 'PAID' ? alpha('#10b981', 0.1) : (c.status === 'APPROVED' ? alpha(binThemeTokens.gold, 0.1) : 'rgba(255,255,255,0.05)'),
                                                color: c.status === 'PAID' ? '#10b981' : (c.status === 'APPROVED' ? binThemeTokens.gold : 'rgba(255,255,255,0.5)')
                                            }} 
                                        />
                                    </TableCell>
                                    <TableCell sx={{ fontWeight: 900, color: '#FFF', borderBottom: '1px solid rgba(255,255,255,0.02)' }} align="right">
                                        {c.amount.toLocaleString()}
                                    </TableCell>
                                    <TableCell sx={{ borderBottom: '1px solid rgba(255,255,255,0.02)' }} align="center">
                                        {c.status === 'PENDING' && (
                                            <Button size="small" onClick={() => handleApprove(c.id)} sx={{ color: binThemeTokens.gold, fontWeight: 900 }}>APPROVE</Button>
                                        )}
                                        {c.status === 'APPROVED' && (
                                            <Button size="small" variant="contained" sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 900 }}>MARK PAID</Button>
                                        )}
                                    </TableCell>
                                </TableRow>
                            ))}
                            {commissions.length === 0 && (
                                <TableRow><TableCell colSpan={5} align="center" sx={{ py: 6, color: 'rgba(255,255,255,0.2)' }}>No commissions pending in the network.</TableCell></TableRow>
                            )}
                        </TableBody>
                    </Table>
                </TableContainer>
            </Paper>
        </Container>
    );
}

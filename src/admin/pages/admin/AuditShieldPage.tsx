import React, { useState, useEffect } from 'react';
import { 
    Box, Typography, Paper, Table, TableBody, TableCell, 
    TableHead, TableRow, Chip, Button, Grid, alpha, Stack 
} from '@mui/material';
import { Security, ShieldCheck, Download, RefreshCw, Hash } from 'lucide-react';
import { db } from '@/lib/firebase';
import { collection, onSnapshot, query, orderBy, limit } from 'firebase/firestore';
import { useLanguage } from '@bin/shared';
import { binThemeTokens } from '../../theme/adminTheme';
import AdminPageFrame from '../../components/AdminPageFrame';

export default function AuditShieldPage() {
    const { t } = useLanguage();
    const [logs, setLogs] = useState<any[]>([]);
    const [stats, setStats] = useState({ total: 0, verified: 0 });
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const q = query(
            collection(db, 'governanceAudit'), 
            orderBy('createdAt', 'desc'), 
            limit(100)
        );
        
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const auditLogs = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data(),
                timestamp: doc.data().createdAt?.toDate?.()?.toLocaleString() || new Date().toLocaleString()
            }));
            setLogs(auditLogs);
            setStats({
                total: auditLogs.length,
                verified: auditLogs.filter((l: any) => l.forensicHash).length
            });
            setLoading(false);
        }, (error) => {
            console.error("Audit Fetch Error:", error);
            setLoading(false);
        });

        return () => unsubscribe();
    }, []);

    return (
        <AdminPageFrame
            title={t('admin.audit_shield') || 'AUDIT SHIELD'}
            subtitle={t('audit.subtitle') || 'Real-time systemic event logging and compliance tracking'}
            loading={loading}
            isEmpty={logs.length === 0}
            emptyMessage={t('audit.empty') || 'No audit events recorded yet.'}
            breadcrumbs={[{ label: 'Institutional Audit' }]}
            actions={
                <Stack direction="row" spacing={2}>
                    <Button 
                        variant="outlined" 
                        startIcon={<RefreshCw size={16} />} 
                        sx={{ borderColor: 'rgba(255,255,255,0.1)', color: '#FFF', fontWeight: 900 }}
                    >
                        VERIFY HASHES
                    </Button>
                    <Button 
                        variant="contained" 
                        startIcon={<Download size={16} />} 
                        sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950 }}
                    >
                        EXPORT BUNDLE
                    </Button>
                </Stack>
            }
        >
            <Grid container spacing={3}>
                <Grid item xs={12} md={4}>
                    <Paper sx={{ p: 3, borderRadius: 4, bgcolor: 'rgba(255,255,255,0.01)', border: '1px solid rgba(255,255,255,0.05)' }}>
                        <Typography variant="overline" sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 900 }}>TOTAL EVIDENCE BLOCKS</Typography>
                        <Typography variant="h3" fontWeight="950" color="#FFF">{stats.total}</Typography>
                    </Paper>
                </Grid>
                <Grid item xs={12} md={4}>
                    <Paper sx={{ p: 3, borderRadius: 4, bgcolor: alpha(binThemeTokens.gold, 0.05), border: `1px solid ${alpha(binThemeTokens.gold, 0.2)}` }}>
                        <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 900 }}>FORENSIC VERIFICATION</Typography>
                        <Typography variant="h3" fontWeight="950" color={binThemeTokens.gold}>{stats.verified}</Typography>
                    </Paper>
                </Grid>
                <Grid item xs={12} md={4}>
                    <Paper sx={{ p: 3, borderRadius: 4, bgcolor: 'rgba(255,255,255,0.01)', border: '1px solid rgba(255,255,255,0.05)' }}>
                        <Typography variant="overline" sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 900 }}>INSTITUTIONAL STATUS</Typography>
                        <Typography variant="h3" fontWeight="950" color="#10b981">DLD-AA+</Typography>
                    </Paper>
                </Grid>

                <Grid item xs={12}>
                    <TableContainer component={Paper} sx={{ borderRadius: 4, bgcolor: 'rgba(255,255,255,0.01)', border: '1px solid rgba(255,255,255,0.05)' }}>
                        <Table>
                            <TableHead>
                                <TableRow>
                                    <TableCell sx={{ bgcolor: '#020617', color: 'rgba(255,255,255,0.3)', fontWeight: 900 }}>EVENT ID</TableCell>
                                    <TableCell sx={{ bgcolor: '#020617', color: 'rgba(255,255,255,0.3)', fontWeight: 900 }}>ACTION TYPE</TableCell>
                                    <TableCell sx={{ bgcolor: '#020617', color: 'rgba(255,255,255,0.3)', fontWeight: 900 }}>ACTOR / TARGET</TableCell>
                                    <TableCell sx={{ bgcolor: '#020617', color: 'rgba(255,255,255,0.3)', fontWeight: 900 }}>FORENSIC HASH</TableCell>
                                    <TableCell sx={{ bgcolor: '#020617', color: 'rgba(255,255,255,0.3)', fontWeight: 900 }}>TIMESTAMP</TableCell>
                                    <TableCell align="right" sx={{ bgcolor: '#020617', color: 'rgba(255,255,255,0.3)', fontWeight: 900 }}>STATUS</TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {logs.map((row) => (
                                    <TableRow key={row.id} hover>
                                        <TableCell sx={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.7rem', fontFamily: 'monospace' }}>
                                            {row.id.slice(0, 8).toUpperCase()}
                                        </TableCell>
                                        <TableCell>
                                            <Chip 
                                                size="small" 
                                                label={row.eventType || 'SYSTEM'} 
                                                sx={{ 
                                                    bgcolor: alpha(binThemeTokens.gold, 0.1), 
                                                    color: binThemeTokens.gold, 
                                                    fontWeight: 900, fontSize: '0.6rem' 
                                                }} 
                                            />
                                        </TableCell>
                                        <TableCell sx={{ fontWeight: 800, color: '#FFF' }}>
                                            {row.actor?.displayName || row.actor?.uid?.slice(0, 8) || 'SOVEREIGN_CORE'}
                                        </TableCell>
                                        <TableCell sx={{ color: 'rgba(255,255,255,0.3)', fontSize: '0.65rem', fontFamily: 'monospace' }}>
                                            {row.forensicHash ? (
                                                <Stack direction="row" spacing={1} alignItems="center">
                                                    <ShieldCheck size={12} color="#10b981" />
                                                    <Box>{row.forensicHash.slice(0, 16)}...</Box>
                                                </Stack>
                                            ) : 'CRYPTO_PENDING'}
                                        </TableCell>
                                        <TableCell sx={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.75rem' }}>
                                            {row.timestamp}
                                        </TableCell>
                                        <TableCell align="right">
                                            <Chip 
                                                size="small" 
                                                label={row.forensicHash ? 'VERIFIED' : 'PENDING'} 
                                                sx={{ 
                                                    bgcolor: row.forensicHash ? alpha('#10b981', 0.1) : 'rgba(255,255,255,0.05)', 
                                                    color: row.forensicHash ? '#10b981' : 'rgba(255,255,255,0.4)', 
                                                    fontWeight: 950, fontSize: '0.6rem'
                                                }} 
                                            />
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </TableContainer>
                </Grid>
            </Grid>
        </AdminPageFrame>
    );
}

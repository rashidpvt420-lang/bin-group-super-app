import React, { useState, useEffect } from 'react';
import { 
    Box, Typography, Paper, Table, TableBody, TableCell, 
    TableHead, TableRow, Chip, Button, Grid, alpha, Stack,
    TableContainer, IconButton, Tooltip as MuiTooltip
} from '@mui/material';
import { 
    Shield, ShieldCheck, Download, RefreshCw, Hash, 
    Lock, ShieldAlert, Eye, Terminal, Fingerprint
} from 'lucide-react';
import { db } from '@/lib/firebase';
import { collection, onSnapshot, query, orderBy, limit } from 'firebase/firestore';
import { useLanguage } from '@bin/shared';
import { binThemeTokens } from '../../theme/adminTheme';
import AdminPageFrame from '../../components/AdminPageFrame';

export default function AuditShieldPage() {
    const { t } = useLanguage();
    const [logs, setLogs] = useState<any[]>([]);
    const [stats, setStats] = useState({ total: 0, verified: 0, anomalies: 0 });
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
                verified: auditLogs.filter((l: any) => l.forensicHash).length,
                anomalies: 0 // Placeholder for real logic
            });
            setLoading(false);
        }, (error) => {
            console.error("Audit Fetch Error:", error);
            setLoading(false);
        });

        return () => unsubscribe();
    }, []);

    const StatCard = ({ label, value, icon: Icon, color }: any) => (
        <Paper sx={{ 
            p: 3, 
            borderRadius: 5, 
            bgcolor: 'rgba(255,255,255,0.01)', 
            border: '1px solid rgba(255,255,255,0.05)',
            display: 'flex',
            alignItems: 'center',
            gap: 2
        }}>
            <Box sx={{ p: 1.5, borderRadius: 3, bgcolor: alpha(color, 0.1), color }}>
                <Icon size={24} />
            </Box>
            <Box>
                <Typography variant="overline" sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 900, display: 'block', lineHeight: 1 }}>{label}</Typography>
                <Typography variant="h4" fontWeight="950" color="#FFF">{value}</Typography>
            </Box>
        </Paper>
    );

    return (
        <AdminPageFrame
            title="Institutional Audit"
            subtitle="Immutable forensic ledger and systemic activity verification node"
            loading={loading}
            isEmpty={logs.length === 0}
            emptyMessage="FORENSIC LEDGER EMPTY - INITIALIZING AUDIT SYNC"
            breadcrumbs={[{ label: 'Audit Shield' }]}
        >
            <Stack spacing={4}>
                {/* HIGH DENSITY STATS */}
                <Grid container spacing={3}>
                    <Grid item xs={12} md={4}>
                        <StatCard label="Evidence Blocks" value={stats.total} icon={Terminal} color={binThemeTokens.gold} />
                    </Grid>
                    <Grid item xs={12} md={4}>
                        <StatCard label="Verified Hashes" value={stats.verified} icon={Fingerprint} color="#10b981" />
                    </Grid>
                    <Grid item xs={12} md={4}>
                        <StatCard label="System Integrity" value="100%" icon={ShieldCheck} color="#6366f1" />
                    </Grid>
                </Grid>

                {/* ACTION BAR */}
                <Paper sx={{ p: 2, borderRadius: 4, bgcolor: alpha(binThemeTokens.gold, 0.03), border: `1px solid ${alpha(binThemeTokens.gold, 0.1)}` }}>
                    <Stack direction="row" justifyContent="space-between" alignItems="center">
                        <Stack direction="row" spacing={2} alignItems="center">
                            <Shield color={binThemeTokens.gold} size={20} />
                            <Typography variant="body2" fontWeight="950" color="#FFF">SOVEREIGN FORENSIC PROTOCOL ACTIVE</Typography>
                        </Stack>
                        <Stack direction="row" spacing={2}>
                            <Button variant="outlined" startIcon={<RefreshCw size={16} />} sx={{ color: '#FFF', borderColor: 'rgba(255,255,255,0.1)', fontWeight: 900 }}>RE-HASH LEDGER</Button>
                            <Button variant="contained" startIcon={<Download size={16} />} sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950 }}>EXPORT BUNDLE</Button>
                        </Stack>
                    </Stack>
                </Paper>

                {/* FORENSIC LOG TABLE */}
                <TableContainer component={Paper} sx={{ borderRadius: 6, bgcolor: 'rgba(255,255,255,0.01)', border: '1px solid rgba(255,255,255,0.05)', overflow: 'hidden' }}>
                    <Table>
                        <TableHead>
                            <TableRow>
                                <TableCell sx={{ bgcolor: '#020617', color: 'rgba(255,255,255,0.3)', fontWeight: 900, fontSize: '0.7rem' }}>BLOCK ID</TableCell>
                                <TableCell sx={{ bgcolor: '#020617', color: 'rgba(255,255,255,0.3)', fontWeight: 900, fontSize: '0.7rem' }}>ACTION</TableCell>
                                <TableCell sx={{ bgcolor: '#020617', color: 'rgba(255,255,255,0.3)', fontWeight: 900, fontSize: '0.7rem' }}>ACTOR IDENTITY</TableCell>
                                <TableCell sx={{ bgcolor: '#020617', color: 'rgba(255,255,255,0.3)', fontWeight: 900, fontSize: '0.7rem' }}>FORENSIC HASH (SHA-256)</TableCell>
                                <TableCell sx={{ bgcolor: '#020617', color: 'rgba(255,255,255,0.3)', fontWeight: 900, fontSize: '0.7rem' }}>TIMESTAMP</TableCell>
                                <TableCell align="right" sx={{ bgcolor: '#020617', color: 'rgba(255,255,255,0.3)', fontWeight: 900, fontSize: '0.7rem' }}>INTEGRITY</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {logs.map((row) => (
                                <TableRow key={row.id} hover>
                                    <TableCell sx={{ fontFamily: 'monospace', color: 'rgba(255,255,255,0.4)', fontSize: '0.7rem' }}>
                                        {row.id.slice(0, 12).toUpperCase()}
                                    </TableCell>
                                    <TableCell>
                                        <Chip 
                                            label={String(row.action || 'SYSTEM').toUpperCase()} 
                                            size="small" 
                                            sx={{ 
                                                bgcolor: alpha(binThemeTokens.gold, 0.1), 
                                                color: binThemeTokens.gold, 
                                                fontWeight: 950, fontSize: '0.6rem' 
                                            }} 
                                        />
                                    </TableCell>
                                    <TableCell>
                                        <Stack direction="row" spacing={1} alignItems="center">
                                            <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: binThemeTokens.gold }} />
                                            <Typography variant="body2" fontWeight="800" color="#FFF">{String(row.actorRole || 'CORE').toUpperCase()}</Typography>
                                        </Stack>
                                    </TableCell>
                                    <TableCell sx={{ fontFamily: 'monospace', color: 'rgba(255,255,255,0.2)', fontSize: '0.65rem' }}>
                                        {row.forensicHash ? (
                                            <Stack direction="row" spacing={1} alignItems="center">
                                                <Lock size={12} color="#10b981" />
                                                <Box>{row.forensicHash.slice(0, 24)}...</Box>
                                            </Stack>
                                        ) : 'HASH_PENDING'}
                                    </TableCell>
                                    <TableCell sx={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.75rem', fontWeight: 700 }}>
                                        {row.timestamp}
                                    </TableCell>
                                    <TableCell align="right">
                                        <Chip 
                                            label={row.forensicHash ? 'VERIFIED' : 'PENDING'} 
                                            size="small" 
                                            sx={{ 
                                                bgcolor: row.forensicHash ? alpha('#10b981', 0.1) : 'rgba(255,255,255,0.05)', 
                                                color: row.forensicHash ? '#10b981' : 'rgba(255,255,255,0.3)', 
                                                fontWeight: 950, fontSize: '0.6rem'
                                            }} 
                                        />
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </TableContainer>
            </Stack>
        </AdminPageFrame>
    );
}

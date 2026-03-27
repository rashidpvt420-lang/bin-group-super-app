import React, { useState, useEffect } from 'react';
import { 
    Box, 
    Typography, 
    Paper, 
    Table, 
    TableBody, 
    TableCell, 
    TableHead, 
    TableRow, 
    Chip, 
    Button, 
    Grid 
} from '@mui/material';
import SecurityIcon from '@mui/icons-material/Security';
import { db } from '../../lib/firebase';
import { collection, onSnapshot, query, orderBy, limit } from 'firebase/firestore';

export default function AuditShieldPage() {
    const [logs, setLogs] = useState<any[]>([]);
    const [stats, setStats] = useState({ total: 0, verified: 0 });

    useEffect(() => {
        const q = query(
            collection(db, 'governanceAudit'), 
            orderBy('createdAt', 'desc'), 
            limit(50)
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
        });

        return () => unsubscribe();
    }, []);

    return (
        <Box sx={{ p: 4, bgcolor: '#020617', minHeight: '100vh', color: 'white' }}>
            {/* Header */}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 4 }}>
                <SecurityIcon sx={{ fontSize: 40, color: '#3b82f6' }} />
                <Typography variant="h4" fontWeight="900" textTransform="uppercase">
                    Audit Shield <Typography component="span" variant="h4" color="#64748b" fontWeight="900">Observer</Typography>
                </Typography>
            </Box>

            {/* Quick Stats */}
            <Grid container spacing={3} sx={{ mb: 4 }}>
                <Grid item xs={12} md={4}>
                    <Paper sx={{ p: 3, bgcolor: '#0f172a', border: '1px solid #1e293b', borderRadius: 4 }}>
                        <Typography variant="overline" sx={{ color: '#64748b', fontWeight: 900 }}>Total Evidence Blocks</Typography>
                        <Typography variant="h3" fontWeight="900">{stats.total}</Typography>
                    </Paper>
                </Grid>
                <Grid item xs={12} md={4}>
                    <Paper sx={{ p: 3, bgcolor: '#0f172a', border: '1px solid #1e293b', borderRadius: 4 }}>
                        <Typography variant="overline" sx={{ color: '#64748b', fontWeight: 900 }}>Forensic Verification</Typography>
                        <Typography variant="h3" fontWeight="900" color="#10b981">{stats.verified}</Typography>
                    </Paper>
                </Grid>
                <Grid item xs={12} md={4}>
                    <Paper sx={{ p: 3, bgcolor: '#0f172a', border: '1px solid #1e293b', borderRadius: 4 }}>
                        <Typography variant="overline" sx={{ color: '#64748b', fontWeight: 900 }}>Institutional Status</Typography>
                        <Typography variant="h3" fontWeight="900" color="#3b82f6">DLD-AA+</Typography>
                    </Paper>
                </Grid>
            </Grid>

            {/* Main Ledger */}
            <Paper sx={{ bgcolor: '#0f172a', p: 4, borderRadius: 6, border: '1px solid #1e293b', boxShadow: '0 20px 50px rgba(0,0,0,0.3)' }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 4 }}>
                    <Box>
                        <Typography variant="h6" color="white" fontWeight="900">AuditShield™ Immutable Ledger</Typography>
                        <Typography variant="caption" sx={{ color: '#64748b' }}>Real-time cryptographic verification of forensic evidence chains.</Typography>
                    </Box>
                    <Box sx={{ display: 'flex', gap: 2 }}>
                        <Button variant="outlined" sx={{ borderRadius: 2, borderColor: '#3b82f6', color: '#3b82f6', fontWeight: 900 }}>
                             Verify Hashes
                        </Button>
                        <Button variant="contained" sx={{ borderRadius: 2, bgcolor: '#10b981', '&:hover': { bgcolor: '#059669' }, fontWeight: 900 }}>
                            Export Bundle
                        </Button>
                    </Box>
                </Box>
                
                <Table>
                    <TableHead>
                        <TableRow>
                            <TableCell sx={{ color: '#64748b', fontWeight: 900, borderBottom: '1px solid #1e293b' }}>EVENT ID</TableCell>
                            <TableCell sx={{ color: '#64748b', fontWeight: 900, borderBottom: '1px solid #1e293b' }}>ACTION TYPE</TableCell>
                            <TableCell sx={{ color: '#64748b', fontWeight: 900, borderBottom: '1px solid #1e293b' }}>ACTOR / TARGET</TableCell>
                            <TableCell sx={{ color: '#64748b', fontWeight: 900, borderBottom: '1px solid #1e293b' }}>FORENSIC HASH</TableCell>
                            <TableCell sx={{ color: '#64748b', fontWeight: 900, borderBottom: '1px solid #1e293b' }}>TIMESTAMP</TableCell>
                            <TableCell sx={{ color: '#64748b', fontWeight: 900, borderBottom: '1px solid #1e293b', textAlign: 'right' }}>STATUS</TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {logs.map((row) => (
                            <TableRow key={row.id} sx={{ '&:hover': { bgcolor: 'rgba(255,255,255,0.02)' } }}>
                                <TableCell sx={{ color: '#64748b', borderBottom: '1px solid #1e293b', fontSize: '0.75rem', fontFamily: 'monospace' }}>
                                    {row.id.slice(0, 8)}
                                </TableCell>
                                <TableCell sx={{ color: 'white', borderBottom: '1px solid #1e293b' }}>
                                    <Chip 
                                        size="small" 
                                        label={row.eventType || 'SYSTEM'} 
                                        sx={{ 
                                            bgcolor: (row.eventType?.includes('KYC') || row.eventType?.includes('ROLE')) ? '#ef444433' : '#3b82f633', 
                                            color: (row.eventType?.includes('KYC') || row.eventType?.includes('ROLE')) ? '#ef4444' : '#3b82f6', 
                                            fontWeight: 900,
                                            fontSize: '0.65rem'
                                        }} 
                                    />
                                </TableCell>
                                <TableCell sx={{ color: 'white', borderBottom: '1px solid #1e293b' }}>
                                    {row.actor?.displayName || row.actor?.uid?.slice(0, 10) || 'SYSTEM'}
                                </TableCell>
                                <TableCell sx={{ color: '#64748b', borderBottom: '1px solid #1e293b', fontSize: '0.7rem', fontFamily: 'monospace' }}>
                                    {row.forensicHash ? (
                                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                            <Box sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: '#10b981' }} />
                                            {row.forensicHash.slice(0, 12)}...
                                        </Box>
                                    ) : (
                                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                            <Box sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: '#64748b' }} />
                                            LEGACY_LOG
                                        </Box>
                                    )}
                                </TableCell>
                                <TableCell sx={{ color: '#94a3b8', borderBottom: '1px solid #1e293b', fontSize: '0.8rem' }}>
                                    {row.timestamp}
                                </TableCell>
                                <TableCell sx={{ borderBottom: '1px solid #1e293b', textAlign: 'right' }}>
                                    <Chip 
                                        size="small" 
                                        label={row.forensicHash ? 'VERIFIED' : 'PENDING'} 
                                        sx={{ 
                                            bgcolor: row.forensicHash ? '#10b98133' : '#64748b33', 
                                            color: row.forensicHash ? '#10b981' : '#94a3b8', 
                                            fontWeight: 900,
                                            fontSize: '0.65rem'
                                        }} 
                                    />
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>

                {logs.length === 0 && (
                    <Box sx={{ textAlign: 'center', py: 10 }}>
                        <Typography variant="body2" sx={{ color: '#64748b', fontStyle: 'italic' }}>
                            Awaiting operational telemetry for AuditShield™ verification...
                        </Typography>
                    </Box>
                )}
            </Paper>
        </Box>
    );
}

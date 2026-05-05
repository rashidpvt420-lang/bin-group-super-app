import React, { useState, useEffect } from 'react';
import {
    Box, Button, Chip, CircularProgress, Paper, Table, 
    TableBody, TableCell, TableContainer, TableHead, TableRow, 
    Typography, alpha, Stack, IconButton
} from '@mui/material';
import { 
    ShieldCheck, Download, Activity, AlertCircle, 
    CheckCircle, Shield, FileText, Lock
} from 'lucide-react';
import { db } from '@/lib/firebase';
import { collection, query, orderBy, limit, onSnapshot } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { useLanguage, binThemeTokens } from '@bin/shared';
import AdminPageFrame from '../../components/AdminPageFrame';

interface AuditLog {
    id: string;
    uid: string;
    email: string;
    action: string;
    resourceType: string;
    resourceId: string;
    severity: 'INFO' | 'WARN' | 'CRITICAL';
    timestamp: string;
}

export default function CompliancePage() {
    const { t } = useLanguage();
    const [logs, setLogs] = useState<AuditLog[]>([]);
    const [loading, setLoading] = useState(true);
    const [exporting, setExporting] = useState(false);

    useEffect(() => {
        const q = query(collection(db, '_auditLogs'), orderBy('timestamp', 'desc'), limit(100));
        return onSnapshot(q, snap => {
            setLogs(snap.docs.map(d => ({ id: d.id, ...d.data() } as AuditLog)));
            setLoading(false);
        });
    }, []);

    const handleExport = async () => {
        setExporting(true);
        try {
            const fns = getFunctions();
            const result = await httpsCallable(fns, 'exportComplianceReport')({ months: 12 }) as any;
            const report = result.data.report;
            const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url; a.download = `BIN_Group_Audit_Trail_${new Date().toISOString().slice(0, 10)}.json`; a.click();
        } catch (e: any) {
            alert(`Export failed: ${e.message}`);
        } finally {
            setExporting(false);
        }
    };

    const getSeverityStyle = (severity: string) => {
        if (severity === 'CRITICAL') return { color: '#EF4444', bg: alpha('#EF4444', 0.1) };
        if (severity === 'WARN') return { color: '#F59E0B', bg: alpha('#F59E0B', 0.1) };
        return { color: '#10B981', bg: alpha('#10B981', 0.1) };
    };

    return (
        <AdminPageFrame
            title={t('nav.audit') || 'COMPLIANCE & AUDIT SHIELD'}
            subtitle="ISO 27001 / UAE PDPL compliant systemic audit trail and tamper-evident logs"
            loading={loading}
            breadcrumbs={[{ label: 'Compliance' }]}
            actions={
                <Button
                    variant="contained"
                    startIcon={exporting ? <CircularProgress size={16} color="inherit" /> : <Download size={18} />}
                    onClick={handleExport}
                    disabled={exporting}
                    sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950, borderRadius: 2 }}
                >
                    EXPORT AUDIT TRAIL
                </Button>
            }
        >
            <Stack direction="row" spacing={3} sx={{ mb: 4 }}>
                <Box sx={{ p: 2, bgcolor: alpha('#10B981', 0.1), borderRadius: 2, border: '1px solid rgba(16,185,129,0.2)', flexGrow: 1 }}>
                    <Typography variant="caption" sx={{ color: '#10B981', fontWeight: 950, display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Shield size={14} /> PDPL COMPLIANT
                    </Typography>
                </Box>
                <Box sx={{ p: 2, bgcolor: alpha(binThemeTokens.gold, 0.1), borderRadius: 2, border: '1px solid rgba(218,165,32,0.2)', flexGrow: 1 }}>
                    <Typography variant="caption" sx={{ color: binThemeTokens.gold, fontWeight: 950, display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Activity size={14} /> LIVE MONITORING
                    </Typography>
                </Box>
                <Box sx={{ p: 2, bgcolor: alpha('#6366f1', 0.1), borderRadius: 2, border: '1px solid rgba(99,102,241,0.2)', flexGrow: 1 }}>
                    <Typography variant="caption" sx={{ color: '#6366f1', fontWeight: 950, display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Lock size={14} /> TAMPER EVIDENT
                    </Typography>
                </Box>
            </Stack>

            <TableContainer component={Paper} sx={{ borderRadius: 4, bgcolor: 'rgba(255,255,255,0.01)', border: '1px solid rgba(255,255,255,0.05)' }}>
                <Table size="small">
                    <TableHead>
                        <TableRow>
                            <TableCell sx={{ bgcolor: '#020617', color: 'rgba(255,255,255,0.3)', fontWeight: 900 }}>TIMESTAMP</TableCell>
                            <TableCell sx={{ bgcolor: '#020617', color: 'rgba(255,255,255,0.3)', fontWeight: 900 }}>OPERATOR</TableCell>
                            <TableCell sx={{ bgcolor: '#020617', color: 'rgba(255,255,255,0.3)', fontWeight: 900 }}>ACTION</TableCell>
                            <TableCell sx={{ bgcolor: '#020617', color: 'rgba(255,255,255,0.3)', fontWeight: 900 }}>RESOURCE</TableCell>
                            <TableCell sx={{ bgcolor: '#020617', color: 'rgba(255,255,255,0.3)', fontWeight: 900 }}>SEVERITY</TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {logs.map(log => {
                            const style = getSeverityStyle(log.severity);
                            return (
                                <TableRow key={log.id} hover>
                                    <TableCell>
                                        <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)', fontFamily: 'monospace' }}>
                                            {log.timestamp?.slice(0, 19).replace('T', ' ')}
                                        </Typography>
                                    </TableCell>
                                    <TableCell>
                                        <Typography variant="body2" sx={{ fontWeight: 800, color: '#FFF' }}>{log.email || 'SYSTEM'}</Typography>
                                        <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.2)', fontSize: '0.6rem' }}>{log.uid?.slice(0, 8)}</Typography>
                                    </TableCell>
                                    <TableCell>
                                        <Typography variant="caption" sx={{ fontWeight: 950, color: binThemeTokens.gold, letterSpacing: 1 }}>{String(log.action || 'SYSTEM').toUpperCase()}</Typography>
                                    </TableCell>
                                    <TableCell>
                                        <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.6)' }}>{log.resourceType}</Typography>
                                        <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.2)', fontFamily: 'monospace' }}>{log.resourceId?.slice(0, 12)}</Typography>
                                    </TableCell>
                                    <TableCell>
                                        <Chip 
                                            label={log.severity} 
                                            size="small" 
                                            sx={{ bgcolor: style.bg, color: style.color, fontWeight: 950, fontSize: '0.6rem' }} 
                                        />
                                    </TableCell>
                                </TableRow>
                            );
                        })}
                    </TableBody>
                </Table>
            </TableContainer>
        </AdminPageFrame>
    );
}

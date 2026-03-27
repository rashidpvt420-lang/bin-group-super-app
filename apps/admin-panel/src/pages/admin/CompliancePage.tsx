/**
 * CompliancePage — Admin Panel
 * Displays the _auditLogs collection and provides a PDF-style compliance export button.
 * ISO 27001 / UAE PDPL compliant audit trail.
 */
import React, { useState, useEffect } from 'react';
import {
    Box, Button, Chip, CircularProgress, Container, Divider,
    Paper, Table, TableBody, TableCell, TableContainer,
    TableHead, TableRow, Typography,
} from '@mui/material';
import DownloadIcon from '@mui/icons-material/Download';
import ShieldIcon from '@mui/icons-material/Shield';
import VerifiedIcon from '@mui/icons-material/Verified';
import { db } from '../../lib/firebase';
import { collection, query, orderBy, limit, onSnapshot } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';

interface AuditLog {
    id: string;
    uid: string;
    email: string;
    action: string;
    resourceType: string;
    resourceId: string;
    severity: 'INFO' | 'WARN' | 'CRITICAL';
    timestamp: string;
    propertyId?: string;
}

const SEVERITY_CHIP: Record<string, 'success' | 'warning' | 'error' | 'default'> = {
    INFO: 'success', WARN: 'warning', CRITICAL: 'error',
};

function downloadJSON(data: any, filename: string) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
}

export default function CompliancePage() {
    const [logs, setLogs] = useState<AuditLog[]>([]);
    const [loading, setLoading] = useState(true);
    const [exporting, setExporting] = useState(false);
    const [summary, setSummary] = useState<any>(null);

    useEffect(() => {
        const q = query(collection(db, '_auditLogs'), orderBy('timestamp', 'desc'), limit(200));
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
            setSummary(report.summary);
            downloadJSON(report, `BIN_Group_Compliance_Report_${new Date().toISOString().slice(0, 10)}.json`);
        } catch (e: any) {
            alert(`Export failed: ${e.message}`);
        } finally {
            setExporting(false);
        }
    };

    const criticalCount = logs.filter(l => l.severity === 'CRITICAL').length;
    const warnCount = logs.filter(l => l.severity === 'WARN').length;

    return (
        <Container maxWidth="xl" sx={{ py: 4 }}>
            {/* Header */}
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 4, flexWrap: 'wrap', gap: 2 }}>
                <Box>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 0.5 }}>
                        <ShieldIcon sx={{ color: '#6366f1', fontSize: 28 }} />
                        <Typography variant="h4" fontWeight="black">Compliance & Audit Log</Typography>
                    </Box>
                    <Typography variant="body2" color="text.secondary">
                        ISO 27001 · UAE PDPL Compliant · Real-time tamper-evident log
                    </Typography>
                </Box>
                <Button
                    variant="contained"
                    size="large"
                    startIcon={exporting ? <CircularProgress size={20} color="inherit" /> : <DownloadIcon />}
                    disabled={exporting}
                    onClick={handleExport}
                    sx={{ bgcolor: '#0f172a', fontWeight: 'bold', borderRadius: 3, px: 4 }}
                >
                    {exporting ? 'Generating Report...' : 'Export 12-Month Compliance Report'}
                </Button>
            </Box>

            {/* Summary cards */}
            {summary && (
                <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 2, mb: 4 }}>
                    {[
                        { label: 'Total Events', value: summary.totalAuditEvents, color: '#6366f1' },
                        { label: 'Contract Events', value: summary.contractEvents, color: '#0ea5e9' },
                        { label: 'SLA Compliance', value: `${summary.slaCompliancePct}%`, color: '#10b981' },
                        { label: 'SLA Breaches', value: summary.slaBreaches, color: '#ef4444' },
                        { label: 'Critical Events', value: summary.criticalEvents, color: '#f59e0b' },
                    ].map(c => (
                        <Paper key={c.label} sx={{ p: 3, borderRadius: 3, textAlign: 'center', border: `2px solid ${c.color}20` }}>
                            <Typography fontWeight="black" fontSize={28} color={c.color}>{c.value}</Typography>
                            <Typography fontSize={11} color="text.secondary" fontWeight={700} mt={0.5}>{c.label}</Typography>
                        </Paper>
                    ))}
                </Box>
            )}

            {/* Live stats */}
            <Box sx={{ display: 'flex', gap: 2, mb: 3, flexWrap: 'wrap', alignItems: 'center' }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <VerifiedIcon sx={{ color: '#10b981', fontSize: 18 }} />
                    <Typography variant="body2" fontWeight="bold" color="#10b981">UAE PDPL Compliant</Typography>
                </Box>
                <Divider orientation="vertical" flexItem />
                <Typography variant="body2" color="text.secondary" fontWeight="bold">
                    {logs.length} audit events loaded
                </Typography>
                {criticalCount > 0 && (
                    <Chip label={`${criticalCount} Critical`} color="error" size="small" sx={{ fontWeight: 700 }} />
                )}
                {warnCount > 0 && (
                    <Chip label={`${warnCount} Warnings`} color="warning" size="small" sx={{ fontWeight: 700 }} />
                )}
            </Box>

            {/* Audit Log Table */}
            {loading ? (
                <Box sx={{ textAlign: 'center', py: 8 }}><CircularProgress /></Box>
            ) : (
                <TableContainer component={Paper} sx={{ borderRadius: 3, border: '1px solid #f1f5f9' }}>
                    <Table size="small">
                        <TableHead sx={{ bgcolor: '#f8fafc' }}>
                            <TableRow>
                                {['Timestamp', 'User', 'Action', 'Resource', 'Property', 'Severity'].map(h => (
                                    <TableCell key={h} sx={{ fontWeight: 800, fontSize: 11, letterSpacing: 0.5, color: '#64748b', textTransform: 'uppercase' }}>
                                        {h}
                                    </TableCell>
                                ))}
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {logs.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={6} align="center" sx={{ py: 6, color: '#94a3b8' }}>
                                        No audit events yet. Events are logged automatically as operations occur.
                                    </TableCell>
                                </TableRow>
                            ) : logs.map(log => (
                                <TableRow key={log.id} hover sx={{ '&:last-child td': { border: 0 } }}>
                                    <TableCell>
                                        <Typography fontSize={11} fontFamily="monospace">
                                            {log.timestamp?.slice(0, 19).replace('T', ' ')}
                                        </Typography>
                                    </TableCell>
                                    <TableCell>
                                        <Typography fontSize={11} fontWeight={600}>{log.email || log.uid?.slice(0, 8)}</Typography>
                                    </TableCell>
                                    <TableCell>
                                        <Typography fontSize={11} fontWeight={700} sx={{ textTransform: 'uppercase', letterSpacing: 0.5 }}>
                                            {log.action}
                                        </Typography>
                                    </TableCell>
                                    <TableCell>
                                        <Typography fontSize={11}>{log.resourceType}</Typography>
                                        {log.resourceId && (
                                            <Typography fontSize={10} color="text.secondary" fontFamily="monospace">
                                                {log.resourceId.slice(0, 12)}…
                                            </Typography>
                                        )}
                                    </TableCell>
                                    <TableCell>
                                        <Typography fontSize={11} fontFamily="monospace">
                                            {log.propertyId?.slice(0, 12) || '—'}
                                        </Typography>
                                    </TableCell>
                                    <TableCell>
                                        <Chip
                                            label={log.severity}
                                            color={SEVERITY_CHIP[log.severity] || 'default'}
                                            size="small"
                                            sx={{ fontWeight: 800, fontSize: 10, letterSpacing: 0.5 }}
                                        />
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </TableContainer>
            )}
        </Container>
    );
}

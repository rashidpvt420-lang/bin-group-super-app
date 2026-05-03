import React, { useState, useEffect } from 'react';
import { 
    Paper, Table, TableBody, TableCell, TableContainer, 
    TableHead, TableRow, Chip, Box, Typography, Stack,
    alpha, TextField, InputAdornment, IconButton
} from '@mui/material';
import { 
    Search, Filter, ShieldCheck, User, 
    Clock, Activity, AlertCircle, FileText
} from 'lucide-react';
import { collection, query, orderBy, limit, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useLanguage } from '@bin/shared';
import { binThemeTokens } from '../theme/adminTheme';
import AdminPageFrame from '../components/AdminPageFrame';

export default function AuditLogPage() {
    const { t, lang } = useLanguage();
    const [logs, setLogs] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');

    useEffect(() => {
        const q = query(collection(db, 'audit_logs'), orderBy('createdAt', 'desc'), limit(100));
        const unsubscribe = onSnapshot(q, (snap) => {
            const data = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setLogs(data);
            setLoading(false);
        }, (err) => {
            console.error("Audit load fault:", err);
            setLoading(false);
        });
        return () => unsubscribe();
    }, []);

    const getSeverityColor = (action: string) => {
        if (action?.includes('DELETE') || action?.includes('REJECT')) return 'error';
        if (action?.includes('CREATE') || action?.includes('APPROVE')) return 'success';
        if (action?.includes('UPDATE')) return 'warning';
        return 'primary';
    };

    const filteredLogs = logs.filter(log => 
        log.action?.toLowerCase().includes(search.toLowerCase()) ||
        log.adminId?.toLowerCase().includes(search.toLowerCase()) ||
        log.id?.toLowerCase().includes(search.toLowerCase())
    );

    return (
        <AdminPageFrame
            title={t('audit.title') || 'INSTITUTIONAL AUDIT'}
            subtitle={t('audit.subtitle') || 'Sovereign audit trail and compliance monitoring'}
            loading={loading}
            isEmpty={logs.length === 0}
            emptyMessage={t('audit.no_events') || 'No audit events recorded.'}
            breadcrumbs={[{ label: 'Audit Log' }]}
            actions={
                <Stack direction="row" spacing={2}>
                    <TextField 
                        placeholder="Search Events..." 
                        size="small" 
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        InputProps={{
                            startAdornment: (
                                <InputAdornment position="start">
                                    <Search size={16} color="rgba(255,255,255,0.3)" />
                                </InputAdornment>
                            ),
                            sx: { bgcolor: 'rgba(255,255,255,0.05)', borderRadius: 2 }
                        }}
                    />
                    <IconButton sx={{ bgcolor: 'rgba(255,255,255,0.05)' }}><Filter size={20} /></IconButton>
                </Stack>
            }
        >
            <TableContainer component={Paper} sx={{ borderRadius: 4, bgcolor: 'rgba(255,255,255,0.01)' }}>
                <Table>
                    <TableHead>
                        <TableRow>
                            <TableCell>{t('audit.table.timestamp')?.toUpperCase() || 'TIMESTAMP'}</TableCell>
                            <TableCell>{t('audit.table.actor')?.toUpperCase() || 'ACTOR'}</TableCell>
                            <TableCell>{t('audit.table.event_type')?.toUpperCase() || 'ACTION'}</TableCell>
                            <TableCell>{t('audit.table.resource_id')?.toUpperCase() || 'RESOURCE'}</TableCell>
                            <TableCell>{t('audit.table.status')?.toUpperCase() || 'COMPLIANCE'}</TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {filteredLogs.map((log) => (
                            <TableRow key={log.id} hover>
                                <TableCell>
                                    <Stack direction="row" spacing={1} alignItems="center">
                                        <Clock size={14} color="rgba(255,255,255,0.4)" />
                                        <Typography variant="caption">
                                            {log.createdAt?.toDate ? log.createdAt.toDate().toLocaleString() : 'N/A'}
                                        </Typography>
                                    </Stack>
                                </TableCell>
                                <TableCell>
                                    <Stack direction="row" spacing={1} alignItems="center">
                                        <User size={14} color={binThemeTokens.gold} />
                                        <Typography variant="body2" fontWeight="700">{log.adminId || 'SYSTEM'}</Typography>
                                    </Stack>
                                </TableCell>
                                <TableCell>
                                    <Chip 
                                        label={log.action?.replace(/_/g, ' ') || 'SYSTEM_EVENT'} 
                                        size="small" 
                                        color={getSeverityColor(log.action)}
                                        sx={{ fontWeight: 900, fontSize: '0.65rem' }} 
                                    />
                                </TableCell>
                                <TableCell>
                                    <Typography variant="caption" sx={{ fontFamily: 'monospace', color: 'rgba(255,255,255,0.5)' }}>
                                        {log.intakeId || log.ownerId || log.id}
                                    </Typography>
                                </TableCell>
                                <TableCell>
                                    <Chip 
                                        icon={<ShieldCheck size={12} />}
                                        label="VERIFIED" 
                                        size="small" 
                                        variant="outlined" 
                                        sx={{ color: '#10b981', borderColor: alpha('#10b981', 0.3), fontWeight: 800, fontSize: '0.6rem' }} 
                                    />
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </TableContainer>
        </AdminPageFrame>
    );
}

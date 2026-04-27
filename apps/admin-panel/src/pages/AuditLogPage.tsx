import React, { useState, useEffect } from 'react';
import { 
    Container, Typography, Paper, Table, TableBody, TableCell, 
    TableContainer, TableHead, TableRow, Chip, Box, TextField, 
    InputAdornment, IconButton, Grid
} from '@mui/material';
import { collection, query, orderBy, limit, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';
import SearchIcon from '@mui/icons-material/Search';
import FilterListIcon from '@mui/icons-material/FilterList';
import HistoryIcon from '@mui/icons-material/History';
import { useLanguage } from '@bin/shared';

export default function AuditLogPage() {
    const { t, lang, isRTL } = useLanguage();
    const [logs, setLogs] = useState<any[]>([]);
    const [search, setSearch] = useState('');

    useEffect(() => {
        const q = query(collection(db, 'system_logs'), orderBy('timestamp', 'desc'), limit(100));
        const unsubscribe = onSnapshot(q, (snap) => {
            const data = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as any));
            setLogs(data);
        });
        return () => unsubscribe();
    }, []);

    const getSeverityColor = (type: string) => {
        switch (type) {
            case 'SLA_VIOLATION': return 'error';
            case 'DISPATCH_EVENT': return 'primary';
            case 'RENEWAL_ALERT': return 'warning';
            case 'BILLING_EVENT': return 'success';
            default: return 'default';
        }
    };

    return (
        <Container maxWidth="xl" sx={{ py: 6, direction: isRTL ? 'rtl' : 'ltr' }}>
            <Box sx={{ mb: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexDirection: isRTL ? 'row-reverse' : 'row' }}>
                <Box sx={{ textAlign: isRTL ? 'right' : 'left' }}>
                    <Typography variant="h4" fontWeight="black" gutterBottom>{t('audit.title')}</Typography>
                    <Typography variant="body2" color="text.secondary">{t('audit.subtitle')}</Typography>
                </Box>
                <Box sx={{ display: 'flex', gap: 2, flexDirection: isRTL ? 'row-reverse' : 'row' }}>
                    <TextField 
                        placeholder={t('audit.search_placeholder')} 
                        size="small" 
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        InputProps={{
                            startAdornment: (
                                <InputAdornment position="start">
                                    <SearchIcon fontSize="small" />
                                </InputAdornment>
                            )
                        }}
                    />
                    <IconButton><FilterListIcon /></IconButton>
                </Box>
            </Box>

            <Grid container spacing={4}>
                <Grid item xs={12}>
                    <TableContainer component={Paper} elevation={0} sx={{ border: '1px solid rgba(0,0,0,0.05)', borderRadius: 3 }}>
                        <Table sx={{ minWidth: 650 }}>
                            <TableHead sx={{ bgcolor: 'rgba(0,0,0,0.02)' }}>
                                <TableRow sx={{ flexDirection: isRTL ? 'row-reverse' : 'row' }}>
                                    <TableCell sx={{ fontWeight: 'bold', textAlign: isRTL ? 'right' : 'left' }}>{t('audit.table.timestamp')}</TableCell>
                                    <TableCell sx={{ fontWeight: 'bold', textAlign: isRTL ? 'right' : 'left' }}>{t('audit.table.event_type')}</TableCell>
                                    <TableCell sx={{ fontWeight: 'bold', textAlign: isRTL ? 'right' : 'left' }}>{t('audit.table.resource_id')}</TableCell>
                                    <TableCell sx={{ fontWeight: 'bold', textAlign: isRTL ? 'right' : 'left' }}>{t('audit.table.actor')}</TableCell>
                                    <TableCell sx={{ fontWeight: 'bold', textAlign: isRTL ? 'right' : 'left' }}>{t('audit.table.description')}</TableCell>
                                    <TableCell sx={{ fontWeight: 'bold', textAlign: isRTL ? 'right' : 'left' }}>{t('audit.table.status')}</TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {logs.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={6} align="center" sx={{ py: 8 }}>
                                            <HistoryIcon sx={{ fontSize: 40, color: '#94a3b8', mb: 1, display: 'block', mx: 'auto' }} />
                                            <Typography color="text.secondary">{t('audit.no_events')}</Typography>
                                        </TableCell>
                                    </TableRow>
                                ) : logs.map((log) => (
                                    <TableRow key={log.id} hover sx={{ flexDirection: isRTL ? 'row-reverse' : 'row' }}>
                                        <TableCell sx={{ textAlign: isRTL ? 'right' : 'left' }}>{log.timestamp?.toDate().toLocaleString(lang === 'ar' ? 'ar-AE' : 'en-AE')}</TableCell>
                                        <TableCell sx={{ textAlign: isRTL ? 'right' : 'left' }}>
                                            <Chip label={log.type} size="small" color={getSeverityColor(log.type)} sx={{ fontWeight: 'bold' }} />
                                        </TableCell>
                                        <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.8rem', textAlign: isRTL ? 'right' : 'left' }}>{log.resourceId}</TableCell>
                                        <TableCell sx={{ textAlign: isRTL ? 'right' : 'left' }}>{log.actor}</TableCell>
                                        <TableCell sx={{ fontWeight: 500, textAlign: isRTL ? 'right' : 'left' }}>{log.message}</TableCell>
                                        <TableCell sx={{ textAlign: isRTL ? 'right' : 'left' }}>
                                            <Chip label={t('audit.verified')} size="small" variant="outlined" sx={{ color: '#10b981', borderColor: '#10b981' }} />
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </TableContainer>
                </Grid>
            </Grid>
        </Container>
    );
}

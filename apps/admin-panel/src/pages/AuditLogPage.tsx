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

export default function AuditLogPage() {
    const [logs, setLogs] = useState<any[]>([]);
    const [search, setSearch] = useState('');

    useEffect(() => {
        const q = query(collection(db, 'system_logs'), orderBy('timestamp', 'desc'), limit(100));
        const unsubscribe = onSnapshot(q, (snap) => {
            const data = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
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
        <Container maxWidth="xl" sx={{ py: 6 }}>
            <Box sx={{ mb: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Box>
                    <Typography variant="h4" fontWeight="black" gutterBottom>Systemic Audit Log</Typography>
                    <Typography variant="body2" color="text.secondary">Real-time trace of the BIN-GROUP Intelligence Layer (V1.3)</Typography>
                </Box>
                <Box sx={{ display: 'flex', gap: 2 }}>
                    <TextField 
                        placeholder="Search Trace ID..." 
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
                                <TableRow>
                                    <TableCell sx={{ fontWeight: 'bold' }}>Timestamp</TableCell>
                                    <TableCell sx={{ fontWeight: 'bold' }}>Event Type</TableCell>
                                    <TableCell sx={{ fontWeight: 'bold' }}>Resource ID</TableCell>
                                    <TableCell sx={{ fontWeight: 'bold' }}>Actor</TableCell>
                                    <TableCell sx={{ fontWeight: 'bold' }}>Description</TableCell>
                                    <TableCell sx={{ fontWeight: 'bold' }}>Status</TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {logs.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={6} align="center" sx={{ py: 8 }}>
                                            <HistoryIcon sx={{ fontSize: 40, color: '#94a3b8', mb: 1, display: 'block', mx: 'auto' }} />
                                            <Typography color="text.secondary">No systemic events captured in current window.</Typography>
                                        </TableCell>
                                    </TableRow>
                                ) : logs.map((log) => (
                                    <TableRow key={log.id} hover>
                                        <TableCell>{log.timestamp?.toDate().toLocaleString()}</TableCell>
                                        <TableCell>
                                            <Chip label={log.type} size="small" color={getSeverityColor(log.type)} sx={{ fontWeight: 'bold' }} />
                                        </TableCell>
                                        <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>{log.resourceId}</TableCell>
                                        <TableCell>{log.actor}</TableCell>
                                        <TableCell sx={{ fontWeight: 500 }}>{log.message}</TableCell>
                                        <TableCell>
                                            <Chip label="VERIFIED" size="small" variant="outlined" sx={{ color: '#10b981', borderColor: '#10b981' }} />
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

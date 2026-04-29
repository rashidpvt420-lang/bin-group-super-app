// apps/admin-panel/src/pages/admin/DesignStudioAdminPage.tsx
import React, { useState, useEffect } from 'react';
import { 
    Paper, Table, TableBody, TableCell, 
    TableContainer, TableHead, TableRow, Chip, 
    IconButton, Stack, alpha, CircularProgress, 
    Typography, Box, Container, Button, TextField, InputAdornment
} from '@mui/material';
import { ChevronRight, Search } from 'lucide-react';
import { db, collection, query, onSnapshot, orderBy, doc, updateDoc, serverTimestamp } from '../../lib/firebase';
import { useLanguage } from '@bin/shared';
import { binThemeTokens } from '../../theme/adminTheme';
import { useNavigate } from 'react-router-dom';

export default function DesignStudioAdminPage() {
    const [requests, setRequests] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');

    useEffect(() => {
        const q = query(collection(db, 'design_requests'), orderBy('createdAt', 'desc'));
        const unsub = onSnapshot(q, (snap) => {
            setRequests(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
            setLoading(false);
        });
        return () => unsub();
    }, []);

    const getStatusChip = (status: string) => {
        const s = status || 'DRAFT';
        switch (s) {
            case 'PAID': return <Chip label="PAID" size="small" sx={{ bgcolor: 'rgba(16,185,129,0.1)', color: '#10b981', fontWeight: 900 }} />;
            case 'OWNER_APPROVED': return <Chip label="APPROVED" size="small" sx={{ bgcolor: 'rgba(59,130,246,0.1)', color: '#60A5FA', fontWeight: 900 }} />;
            case 'PENDING_OWNER_NOC': return <Chip label="NOC PENDING" size="small" sx={{ bgcolor: 'rgba(245,158,11,0.1)', color: '#f59e0b', fontWeight: 900 }} />;
            case 'OWNER_REJECTED': return <Chip label="REJECTED" size="small" sx={{ bgcolor: 'rgba(239,68,68,0.1)', color: '#ef4444', fontWeight: 900 }} />;
            default: return <Chip label={s.replace('_', ' ')} size="small" sx={{ bgcolor: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.6)', fontWeight: 900 }} />;
        }
    };

    const handleConvertToProject = async (id: string) => {
        try {
            await updateDoc(doc(db, 'design_requests', id), {
                status: 'CONVERTED_TO_PROJECT',
                convertedAt: serverTimestamp()
            });
            alert("Design request converted to active execution project.");
        } catch (err) {
            console.error("Conversion failed:", err);
        }
    };

    if (loading) return <Box sx={{ height: '80vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><CircularProgress /></Box>;

    return (
        <Box sx={{ height: '100%', overflowY: 'auto', bgcolor: '#020617', py: 4 }}>
            <Container maxWidth="xl">
                <Box sx={{ mb: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Box>
                        <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 950, letterSpacing: 4 }}>
                            CREATIVE OPERATIONS
                        </Typography>
                        <Typography variant="h3" fontWeight="950" color="#FFF">
                            Design Studio <Box component="span" sx={{ color: binThemeTokens.gold }}>Manager</Box>
                        </Typography>
                    </Box>
                    <Stack direction="row" spacing={2}>
                        <Paper sx={{ px: 3, py: 1.5, bgcolor: alpha(binThemeTokens.gold, 0.05), border: `1px solid ${alpha(binThemeTokens.gold, 0.2)}`, borderRadius: 2 }}>
                            <Typography variant="caption" sx={{ color: binThemeTokens.gold, fontWeight: 900, display: 'block' }}>TOTAL REVENUE</Typography>
                            <Typography variant="h6" fontWeight="950" color="#FFF">AED 0.00</Typography>
                        </Paper>
                    </Stack>
                </Box>

                <Paper sx={{ p: 0, borderRadius: 4, bgcolor: 'rgba(22, 22, 24, 0.6)', border: '1px solid rgba(255,255,255,0.05)', overflow: 'hidden' }}>
                    <Box sx={{ p: 3, borderBottom: '1px solid rgba(255,255,255,0.05)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <TextField 
                            placeholder="Search requests, owners, properties..." 
                            size="small"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            InputProps={{
                                startAdornment: <InputAdornment position="start"><Search size={18} color="rgba(255,255,255,0.3)" /></InputAdornment>,
                                sx: { bgcolor: 'rgba(255,255,255,0.02)', borderRadius: 2 }
                            }}
                            sx={{ width: 400 }}
                        />
                        <Chip label={`${requests.length} REQUESTS`} sx={{ fontWeight: 900 }} />
                    </Box>

                    <TableContainer>
                        <Table>
                            <TableHead sx={{ bgcolor: 'rgba(255,255,255,0.02)' }}>
                                <TableRow>
                                    <TableCell sx={{ color: binThemeTokens.gold, fontWeight: 900 }}>REQUEST ID / DATE</TableCell>
                                    <TableCell sx={{ color: binThemeTokens.gold, fontWeight: 900 }}>ASSET NODE</TableCell>
                                    <TableCell sx={{ color: binThemeTokens.gold, fontWeight: 900 }}>ZONE / STYLE</TableCell>
                                    <TableCell sx={{ color: binThemeTokens.gold, fontWeight: 900 }}>QUOTE TOTAL</TableCell>
                                    <TableCell sx={{ color: binThemeTokens.gold, fontWeight: 900 }}>STATUS</TableCell>
                                    <TableCell align="right"></TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {requests.filter(r => 
                                    r.id.toLowerCase().includes(searchTerm.toLowerCase()) || 
                                    r.propertyName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                                    r.scope?.zoneType?.toLowerCase().includes(searchTerm.toLowerCase())
                                ).map((r) => (
                                    <TableRow key={r.id} hover>
                                        <TableCell>
                                            <Typography variant="body2" fontWeight="900" color="#FFF">#{r.id.substring(0,8).toUpperCase()}</Typography>
                                            <Typography variant="caption" color="textSecondary">{r.createdAt?.toDate ? r.createdAt.toDate().toLocaleDateString() : 'Recent'}</Typography>
                                        </TableCell>
                                        <TableCell>
                                            <Typography variant="body2" fontWeight="700" color="#FFF">{r.propertyName}</Typography>
                                            <Typography variant="caption" color="textSecondary">{r.role?.toUpperCase()}: {r.userId?.substring(0,6)}</Typography>
                                        </TableCell>
                                        <TableCell>
                                            <Typography variant="body2" fontWeight="700" color="#FFF">{r.scope?.zoneType?.toUpperCase()}</Typography>
                                            <Typography variant="caption" color="textSecondary">{r.designStyle}</Typography>
                                        </TableCell>
                                        <TableCell sx={{ color: binThemeTokens.gold, fontWeight: 900 }}>
                                            AED {r.quote?.finalTotal?.toLocaleString()}
                                        </TableCell>
                                        <TableCell>
                                            {getStatusChip(r.status)}
                                        </TableCell>
                                        <TableCell align="right">
                                            <Stack direction="row" spacing={1} justifyContent="flex-end">
                                                {r.status === 'PAID' && (
                                                    <Button variant="contained" size="small" color="success" onClick={() => handleConvertToProject(r.id)} sx={{ fontWeight: 900, fontSize: '0.65rem' }}>
                                                        CONVERT TO PROJECT
                                                    </Button>
                                                )}
                                                <IconButton size="small" sx={{ color: 'rgba(255,255,255,0.3)' }}>
                                                    <ChevronRight size={18} />
                                                </IconButton>
                                            </Stack>
                                        </TableCell>
                                    </TableRow>
                                ))}
                                {requests.length === 0 && (
                                    <TableRow><TableCell colSpan={6} align="center" sx={{ py: 10, color: 'rgba(255,255,255,0.2)' }}>No design requests currently tracked in Sovereign Registry.</TableCell></TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </TableContainer>
                </Paper>
            </Container>
        </Box>
    );
}

import React, { useState, useEffect } from 'react';
import { 
    Paper, Grid, Typography, Box, Chip, Table, TableBody, 
    TableCell, TableHead, TableRow, TableContainer, Stack,
    Button, alpha, CircularProgress, IconButton
} from '@mui/material';
import { 
    ShieldAlert, Link as LinkIcon, AlertTriangle, 
    CheckCircle, UserMinus, Home, FileWarning, Search
} from 'lucide-react';
import { db, collection, query, where, onSnapshot, doc, writeBatch, serverTimestamp } from '@/lib/firebase';
import { useLanguage } from '@bin/shared';
import { binThemeTokens } from '../../theme/adminTheme';
import AdminPageFrame from '../../components/AdminPageFrame';

export default function OrphanWarRoomPage() {
    const { t } = useLanguage();
    const [loading, setLoading] = useState(true);
    const [orphans, setOrphans] = useState<any[]>([]);

    useEffect(() => {
        const unsubs: (() => void)[] = [];

        // 1. Orphan Users (missing propertyId)
        unsubs.push(onSnapshot(query(collection(db, "users"), where("propertyId", "==", "UNASSOCIATED")), (s) => {
            setOrphans(prev => [
                ...prev.filter(o => o.type !== 'USER'),
                ...s.docs.map(d => ({ id: d.id, type: 'USER', ...d.data(), label: `Unlinked ${d.data().role || 'User'}` }))
            ]);
        }));

        // 2. Orphan Tickets
        unsubs.push(onSnapshot(query(collection(db, "maintenanceTickets"), where("propertyId", "==", "UNASSOCIATED")), (s) => {
            setOrphans(prev => [
                ...prev.filter(o => o.type !== 'TICKET'),
                ...s.docs.map(d => ({ id: d.id, type: 'TICKET', ...d.data(), label: 'Unassociated Ticket' }))
            ]);
        }));

        // 3. Orphan Units (Vacant but maybe should be linked)
        unsubs.push(onSnapshot(query(collection(db, "units"), where("occupancyStatus", "==", "VACANT")), (s) => {
            setOrphans(prev => [
                ...prev.filter(o => o.type !== 'UNIT'),
                ...s.docs.map(d => ({ id: d.id, type: 'UNIT', ...d.data(), label: 'Vacant Asset' }))
            ]);
        }));

        // 4. Orphan Passports
        unsubs.push(onSnapshot(query(collection(db, "propertyPassports"), where("propertyId", "==", "UNASSOCIATED")), (s) => {
            setOrphans(prev => [
                ...prev.filter(o => o.type !== 'PASSPORT'),
                ...s.docs.map(d => ({ id: d.id, type: 'PASSPORT', ...d.data(), label: 'Orphan Passport' }))
            ]);
        }));

        // 5. Orphan Contracts
        unsubs.push(onSnapshot(query(collection(db, "contracts"), where("propertyId", "==", "UNASSOCIATED")), (s) => {
            setOrphans(prev => [
                ...prev.filter(o => o.type !== 'CONTRACT'),
                ...s.docs.map(d => ({ id: d.id, type: 'CONTRACT', ...d.data(), label: 'Unlinked Contract' }))
            ]);
            setLoading(false);
        }));

        return () => unsubs.forEach(u => u());
    }, []);

    const getIcon = (type: string) => {
        switch (type) {
            case 'USER': return <UserMinus size={16} />;
            case 'TICKET': return <AlertTriangle size={16} />;
            case 'UNIT': return <Home size={16} />;
            case 'PASSPORT': return <FileWarning size={16} />;
            case 'CONTRACT': return <LinkIcon size={16} />;
            default: return <ShieldAlert size={16} />;
        }
    };

    return (
        <AdminPageFrame
            title={t('nav.orphans') || 'ORPHAN WAR ROOM'}
            subtitle="Systematic identification of unlinked operational nodes"
            loading={loading}
            isEmpty={orphans.length === 0}
            emptyMessage="RELATIONAL INTEGRITY AT 100% - NO ORPHANS DETECTED"
            breadcrumbs={[{ label: 'War Room' }]}
        >
            <Grid container spacing={3}>
                <Grid item xs={12}>
                    <Paper sx={{ p: 0, bgcolor: 'rgba(255,255,255,0.01)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 4, overflow: 'hidden' }}>
                        <TableContainer>
                            <Table>
                                <TableHead>
                                    <TableRow>
                                        <TableCell sx={{ color: 'rgba(255,255,255,0.3)', fontWeight: 900 }}>NODE FAULT</TableCell>
                                        <TableCell sx={{ color: 'rgba(255,255,255,0.3)', fontWeight: 900 }}>IDENTIFIER</TableCell>
                                        <TableCell sx={{ color: 'rgba(255,255,255,0.3)', fontWeight: 900 }}>METADATA</TableCell>
                                        <TableCell align="right" sx={{ color: 'rgba(255,255,255,0.3)', fontWeight: 900 }}>REPAIR PROTOCOL</TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {orphans.map((o) => (
                                        <TableRow key={`${o.type}-${o.id}`} hover>
                                            <TableCell>
                                                <Stack direction="row" spacing={1.5} alignItems="center">
                                                    <Box sx={{ p: 1, bgcolor: alpha(binThemeTokens.danger, 0.1), color: binThemeTokens.danger, borderRadius: 1.5 }}>
                                                        {getIcon(o.type)}
                                                    </Box>
                                                    <Box>
                                                        <Typography variant="body2" fontWeight="900" sx={{ color: binThemeTokens.danger }}>{o.label.toUpperCase()}</Typography>
                                                        <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.3)' }}>ID: {o.id.substring(0,12)}</Typography>
                                                    </Box>
                                                </Stack>
                                            </TableCell>
                                            <TableCell sx={{ color: '#FFF', fontWeight: 700 }}>
                                                {o.displayName || o.email || o.propertyName || o.title || 'UNSPECIFIED NODE'}
                                            </TableCell>
                                            <TableCell>
                                                <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 800 }}>
                                                    CREATED: {o.createdAt?.toDate ? o.createdAt.toDate().toLocaleDateString() : 'LEGACY'}
                                                </Typography>
                                            </TableCell>
                                            <TableCell align="right">
                                                <Button 
                                                    size="small" 
                                                    variant="contained" 
                                                    startIcon={<LinkIcon size={14} />}
                                                    sx={{ bgcolor: binThemeTokens.danger, color: '#FFF', fontWeight: 950, fontSize: '0.65rem' }}
                                                >
                                                    BIND NODE
                                                </Button>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </TableContainer>
                    </Paper>
                </Grid>
            </Grid>
        </AdminPageFrame>
    );
}


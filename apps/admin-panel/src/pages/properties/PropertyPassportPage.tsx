import React, { useEffect, useMemo, useState } from 'react';
import {
    Box, Typography, Grid, Card, CardContent,
    Table, TableBody, TableCell, TableContainer, TableHead,
    TableRow, Paper, Chip, Stack, CircularProgress, InputBase, Alert
} from '@mui/material';
import {
    Search as SearchIcon, TrendingUp, Users, Home, AlertCircle
} from 'lucide-react';
import { collection, onSnapshot, orderBy, query } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useLanguage } from '@bin/shared';

function safeNumber(value: unknown) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
}

export default function PropertyPassportPage() {
    const { isRTL } = useLanguage();
    const [passports, setPassports] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [searchTerm, setSearchTerm] = useState('');

    useEffect(() => {
        const q = query(collection(db, 'propertyPassports'), orderBy('updatedAt', 'desc'));
        const unsubscribe = onSnapshot(
            q,
            (snap) => {
                setPassports(snap.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() })));
                setError(null);
                setLoading(false);
            },
            (listenerError) => {
                console.error('[PropertyPassport] live registry listener failed:', listenerError);
                setPassports([]);
                setError('Live property passport records could not be loaded.');
                setLoading(false);
            },
        );
        return () => unsubscribe();
    }, []);

    const filteredPassports = useMemo(() => {
        const term = searchTerm.trim().toLowerCase();
        if (!term) return passports;
        return passports.filter((p) =>
            String(p.propertyName || '').toLowerCase().includes(term) ||
            String(p.emirate || '').toLowerCase().includes(term) ||
            String(p.propertyType || '').toLowerCase().includes(term)
        );
    }, [passports, searchTerm]);

    const stats = useMemo(() => ({
        totalRent: passports.reduce((sum, p) => sum + safeNumber(p.rentCollectedTotal), 0),
        outstanding: passports.reduce((sum, p) => sum + safeNumber(p.rentOutstandingTotal), 0),
        totalUnits: passports.reduce((sum, p) => sum + safeNumber(p.totalUnits), 0),
        activeTenants: passports.reduce((sum, p) => sum + safeNumber(p.tenantCount), 0),
    }), [passports]);

    if (loading) {
        return (
            <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '80vh' }}>
                <CircularProgress sx={{ color: '#DAA520' }} />
            </Box>
        );
    }

    return (
        <Box sx={{ p: { xs: 2, md: 4 }, direction: isRTL ? 'rtl' : 'ltr' }}>
            <Box sx={{ mb: 5, display: 'flex', flexWrap: 'wrap', gap: 3, justifyContent: 'space-between', alignItems: 'flex-end' }}>
                <Box>
                    <Typography variant="h4" sx={{ fontWeight: 950, color: '#fff', mb: 1, letterSpacing: -1 }}>
                        PROPERTY PASSPORT <Box component="span" sx={{ color: '#DAA520' }}>REGISTRY</Box>
                    </Typography>
                    <Typography variant="body1" sx={{ color: 'rgba(255,255,255,0.5)', fontWeight: 600 }}>
                        Real-time institutional oversight from Firestore property passport records.
                    </Typography>
                </Box>
                <Box sx={{
                    display: 'flex', alignItems: 'center', bgcolor: 'rgba(255,255,255,0.05)', borderRadius: 2,
                    px: 2, border: '1px solid rgba(255,255,255,0.1)', width: { xs: '100%', sm: 320 }
                }}>
                    <SearchIcon size={18} color="rgba(255,255,255,0.3)" />
                    <InputBase
                        placeholder="Search properties..."
                        value={searchTerm}
                        onChange={(event) => setSearchTerm(event.target.value)}
                        sx={{ ml: 1, flex: 1, color: '#fff', fontSize: '0.875rem' }}
                    />
                </Box>
            </Box>

            {error && <Alert severity="error" sx={{ mb: 4 }}>{error}</Alert>}

            <Grid container spacing={3} sx={{ mb: 5 }}>
                {[
                    { label: 'Total Rent Collected', value: `AED ${stats.totalRent.toLocaleString()}`, icon: <TrendingUp color="#10b981" /> },
                    { label: 'Total Outstanding', value: `AED ${stats.outstanding.toLocaleString()}`, icon: <AlertCircle color="#ef4444" /> },
                    { label: 'Units Under Mgmt', value: stats.totalUnits.toLocaleString(), icon: <Home color="#DAA520" /> },
                    { label: 'Active Tenants', value: stats.activeTenants.toLocaleString(), icon: <Users color="#6366f1" /> },
                ].map((stat) => (
                    <Grid item xs={12} sm={6} md={3} key={stat.label}>
                        <Card sx={{ bgcolor: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 4 }}>
                            <CardContent sx={{ p: 3 }}>
                                <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
                                    <Box sx={{ p: 1, borderRadius: 2, bgcolor: 'rgba(218,165,32,0.08)' }}>{stat.icon}</Box>
                                    <Chip label="LIVE" size="small" sx={{ color: '#10b981', bgcolor: 'rgba(16,185,129,0.1)', fontWeight: 900, fontSize: 10 }} />
                                </Box>
                                <Typography variant="h5" sx={{ color: '#fff', fontWeight: 950, mb: 0.5 }}>{stat.value}</Typography>
                                <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 800, textTransform: 'uppercase', letterSpacing: 1 }}>{stat.label}</Typography>
                            </CardContent>
                        </Card>
                    </Grid>
                ))}
            </Grid>

            <TableContainer component={Paper} sx={{ bgcolor: 'transparent', boxShadow: 'none' }}>
                <Table sx={{ borderCollapse: 'separate', borderSpacing: '0 12px' }}>
                    <TableHead>
                        <TableRow>
                            {['Property Name', 'Units (O/V)', 'Financial Health', 'Maintenance', 'Lease Health'].map((heading) => (
                                <TableCell key={heading} sx={{ color: 'rgba(255,255,255,0.3)', border: 'none', fontWeight: 900, textTransform: 'uppercase', fontSize: '0.7rem', letterSpacing: 1 }}>
                                    {heading}
                                </TableCell>
                            ))}
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {!error && filteredPassports.length === 0 && (
                            <TableRow>
                                <TableCell colSpan={5} sx={{ border: 'none', color: 'rgba(255,255,255,0.5)', textAlign: 'center', py: 6 }}>
                                    {passports.length === 0 ? 'No property passport records exist yet.' : 'No property passport matches this search.'}
                                </TableCell>
                            </TableRow>
                        )}
                        {filteredPassports.map((p) => {
                            const totalUnits = safeNumber(p.totalUnits);
                            const occupiedUnits = safeNumber(p.occupiedUnits);
                            const vacantUnits = p.vacantUnits !== undefined ? safeNumber(p.vacantUnits) : Math.max(totalUnits - occupiedUnits, 0);
                            return (
                                <TableRow key={p.id} sx={{ bgcolor: 'rgba(255,255,255,0.02)' }}>
                                    <TableCell sx={{ border: 'none', py: 3 }}>
                                        <Stack direction="row" spacing={2} alignItems="center">
                                            <Box sx={{ width: 40, height: 40, borderRadius: 2, bgcolor: 'rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                <Home size={20} color="#DAA520" />
                                            </Box>
                                            <Box>
                                                <Typography sx={{ color: '#fff', fontWeight: 900 }}>{p.propertyName || 'Unnamed property'}</Typography>
                                                <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 700 }}>
                                                    {[p.emirate, p.propertyType].filter(Boolean).join(' · ') || 'Classification not recorded'}
                                                </Typography>
                                            </Box>
                                        </Stack>
                                    </TableCell>
                                    <TableCell sx={{ border: 'none', color: '#fff', fontWeight: 900 }}>{occupiedUnits} / {vacantUnits}</TableCell>
                                    <TableCell sx={{ border: 'none' }}>
                                        <Typography sx={{ color: '#10b981', fontWeight: 900 }}>AED {safeNumber(p.rentCollectedTotal).toLocaleString()} Collected</Typography>
                                        <Typography variant="caption" sx={{ color: '#ef4444', fontWeight: 800 }}>AED {safeNumber(p.rentOutstandingTotal).toLocaleString()} Outstanding</Typography>
                                    </TableCell>
                                    <TableCell sx={{ border: 'none' }}>
                                        <Stack direction="row" spacing={1}>
                                            <Chip label={`${safeNumber(p.maintenanceTicketsOpen)} OPEN`} size="small" sx={{ bgcolor: 'rgba(239,68,68,0.1)', color: '#ef4444', fontWeight: 900 }} />
                                            <Chip label={`${safeNumber(p.maintenanceTicketsClosed)} DONE`} size="small" sx={{ bgcolor: 'rgba(16,185,129,0.1)', color: '#10b981', fontWeight: 900 }} />
                                        </Stack>
                                    </TableCell>
                                    <TableCell sx={{ border: 'none' }}>
                                        <Typography sx={{ color: '#fff', fontWeight: 900 }}>{safeNumber(p.activeLeases)} ACTIVE</Typography>
                                        <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 800 }}>{safeNumber(p.expiredLeases)} EXPIRED</Typography>
                                    </TableCell>
                                </TableRow>
                            );
                        })}
                    </TableBody>
                </Table>
            </TableContainer>
        </Box>
    );
}

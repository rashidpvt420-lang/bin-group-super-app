import React, { useState, useEffect } from 'react';
import { 
    Box, Typography, Paper, Stack, Chip, CircularProgress, 
    Table, TableBody, TableCell, TableContainer, TableHead, 
    TableRow, TextField, InputAdornment, alpha, Button,
    Tooltip, IconButton
} from '@mui/material';
import { 
    Search, Building2, DollarSign, Users, 
    Filter, ArrowUpRight, ChevronRight, Layout,
    CheckCircle2, AlertCircle, Clock
} from 'lucide-react';
import { db, collection, query, where, getDocs, onSnapshot } from '../../lib/firebase';
import { useRole } from '../../context/RoleContext';
import { binThemeTokens } from '../../theme/binGroupTheme';

export default function OwnerUnitsPage() {
    const { user } = useRole();
    const [loading, setLoading] = useState(true);
    const [units, setUnits] = useState<any[]>([]);
    const [search, setSearch] = useState('');
    const [filterStatus, setFilterStatus] = useState('ALL');

    useEffect(() => {
        if (!user?.email) return;
        
        // 1. Get properties linked to owner email
        const propQ = query(collection(db, 'properties'), where('ownerEmail', '==', user.email.toLowerCase()));
        
        const unsubscribe = onSnapshot(propQ, async (propSnap) => {
            const propIds = propSnap.docs.map(d => d.id);
            if (propIds.length === 0) { 
                setUnits([]);
                setLoading(false); 
                return; 
            }

            // 2. Get units for these properties
            const unitQ = query(collection(db, 'units'), where('propertyId', 'in', propIds));
            onSnapshot(unitQ, (unitSnap) => {
                const allUnits = unitSnap.docs.map(d => {
                    const data = d.data();
                    const prop = propSnap.docs.find(p => p.id === data.propertyId)?.data();
                    return {
                        id: d.id,
                        ...data,
                        propertyName: prop?.name || prop?.propertyName || 'Sovereign Asset'
                    };
                });
                setUnits(allUnits);
                setLoading(false);
            });
        });

        return () => unsubscribe();
    }, [user?.email]);

    const filtered = units.filter(u => {
        const matchesSearch = u.unitNumber?.toLowerCase().includes(search.toLowerCase()) ||
                              u.propertyName?.toLowerCase().includes(search.toLowerCase()) ||
                              u.tenantName?.toLowerCase().includes(search.toLowerCase());
        const matchesStatus = filterStatus === 'ALL' || u.status === filterStatus;
        return matchesSearch && matchesStatus;
    });

    const getStatusColor = (status: string) => {
        switch (status?.toUpperCase()) {
            case 'OCCUPIED': return '#10b981';
            case 'VACANT': return 'rgba(255,255,255,0.4)';
            case 'MAINTENANCE': return '#f59e0b';
            default: return 'rgba(255,255,255,0.2)';
        }
    };

    if (loading) return (
        <Box sx={{ height: '50vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2 }}>
            <CircularProgress sx={{ color: binThemeTokens.gold }} />
            <Typography variant="overline" sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 900 }}>Synchronizing Ledger...</Typography>
        </Box>
    );

    return (
        <Box>
            {/* Header */}
            <Box sx={{ mb: 5, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 3 }}>
                <Box>
                    <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 900, letterSpacing: 4 }}>SOVEREIGN ASSET MANAGEMENT</Typography>
                    <Typography variant="h4" fontWeight="950" sx={{ color: '#FFF', mt: 1 }}>Unit Ledger</Typography>
                </Box>
                <Stack direction="row" spacing={2}>
                    <TextField 
                        size="small" 
                        placeholder="Filter units..." 
                        value={search} 
                        onChange={e => setSearch(e.target.value)}
                        InputProps={{ 
                            startAdornment: <InputAdornment position="start"><Search size={16} color="rgba(255,255,255,0.4)" /></InputAdornment>,
                            sx: { borderRadius: 3, bgcolor: 'rgba(255,255,255,0.03)', color: '#FFF', borderColor: 'rgba(255,255,255,0.1)' }
                        }}
                        sx={{ width: { xs: '100%', sm: 250 } }}
                    />
                </Stack>
            </Box>

            {/* Quick Status Chips */}
            <Stack direction="row" spacing={1} sx={{ mb: 4, overflowX: 'auto', pb: 1 }}>
                {['ALL', 'OCCUPIED', 'VACANT', 'MAINTENANCE'].map(s => (
                    <Chip 
                        key={s} 
                        label={s} 
                        onClick={() => setFilterStatus(s)}
                        variant={filterStatus === s ? 'filled' : 'outlined'}
                        sx={{ 
                            fontWeight: 900, 
                            fontSize: '0.65rem',
                            bgcolor: filterStatus === s ? binThemeTokens.gold : 'transparent',
                            color: filterStatus === s ? '#000' : 'rgba(255,255,255,0.5)',
                            borderColor: filterStatus === s ? binThemeTokens.gold : 'rgba(255,255,255,0.1)',
                            '&:hover': { bgcolor: filterStatus === s ? binThemeTokens.gold : 'rgba(255,255,255,0.05)' }
                        }}
                    />
                ))}
            </Stack>

            {filtered.length === 0 ? (
                <Paper sx={{ p: 10, textAlign: 'center', bgcolor: 'rgba(15, 23, 42, 0.4)', border: '1px dashed rgba(255,255,255,0.08)', borderRadius: 6 }}>
                    <Layout size={48} color="rgba(255,255,255,0.05)" style={{ margin: '0 auto 16px' }} />
                    <Typography sx={{ color: 'rgba(255,255,255,0.2)', fontWeight: 800 }}>NO MATCHING UNITS FOUND</Typography>
                </Paper>
            ) : (
                <TableContainer component={Paper} sx={{ bgcolor: 'rgba(15, 23, 42, 0.4)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 6, overflow: 'hidden' }}>
                    <Table>
                        <TableHead>
                            <TableRow sx={{ bgcolor: 'rgba(255,255,255,0.02)' }}>
                                <TableCell sx={{ color: 'rgba(255,255,255,0.3)', fontWeight: 900, fontSize: '0.7rem', letterSpacing: 1 }}>UNIT / LOCATION</TableCell>
                                <TableCell sx={{ color: 'rgba(255,255,255,0.3)', fontWeight: 900, fontSize: '0.7rem', letterSpacing: 1 }}>TENANT / STATUS</TableCell>
                                <TableCell sx={{ color: 'rgba(255,255,255,0.3)', fontWeight: 900, fontSize: '0.7rem', letterSpacing: 1 }}>RENTAL VALUATION</TableCell>
                                <TableCell sx={{ color: 'rgba(255,255,255,0.3)', fontWeight: 900, fontSize: '0.7rem', letterSpacing: 1 }}>PAYMENT CYCLE</TableCell>
                                <TableCell align="right" sx={{ color: 'rgba(255,255,255,0.3)', fontWeight: 900, fontSize: '0.7rem', letterSpacing: 1 }}>ACTIONS</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {filtered.map(unit => (
                                <TableRow key={unit.id} hover sx={{ '&:hover': { bgcolor: 'rgba(255,255,255,0.01)' } }}>
                                    <TableCell>
                                        <Typography variant="body2" sx={{ color: '#FFF', fontWeight: 900, fontFamily: 'monospace', letterSpacing: 1 }}>{unit.unitNumber}</Typography>
                                        <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)', display: 'block' }}>{unit.propertyName} · Level {unit.floorNumber || 1}</Typography>
                                    </TableCell>
                                    <TableCell>
                                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                                            <Chip 
                                                label={unit.status || 'VACANT'} 
                                                size="small"
                                                sx={{ 
                                                    height: 18, 
                                                    fontSize: '0.6rem', 
                                                    fontWeight: 950,
                                                    bgcolor: alpha(getStatusColor(unit.status), 0.1),
                                                    color: getStatusColor(unit.status),
                                                    border: `1px solid ${alpha(getStatusColor(unit.status), 0.2)}`
                                                }} 
                                            />
                                            <Typography variant="caption" sx={{ color: unit.tenantName ? '#FFF' : 'rgba(255,255,255,0.2)', fontWeight: 700 }}>
                                                {unit.tenantName || 'Unassigned'}
                                            </Typography>
                                        </Box>
                                    </TableCell>
                                    <TableCell>
                                        <Typography variant="body2" sx={{ color: unit.rentAmount ? '#10b981' : 'rgba(255,255,255,0.1)', fontWeight: 900 }}>
                                            {unit.rentAmount ? `AED ${unit.rentAmount.toLocaleString()}` : '—'}
                                        </Typography>
                                        <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.3)', fontWeight: 700 }}>Market Valuation</Typography>
                                    </TableCell>
                                    <TableCell>
                                        <Stack spacing={0.5}>
                                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                                <CheckCircle2 size={12} color={unit.paymentStatus === 'PAID' ? '#10b981' : 'rgba(255,255,255,0.1)'} />
                                                <Typography variant="caption" sx={{ color: unit.paymentStatus === 'PAID' ? '#10b981' : 'rgba(255,255,255,0.3)', fontWeight: 800 }}>
                                                    {unit.paymentStatus || 'NO RECORD'}
                                                </Typography>
                                            </Box>
                                            <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.2)', fontSize: '0.6rem' }}>Next: {unit.nextPaymentDate || '—'}</Typography>
                                        </Stack>
                                    </TableCell>
                                    <TableCell align="right">
                                        <IconButton size="small" sx={{ color: binThemeTokens.gold }} onClick={() => navigate(`/owner/properties/${unit.propertyId}`)}>
                                            <ChevronRight size={18} />
                                        </IconButton>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </TableContainer>
            )}

            {/* Summary Paper */}
            <Paper sx={{ p: 3, mt: 4, bgcolor: alpha(binThemeTokens.gold, 0.03), border: `1px solid ${alpha(binThemeTokens.gold, 0.15)}`, borderRadius: 6 }}>
                <Grid container spacing={4} alignItems="center">
                    <Grid item xs={12} md={8}>
                        <Typography variant="subtitle2" fontWeight="950" sx={{ color: binThemeTokens.gold, mb: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
                            <AlertCircle size={16} /> SOVEREIGN LEDGER INTEGRITY
                        </Typography>
                        <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)', lineHeight: 1.5, display: 'block' }}>
                            Unit data is synchronized directly from property passports. If rent values or tenant names appear inconsistent, 
                            please trigger a **Governance Audit** via the Admin terminal or contact your BIN GROUP specialist.
                        </Typography>
                    </Grid>
                    <Grid item xs={12} md={4} sx={{ textAlign: 'right' }}>
                        <Button variant="outlined" sx={{ borderColor: binThemeTokens.gold, color: binThemeTokens.gold, fontWeight: 900, px: 3, borderRadius: 3 }}>
                            Download Ledger (PDF)
                        </Button>
                    </Grid>
                </Grid>
            </Paper>
        </Box>
    );
}

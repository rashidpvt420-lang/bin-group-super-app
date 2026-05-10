import React, { useState, useEffect } from 'react';
import { 
    Box, Typography, Grid, Card, CardContent, Button, 
    Table, TableBody, TableCell, TableContainer, TableHead, 
    TableRow, Paper, Chip, Stack, CircularProgress,
    IconButton, InputBase, alpha
} from '@mui/material';
import { 
    Search as SearchIcon,
    RefreshCcw as RefreshIcon,
    TrendingUp,
    Users,
    Home,
    AlertCircle,
    ChevronRight
} from 'lucide-react';
import { collection, query, onSnapshot, orderBy } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useLanguage } from '@bin/shared';

export default function PropertyPassportPage() {
    const { isRTL } = useLanguage();
    const [passports, setPassports] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');

    useEffect(() => {
        const q = query(collection(db, 'property_passports'), orderBy('updatedAt', 'desc'));
        const unsubscribe = onSnapshot(q, (snap) => {
            const docs = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setPassports(docs);
            setLoading(false);
        }, (err) => {
            console.error("Passport fetch error:", err);
            setLoading(false);
        });
        return () => unsubscribe();
    }, []);

    const filteredPassports = passports.filter(p => 
        p.propertyName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.emirate?.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const stats = {
        totalRent: passports.reduce((sum, p) => sum + (p.rentCollectedTotal || 0), 0),
        outstanding: passports.reduce((sum, p) => sum + (p.rentOutstandingTotal || 0), 0),
        totalUnits: passports.reduce((sum, p) => sum + (p.totalUnits || 0), 0),
        activeTenants: passports.reduce((sum, p) => sum + (p.tenantCount || 0), 0)
    };

    if (loading) {
        return (
            <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '80vh' }}>
                <CircularProgress sx={{ color: '#DAA520' }} />
            </Box>
        );
    }

    return (
        <Box sx={{ p: 4, direction: isRTL ? 'rtl' : 'ltr' }}>
            <Box sx={{ mb: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                <Box>
                    <Typography variant="h4" sx={{ fontWeight: 950, color: '#fff', mb: 1, letterSpacing: -1 }}>
                        PROPERTY PASSPORT <Box component="span" sx={{ color: '#DAA520' }}>REGISTRY</Box>
                    </Typography>
                    <Typography variant="body1" sx={{ color: 'rgba(255,255,255,0.5)', fontWeight: 600 }}>
                        Real-time institutional oversight across the BIN GROUP portfolio.
                    </Typography>
                </Box>
                <Stack direction="row" spacing={2}>
                    <Box sx={{ 
                        display: 'flex', 
                        alignItems: 'center', 
                        bgcolor: 'rgba(255,255,255,0.05)', 
                        borderRadius: 2, 
                        px: 2, 
                        border: '1px solid rgba(255,255,255,0.1)',
                        width: 300
                    }}>
                        <SearchIcon size={18} color="rgba(255,255,255,0.3)" />
                        <InputBase
                            placeholder="Search properties..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            sx={{ ml: 1, flex: 1, color: '#fff', fontSize: '0.875rem' }}
                        />
                    </Box>
                    <Button 
                        startIcon={<RefreshIcon size={18} />}
                        sx={{ bgcolor: '#DAA520', color: '#000', fontWeight: 900, borderRadius: 2, px: 3 }}
                    >
                        REFRESH ALL
                    </Button>
                </Stack>
            </Box>

            {/* HIGH LEVEL ANALYTICS */}
            <Grid container spacing={3} sx={{ mb: 6 }}>
                {[
                    { label: 'Total Rent Collected', value: `AED ${(stats.totalRent / 1000000).toFixed(2)}M`, icon: <TrendingUp color="#10b981" />, trend: '+12.5%' },
                    { label: 'Total Outstanding', value: `AED ${(stats.outstanding / 1000).toFixed(1)}K`, icon: <AlertCircle color="#ef4444" />, trend: '-2.1%' },
                    { label: 'Units Under Mgmt', value: stats.totalUnits.toLocaleString(), icon: <Home color="#DAA520" />, trend: 'Steady' },
                    { label: 'Active Tenants', value: stats.activeTenants.toLocaleString(), icon: <Users color="#6366f1" />, trend: '+86' }
                ].map((stat, i) => (
                    <Grid item xs={12} sm={6} md={3} key={i}>
                        <Card sx={{ bgcolor: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 4 }}>
                            <CardContent sx={{ p: 3 }}>
                                <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
                                    <Box sx={{ p: 1, borderRadius: 2, bgcolor: alpha(binThemeTokens.gold, 0.1) }}>{stat.icon}</Box>
                                    <Typography variant="caption" sx={{ color: stat.trend.startsWith('+') ? '#10b981' : (stat.trend === 'Steady' ? '#94a3b8' : '#ef4444'), fontWeight: 900 }}>
                                        {stat.trend}
                                    </Typography>
                                </Box>
                                <Typography variant="h5" sx={{ color: '#fff', fontWeight: 950, mb: 0.5 }}>{stat.value}</Typography>
                                <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 800, textTransform: 'uppercase', letterSpacing: 1 }}>{stat.label}</Typography>
                            </CardContent>
                        </Card>
                    </Grid>
                ))}
            </Grid>

            {/* PASSPORT TABLE */}
            <TableContainer component={Paper} sx={{ bgcolor: 'transparent', boxShadow: 'none' }}>
                <Table sx={{ borderCollapse: 'separate', borderSpacing: '0 12px' }}>
                    <TableHead>
                        <TableRow>
                            <TableCell sx={{ color: 'rgba(255,255,255,0.3)', border: 'none', fontWeight: 900, textTransform: 'uppercase', fontSize: '0.7rem', letterSpacing: 1 }}>Property Name</TableCell>
                            <TableCell sx={{ color: 'rgba(255,255,255,0.3)', border: 'none', fontWeight: 900, textTransform: 'uppercase', fontSize: '0.7rem', letterSpacing: 1 }}>Units (O/V)</TableCell>
                            <TableCell sx={{ color: 'rgba(255,255,255,0.3)', border: 'none', fontWeight: 900, textTransform: 'uppercase', fontSize: '0.7rem', letterSpacing: 1 }}>Financial Health</TableCell>
                            <TableCell sx={{ color: 'rgba(255,255,255,0.3)', border: 'none', fontWeight: 900, textTransform: 'uppercase', fontSize: '0.7rem', letterSpacing: 1 }}>Maintenance</TableCell>
                            <TableCell sx={{ color: 'rgba(255,255,255,0.3)', border: 'none', fontWeight: 900, textTransform: 'uppercase', fontSize: '0.7rem', letterSpacing: 1 }}>Lease Health</TableCell>
                            <TableCell sx={{ border: 'none' }}></TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {filteredPassports.map((p) => {
                            const occupancyRate = p.totalUnits > 0 ? (p.occupiedUnits / p.totalUnits) * 100 : 0;

                            return (
                                <TableRow key={p.id} sx={{ 
                                    bgcolor: 'rgba(255,255,255,0.02)', 
                                    transition: 'all 0.2s',
                                    '&:hover': { bgcolor: 'rgba(255,255,255,0.05)', transform: 'translateY(-2px)' }
                                }}>
                                    <TableCell sx={{ border: 'none', py: 3, borderRadius: '16px 0 0 16px' }}>
                                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                                            <Box sx={{ width: 40, height: 40, borderRadius: 2, bgcolor: 'rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                <Home size={20} color="#DAA520" />
                                            </Box>
                                            <Box>
                                                <Typography sx={{ color: '#fff', fontWeight: 900, lineHeight: 1.2 }}>{p.propertyName}</Typography>
                                                <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 700 }}>{p.emirate} • {p.propertyType}</Typography>
                                            </Box>
                                        </Box>
                                    </TableCell>
                                    <TableCell sx={{ border: 'none' }}>
                                        <Box>
                                            <Typography sx={{ color: '#fff', fontWeight: 900 }}>{p.occupiedUnits} / {p.vacantUnits}</Typography>
                                            <Box sx={{ width: 100, height: 4, bgcolor: 'rgba(255,255,255,0.05)', borderRadius: 2, mt: 1 }}>
                                                <Box sx={{ width: `${occupancyRate}%`, height: '100%', bgcolor: occupancyRate > 80 ? '#10b981' : (occupancyRate > 50 ? '#DAA520' : '#ef4444'), borderRadius: 2 }} />
                                            </Box>
                                        </Box>
                                    </TableCell>
                                    <TableCell sx={{ border: 'none' }}>
                                        <Box>
                                            <Typography sx={{ color: '#10b981', fontWeight: 900 }}>AED {(p.rentCollectedTotal / 1000).toFixed(1)}K Collected</Typography>
                                            <Typography variant="caption" sx={{ color: '#ef4444', fontWeight: 800 }}>AED {(p.rentOutstandingTotal / 1000).toFixed(1)}K Outstanding</Typography>
                                        </Box>
                                    </TableCell>
                                    <TableCell sx={{ border: 'none' }}>
                                        <Stack direction="row" spacing={1}>
                                            <Chip 
                                                label={`${p.maintenanceTicketsOpen || 0} OPEN`} 
                                                size="small" 
                                                sx={{ bgcolor: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', fontWeight: 900, borderRadius: 1 }} 
                                            />
                                            <Chip 
                                                label={`${p.maintenanceTicketsClosed || 0} DONE`} 
                                                size="small" 
                                                sx={{ bgcolor: 'rgba(16, 185, 129, 0.1)', color: '#10b981', fontWeight: 900, borderRadius: 1 }} 
                                            />
                                        </Stack>
                                    </TableCell>
                                    <TableCell sx={{ border: 'none' }}>
                                        <Typography sx={{ color: '#fff', fontWeight: 900 }}>{p.activeLeases} ACTIVE</Typography>
                                        <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 800 }}>{p.expiredLeases || 0} EXPIRED</Typography>
                                    </TableCell>
                                    <TableCell sx={{ border: 'none', textAlign: 'right', borderRadius: '0 16px 16px 0' }}>
                                        <IconButton sx={{ color: '#DAA520', '&:hover': { bgcolor: 'rgba(218, 165, 32, 0.1)' } }}>
                                            <ChevronRight size={20} />
                                        </IconButton>
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

const binThemeTokens = {
    gold: '#DAA520',
    textSecondary: 'rgba(255,255,255,0.7)',
    textTertiary: 'rgba(255,255,255,0.4)'
};

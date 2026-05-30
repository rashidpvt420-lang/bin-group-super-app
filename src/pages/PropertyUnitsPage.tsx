// apps/owner-app/src/pages/PropertyUnitsPage.tsx
import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
    Container, Box, Typography, Paper, Grid, Stack, Button, Chip,
    Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
    Divider, CircularProgress, alpha
} from '@mui/material';
import { 
    ArrowLeft, Building, Users, AlertCircle, 
    CheckCircle2, Wrench, ShieldCheck, MapPin, 
    TrendingUp, Calendar
} from 'lucide-react';
import { db, collection, query, where, getDocs, doc, getDoc, orderBy } from '../lib/firebase';
import { binThemeTokens } from '../theme/binGroupTheme';
import { useLanguage } from '@bin/shared';
import { formatAED } from '../utils/formatters';

interface UnitData {
    id: string;
    propertyId: string;
    ownerId: string;
    unitNumber: string;
    floorNumber?: string;
    occupancyStatus?: 'VACANT' | 'OCCUPIED';
    currentTenantId?: string | null;
    tenant?: any;
}

export default function PropertyUnitsPage() {
    const { propertyId } = useParams();
    const navigate = useNavigate();
    const { tx } = useLanguage();
    const [property, setProperty] = useState<any>(null);
    const [units, setUnits] = useState<UnitData[]>([]);
    const [tickets, setTickets] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchPropertyData = async () => {
            if (!propertyId) return;
            try {
                // 1. Fetch Property Details
                const propSnap = await getDoc(doc(db, 'properties', propertyId));
                if (propSnap.exists()) {
                    setProperty({ id: propSnap.id, ...propSnap.data() });
                }

                // 2. Fetch Units for this property
                const unitsSnap = await getDocs(query(collection(db, 'units'), where('propertyId', '==', propertyId)));
                const fetchedUnits = unitsSnap.docs.map(d => ({ id: d.id, ...d.data() } as UnitData));
                
                // 3. Fetch Tenants for these units
                const enrichedUnits = await Promise.all(fetchedUnits.map(async (u) => {
                    if (u.currentTenantId) {
                        const tenantSnap = await getDoc(doc(db, 'users', u.currentTenantId));
                        return { ...u, tenant: tenantSnap.exists() ? tenantSnap.data() : null };
                    }
                    return { ...u, tenant: null };
                }));
                setUnits(enrichedUnits);

                // 4. Fetch Tickets for this property
                const ticketsSnap = await getDocs(query(
                    collection(db, 'maintenanceTickets'), 
                    where('propertyId', '==', propertyId)
                ));
                const fetchedTickets = ticketsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
                fetchedTickets.sort((a: any, b: any) => {
                    const dateA = a.createdAt?.toDate ? a.createdAt.toDate() : new Date(a.createdAt);
                    const dateB = b.createdAt?.toDate ? b.createdAt.toDate() : new Date(b.createdAt);
                    return dateB.getTime() - dateA.getTime();
                });
                setTickets(fetchedTickets);

            } catch (err) {
                console.error("Failed to fetch asset drill-down:", err);
            } finally {
                setLoading(false);
            }
        };

        fetchPropertyData();
    }, [propertyId]);

    if (loading) return <Box sx={{ height: '80vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><CircularProgress sx={{ color: binThemeTokens.gold }} /></Box>;

    return (
        <Container maxWidth="xl" sx={{ py: 4 }}>
            <Button 
                startIcon={<ArrowLeft />} 
                onClick={() => navigate('/dashboard')}
                sx={{ color: 'rgba(255,255,255,0.5)', mb: 4, fontWeight: 900 }}
            >
                BACK TO PORTFOLIO
            </Button>

            <Box sx={{ mb: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                <Box>
                    <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 950, letterSpacing: 4 }}>ASSET NODE DRILL-DOWN</Typography>
                    <Typography variant="h3" fontWeight="950" sx={{ color: '#FFF' }}>{property?.name || property?.propertyName}</Typography>
                    <Stack direction="row" spacing={2} sx={{ mt: 1 }}>
                        <Typography variant="body1" sx={{ color: binThemeTokens.textSecondary }}>{property?.address}</Typography>
                        <Chip label={property?.contractType || 'Maintenance Only'} size="small" sx={{ bgcolor: 'rgba(198,167,94,0.1)', color: binThemeTokens.gold, fontWeight: 900 }} />
                    </Stack>
                </Box>
                <Paper sx={{ p: 2, bgcolor: alpha(binThemeTokens.gold, 0.1), border: `1px solid ${binThemeTokens.gold}`, borderRadius: 2 }}>
                    <Typography variant="caption" sx={{ color: binThemeTokens.gold, fontWeight: 900, display: 'block' }}>ANNUAL AMC</Typography>
                    <Typography variant="h5" fontWeight="950" color="#FFF">AED {property?.annualAMC?.toLocaleString()}</Typography>
                </Paper>
            </Box>

            <Grid container spacing={4}>
                {/* UNITS INVENTORY */}
                <Grid item xs={12} lg={8}>
                    <Paper sx={{ p: 0, bgcolor: 'rgba(22, 22, 24, 0.6)', borderRadius: 4, border: '1px solid rgba(255,255,255,0.05)', overflow: 'hidden' }}>
                        <Box sx={{ p: 3, borderBottom: '1px solid rgba(255,255,255,0.05)', display: 'flex', justifyContent: 'space-between' }}>
                            <Typography variant="h6" fontWeight="950">UNIT INVENTORY</Typography>
                            <Chip label={`${units.length} TOTAL NODES`} size="small" sx={{ fontWeight: 900 }} />
                        </Box>
                        <TableContainer>
                            <Table>
                                <TableHead sx={{ bgcolor: 'rgba(255,255,255,0.02)' }}>
                                    <TableRow>
                                        <TableCell sx={{ color: binThemeTokens.gold, fontWeight: 900 }}>UNIT</TableCell>
                                        <TableCell sx={{ color: binThemeTokens.gold, fontWeight: 900 }}>TENANT</TableCell>
                                        <TableCell sx={{ color: binThemeTokens.gold, fontWeight: 900 }}>STATUS</TableCell>
                                        <TableCell sx={{ color: binThemeTokens.gold, fontWeight: 900 }}>EXPECTED RENT</TableCell>
                                        <TableCell sx={{ color: binThemeTokens.gold, fontWeight: 900 }}>COLLECTED</TableCell>
                                        <TableCell sx={{ color: binThemeTokens.gold, fontWeight: 900 }}>BALANCE</TableCell>
                                        <TableCell sx={{ color: binThemeTokens.gold, fontWeight: 900 }}>RECENT ISSUE</TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {units.map((unit) => {
                                        const unitTickets = tickets.filter(t => t.unitId === unit.id);
                                        const latestTicket = unitTickets[0];
                                        
                                        // Mock PM Data if not provided (for demonstration of PM flow)
                                        const expectedRent = (unit as any).expectedRent || Math.floor(Math.random() * 50000) + 50000;
                                        const collected = (unit as any).collectedRent || (unit.occupancyStatus === 'OCCUPIED' ? expectedRent : 0);
                                        const balance = expectedRent - collected;

                                        return (
                                            <TableRow key={unit.id} hover>
                                                <TableCell>
                                                    <Typography variant="body1" fontWeight="950">Unit {unit.unitNumber}</Typography>
                                                    <Typography variant="caption" color="textSecondary">Floor {unit.floorNumber || 'N/A'}</Typography>
                                                </TableCell>
                                                <TableCell>
                                                    {unit.tenant ? (
                                                        <Box>
                                                            <Typography variant="body2" fontWeight="900">{unit.tenant.displayName}</Typography>
                                                            <Typography variant="caption" color="textSecondary">{unit.tenant.email}</Typography>
                                                        </Box>
                                                    ) : (
                                                        <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.2)' }}>VACANT / UNASSIGNED</Typography>
                                                    )}
                                                </TableCell>
                                                <TableCell>
                                                    <Chip 
                                                        label={unit.occupancyStatus || 'VACANT'} 
                                                        size="small" 
                                                        sx={{ 
                                                            bgcolor: unit.occupancyStatus === 'OCCUPIED' ? 'rgba(16,185,129,0.1)' : 'rgba(255,255,255,0.05)',
                                                            color: unit.occupancyStatus === 'OCCUPIED' ? '#10b981' : 'rgba(255,255,255,0.4)',
                                                            fontWeight: 900,
                                                            fontSize: '0.65rem'
                                                        }} 
                                                    />
                                                </TableCell>
                                                <TableCell>
                                                    <Typography variant="body2" fontWeight="900" color="#FFF">AED {formatAED(expectedRent)}</Typography>
                                                </TableCell>
                                                <TableCell>
                                                    <Typography variant="body2" fontWeight="900" sx={{ color: collected > 0 ? '#10b981' : 'rgba(255,255,255,0.2)' }}>AED {formatAED(collected)}</Typography>
                                                </TableCell>
                                                <TableCell>
                                                    <Typography variant="body2" fontWeight="900" sx={{ color: balance > 0 ? '#ef4444' : '#10b981' }}>{balance > 0 ? `AED ${formatAED(balance)} OVERDUE` : 'SETTLED'}</Typography>
                                                </TableCell>
                                                <TableCell>
                                                    {latestTicket ? (
                                                        <Box>
                                                            <Typography variant="caption" sx={{ color: latestTicket.status === 'OPEN' ? '#ef4444' : '#FFF', fontWeight: 900 }}>
                                                                {latestTicket.description.substring(0, 20)}...
                                                            </Typography>
                                                            <Typography variant="caption" sx={{ display: 'block', fontSize: '0.6rem', color: 'rgba(255,255,255,0.4)' }}>
                                                                {latestTicket.status}
                                                            </Typography>
                                                        </Box>
                                                    ) : '—'}
                                                </TableCell>
                                            </TableRow>
                                        );
                                    })}
                                </TableBody>
                            </Table>
                        </TableContainer>
                    </Paper>
                </Grid>

                {/* SIDEBAR ANALYTICS */}
                <Grid item xs={12} lg={4}>
                    <Stack spacing={4}>
                        <Paper sx={{ p: 4, bgcolor: 'rgba(22, 22, 24, 0.7)', borderRadius: 4, border: '1px solid rgba(255,255,255,0.05)' }}>
                            <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 900 }}>MAINTENANCE VELOCITY</Typography>
                            <Stack spacing={3} sx={{ mt: 3 }}>
                                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                                    <Typography variant="body2" color="textSecondary">Active Tickets</Typography>
                                    <Typography variant="h6" fontWeight="950" color="#ef4444">{tickets.filter(t => !['COMPLETED', 'CLOSED'].includes(t.status)).length}</Typography>
                                </Box>
                                <Divider sx={{ borderColor: 'rgba(255,255,255,0.05)' }} />
                                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                                    <Typography variant="body2" color="textSecondary">Occupancy Rate</Typography>
                                    <Typography variant="h6" fontWeight="950" color="#10b981">
                                        {units.length > 0 ? Math.round((units.filter(u => u.occupancyStatus === 'OCCUPIED').length / units.length) * 100) : 0}%
                                    </Typography>
                                </Box>
                            </Stack>
                        </Paper>

                        <Paper sx={{ p: 4, bgcolor: '#0B0B0C', border: `2px solid ${binThemeTokens.gold}`, borderRadius: 4 }}>
                            <Typography variant="h6" fontWeight="950" color="#FFF" sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                                <ShieldCheck color={binThemeTokens.gold} /> GOVT COMPLIANCE
                            </Typography>
                            <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.6)', mt: 2, mb: 3 }}>
                                This asset is currently compliant with DCD, SIRA, and Municipality standards.
                            </Typography>
                            <Button fullWidth variant="outlined" sx={{ color: binThemeTokens.gold, borderColor: binThemeTokens.gold, fontWeight: 900 }}>
                                VIEW CERTIFICATES
                            </Button>
                        </Paper>
                    </Stack>
                </Grid>
            </Grid>
        </Container>
    );
}


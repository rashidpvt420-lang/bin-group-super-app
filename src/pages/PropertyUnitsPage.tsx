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
import { db, collection, query, where, getDocs, doc, getDoc, limit } from '../lib/firebase';
import { binThemeTokens } from '../theme/binGroupTheme';
import { useRole } from '../context/RoleContext';
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
    const { user } = useRole();
    const [property, setProperty] = useState<any>(null);
    const [units, setUnits] = useState<UnitData[]>([]);
    const [tickets, setTickets] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchPropertyData = async () => {
            if (!propertyId || !user?.uid) return;
            if (propertyId === 'phase2-missing') {
                setLoading(false);
                return;
            }
            try {
                // 1. Fetch Property Details
                const propSnap = await getDoc(doc(db, 'properties', propertyId));
                if (propSnap.exists()) {
                    setProperty({ id: propSnap.id, ...propSnap.data() });
                }

                // 2. Fetch Units for this property
                const unitsSnap = await getDocs(query(
                    collection(db, 'units'),
                    where('ownerId', '==', user.uid),
                    limit(250)
                ));
                const fetchedUnits = unitsSnap.docs
                    .map(d => ({ id: d.id, ...d.data() } as UnitData))
                    .filter(unit => unit.propertyId === propertyId);
                
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
                    where('ownerId', '==', user.uid),
                    limit(250)
                ));
                const fetchedTickets = ticketsSnap.docs
                    .map(d => ({ id: d.id, ...d.data() }))
                    .filter((ticket: any) => ticket.propertyId === propertyId);
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
    }, [propertyId, user?.uid]);

    if (loading) return <Box sx={{ height: '80vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><CircularProgress sx={{ color: '#7A5C12' }} /></Box>;
    if (propertyId === 'phase2-missing') return (
        <Container maxWidth="sm" sx={{ py: 10, textAlign: 'center' }}>
            <AlertCircle size={48} color={binThemeTokens.gold} style={{ margin: '0 auto 16px' }} />
            <Typography variant="h5" fontWeight="950" sx={{ color: '#111827' }}>
                {tx('owner.property.notFound', 'Property record was not found.')}
            </Typography>
            <Button
                onClick={() => navigate('/owner/properties')}
                aria-label={tx('owner.property.back', 'Back to Properties')}
                sx={{ mt: 3, color: '#7A5C12', fontWeight: 900 }}
            >
                {tx('owner.property.back', 'Back to Properties')}
            </Button>
        </Container>
    );

    return (
        <Container maxWidth="xl" sx={{ py: 4 }}>
            <Button 
                startIcon={<ArrowLeft />} 
                onClick={() => navigate('/dashboard')}
                sx={{ color: '#475467', mb: 4, fontWeight: 900 }}
            >
                BACK TO PORTFOLIO
            </Button>

            <Box sx={{ mb: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                <Box>
                    <Typography variant="overline" sx={{ color: '#7A5C12', fontWeight: 950, letterSpacing: 4 }}>ASSET NODE DRILL-DOWN</Typography>
                    <Typography variant="h3" fontWeight="950" sx={{ color: '#111827' }}>{property?.name || property?.propertyName}</Typography>
                    <Stack direction="row" spacing={2} sx={{ mt: 1 }}>
                        <Typography variant="body1" sx={{ color: binThemeTokens.textSecondary }}>{property?.address}</Typography>
                        <Chip label={property?.contractType || 'Maintenance Only'} size="small" sx={{ bgcolor: 'rgba(198,167,94,0.1)', color: '#7A5C12', fontWeight: 900 }} />
                    </Stack>
                </Box>
                <Paper sx={{ p: 2, bgcolor: alpha(binThemeTokens.gold, 0.1), border: `1px solid ${binThemeTokens.gold}`, borderRadius: 2 }}>
                    <Typography variant="caption" sx={{ color: '#7A5C12', fontWeight: 900, display: 'block' }}>ANNUAL AMC</Typography>
                    <Typography variant="h5" fontWeight="950" color="#111827">AED {property?.annualAMC?.toLocaleString()}</Typography>
                </Paper>
            </Box>

            <Grid container spacing={4}>
                {/* UNITS INVENTORY */}
                <Grid item xs={12} lg={8}>
                    <Paper sx={{ p: 0, bgcolor: '#FFFFFF', borderRadius: 4, border: '1px solid #E5E7EB', overflow: 'hidden' }}>
                        <Box sx={{ p: 3, borderBottom: '1px solid #E5E7EB', display: 'flex', justifyContent: 'space-between' }}>
                            <Typography variant="h6" fontWeight="950">UNIT INVENTORY</Typography>
                            <Chip label={`${units.length} TOTAL NODES`} size="small" sx={{ fontWeight: 900 }} />
                        </Box>
                        <TableContainer>
                            <Table>
                                <TableHead sx={{ bgcolor: '#F8F9FB' }}>
                                    <TableRow>
                                        <TableCell sx={{ color: '#7A5C12', fontWeight: 900 }}>UNIT</TableCell>
                                        <TableCell sx={{ color: '#7A5C12', fontWeight: 900 }}>TENANT</TableCell>
                                        <TableCell sx={{ color: '#7A5C12', fontWeight: 900 }}>STATUS</TableCell>
                                        <TableCell sx={{ color: '#7A5C12', fontWeight: 900 }}>EXPECTED RENT</TableCell>
                                        <TableCell sx={{ color: '#7A5C12', fontWeight: 900 }}>COLLECTED</TableCell>
                                        <TableCell sx={{ color: '#7A5C12', fontWeight: 900 }}>BALANCE</TableCell>
                                        <TableCell sx={{ color: '#7A5C12', fontWeight: 900 }}>RECENT ISSUE</TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {units.map((unit) => {
                                        const unitTickets = tickets.filter(t => t.unitId === unit.id);
                                        const latestTicket = unitTickets[0];
                                        
                                        // Use actual PM data, default to 0 if not provided
                                        const expectedRent = (unit as any).expectedRent || 0;
                                        const collected = (unit as any).collectedRent || 0;
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
                                                        <Typography variant="caption" sx={{ color: '#475467' }}>VACANT / UNASSIGNED</Typography>
                                                    )}
                                                </TableCell>
                                                <TableCell>
                                                    <Chip 
                                                        label={unit.occupancyStatus || 'VACANT'} 
                                                        size="small" 
                                                        sx={{ 
                                                            bgcolor: unit.occupancyStatus === 'OCCUPIED' ? 'rgba(16,185,129,0.1)' : '#F8F9FB',
                                                            color: unit.occupancyStatus === 'OCCUPIED' ? '#047857' : '#475467',
                                                            fontWeight: 900,
                                                            fontSize: '0.65rem'
                                                        }} 
                                                    />
                                                </TableCell>
                                                <TableCell>
                                                    <Typography variant="body2" fontWeight="900" color="#111827">AED {formatAED(expectedRent)}</Typography>
                                                </TableCell>
                                                <TableCell>
                                                    <Typography variant="body2" fontWeight="900" sx={{ color: collected > 0 ? '#047857' : 'rgba(255,255,255,0.2)' }}>AED {formatAED(collected)}</Typography>
                                                </TableCell>
                                                <TableCell>
                                                    <Typography variant="body2" fontWeight="900" sx={{ color: balance > 0 ? '#B91C1C' : '#10b981' }}>{balance > 0 ? `AED ${formatAED(balance)} OVERDUE` : 'SETTLED'}</Typography>
                                                </TableCell>
                                                <TableCell>
                                                    {latestTicket ? (
                                                        <Box>
                                                            <Typography variant="caption" sx={{ color: latestTicket.status === 'OPEN' ? '#B91C1C' : '#FFF', fontWeight: 900 }}>
                                                                {latestTicket.description.substring(0, 20)}...
                                                            </Typography>
                                                            <Typography variant="caption" sx={{ display: 'block', fontSize: '0.6rem', color: '#475467' }}>
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
                        <Paper sx={{ p: 4, bgcolor: '#FFFFFF', borderRadius: 4, border: '1px solid #E5E7EB' }}>
                            <Typography variant="overline" sx={{ color: '#7A5C12', fontWeight: 900 }}>MAINTENANCE VELOCITY</Typography>
                            <Stack spacing={3} sx={{ mt: 3 }}>
                                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                                    <Typography variant="body2" color="textSecondary">Active Tickets</Typography>
                                    <Typography variant="h6" fontWeight="950" color="#ef4444">{tickets.filter(t => !['COMPLETED', 'CLOSED'].includes(t.status)).length}</Typography>
                                </Box>
                                <Divider sx={{ borderColor: '#E5E7EB' }} />
                                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                                    <Typography variant="body2" color="textSecondary">Occupancy Rate</Typography>
                                    <Typography variant="h6" fontWeight="950" color="#10b981">
                                        {units.length > 0 ? Math.round((units.filter(u => u.occupancyStatus === 'OCCUPIED').length / units.length) * 100) : 0}%
                                    </Typography>
                                </Box>
                            </Stack>
                        </Paper>

                        <Paper sx={{ p: 4, bgcolor: '#FFFFFF', border: `2px solid ${binThemeTokens.gold}`, borderRadius: 4 }}>
                            <Typography variant="h6" fontWeight="950" color="#111827" sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                                <ShieldCheck color={binThemeTokens.gold} /> GOVT COMPLIANCE
                            </Typography>
                            <Typography variant="body2" sx={{ color: '#475467', mt: 2, mb: 3 }}>
                                This asset is currently compliant with DCD, SIRA, and Municipality standards.
                            </Typography>
                            <Button fullWidth variant="outlined" onClick={() => navigate('/owner/documents')} sx={{ color: '#7A5C12', borderColor: binThemeTokens.gold, fontWeight: 900 }}>
                                VIEW CERTIFICATES
                            </Button>
                        </Paper>
                    </Stack>
                </Grid>
            </Grid>
        </Container>
    );
}


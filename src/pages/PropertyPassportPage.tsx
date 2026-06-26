import React, { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Container, Typography, Box, Paper, Grid, Stack, Button, alpha, CircularProgress, Chip, Table, TableBody, TableCell, TableContainer, TableHead, TableRow } from '@mui/material';
import { ShieldCheck, MapPin, FileText, ArrowLeft, Ruler, Building, AlertTriangle, Key, Download, BadgeCheck } from 'lucide-react';
import { db, doc, getDoc, collection, query, where, getDocs, orderBy, limit } from '../lib/firebase';
import { binThemeTokens } from '../theme/binGroupTheme';
import { useLanguage } from '@bin/shared';

type GpsState = {
    hasCoordinates: boolean;
    exact: boolean;
    latitude: number | null;
    longitude: number | null;
    label: string;
    color: string;
    googleMapsUrl: string;
};

const firstNumber = (...values: any[]) => {
    for (const value of values) {
        const next = Number(value);
        if (Number.isFinite(next) && next !== 0) return next;
    }
    return null;
};

const resolveGps = (property: any): GpsState => {
    const latitude = firstNumber(
        property?.geo?.point?.latitude,
        property?.geo?.latitude,
        property?.geo?.lat,
        property?.gps?.latitude,
        property?.gps?.lat,
        property?.location?.latitude,
        property?.location?.lat,
        property?.latitude,
        property?.lat,
    );
    const longitude = firstNumber(
        property?.geo?.point?.longitude,
        property?.geo?.longitude,
        property?.geo?.lng,
        property?.gps?.longitude,
        property?.gps?.lng,
        property?.location?.longitude,
        property?.location?.lng,
        property?.longitude,
        property?.lng,
    );
    const hasCoordinates = latitude !== null && longitude !== null;
    const exact = Boolean(property?.geo?.verified || property?.gps?.verified || property?.location?.accuracy === 'EXACT' || property?.locationQuality === 'EXACT');
    if (!hasCoordinates) {
        return { hasCoordinates: false, exact: false, latitude: null, longitude: null, label: 'GPS NOT CONFIGURED', color: '#ef4444', googleMapsUrl: '' };
    }
    return {
        hasCoordinates,
        exact,
        latitude,
        longitude,
        label: exact ? 'EXACT GPS VERIFIED' : 'APPROXIMATE GPS REVIEW',
        color: exact ? '#10b981' : '#f59e0b',
        googleMapsUrl: property?.googleMapsUrl || property?.location?.googleMapsUrl || `https://www.google.com/maps?q=${latitude},${longitude}`,
    };
};

const formatDate = (value: any) => {
    if (!value) return '---';
    if (typeof value?.toDate === 'function') return value.toDate().toLocaleDateString('en-AE');
    if (value?.seconds) return new Date(value.seconds * 1000).toLocaleDateString('en-AE');
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? '---' : parsed.toLocaleDateString('en-AE');
};

export default function PropertyPassportPage() {
    const { id } = useParams();
    const navigate = useNavigate();
    const { tx } = useLanguage();
    const [property, setProperty] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [missions, setMissions] = useState<any[]>([]);

    useEffect(() => {
        const fetchPassportData = async () => {
            if (!id) return;
            try {
                const propSnap = await getDoc(doc(db, 'properties', id));
                if (propSnap.exists()) {
                    setProperty({ id: propSnap.id, ...propSnap.data() });
                    const mSnap = await getDocs(query(
                        collection(db, 'maintenanceTickets'),
                        where('propertyId', '==', id),
                        orderBy('createdAt', 'desc'),
                        limit(10)
                    ));
                    setMissions(mSnap.docs.map(d => ({ id: d.id, ...d.data() })));
                }
            } catch (err) {
                console.error('Passport fetch error:', err);
            } finally {
                setLoading(false);
            }
        };
        fetchPassportData();
    }, [id]);

    const gps = useMemo(() => resolveGps(property || {}), [property]);

    if (loading) return <Box sx={{ display: 'flex', justifyContent: 'center', p: 10 }}><CircularProgress sx={{ color: binThemeTokens.gold }}/></Box>;
    if (!property) return <Container sx={{ py: 10 }}><Typography color="error">PROPERTY NODE NOT FOUND</Typography></Container>;

    const isVerified = property.titleDeedStatus === 'verified' || property.geo?.verified === true;

    return (
        <Container maxWidth="xl" sx={{ py: 6 }}>
            <Box sx={{ mb: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: 2 }}>
                <Box>
                    <Button startIcon={<ArrowLeft size={16}/>} onClick={() => navigate(-1)} sx={{ color: binThemeTokens.gold, mb: 2, p: 0 }}>RETURN TO PORTFOLIO</Button>
                    <Typography variant="h3" fontWeight="950" color="#FFF">{property.name || property.propertyName || 'Property Passport'}</Typography>
                    <Stack direction="row" spacing={1.5} sx={{ mt: 1 }} flexWrap="wrap" useFlexGap>
                        <Chip label={`REF: ${property.id.substring(0,8)}`} size="small" sx={{ bgcolor: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.5)', fontWeight: 900 }} />
                        <Chip icon={isVerified ? <ShieldCheck size={14}/> : <AlertTriangle size={14}/>} label={isVerified ? 'SOVEREIGN VERIFIED' : 'PENDING VERIFICATION'} sx={{ bgcolor: isVerified ? alpha('#10b981', 0.1) : alpha('#ef4444', 0.1), color: isVerified ? '#10b981' : '#ef4444', fontWeight: 950 }} />
                        <Chip icon={<MapPin size={14}/>} label={gps.label} sx={{ bgcolor: alpha(gps.color, 0.1), color: gps.color, fontWeight: 950 }} />
                    </Stack>
                </Box>
                <Button variant="contained" startIcon={<Download size={18}/>} sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950, px: 4, borderRadius: 2 }}>
                    EXPORT PASSPORT (PDF)
                </Button>
            </Box>

            <Grid container spacing={4}>
                <Grid item xs={12} lg={4}>
                    <Stack spacing={4}>
                        <Paper sx={{ p: 4, borderRadius: 6, bgcolor: 'rgba(22, 22, 24, 0.6)', border: '1px solid rgba(255,255,255,0.05)' }}>
                            <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 900, mb: 3, display: 'block' }}>STRUCTURAL DNA</Typography>
                            <Grid container spacing={3}>
                                <Grid item xs={6}><Stack spacing={0.5}><Typography variant="caption" color="textSecondary">TYPE</Typography><Typography fontWeight="900" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}><Building size={16} color={binThemeTokens.gold}/> {property.propertyType || 'Not set'}</Typography></Stack></Grid>
                                <Grid item xs={6}><Stack spacing={0.5}><Typography variant="caption" color="textSecondary">GRADE</Typography><Typography fontWeight="900" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}><BadgeCheck size={16} color={binThemeTokens.gold}/> {property.assetGrade || 'Standard'}</Typography></Stack></Grid>
                                <Grid item xs={6}><Stack spacing={0.5}><Typography variant="caption" color="textSecondary">AREA (SQ FT)</Typography><Typography fontWeight="900" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}><Ruler size={16} color={binThemeTokens.gold}/> {(property.sqft || property.totalSqFt || 0).toLocaleString()}</Typography></Stack></Grid>
                                <Grid item xs={6}><Stack spacing={0.5}><Typography variant="caption" color="textSecondary">UNITS</Typography><Typography fontWeight="900" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}><Key size={16} color={binThemeTokens.gold}/> {property.units || property.numberOfUnits || '1'}</Typography></Stack></Grid>
                            </Grid>
                        </Paper>

                        <Paper sx={{ p: 4, borderRadius: 6, bgcolor: 'rgba(22, 22, 24, 0.6)', border: `1px solid ${alpha(gps.color, 0.18)}` }}>
                            <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 900, mb: 3, display: 'block' }}>GEOSPATIAL ANCHOR</Typography>
                            <Stack spacing={2}>
                                <Box sx={{ p: 2, bgcolor: 'rgba(0,0,0,0.3)', borderRadius: 2, border: '1px solid rgba(255,255,255,0.05)' }}>
                                    <Typography variant="caption" color="textSecondary">CANONICAL ADDRESS</Typography>
                                    <Typography variant="body2" fontWeight="700" sx={{ mt: 0.5 }}>{property.geo?.address || property.address || property.addressLine || 'Address not configured'}</Typography>
                                </Box>
                                <Stack direction="row" spacing={2}>
                                    <Box sx={{ flex: 1, p: 2, bgcolor: 'rgba(0,0,0,0.3)', borderRadius: 2 }}>
                                        <Typography variant="caption" color="textSecondary">EMIRATE</Typography>
                                        <Typography variant="body2" fontWeight="900">{property.geo?.emirate || property.emirate || 'Not set'}</Typography>
                                    </Box>
                                    <Box sx={{ flex: 1, p: 2, bgcolor: 'rgba(0,0,0,0.3)', borderRadius: 2 }}>
                                        <Typography variant="caption" color="textSecondary">GPS STATE</Typography>
                                        <Typography variant="body2" fontWeight="900" sx={{ fontSize: '0.72rem', color: gps.color }}>{gps.label}</Typography>
                                    </Box>
                                </Stack>
                                <Box sx={{ p: 2, bgcolor: 'rgba(0,0,0,0.3)', borderRadius: 2 }}>
                                    <Typography variant="caption" color="textSecondary">COORDINATES</Typography>
                                    <Typography variant="body2" fontWeight="900" sx={{ fontSize: '0.8rem', color: gps.color }}>
                                        {gps.hasCoordinates ? `${gps.latitude?.toFixed(6)}, ${gps.longitude?.toFixed(6)}` : 'GPS not configured'}
                                    </Typography>
                                </Box>
                                <Button disabled={!gps.hasCoordinates} variant="outlined" onClick={() => gps.googleMapsUrl && window.open(gps.googleMapsUrl, '_blank', 'noopener,noreferrer')} sx={{ borderColor: gps.hasCoordinates ? binThemeTokens.gold : 'rgba(255,255,255,0.12)', color: gps.hasCoordinates ? binThemeTokens.gold : 'rgba(255,255,255,0.3)', fontWeight: 950 }}>
                                    OPEN MAP
                                </Button>
                            </Stack>
                        </Paper>

                        {(property.majlis || property.ownerType === 'Government') && (
                            <Paper sx={{ p: 4, borderRadius: 6, bgcolor: 'rgba(198, 167, 94, 0.05)', border: '1px solid rgba(198, 167, 94, 0.2)' }}>
                                <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 900, mb: 3, display: 'block' }}>INSTITUTIONAL METRICS</Typography>
                                <Stack spacing={2}>
                                    <Box sx={{ display: 'flex', justifyContent: 'space-between' }}><Typography variant="caption" color="textSecondary">PROTOCOL</Typography><Typography variant="caption" fontWeight="900" color={binThemeTokens.gold}>{property.protocolLevel || 'SOVEREIGN'}</Typography></Box>
                                    <Box sx={{ display: 'flex', justifyContent: 'space-between' }}><Typography variant="caption" color="textSecondary">SECURITY</Typography><Typography variant="caption" fontWeight="900" color={binThemeTokens.gold}>{property.securityLevel || 'MAXIMUM'}</Typography></Box>
                                    <Box sx={{ display: 'flex', justifyContent: 'space-between' }}><Typography variant="caption" color="textSecondary">AUTHORITY</Typography><Typography variant="caption" fontWeight="900" color="#FFF">{property.authorityName || 'Federal'}</Typography></Box>
                                    {property.majlis && <Box sx={{ mt: 1, p: 1, bgcolor: alpha(binThemeTokens.gold, 0.1), borderRadius: 1, textAlign: 'center' }}><Typography variant="caption" fontWeight="900" color={binThemeTokens.gold}>MAJLIS PROTOCOL ACTIVE</Typography></Box>}
                                </Stack>
                            </Paper>
                        )}
                    </Stack>
                </Grid>

                <Grid item xs={12} lg={8}>
                    <Stack spacing={4}>
                        <Paper sx={{ p: 4, borderRadius: 6, bgcolor: alpha(binThemeTokens.gold, 0.03), border: `1px solid ${alpha(binThemeTokens.gold, 0.1)}` }}>
                            <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 900, mb: 3, display: 'block' }}>VERIFICATION HUB</Typography>
                            <Grid container spacing={3}>
                                <Grid item xs={12} md={4}><Stack direction="row" spacing={2} alignItems="center"><Box sx={{ p: 1.5, bgcolor: alpha(isVerified ? '#10b981' : '#f59e0b', 0.1), borderRadius: 3 }}><ShieldCheck color={isVerified ? '#10b981' : '#f59e0b'} /></Box><Box><Typography variant="subtitle2" fontWeight="900" color="#FFF">TITLE DEED</Typography><Typography variant="caption" color={isVerified ? '#10b981' : '#f59e0b'}>{isVerified ? 'VERIFIED' : 'PENDING REVIEW'}</Typography></Box></Stack></Grid>
                                <Grid item xs={12} md={4}><Stack direction="row" spacing={2} alignItems="center"><Box sx={{ p: 1.5, bgcolor: alpha(gps.color, 0.1), borderRadius: 3 }}><MapPin color={gps.color} /></Box><Box><Typography variant="subtitle2" fontWeight="900" color="#FFF">GEO-ANCHOR</Typography><Typography variant="caption" color={gps.color}>{gps.label}</Typography></Box></Stack></Grid>
                                <Grid item xs={12} md={4}><Stack direction="row" spacing={2} alignItems="center"><Box sx={{ p: 1.5, bgcolor: alpha(binThemeTokens.gold, 0.1), borderRadius: 3 }}><FileText color={binThemeTokens.gold} /></Box><Box><Typography variant="subtitle2" fontWeight="900" color="#FFF">CONTRACT</Typography><Typography variant="caption" color={binThemeTokens.gold}>{property.contractStatus || 'PENDING'}</Typography></Box></Stack></Grid>
                            </Grid>
                        </Paper>

                        <Paper sx={{ p: 4, borderRadius: 6, bgcolor: 'rgba(22, 22, 24, 0.6)', border: '1px solid rgba(255,255,255,0.05)' }}>
                            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
                                <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 900 }}>MISSION HISTORY</Typography>
                                <Chip label={`${missions.length} RECORDS`} size="small" sx={{ fontWeight: 900, fontSize: '0.65rem' }} />
                            </Box>
                            <TableContainer>
                                <Table size="small">
                                    <TableHead>
                                        <TableRow>
                                            <TableCell sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 900, borderBottom: '1px solid rgba(255,255,255,0.05)' }}>REF</TableCell>
                                            <TableCell sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 900, borderBottom: '1px solid rgba(255,255,255,0.05)' }}>CATEGORY</TableCell>
                                            <TableCell sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 900, borderBottom: '1px solid rgba(255,255,255,0.05)' }}>STATUS</TableCell>
                                            <TableCell sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 900, borderBottom: '1px solid rgba(255,255,255,0.05)' }}>DATE</TableCell>
                                        </TableRow>
                                    </TableHead>
                                    <TableBody>
                                        {missions.map((m) => (
                                            <TableRow key={m.id}>
                                                <TableCell sx={{ color: '#FFF', fontWeight: 700, borderBottom: '1px solid rgba(255,255,255,0.02)' }}>{m.id.substring(0,6)}</TableCell>
                                                <TableCell sx={{ color: '#FFF', borderBottom: '1px solid rgba(255,255,255,0.02)' }}>{m.trade || m.category || m.issueType || 'Maintenance'}</TableCell>
                                                <TableCell sx={{ borderBottom: '1px solid rgba(255,255,255,0.02)' }}><Chip label={m.status || 'OPEN'} size="small" sx={{ height: 16, fontSize: '0.6rem', fontWeight: 900, bgcolor: m.status === 'COMPLETED' ? alpha('#10b981', 0.1) : alpha(binThemeTokens.gold, 0.1), color: m.status === 'COMPLETED' ? '#10b981' : binThemeTokens.gold }} /></TableCell>
                                                <TableCell sx={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.7rem', borderBottom: '1px solid rgba(255,255,255,0.02)' }}>{formatDate(m.createdAt || m.updatedAt)}</TableCell>
                                            </TableRow>
                                        ))}
                                        {missions.length === 0 && <TableRow><TableCell colSpan={4} sx={{ py: 4, textAlign: 'center', color: 'rgba(255,255,255,0.2)' }}>No operational missions found for this node.</TableCell></TableRow>}
                                    </TableBody>
                                </Table>
                            </TableContainer>
                        </Paper>
                    </Stack>
                </Grid>
            </Grid>
        </Container>
    );
}

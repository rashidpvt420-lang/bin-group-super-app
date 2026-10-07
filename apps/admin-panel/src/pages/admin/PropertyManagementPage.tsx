// admin-panel/src/pages/admin/PropertyManagementPage.tsx
import React, { useEffect, useState } from 'react';
import {
    Alert,
    Box,
    Button,
    Chip,
    Container,
    Paper,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    Typography,
    alpha
} from '@mui/material';
import { MapPin, Route } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { db } from '../../lib/firebase';
import { collection, onSnapshot, query } from 'firebase/firestore';
import { binThemeTokens } from '../../theme/adminTheme';

interface Property {
    id: string;
    name?: string;
    propertyName?: string;
    propertyType?: string;
    address?: string;
    submittedGeo?: {
        lat?: number;
        lng?: number;
        verified?: boolean;
    };
    geo?: {
        lat?: number;
        lng?: number;
        verified?: boolean;
    };
    ownerId?: string;
    emirate?: string;
    serviceZone?: string;
    status?: string;
}

const displayStatus = (value: unknown) => String(value || 'UNKNOWN').replace(/_/g, ' ').toUpperCase();

export default function PropertyManagementPage() {
    const navigate = useNavigate();
    const [properties, setProperties] = useState<Property[]>([]);
    const [loadError, setLoadError] = useState('');

    useEffect(() => {
        const q = query(collection(db, 'properties'));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            setProperties(snapshot.docs.map((item) => ({ id: item.id, ...(item.data() || {}) } as Property)));
            setLoadError('');
        }, () => {
            setLoadError('Property registry could not be loaded. No mutation controls are available on this page.');
        });
        return () => unsubscribe();
    }, []);

    return (
        <Container maxWidth="xl" sx={{ py: 6 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 3, alignItems: 'center', mb: 4, flexWrap: 'wrap' }}>
                <Box>
                    <Typography variant="h3" fontWeight={900} sx={{ color: binThemeTokens.gold, letterSpacing: -1 }}>
                        ASSET REGISTRY
                    </Typography>
                    <Typography variant="body1" sx={{ color: binThemeTokens.textSecondary }}>
                        READ-ONLY OPERATIONAL REGISTRY · PROPERTY CREATION, OWNER ASSOCIATION, GPS REVIEW AND LIFECYCLE CHANGES USE THE CANONICAL INTAKE WORKFLOW
                    </Typography>
                </Box>
                <Button
                    variant="contained"
                    startIcon={<Route size={18} />}
                    onClick={() => navigate('/vault')}
                    sx={{
                        background: binThemeTokens.goldGradient,
                        color: binThemeTokens.black,
                        fontWeight: 900,
                        px: 4,
                        borderRadius: 100
                    }}
                >
                    Review Five-Page Applications
                </Button>
            </Box>

            <Alert severity="info" sx={{ mb: 3 }}>
                This registry is intentionally read-only. New property records must originate from the canonical Owner five-page onboarding and be reviewed in Intake Vault.
            </Alert>
            {loadError && <Alert severity="error" sx={{ mb: 3 }}>{loadError}</Alert>}

            <TableContainer component={Paper} sx={{
                borderRadius: 4,
                bgcolor: binThemeTokens.graphite,
                border: `1px solid ${alpha(binThemeTokens.gold, 0.1)}`,
                boxShadow: 'none'
            }}>
                <Table>
                    <TableHead>
                        <TableRow>
                            <TableCell sx={{ color: binThemeTokens.gold, fontWeight: 900, py: 3 }}>ASSET NAME</TableCell>
                            <TableCell sx={{ color: binThemeTokens.gold, fontWeight: 900 }}>TYPE</TableCell>
                            <TableCell sx={{ color: binThemeTokens.gold, fontWeight: 900 }}>ADDRESS</TableCell>
                            <TableCell sx={{ color: binThemeTokens.gold, fontWeight: 900 }}>ZONE / EMIRATE</TableCell>
                            <TableCell sx={{ color: binThemeTokens.gold, fontWeight: 900 }}>COORDINATES</TableCell>
                            <TableCell sx={{ color: binThemeTokens.gold, fontWeight: 900 }}>STATUS</TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {properties.map((prop) => {
                            const verified = prop.geo?.verified === true;
                            const lat = verified ? prop.geo?.lat : prop.submittedGeo?.lat;
                            const lng = verified ? prop.geo?.lng : prop.submittedGeo?.lng;
                            return (
                                <TableRow key={prop.id} hover>
                                    <TableCell sx={{ fontWeight: 700 }}>{prop.name || prop.propertyName || prop.id}</TableCell>
                                    <TableCell><Chip label={prop.propertyType || '—'} size="small" /></TableCell>
                                    <TableCell sx={{ color: binThemeTokens.textSecondary }}>{prop.address || '—'}</TableCell>
                                    <TableCell>
                                        <Typography variant="body2" sx={{ fontWeight: 700 }}>{prop.serviceZone || '—'}</Typography>
                                        <Typography variant="caption" sx={{ color: binThemeTokens.textSecondary }}>{prop.emirate || '—'}</Typography>
                                    </TableCell>
                                    <TableCell>
                                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, color: binThemeTokens.gold }}>
                                            <MapPin size={14} />
                                            <Typography variant="caption" sx={{ fontFamily: 'monospace' }}>
                                                {Number.isFinite(Number(lat)) && Number.isFinite(Number(lng))
                                                    ? `${Number(lat).toFixed(4)}, ${Number(lng).toFixed(4)}`
                                                    : 'N/A'}
                                            </Typography>
                                            {verified
                                                ? <Chip label="VERIFIED" size="small" sx={{ height: 18, fontSize: 10, bgcolor: 'rgba(16,185,129,0.12)', color: '#10b981', fontWeight: 900 }} />
                                                : prop.submittedGeo
                                                    ? <Chip label="UNVERIFIED" size="small" sx={{ height: 18, fontSize: 10, fontWeight: 900 }} />
                                                    : null}
                                        </Box>
                                    </TableCell>
                                    <TableCell><Chip label={displayStatus(prop.status)} size="small" variant="outlined" /></TableCell>
                                </TableRow>
                            );
                        })}
                        {properties.length === 0 && !loadError && (
                            <TableRow><TableCell colSpan={6} align="center">No property records found.</TableCell></TableRow>
                        )}
                    </TableBody>
                </Table>
            </TableContainer>
        </Container>
    );
}

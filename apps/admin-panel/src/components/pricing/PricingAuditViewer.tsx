import React, { useEffect, useMemo, useState } from 'react';
import {
    Alert, Box, Typography, Card, Grid, Divider, Chip, Stack,
    Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper,
    LinearProgress, CircularProgress
} from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import { collection, doc, getDoc, getDocs, limit, orderBy, query } from 'firebase/firestore';
import { db } from '../../lib/firebase';

type PricingAuditDocument = {
    id: string;
    ownerId?: string;
    propertyId?: string;
    engineType?: string;
    summary?: string;
    result?: any;
    createdAt?: any;
};

function formatDate(value: any) {
    if (!value) return 'Timestamp unavailable';
    const date = typeof value?.toDate === 'function' ? value.toDate() : new Date(value);
    return Number.isNaN(date.getTime()) ? 'Timestamp unavailable' : date.toLocaleString();
}

function money(value: unknown) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? `AED ${parsed.toLocaleString()}` : 'N/A';
}

function getAuditResult(audit: PricingAuditDocument | null) {
    return audit?.result && typeof audit.result === 'object' ? audit.result : null;
}

const PricingAuditViewer: React.FC<{ auditId?: string }> = ({ auditId }) => {
    const [audit, setAudit] = useState<PricingAuditDocument | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let active = true;

        async function loadAudit() {
            setLoading(true);
            setError(null);
            try {
                if (auditId) {
                    const snap = await getDoc(doc(db, 'pricingAuditLogs', auditId));
                    if (!snap.exists()) {
                        if (active) setAudit(null);
                    } else if (active) {
                        setAudit({ id: snap.id, ...snap.data() } as PricingAuditDocument);
                    }
                } else {
                    const snap = await getDocs(query(collection(db, 'pricingAuditLogs'), orderBy('createdAt', 'desc'), limit(1)));
                    if (active) {
                        setAudit(snap.empty ? null : ({ id: snap.docs[0].id, ...snap.docs[0].data() } as PricingAuditDocument));
                    }
                }
            } catch (loadError) {
                console.error('[PricingAuditViewer] Live audit load failed:', loadError);
                if (active) {
                    setAudit(null);
                    setError('Live pricing audit records could not be loaded.');
                }
            } finally {
                if (active) setLoading(false);
            }
        }

        loadAudit();
        return () => { active = false; };
    }, [auditId]);

    const result = useMemo(() => getAuditResult(audit), [audit]);
    const property = result?.property || {};
    const valuation = result?.valuation || {};
    const fmQuote = result?.fmQuote || {};
    const riskPack = result?.riskPack || {};
    const confidenceScore = Number(result?.confidenceScore ?? valuation?.confidenceScore);
    const inputCompleteness = Number(result?.inputCompleteness);
    const missingFields: string[] = Array.isArray(result?.missingFields) ? result.missingFields : [];
    const assumptionFlags: string[] = Array.isArray(result?.assumptionFlags) ? result.assumptionFlags : [];

    if (loading) {
        return <Box sx={{ p: 6, display: 'flex', justifyContent: 'center' }}><CircularProgress /></Box>;
    }

    if (error) return <Alert severity="error">{error}</Alert>;

    if (!audit || !result) {
        return (
            <Alert severity="info">
                {auditId ? 'No persisted pricing audit exists for this audit ID.' : 'No persisted pricing audit records are available yet.'}
            </Alert>
        );
    }

    const propertyFields = [
        ['Property', property.propertyName],
        ['Emirate', property.emirate],
        ['Area', property.area],
        ['Property Type', property.propertyType],
        ['Unit Subtype', property.unitSubtype],
        ['Built-up Area', property.builtUpAreaSqFt ? `${Number(property.builtUpAreaSqFt).toLocaleString()} sq ft` : null],
        ['Building Age', Number.isFinite(Number(property.propertyAgeYears)) ? `${property.propertyAgeYears} years` : null],
        ['Building Grade', property.buildingGrade],
        ['Condition Score', Number.isFinite(Number(property.conditionScore)) ? property.conditionScore : null],
        ['Compliance Risk', property.complianceRiskProfile],
    ].filter(([, value]) => value !== undefined && value !== null && value !== '');

    const outputRows = [
        ['Sale target', valuation?.saleEstimate?.target],
        ['Annual rent target', valuation?.rentEstimate?.target],
        ['Annual FM target', fmQuote?.annualEstimate?.target],
    ];

    return (
        <Box sx={{ p: 3, bgcolor: '#f8fafc', minHeight: '100vh' }}>
            <Box sx={{ mb: 4 }}>
                <Stack direction="row" spacing={2} alignItems="center" sx={{ mb: 1, flexWrap: 'wrap' }}>
                    <Typography variant="h4" fontWeight="bold">Pricing Audit: {audit.id}</Typography>
                    {result.decisionVersion && <Chip label={result.decisionVersion} color="primary" variant="outlined" size="small" />}
                    {result.trustTier && <Chip label={result.trustTier} color="success" size="small" />}
                </Stack>
                <Typography variant="body2" color="text.secondary">
                    Persisted Firestore evidence · {audit.summary || 'Pricing decision'} · {formatDate(audit.createdAt)}
                </Typography>
            </Box>

            <Grid container spacing={3}>
                <Grid item xs={12} md={4}>
                    <Card sx={{ p: 3, height: '100%' }}>
                        <Typography variant="h6" fontWeight="bold" gutterBottom>Property Snapshot</Typography>
                        <Divider sx={{ mb: 2 }} />
                        <Stack spacing={1.5}>
                            {propertyFields.length === 0 && <Typography color="text.secondary">No property inputs were persisted.</Typography>}
                            {propertyFields.map(([label, value]) => (
                                <Box key={String(label)} sx={{ display: 'flex', justifyContent: 'space-between', gap: 2 }}>
                                    <Typography variant="body2" color="text.secondary">{label}</Typography>
                                    <Typography variant="body2" fontWeight="medium" textAlign="right">{String(value)}</Typography>
                                </Box>
                            ))}
                        </Stack>
                    </Card>
                </Grid>

                <Grid item xs={12} md={5}>
                    <Card sx={{ p: 3, height: '100%' }}>
                        <Typography variant="h6" fontWeight="bold" gutterBottom>Engine Output</Typography>
                        <TableContainer component={Paper} elevation={0} sx={{ border: '1px solid #e2e8f0', mt: 2 }}>
                            <Table size="small">
                                <TableHead sx={{ bgcolor: '#f1f5f9' }}>
                                    <TableRow>
                                        <TableCell><Typography variant="caption" fontWeight="bold">Output</Typography></TableCell>
                                        <TableCell align="right"><Typography variant="caption" fontWeight="bold">Persisted Value</Typography></TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {outputRows.map(([label, value]) => (
                                        <TableRow key={String(label)}>
                                            <TableCell>{label}</TableCell>
                                            <TableCell align="right" sx={{ fontWeight: 700 }}>{money(value)}</TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </TableContainer>
                        {result.package?.packageName && (
                            <Box sx={{ mt: 3 }}>
                                <Typography variant="caption" color="text.secondary">Recommended Package</Typography>
                                <Typography variant="body1" fontWeight="bold">{result.package.packageName}</Typography>
                            </Box>
                        )}
                    </Card>
                </Grid>

                <Grid item xs={12} md={3}>
                    <Stack spacing={3}>
                        <Card sx={{ p: 3, bgcolor: '#1e293b', color: 'white' }}>
                            <Typography variant="h6" fontWeight="bold" gutterBottom>Signal Diagnostics</Typography>
                            <Box sx={{ mt: 2 }}>
                                <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                                    <Typography variant="caption" sx={{ opacity: 0.8 }}>Input completeness</Typography>
                                    <Typography variant="caption" fontWeight="bold">
                                        {Number.isFinite(inputCompleteness) ? `${Math.round(inputCompleteness * 100)}%` : 'N/A'}
                                    </Typography>
                                </Box>
                                {Number.isFinite(inputCompleteness) && (
                                    <LinearProgress variant="determinate" value={Math.max(0, Math.min(100, inputCompleteness * 100))} />
                                )}
                            </Box>
                            <Box sx={{ mt: 3 }}>
                                <Typography variant="caption" sx={{ opacity: 0.8, display: 'block', mb: 1 }}>Assumption flags</Typography>
                                <Stack spacing={1}>
                                    {assumptionFlags.length === 0 && <Typography variant="caption">None persisted.</Typography>}
                                    {assumptionFlags.map((flag) => <Chip key={flag} label={flag} size="small" sx={{ color: '#fff' }} />)}
                                </Stack>
                            </Box>
                        </Card>

                        <Card sx={{ p: 3, bgcolor: '#0f172a', color: 'white' }}>
                            <Typography variant="h6" fontWeight="bold" gutterBottom>Confidence</Typography>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                <CheckCircleIcon color={Number.isFinite(confidenceScore) ? 'primary' : 'disabled'} fontSize="small" />
                                <Typography variant="body2">
                                    {Number.isFinite(confidenceScore) ? `${confidenceScore}%` : 'Not persisted'}
                                </Typography>
                            </Box>
                            {missingFields.length > 0 && (
                                <Typography variant="caption" sx={{ display: 'block', mt: 2, opacity: 0.75 }}>
                                    Missing inputs: {missingFields.join(', ')}
                                </Typography>
                            )}
                            {riskPack?.complianceRiskLabel && (
                                <Typography variant="caption" sx={{ display: 'block', mt: 2, opacity: 0.75 }}>
                                    Compliance: {riskPack.complianceRiskLabel}
                                </Typography>
                            )}
                        </Card>
                    </Stack>
                </Grid>

                <Grid item xs={12}>
                    <Card sx={{ p: 3 }}>
                        <Typography variant="h6" fontWeight="bold" gutterBottom>Traceability</Typography>
                        <Grid container spacing={3} sx={{ mt: 0.5 }}>
                            <Grid item xs={12} md={4}>
                                <Typography variant="caption" color="text.secondary">Owner ID</Typography>
                                <Typography variant="body2" fontWeight="bold">{audit.ownerId || 'Not persisted'}</Typography>
                            </Grid>
                            <Grid item xs={12} md={4}>
                                <Typography variant="caption" color="text.secondary">Property ID</Typography>
                                <Typography variant="body2" fontWeight="bold">{audit.propertyId || 'Not persisted'}</Typography>
                            </Grid>
                            <Grid item xs={12} md={4}>
                                <Typography variant="caption" color="text.secondary">Engine Type</Typography>
                                <Typography variant="body2" fontWeight="bold">{audit.engineType || 'Not persisted'}</Typography>
                            </Grid>
                        </Grid>
                    </Card>
                </Grid>
            </Grid>
        </Box>
    );
};

export default PricingAuditViewer;

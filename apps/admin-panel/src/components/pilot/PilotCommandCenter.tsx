import React, { useEffect, useMemo, useState } from 'react';
import {
    Alert, Box, Card, Chip, CircularProgress, Divider, Grid, LinearProgress,
    Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Typography
} from '@mui/material';
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import GppGoodIcon from '@mui/icons-material/GppGood';
import { collection, getDocs, limit, orderBy, query } from 'firebase/firestore';
import { db } from '../../lib/firebase';

function normalizeStatus(value: unknown) {
    return String(value || '').trim().toUpperCase().replace(/[\s-]+/g, '_');
}

function amount(value: unknown) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
}

function annualValue(contract: any) {
    return amount(
        contract?.quoteSnapshot?.annualContractValue ??
        contract?.paymentSchedule?.annualContractValue ??
        contract?.annualContractValue ??
        contract?.annualFee
    );
}

function contractPropertyName(contract: any) {
    return String(
        contract?.propertyName ||
        contract?.propertySnapshot?.propertyName ||
        contract?.propertySnapshot?.name ||
        contract?.quoteSnapshot?.property?.propertyName ||
        contract?.properties?.[0]?.propertyName ||
        contract?.propertyId ||
        'Property not recorded'
    );
}

function auditProperty(audit: any) {
    return audit?.result?.property || audit?.property || {};
}

export default function PilotCommandCenter() {
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [leads, setLeads] = useState<any[]>([]);
    const [contracts, setContracts] = useState<any[]>([]);
    const [audits, setAudits] = useState<any[]>([]);

    useEffect(() => {
        let active = true;
        async function load() {
            setLoading(true);
            setError(null);
            try {
                const [leadSnap, contractSnap, auditSnap] = await Promise.all([
                    getDocs(query(collection(db, 'ownerRegistrationRequests'), limit(250))),
                    getDocs(query(collection(db, 'contracts'), limit(250))),
                    getDocs(query(collection(db, 'pricingAuditLogs'), orderBy('createdAt', 'desc'), limit(100))),
                ]);
                if (!active) return;
                setLeads(leadSnap.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() })));
                setContracts(contractSnap.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() })));
                setAudits(auditSnap.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() })));
            } catch (loadError) {
                console.error('[PilotCommandCenter] live registry load failed:', loadError);
                if (active) {
                    setLeads([]);
                    setContracts([]);
                    setAudits([]);
                    setError('Pilot command records could not be loaded from Firestore.');
                }
            } finally {
                if (active) setLoading(false);
            }
        }
        load();
        return () => { active = false; };
    }, []);

    const activeContracts = useMemo(
        () => contracts.filter((contract) => ['ACTIVE', 'ACTIVATED'].includes(normalizeStatus(contract.status || contract.activationStatus))),
        [contracts]
    );
    const acceptedContracts = useMemo(
        () => contracts.filter((contract) => ['ACCEPTED', 'SIGNED', 'APPROVED', 'ACTIVE', 'ACTIVATED'].includes(normalizeStatus(contract.status || contract.activationStatus))),
        [contracts]
    );
    const unlocked = useMemo(
        () => contracts.filter((contract) => contract.dashboardUnlocked === true || contract.ownerDashboardUnlocked === true).length,
        [contracts]
    );
    const expectedAnnualRevenue = useMemo(
        () => activeContracts.reduce((sum, contract) => sum + annualValue(contract), 0),
        [activeContracts]
    );

    const pricingRows = useMemo(() => audits.slice(0, 12).map((audit) => {
        const result = audit.result || {};
        const property = auditProperty(audit);
        const confidence = Number(result.confidenceScore ?? result.valuation?.confidenceScore);
        return {
            id: audit.id,
            unit: String(property.propertyName || property.name || audit.propertyId || 'Property not recorded'),
            region: String(property.area || property.emirate || 'Region not recorded'),
            confidence: Number.isFinite(confidence) ? confidence : null,
            target: amount(result?.valuation?.saleEstimate?.target || result?.valuation?.rentEstimate?.target || result?.fmQuote?.annualEstimate?.target),
            missing: Array.isArray(result.missingFields) ? result.missingFields.length : 0,
            assumptions: Array.isArray(result.assumptionFlags) ? result.assumptionFlags.length : 0,
            version: String(result.decisionVersion || audit.engineVersion || audit.engineType || 'Not recorded'),
        };
    }), [audits]);

    const latestEngineVersion = pricingRows[0]?.version || 'Not recorded';
    const pricingWithConfidence = pricingRows.filter((row) => row.confidence !== null);
    const averageConfidence = pricingWithConfidence.length
        ? pricingWithConfidence.reduce((sum, row) => sum + Number(row.confidence), 0) / pricingWithConfidence.length
        : null;
    const missingFieldAudits = pricingRows.filter((row) => row.missing > 0).length;
    const assumptionAudits = pricingRows.filter((row) => row.assumptions > 0).length;

    if (loading) {
        return <Box sx={{ p: 10, display: 'flex', justifyContent: 'center' }}><CircularProgress /></Box>;
    }

    return (
        <Box sx={{ p: 4, bgcolor: '#f8fafc', minHeight: '100vh' }}>
            <Box sx={{ mb: 4, display: 'flex', flexWrap: 'wrap', gap: 2, justifyContent: 'space-between', alignItems: 'center' }}>
                <Box>
                    <Typography variant="h4" fontWeight="black" sx={{ color: '#0f172a', letterSpacing: -1 }}>
                        PILOT COMMAND CENTER <Chip label="LIVE FIRESTORE" size="small" sx={{ ml: 1, bgcolor: '#0f172a', color: 'white', fontWeight: 'bold' }} />
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                        Owner pipeline, activated contracts, and pricing evidence from persisted production records.
                    </Typography>
                </Box>
                <Card sx={{ px: 3, py: 1.5, bgcolor: '#10b981', color: 'white' }}>
                    <Typography variant="caption" sx={{ opacity: 0.8 }}>ACTIVE CONTRACT ANNUAL VALUE</Typography>
                    <Typography variant="h6" fontWeight="bold">AED {expectedAnnualRevenue.toLocaleString()}</Typography>
                </Card>
            </Box>

            {error && <Alert severity="error" sx={{ mb: 3 }}>{error}</Alert>}

            <Grid container spacing={3}>
                <Grid item xs={12}>
                    <Card sx={{ p: 3 }}>
                        <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 2 }}>
                            <TrendingUpIcon color="primary" />
                            <Typography variant="h6" fontWeight="bold">Onboarding Pipeline Summary</Typography>
                        </Stack>
                        <Grid container spacing={2}>
                            {[
                                { label: 'Leads', val: leads.length, color: '#64748b' },
                                { label: 'Pricing Audits', val: audits.length, color: '#3b82f6' },
                                { label: 'Accepted / Signed', val: acceptedContracts.length, color: '#8b5cf6' },
                                { label: 'Contracts', val: contracts.length, color: '#ec4899' },
                                { label: 'Activated', val: activeContracts.length, color: '#10b981' },
                                { label: 'Unlocked', val: unlocked, color: '#059669' },
                            ].map((step, idx) => (
                                <Grid item xs={6} md={2} key={step.label}>
                                    <Box sx={{ p: 2, textAlign: 'center', borderRight: idx < 5 ? '1px solid #e2e8f0' : 'none' }}>
                                        <Typography variant="h4" fontWeight="bold" sx={{ color: step.color }}>{step.val}</Typography>
                                        <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 'bold' }}>{step.label.toUpperCase()}</Typography>
                                    </Box>
                                </Grid>
                            ))}
                        </Grid>
                    </Card>
                </Grid>

                <Grid item xs={12} md={4}>
                    <Stack spacing={2}>
                        <Card sx={{ p: 3 }}>
                            <Typography variant="h6" fontWeight="bold" sx={{ mb: 2 }}>Pricing Evidence Health</Typography>
                            <Stack spacing={1.5}>
                                <Alert severity={missingFieldAudits ? 'warning' : 'success'}>
                                    {missingFieldAudits} of {pricingRows.length} recent audits report missing inputs.
                                </Alert>
                                <Alert severity={assumptionAudits ? 'info' : 'success'}>
                                    {assumptionAudits} of {pricingRows.length} recent audits include explicit assumption flags.
                                </Alert>
                                <Alert severity={audits.length ? 'success' : 'info'}>
                                    {audits.length ? `${audits.length} persisted pricing audit records loaded.` : 'No pricing audit evidence exists yet.'}
                                </Alert>
                            </Stack>
                        </Card>
                        <Card sx={{ p: 3, bgcolor: '#0f172a', color: 'white' }}>
                            <Typography variant="caption" sx={{ opacity: 0.7 }}>LATEST ENGINE VERSION</Typography>
                            <Typography variant="h5" fontWeight="black" gutterBottom>{latestEngineVersion}</Typography>
                            <Divider sx={{ bgcolor: 'rgba(255,255,255,0.1)', my: 1 }} />
                            <Stack spacing={1}>
                                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                                    <Typography variant="caption">Active Contracts</Typography>
                                    <Typography variant="caption" fontWeight="bold">{activeContracts.length}</Typography>
                                </Box>
                                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                                    <Typography variant="caption">Average Pricing Confidence</Typography>
                                    <Typography variant="caption" fontWeight="bold" color="#10b981">{averageConfidence === null ? 'N/A' : `${averageConfidence.toFixed(1)}%`}</Typography>
                                </Box>
                            </Stack>
                        </Card>
                    </Stack>
                </Grid>

                <Grid item xs={12} md={8}>
                    <Card sx={{ p: 0, height: '100%', overflow: 'hidden' }}>
                        <Box sx={{ p: 3, borderBottom: '1px solid #e2e8f0' }}>
                            <Stack direction="row" spacing={1} alignItems="center">
                                <GppGoodIcon color="success" />
                                <Typography variant="h6" fontWeight="bold">Recent Pricing Audit Monitor</Typography>
                            </Stack>
                        </Box>
                        <TableContainer sx={{ maxHeight: 360 }}>
                            <Table stickyHeader size="small">
                                <TableHead>
                                    <TableRow>
                                        <TableCell sx={{ fontWeight: 'bold', bgcolor: '#f8fafc' }}>Property</TableCell>
                                        <TableCell sx={{ fontWeight: 'bold', bgcolor: '#f8fafc' }}>Region</TableCell>
                                        <TableCell sx={{ fontWeight: 'bold', bgcolor: '#f8fafc' }}>Persisted Target</TableCell>
                                        <TableCell sx={{ fontWeight: 'bold', bgcolor: '#f8fafc' }}>Confidence</TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {pricingRows.length === 0 ? (
                                        <TableRow><TableCell colSpan={4} align="center">No pricing audit records available.</TableCell></TableRow>
                                    ) : pricingRows.map((row) => (
                                        <TableRow key={row.id} hover>
                                            <TableCell sx={{ fontWeight: 'bold' }}>{row.unit}</TableCell>
                                            <TableCell>{row.region}</TableCell>
                                            <TableCell>{row.target > 0 ? `AED ${row.target.toLocaleString()}` : 'N/A'}</TableCell>
                                            <TableCell>
                                                {row.confidence === null ? 'N/A' : (
                                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                                        <Typography variant="caption" sx={{ minWidth: 35 }}>{row.confidence.toFixed(1)}%</Typography>
                                                        <LinearProgress variant="determinate" value={Math.max(0, Math.min(100, row.confidence))} sx={{ width: 60, height: 6, borderRadius: 3 }} />
                                                    </Box>
                                                )}
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </TableContainer>
                    </Card>
                </Grid>

                <Grid item xs={12}>
                    <Card sx={{ p: 0 }}>
                        <Box sx={{ p: 3, borderBottom: '1px solid #e2e8f0' }}>
                            <Stack direction="row" spacing={1} alignItems="center">
                                <ReceiptLongIcon color="primary" />
                                <Typography variant="h6" fontWeight="bold">Active Contract Registry</Typography>
                            </Stack>
                        </Box>
                        <TableContainer>
                            <Table>
                                <TableHead sx={{ bgcolor: '#f8fafc' }}>
                                    <TableRow>
                                        <TableCell sx={{ fontWeight: 'bold' }}>Owner</TableCell>
                                        <TableCell sx={{ fontWeight: 'bold' }}>Property</TableCell>
                                        <TableCell sx={{ fontWeight: 'bold' }}>Plan</TableCell>
                                        <TableCell sx={{ fontWeight: 'bold' }}>Status</TableCell>
                                        <TableCell sx={{ fontWeight: 'bold' }}>Annual Value</TableCell>
                                        <TableCell sx={{ fontWeight: 'bold' }}>Dashboard</TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {activeContracts.length === 0 ? (
                                        <TableRow><TableCell colSpan={6} align="center">No active contract records are available.</TableCell></TableRow>
                                    ) : activeContracts.slice(0, 25).map((contract) => (
                                        <TableRow key={contract.id}>
                                            <TableCell>{contract.ownerName || contract.ownerEmail || contract.ownerId || 'Owner not recorded'}</TableCell>
                                            <TableCell>{contractPropertyName(contract)}</TableCell>
                                            <TableCell>{contract.planName || contract.servicePlan || contract.contractType || 'Plan not recorded'}</TableCell>
                                            <TableCell><Chip label={normalizeStatus(contract.status || contract.activationStatus) || 'STATUS_UNKNOWN'} size="small" color="success" sx={{ fontWeight: 'bold' }} /></TableCell>
                                            <TableCell sx={{ fontWeight: 'black' }}>{annualValue(contract) > 0 ? `AED ${annualValue(contract).toLocaleString()}` : 'N/A'}</TableCell>
                                            <TableCell>{contract.dashboardUnlocked === true || contract.ownerDashboardUnlocked === true ? 'UNLOCKED' : 'NOT RECORDED'}</TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </TableContainer>
                    </Card>
                </Grid>
            </Grid>
        </Box>
    );
}

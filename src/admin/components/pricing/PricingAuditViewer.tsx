import React, { useState, useEffect } from 'react';
import { 
    Box, Typography, Card, Grid, Divider, 
    Button, Chip, Stack, Paper, Table, 
    TableBody, TableCell, TableContainer, 
    TableHead, TableRow,
    IconButton, LinearProgress
} from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import RefreshIcon from '@mui/icons-material/Refresh';
import SimCardDownloadIcon from '@mui/icons-material/SimCardDownload';

interface PricingAuditData {
    auditId: string;
    decisionVersion: string;
    ownerId: string;
    propertyId: string;
    quoteId: string;
    contractId: string;
    strategy: 'sale' | 'rent' | 'fm';
    inputs: any;
    multipliers: any;
    outputs: any;
    recommendation: any;
    createdAt: any;
}

const PricingAuditViewer: React.FC<{ auditId?: string }> = ({ auditId }) => {
    const [audit, setAudit] = useState<PricingAuditData | null>(null);
    const [loading, setLoading] = useState(true);

    // Mock data for initial pilot layout - replace with Firestore hook
    useEffect(() => {
        setTimeout(() => {
            setAudit({
                auditId: "PA-2026-00142",
                decisionVersion: "v5.0-STABLE",
                ownerId: "rashid_holdings_77",
                propertyId: "marina_tower_2504",
                quoteId: "Q-9921-X",
                contractId: "CTR-ACTIVE-001",
                strategy: "sale",
                inputs: {
                    emirate: "Dubai",
                    community: "Dubai Marina",
                    assetType: "Apartment",
                    configuration: "1BR",
                    floorPlateSqFt: 15000,
                    exposure: "Street",
                    verticalLevel: 1,
                    buildingGrade: "Luxury",
                    conditionScore: 9,
                    buildingAge: 19,
                    compliance: "Low Risk"
                },
                multipliers: {
                    baseRate: 1200,
                    community: 1.45,
                    grade: 1.8,
                    exposure: 1.0,
                    vertical: 1.0,
                    age: 0.81,
                    condition: 0.9,
                    compliance: 1.0
                },
                outputs: {
                    saleTarget: 25400000,
                    rentTarget: 1650000,
                    fmAnnualFee: 304800
                },
                recommendation: {
                    contractType: "Elite Property Care",
                    reason: ["Prime market zone", "Luxury asset class", "Lifecycle optimization required"],
                    score: 91
                },
                createdAt: new Date().toISOString()
            });
            setLoading(false);
        }, 800);
    }, [auditId]);

    if (loading || !audit) return <Typography>Consulting Audit Engine...</Typography>;

    return (
        <Box sx={{ p: 3, bgcolor: '#f8fafc', minHeight: '100vh' }}>
            {/* Section 1: Audit Header */}
            <Box sx={{ mb: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <Box>
                    <Stack direction="row" spacing={2} alignItems="center" sx={{ mb: 1 }}>
                        <Typography variant="h4" fontWeight="bold">Pricing Audit: {audit.auditId}</Typography>
                        <Chip label={audit.decisionVersion} color="primary" variant="outlined" size="small" />
                        <Chip label="ACTIVE" color="success" size="small" />
                    </Stack>
                    <Typography variant="body2" color="text.secondary">
                        Traceability for {audit.strategy.toUpperCase()} strategy | Rashid Holdings | Marina Tower 2504
                    </Typography>
                </Box>
                <Stack direction="row" spacing={1}>
                    <Button startIcon={<RefreshIcon />} variant="outlined">Re-run Simulation</Button>
                    <Button startIcon={<SimCardDownloadIcon />} variant="contained">Download Summary</Button>
                </Stack>
            </Box>

            <Grid container spacing={3}>
                {/* Section 2: Owner/Property Snapshot */}
                <Grid item xs={12} md={4}>
                    <Card sx={{ p: 3, height: '100%' }}>
                        <Typography variant="h6" fontWeight="bold" gutterBottom>Property Snapshot</Typography>
                        <Divider sx={{ mb: 2 }} />
                        <Stack spacing={1.5}>
                            {Object.entries(audit.inputs).map(([key, value]: any) => (
                                <Box key={key} sx={{ display: 'flex', justifyContent: 'space-between' }}>
                                    <Typography variant="body2" color="text.secondary" sx={{ textTransform: 'capitalize' }}>
                                        {key.replace(/([A-Z])/g, ' $1')}
                                    </Typography>
                                    <Typography variant="body2" fontWeight="medium">{typeof value === 'number' ? value.toLocaleString() : value}</Typography>
                                </Box>
                            ))}
                        </Stack>
                    </Card>
                </Grid>

                {/* Section 4: Multiplier Trace Stack */}
                <Grid item xs={12} md={5}>
                    <Card sx={{ p: 3, height: '100%' }}>
                        <Typography variant="h6" fontWeight="bold" gutterBottom>Multiplier Trace Stack</Typography>
                        <TableContainer component={Paper} elevation={0} sx={{ border: '1px solid #e2e8f0', mt: 2 }}>
                            <Table size="small">
                                <TableHead sx={{ bgcolor: '#f1f5f9' }}>
                                    <TableRow>
                                        <TableCell><Typography variant="caption" fontWeight="bold">Factor</Typography></TableCell>
                                        <TableCell><Typography variant="caption" fontWeight="bold">Value</Typography></TableCell>
                                        <TableCell align="right"><Typography variant="caption" fontWeight="bold">Effect</Typography></TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {Object.entries(audit.multipliers).map(([factor, value]: any) => (
                                        <TableRow key={factor}>
                                            <TableCell sx={{ textTransform: 'capitalize' }}>{factor}</TableCell>
                                            <TableCell>{value}{factor !== 'baseRate' ? 'x' : ''}</TableCell>
                                            <TableCell align="right" sx={{ color: value > 1 ? 'success.main' : value < 1 ? 'error.main' : 'text.primary' }}>
                                                {value > 1 ? `+${Math.round((value - 1) * 100)}%` : value < 1 ? `-${Math.round((1 - value) * 100)}%` : 'Neutral'}
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                    <TableRow sx={{ bgcolor: '#f8fafc' }}>
                                        <TableCell colSpan={2} sx={{ fontWeight: 'bold' }}>Final Decision Weight</TableCell>
                                        <TableCell align="right" sx={{ fontWeight: 'bold', color: 'primary.main' }}>2.11x adjusted</TableCell>
                                    </TableRow>
                                </TableBody>
                            </Table>
                        </TableContainer>
                    </Card>
                </Grid>

                {/* Section 3 & 5: Recommendation & Output */}
                <Grid item xs={12} md={3}>
                    <Stack spacing={3}>
                        <Card sx={{ p: 3, bgcolor: '#1e293b', color: 'white' }}>
                            <Typography variant="h6" fontWeight="bold" gutterBottom>Signal Diagnostics</Typography>
                            <Box sx={{ mt: 2 }}>
                                <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                                    <Typography variant="caption" sx={{ opacity: 0.8 }}>Input Health</Typography>
                                    <Typography variant="caption" fontWeight="bold">86%</Typography>
                                </Box>
                                <LinearProgress 
                                    variant="determinate" 
                                    value={86} 
                                    sx={{ 
                                        height: 4, 
                                        borderRadius: 2,
                                        bgcolor: 'rgba(255,255,255,0.1)',
                                        '& .MuiLinearProgress-bar': { bgcolor: 'primary.light' }
                                    }} 
                                />
                            </Box>
                            <Box sx={{ mt: 3 }}>
                                <Typography variant="caption" sx={{ opacity: 0.8, display: 'block', mb: 1 }}>Inference Flags:</Typography>
                                <Stack spacing={1}>
                                    {['baselineExposureApplied', 'standardConditionCurveUsed'].map(flag => (
                                        <Chip 
                                            key={flag} 
                                            label={flag} 
                                            size="small" 
                                            sx={{ 
                                                bgcolor: 'rgba(244, 63, 94, 0.1)', 
                                                color: '#fb7185', 
                                                border: '1px solid #fb7185',
                                                fontSize: '10px' 
                                            }} 
                                        />
                                    ))}
                                </Stack>
                            </Box>
                        </Card>

                        <Card sx={{ p: 3, bgcolor: '#0f172a', color: 'white' }}>
                            <Typography variant="h6" fontWeight="bold" gutterBottom>Engine Output</Typography>
                            <Box sx={{ mt: 2 }}>
                                <Typography variant="h4" fontWeight="bold" color="primary.light">
                                    AED {audit.outputs.saleTarget.toLocaleString()}
                                </Typography>
                                <Typography variant="caption">Projected Asset Value</Typography>
                            </Box>
                            <Divider sx={{ my: 2, bgcolor: 'rgba(255,255,255,0.1)' }} />
                            <Box sx={{ mb: 1 }}>
                                <Typography variant="body2" fontWeight="bold">{audit.recommendation.contractType}</Typography>
                                <Typography variant="caption" sx={{ opacity: 0.7 }}>Recommended Package</Typography>
                            </Box>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                <VerifiedIcon color="primary" fontSize="small" />
                                <Typography variant="body2">Confidence Score: 91%</Typography>
                            </Box>
                        </Card>
                    </Stack>
                </Grid>

                {/* Section 6: Contract Trace */}
                <Grid item xs={12}>
                    <Card sx={{ p: 3 }}>
                        <Typography variant="h6" fontWeight="bold" gutterBottom>Revenue & Activation Trace</Typography>
                        <Grid container spacing={4} sx={{ mt: 1 }}>
                            {[
                                { label: 'Quote Link', value: audit.quoteId, icon: <OpenInNewIcon fontSize="small" /> },
                                { label: 'Contract Link', value: audit.contractId, icon: <OpenInNewIcon fontSize="small" /> },
                                { label: 'Payment Status', value: 'PAID', chipColor: 'success' },
                                { label: 'Dashboard State', value: 'UNLOCKED', chipColor: 'success' }
                            ].map((item, idx) => (
                                <Grid item xs={6} md={3} key={idx}>
                                    <Typography variant="caption" color="text.secondary">{item.label}</Typography>
                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.5 }}>
                                        {item.chipColor ? (
                                            <Chip label={item.value} color={item.chipColor as any} size="small" />
                                        ) : (
                                            <>
                                                <Typography variant="body2" fontWeight="bold">{item.value}</Typography>
                                                <IconButton size="small">{item.icon}</IconButton>
                                            </>
                                        )}
                                    </Box>
                                </Grid>
                            ))}
                        </Grid>
                    </Card>
                </Grid>
            </Grid>
        </Box>
    );
};

const VerifiedIcon = CheckCircleIcon; // Fix for referenced undefined

export default PricingAuditViewer;

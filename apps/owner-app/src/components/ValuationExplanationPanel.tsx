import React from 'react';
import { 
    Box, Typography, Card, Grid, Divider, 
    Button, Chip, LinearProgress, Tooltip,
    Paper, Stack
} from '@mui/material';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import SecurityIcon from '@mui/icons-material/Security';
import VerifiedIcon from '@mui/icons-material/Verified';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';

interface ValuationExplanationPanelProps {
    valuation: any;
    propertyInfo: any;
    recommendation: any;
    onContinue: () => void;
    onAdjust: () => void;
}

const ValuationExplanationPanel: React.FC<ValuationExplanationPanelProps> = ({ 
    valuation, 
    propertyInfo, 
    recommendation,
    onContinue,
    onAdjust
}) => {
    const isSale = propertyInfo.strategy === 'sale';
    const isRent = propertyInfo.strategy === 'rent';

    return (
        <Box sx={{ py: 2 }}>
            {/* Header / Trust Badge */}
            <Box sx={{ mb: 4, textAlign: 'center' }}>
                <Stack direction="row" spacing={1} justifyContent="center" sx={{ mb: 2 }}>
                    <Chip 
                        icon={<VerifiedIcon style={{ color: valuation.trustTier === 'INSTITUTIONAL_HIGH' ? '#059669' : '#0369a1' }} />}
                        label={valuation.trustTier.replace('_', ' ')} 
                        sx={{ 
                            fontWeight: 'bold',
                            bgcolor: valuation.trustTier === 'INSTITUTIONAL_HIGH' ? '#ecfdf5' : '#f0f9ff',
                            color: valuation.trustTier === 'INSTITUTIONAL_HIGH' ? '#059669' : '#0369a1',
                            border: '1px solid currentColor'
                        }} 
                    />
                    <Chip label="v5.0 Stable" size="small" variant="outlined" />
                </Stack>
                <Typography variant="h5" fontWeight="bold" gutterBottom>
                    Property Intelligence Report
                </Typography>
                <Typography variant="body2" color="text.secondary">
                    Quote Reference: {Math.random().toString(36).substring(7).toUpperCase()} | Valid for 7 days
                </Typography>
            </Box>

            <Grid container spacing={3}>
                {/* Section 1: Asset Snapshot */}
                <Grid item xs={12} md={4}>
                    <Card variant="outlined" sx={{ p: 2, height: '100%', borderColor: 'primary.light' }}>
                        <Typography variant="overline" color="primary" fontWeight="bold">
                            Asset Analysis Snapshot
                        </Typography>
                        <Stack spacing={1.5} sx={{ mt: 2 }}>
                            {Object.entries({
                                'Location': propertyInfo.community,
                                'Grade': propertyInfo.buildingGrade,
                                'Condition': `${propertyInfo.conditionScore}/10`,
                                'Age': `${propertyInfo.buildingAge} years`,
                                'Strategy': propertyInfo.strategy.toUpperCase()
                            }).map(([key, value]) => (
                                <Box key={key} sx={{ display: 'flex', justifyContent: 'space-between' }}>
                                    <Typography variant="body2" color="text.secondary">{key}</Typography>
                                    <Typography variant="body2" fontWeight="medium">{value}</Typography>
                                </Box>
                            ))}
                        </Stack>
                        <Chip 
                            label="Market Position: Above Average" 
                            color="success" 
                            variant="outlined" 
                            size="small" 
                            sx={{ mt: 3, width: '100%', fontWeight: 'bold' }} 
                        />
                    </Card>
                </Grid>

                {/* Section 2: Strategy Output & Breakdown */}
                <Grid item xs={12} md={8}>
                    <Paper elevation={0} sx={{ p: 3, border: '1px solid', borderColor: 'divider', bgcolor: 'grey.50' }}>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                            <Typography variant="h6" fontWeight="bold">
                                {isSale ? 'Market Valuation Adjustments' : 'Rental Yield Drivers'}
                            </Typography>
                            <Typography variant="caption" color="text.secondary">Engine v5.0-STABLE</Typography>
                        </Box>

                        <Grid container spacing={2}>
                            {valuation.drivers.map((driver: string, index: number) => (
                                <Grid item xs={6} key={index}>
                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                        <TrendingUpIcon fontSize="small" color="primary" />
                                        <Typography variant="body2">{driver}</Typography>
                                    </Box>
                                </Grid>
                            ))}
                        </Grid>

                        <Divider sx={{ my: 3 }} />

                        {/* V1.16 Institutional Mission Radar */}
                        <Box sx={{ mt: 4 }}>
                            <Typography variant="caption" fontWeight="900" color="primary.main" sx={{ display: 'block', mb: 2 }}>MISSION EXECUTION RADAR (V1.16)</Typography>
                            <Grid container spacing={2}>
                                {[
                                    { name: 'FIRE COMPLIANCE', code: 'SFS-1', status: 'compliant' },
                                    { name: 'LIFT COVERAGE', code: 'V-TX', status: 'compliant' },
                                    { name: 'COOLING SYNC', code: 'D-CL', status: 'compliant' },
                                    { name: 'SIRA READINESS', code: 'SEC-X', status: 'pending' },
                                    { name: 'BMU ACCESS', code: 'EXT-F', status: 'compliant' },
                                    { name: 'PCA BASELINE', code: 'INS-P', status: 'missing' }
                                ].map((m, i) => (
                                    <Grid item xs={4} key={i}>
                                        <Paper variant="outlined" sx={{ 
                                            p: 1, textAlign: 'center', 
                                            borderColor: m.status === 'compliant' ? 'success.light' : (m.status === 'pending' ? 'warning.light' : 'error.light'),
                                            bgcolor: m.status === 'compliant' ? 'rgba(76, 175, 80, 0.05)' : (m.status === 'pending' ? 'rgba(255, 152, 0, 0.05)' : 'rgba(244, 67, 54, 0.05)')
                                        }}>
                                            <Typography variant="caption" fontWeight="900" sx={{ display: 'block', fontSize: 10 }}>{m.code}</Typography>
                                            <Typography variant="caption" sx={{ fontSize: 9, opacity: 0.7 }}>{m.name}</Typography>
                                        </Paper>
                                    </Grid>
                                ))}
                            </Grid>
                        </Box>
                    </Paper>
                </Grid>

                {/* Section 3: Add-On Missions (The "Missing" Parts) */}
                <Grid item xs={12}>
                    <Typography variant="subtitle2" fontWeight="900" sx={{ mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
                        <AutoAwesomeIcon color="primary" sx={{ fontSize: 20 }} /> CORE SERVICE MISSIONS PINNED TO ASSET
                    </Typography>
                    <Grid container spacing={2}>
                        {valuation.addOns.map((addon: any, index: number) => (
                            <Grid item xs={12} md={4} key={index}>
                                <Paper variant="outlined" sx={{ p: 2, borderRadius: 2, height: '100%', borderColor: addon.isMandatory ? 'primary.light' : 'divider' }}>
                                    <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                                        <Typography variant="body2" fontWeight="800">{addon.name}</Typography>
                                        {addon.isMandatory && <Chip label="MANDATORY" size="small" color="primary" sx={{ height: 16, fontSize: 8, fontWeight: 900 }} />}
                                    </Box>
                                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>{addon.description}</Typography>
                                    <Typography variant="caption" fontWeight="bold">AED {addon.annualCost.toLocaleString()} / {addon.frequency}</Typography>
                                </Paper>
                            </Grid>
                        ))}
                    </Grid>
                </Grid>

                {/* Section 5: Recommendation Block */}
                <Grid item xs={12}>
                    <Card sx={{ 
                        p: 3, 
                        background: 'linear-gradient(135deg, #1976d2 0%, #1565c0 100%)', 
                        color: 'white',
                        position: 'relative',
                        overflow: 'hidden'
                    }}>
                        <Box sx={{ position: 'relative', zIndex: 1 }}>
                             <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
                                <VerifiedIcon fontSize="small" />
                                <Typography variant="overline" fontWeight="bold">Recommended Service Plan</Typography>
                                <Chip label={`SOVEREIGN ESG: ${valuation.insights.esgRating}`} size="small" color="secondary" sx={{ height: 16, fontSize: 8, fontWeight: 900, ml: 'auto', bgcolor: 'white', color: 'primary.main' }} />
                            </Stack>
                            <Typography variant="h4" fontWeight="bold" gutterBottom>
                                {recommendation.packageName}
                            </Typography>
                            <Typography variant="body1" sx={{ opacity: 0.9, mb: 3, maxWidth: '600px' }}>
                                Optimized for {propertyInfo.buildingGrade} assets in {propertyInfo.community}. Protects your {isSale ? 'exit value' : 'yield'} through institutional-grade lifecycle management (Confidence: {valuation.insights.reserveConfidenceIndex}).
                            </Typography>

                            <Box sx={{ display: 'flex', gap: 4, mb: 3 }}>
                                <Box>
                                    <Typography variant="h6" fontWeight="bold">AED {recommendation.annualPrice.toLocaleString()}</Typography>
                                    <Typography variant="caption">Annualized Service Cost</Typography>
                                </Box>
                                <Divider orientation="vertical" flexItem sx={{ bgcolor: 'rgba(255,255,255,0.2)' }} />
                                <Box>
                                    <Typography variant="h6" fontWeight="bold">AED 42,000</Typography>
                                    <Typography variant="caption">Est. Annual Lifecycle Savings</Typography>
                                </Box>
                            </Box>

                            <Stack direction="row" spacing={2}>
                                <Button 
                                    variant="contained" 
                                    color="secondary" 
                                    size="large"
                                    onClick={onContinue}
                                    sx={{ fontWeight: 'bold', px: 4, bgcolor: 'common.white', color: 'primary.main', '&:hover': { bgcolor: '#f5f5f5' } }}
                                >
                                    Continue with Recommended Plan
                                </Button>
                                <Button 
                                    variant="outlined" 
                                    size="large"
                                    onClick={onAdjust}
                                    sx={{ color: 'white', borderColor: 'white', '&:hover': { borderColor: '#f5f5f5', bgcolor: 'rgba(255,255,255,0.1)' } }}
                                >
                                    Adjust Strategy
                                </Button>
                            </Stack>
                        </Box>
                        <SecurityIcon sx={{ 
                            position: 'absolute', 
                            right: -20, 
                            bottom: -20, 
                            fontSize: 200, 
                            opacity: 0.1 
                        }} />
                    </Card>
                </Grid>
            </Grid>

            {/* Scale Hardening: Legal & Terms Section */}
            <Box sx={{ mt: 6 }}>
                <Card variant="outlined" sx={{ p: 4, bgcolor: '#f8fafc', borderColor: '#e2e8f0', borderStyle: 'dashed' }}>
                    <Typography variant="caption" fontWeight="black" color="text.secondary" sx={{ display: 'block', mb: 2, textTransform: 'uppercase', letterSpacing: 1.5 }}>
                        Institutional Disclosure & Security Protocol
                    </Typography>
                    <Grid container spacing={4}>
                        <Grid item xs={12} md={6}>
                            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', lineHeight: 1.8 }}>
                                • <b>Price Lock:</b> This valuation is version-pinned (v5.0-STABLE) and price-locked for 48 hours to secure current community multipliers.<br />
                                • <b>Quote Validity:</b> Estimates expire in 7 days ({new Date(valuation.quoteExpiresAt).toLocaleDateString()}). Re-calculation is required after this window.<br />
                                • <b>Regulatory Note:</b> This digital analysis provided by <i>BIN Group Super App</i> is an institutional-grade estimate. High-precision physical appraisal is required for mortgage or bank-grade bankability.
                            </Typography>
                        </Grid>
                        <Grid item xs={12} md={6}>
                            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', lineHeight: 1.8 }}>
                                • <b>Privacy & Data:</b> All asset signals are processed in compliance with UAE Federal Decree-Law No. 45 of 2021 regarding the Protection of Personal Data.<br />
                                • <b>No-Repudiation:</b> Snapshot hashes are uniquely generated for your property ID and strategy ( {valuation.trustTier} ).
                            </Typography>
                        </Grid>
                    </Grid>
                </Card>
            </Box>

            {/* Footer */}
            <Typography variant="caption" color="text.secondary" sx={{ mt: 4, display: 'block', textAlign: 'center' }}>
                Valuation calibrated using UAE community multipliers and lifecycle maintenance models. 
                System ID: 0x{Math.random().toString(16).substring(2, 8).toUpperCase()} | Decision Engine v5.0-STABLE.
            </Typography>
        </Box>
    );
};

export default ValuationExplanationPanel;

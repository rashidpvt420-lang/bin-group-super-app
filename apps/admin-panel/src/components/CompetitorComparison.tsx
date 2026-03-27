import React, { useState } from 'react';
import {
    Paper,
    Typography,
    Box,
    TextField,
    Divider,
    Grid,
    Card,
    CardContent,
    Fade,
} from '@mui/material';
import TrendingDownIcon from '@mui/icons-material/TrendingDown';
import AlertTriangleIcon from '@mui/icons-material/ReportProblem';
import ZapIcon from '@mui/icons-material/FlashOn';
import InfoIcon from '@mui/icons-material/Info';

interface Props {
    binGroupTotal: number;
}

export default function CompetitorComparison({ binGroupTotal }: Props) {
    const [competitorPrice, setCompetitorPrice] = useState<number | ''>('');

    // Heuristic logic: Cheap competitors hide emergency and CapEx costs
    const hiddenEmergencyCost = competitorPrice ? Math.round(Number(competitorPrice) * 0.25) : 0;
    const hiddenCapExCost = competitorPrice ? Math.round(Number(competitorPrice) * 0.15) : 0;
    const realCompetitorCost = Number(competitorPrice) + hiddenEmergencyCost + hiddenCapExCost;

    return (
        <Paper sx={{ p: 4, borderRadius: 4, bgcolor: '#0f172a', border: '1px solid rgba(255,255,255,0.1)', color: 'white', position: 'relative', overflow: 'hidden' }}>
            {/* Background Icon */}
            <TrendingDownIcon sx={{ position: 'absolute', top: -40, right: -40, fontSize: 280, color: 'rgba(59,130,246,0.03)', pointerEvents: 'none' }} />

            <Box sx={{ position: 'relative', zIndex: 1 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 4 }}>
                    <Box sx={{ p: 1, bgcolor: 'rgba(59,130,246,0.1)', borderRadius: 2 }}>
                        <TrendingDownIcon sx={{ color: '#3b82f6' }} />
                    </Box>
                    <Box>
                        <Typography variant="h6" sx={{ fontWeight: 900, textTransform: 'uppercase', letterSpacing: -0.5, fontStyle: 'italic' }}>
                            Comparison Engine v1.1
                        </Typography>
                        <Typography variant="caption" sx={{ color: '#3b82f6', fontWeight: 'black', textTransform: 'uppercase', letterSpacing: 1.5, display: 'block', mt: -0.5 }}>
                            Actuarial Risk Assessment
                        </Typography>
                    </Box>
                </Box>

                <Box sx={{ mb: 4 }}>
                    <Typography variant="caption" sx={{ color: '#94a3b8', fontWeight: 900, textTransform: 'uppercase', letterSpacing: 1, ml: 0.5, mb: 1, display: 'block' }}>
                        Enter Competitor's Annual Quote (AED)
                    </Typography>
                    <TextField
                        fullWidth
                        type="number"
                        value={competitorPrice}
                        onChange={(e) => setCompetitorPrice(e.target.value === '' ? '' : Number(e.target.value))}
                        placeholder="0.00"
                        variant="outlined"
                        InputProps={{
                            endAdornment: <Typography sx={{ color: '#475569', fontWeight: 'bold' }}>AED/YR</Typography>,
                            sx: {
                                bgcolor: 'rgba(0,0,0,0.2)',
                                color: 'white',
                                fontWeight: 900,
                                fontSize: '1.2rem',
                                borderRadius: 3,
                                '& fieldset': { borderColor: 'rgba(255,255,255,0.1)' },
                                '&:hover fieldset': { borderColor: '#3b82f6' },
                                '&.Mui-focused fieldset': { borderColor: '#3b82f6' },
                            }
                        }}
                    />
                </Box>

                <Fade in={!!competitorPrice && Number(competitorPrice) > 0}>
                    <Box>
                        <Grid container spacing={2} sx={{ mb: 4 }}>
                            <Grid item xs={12}>
                                <Box sx={{ display: 'flex', justifyContent: 'space-between', p: 2, bgcolor: 'rgba(255,255,255,0.03)', borderRadius: 2, border: '1px solid rgba(255,255,255,0.05)' }}>
                                    <Typography variant="caption" sx={{ color: '#94a3b8', fontWeight: 900, textTransform: 'uppercase' }}>Base Quote</Typography>
                                    <Typography sx={{ fontFamily: 'monospace', fontWeight: 900 }}>AED {Number(competitorPrice).toLocaleString()}</Typography>
                                </Box>
                            </Grid>

                            <Grid item xs={12}>
                                <Box sx={{ display: 'flex', justifyContent: 'space-between', p: 2, bgcolor: 'rgba(239,68,68,0.05)', borderRadius: 2, border: '1px solid rgba(239,68,68,0.1)', color: '#f87171' }}>
                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                        <AlertTriangleIcon sx={{ fontSize: 16 }} />
                                        <Typography variant="caption" sx={{ fontWeight: 900, textTransform: 'uppercase' }}>Emergency Callouts (Excluded)</Typography>
                                    </Box>
                                    <Typography sx={{ fontFamily: 'monospace', fontWeight: 900 }}>AED {hiddenEmergencyCost.toLocaleString()}</Typography>
                                </Box>
                            </Grid>

                            <Grid item xs={12}>
                                <Box sx={{ display: 'flex', justifyContent: 'space-between', p: 2, bgcolor: 'rgba(239,68,68,0.05)', borderRadius: 2, border: '1px solid rgba(239,68,68,0.1)', color: '#f87171' }}>
                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                        <ZapIcon sx={{ fontSize: 16 }} />
                                        <Typography variant="caption" sx={{ fontWeight: 900, textTransform: 'uppercase' }}>Unplanned MEP Failures</Typography>
                                    </Box>
                                    <Typography sx={{ fontFamily: 'monospace', fontWeight: 900 }}>AED {hiddenCapExCost.toLocaleString()}</Typography>
                                </Box>
                            </Grid>
                        </Grid>

                        <Grid container spacing={2} sx={{ mb: 4 }}>
                            <Grid item xs={6}>
                                <Card sx={{ bgcolor: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 4 }}>
                                    <CardContent sx={{ p: '24px !important' }}>
                                        <Typography variant="caption" sx={{ color: '#f87171', fontWeight: 900, textTransform: 'uppercase', display: 'block', mb: 1 }}>Competitor Real Cost</Typography>
                                        <Typography variant="h4" sx={{ fontWeight: 900 }}>
                                            <Box component="span" sx={{ fontSize: '0.8rem', color: 'rgba(248,113,113,0.5)', mr: 1 }}>AED</Box>
                                            {realCompetitorCost.toLocaleString()}
                                        </Typography>
                                    </CardContent>
                                </Card>
                            </Grid>
                            <Grid item xs={6}>
                                <Card sx={{ bgcolor: 'rgba(59,130,246,0.1)', border: '1px solid rgba(59,130,246,0.3)', borderRadius: 4, boxShadow: '0 0 20px rgba(59,130,246,0.1)' }}>
                                    <CardContent sx={{ p: '24px !important' }}>
                                        <Typography variant="caption" sx={{ color: '#60a5fa', fontWeight: 900, textTransform: 'uppercase', display: 'block', mb: 1 }}>BIN-GROUP Fixed Cost</Typography>
                                        <Typography variant="h4" sx={{ fontWeight: 900 }}>
                                            <Box component="span" sx={{ fontSize: '0.8rem', color: 'rgba(96,165,250,0.5)', mr: 1 }}>AED</Box>
                                            {binGroupTotal.toLocaleString()}
                                        </Typography>
                                    </CardContent>
                                </Card>
                            </Grid>
                        </Grid>

                        <Box sx={{ borderLeft: '4px solid #3b82f6', bgcolor: 'rgba(59,130,246,0.05)', p: 2, borderRadius: '0 16px 16px 0' }}>
                            <Typography variant="body2" sx={{ color: '#93c5fd', fontStyle: 'italic', fontWeight: 700, textTransform: 'uppercase', fontSize: '0.75rem', letterSpacing: 0.5 }}>
                                "Your BIN-GROUP quote includes predictive MEP monitoring and zero-cost emergency SLA. Cheap contracts guarantee expensive emergencies."
                            </Typography>
                        </Box>
                    </Box>
                </Fade>

                {!competitorPrice && (
                    <Box sx={{ height: 160, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', border: '2px dashed rgba(255,255,255,0.05)', borderRadius: 4 }}>
                        <InfoIcon sx={{ fontSize: 40, color: 'rgba(255,255,255,0.05)', mb: 1 }} />
                        <Typography variant="caption" sx={{ color: '#475569', fontWeight: 900, textTransform: 'uppercase', letterSpacing: 2 }}>
                            Enter Quote to Begin Analysis
                        </Typography>
                    </Box>
                )}
            </Box>
        </Paper>
    );
}

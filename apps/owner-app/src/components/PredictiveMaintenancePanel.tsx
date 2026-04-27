import React from 'react';
import { 
    Box, Typography, Paper, Grid, Stack, Chip, 
    Divider, alpha, Button, LinearProgress 
} from '@mui/material';
import { 
    ShieldAlert, AlertTriangle, Info, Clock, 
    TrendingUp, Activity, ShieldCheck 
} from 'lucide-react';
import { binThemeTokens } from '../theme/binGroupTheme';
import { PredictiveMaintenanceReport, PredictionAdvisory } from '@bin/shared';

interface Props {
    report: PredictiveMaintenanceReport;
}

const PredictiveMaintenancePanel: React.FC<Props> = ({ report }) => {
    const getRiskColor = (level: PredictionAdvisory['riskLevel']) => {
        switch (level) {
            case 'CRITICAL': return '#ef4444';
            case 'HIGH': return '#f59e0b';
            case 'MEDIUM': return binThemeTokens.gold;
            default: return '#10b981';
        }
    };

    return (
        <Paper sx={{ 
            p: 4, bgcolor: 'rgba(22, 22, 24, 0.7)', 
            border: '1px solid rgba(198, 167, 94, 0.15)', 
            borderRadius: 6,
            overflow: 'hidden',
            position: 'relative'
        }}>
            <Box sx={{ mb: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Box>
                    <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 950, letterSpacing: 2 }}>
                        INSTITUTIONAL PREDICTION LAYER
                    </Typography>
                    <Typography variant="h5" fontWeight="950" color="#FFF">
                        Systemic Risk Mitigation
                    </Typography>
                </Box>
                <Box sx={{ textAlign: 'right' }}>
                    <Typography variant="caption" color="textSecondary" display="block">PORTFOLIO IMPACT</Typography>
                    <Typography variant="h4" fontWeight="950" sx={{ color: report.overallRiskScore > 70 ? '#ef4444' : binThemeTokens.gold }}>
                        {report.overallRiskScore}%
                    </Typography>
                </Box>
            </Box>

            <Stack spacing={3}>
                {report.advisories.map((adv, i) => (
                    <Box key={i} sx={{ 
                        p: 3, bgcolor: alpha(getRiskColor(adv.riskLevel), 0.03), 
                        border: `1px solid ${alpha(getRiskColor(adv.riskLevel), 0.15)}`,
                        borderRadius: 4
                    }}>
                        <Grid container spacing={2} alignItems="center">
                            <Grid item xs={12} md={8}>
                                <Box sx={{ display: 'flex', gap: 1, mb: 1.5, alignItems: 'center' }}>
                                    <Chip 
                                        label={adv.riskLevel} 
                                        size="small" 
                                        sx={{ 
                                            bgcolor: getRiskColor(adv.riskLevel), 
                                            color: '#000', 
                                            fontWeight: 950,
                                            fontSize: '0.6rem'
                                        }} 
                                    />
                                    <Typography variant="subtitle2" fontWeight="900" color="#FFF">
                                        {adv.system.toUpperCase()}
                                    </Typography>
                                </Box>
                                <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.7)', mb: 2 }}>
                                    {adv.warning}
                                </Typography>
                                <Stack direction="row" spacing={3}>
                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                        <Clock size={14} color={binThemeTokens.gold} />
                                        <Typography variant="caption" sx={{ color: binThemeTokens.gold, fontWeight: 700 }}>
                                            Timeframe: {adv.timeframe}
                                        </Typography>
                                    </Box>
                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                        <Activity size={14} color="rgba(255,255,255,0.4)" />
                                        <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)' }}>
                                            Confidence: {adv.probability}%
                                        </Typography>
                                    </Box>
                                </Stack>
                            </Grid>
                            <Grid item xs={12} md={4} sx={{ textAlign: 'right' }}>
                                <Button 
                                    variant="outlined" 
                                    size="small"
                                    sx={{ 
                                        borderColor: 'rgba(255,255,255,0.1)', 
                                        color: '#FFF', 
                                        fontWeight: 900,
                                        fontSize: '0.7rem'
                                    }}
                                >
                                    MITIGATE NOW
                                </Button>
                            </Grid>
                        </Grid>
                    </Box>
                ))}

                {report.advisories.length === 0 && (
                    <Box sx={{ py: 4, textAlign: 'center' }}>
                        <ShieldCheck color="#10b981" size={48} style={{ opacity: 0.3, marginBottom: 16 }} />
                        <Typography variant="body2" color="textSecondary">
                            All systems operating within normal institutional envelopes. No predictive warnings active.
                        </Typography>
                    </Box>
                )}
            </Stack>

            <Box sx={{ mt: 4, p: 2, bgcolor: alpha(binThemeTokens.gold, 0.05), borderRadius: 2 }}>
                <Typography variant="caption" sx={{ color: binThemeTokens.gold, display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Info size={14} /> ADVISORY: Predictions are probabilistic based on historical decay patterns and sensor telemetry where available.
                </Typography>
            </Box>
        </Paper>
    );
};

export default PredictiveMaintenancePanel;

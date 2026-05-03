import React from 'react';
import { Box, Typography, Paper, alpha, Stack, Grid } from '@mui/material';
import { Radar, RadarChart, PolarGrid, PolarAngleAxis, ResponsiveContainer } from 'recharts';
import { AlertCircle, ShieldCheck } from 'lucide-react';
import { binThemeTokens } from '../theme/binGroupTheme';

const RiskRadar: React.FC<{ data: any }> = ({ data }) => {
    // Mock data for the radar
    const radarData = [
        { subject: 'Structural', A: 90, fullMark: 100 },
        { subject: 'HVAC', A: 75, fullMark: 100 },
        { subject: 'Plumbing', A: 85, fullMark: 100 },
        { subject: 'Safety', A: 95, fullMark: 100 },
        { subject: 'SIRA', A: 100, fullMark: 100 },
        { subject: 'Pool', A: 60, fullMark: 100 },
    ];

    return (
        <Paper sx={{ 
            p: 4, borderRadius: 6, bgcolor: 'rgba(22, 22, 24, 0.7)', 
            border: '1px solid rgba(198, 167, 94, 0.15)', height: '100%' 
        }}>
            <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 4 }}>
                <Box>
                    <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 900, letterSpacing: 2 }}>
                        MAINTENANCE RISK RADAR
                    </Typography>
                    <Typography variant="h6" fontWeight="950" sx={{ color: '#FFF' }}>
                        Systemic Resilience
                    </Typography>
                </Box>
                <ShieldCheck color={binThemeTokens.gold} size={24} />
            </Stack>

            <Box sx={{ height: 250, width: '100%' }}>
                <ResponsiveContainer width="100%" height="100%">
                    <RadarChart cx="50%" cy="50%" outerRadius="80%" data={radarData}>
                        <PolarGrid stroke="rgba(255,255,255,0.1)" />
                        <PolarAngleAxis dataKey="subject" tick={{ fill: 'rgba(255,255,255,0.5)', fontSize: 10, fontWeight: 700 }} />
                        <Radar
                            name="Health"
                            dataKey="A"
                            stroke={binThemeTokens.gold}
                            fill={binThemeTokens.gold}
                            fillOpacity={0.3}
                        />
                    </RadarChart>
                </ResponsiveContainer>
            </Box>

            <Box sx={{ mt: 2, p: 2, borderRadius: 3, bgcolor: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
                <Stack direction="row" spacing={2} alignItems="center">
                    <AlertCircle size={18} color="#FACC15" />
                    <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.6)', fontWeight: 600 }}>
                        POOL FILTRATION SYSTEM DECAY DETECTED. SCHEDULE AUDIT WITHIN 14 DAYS.
                    </Typography>
                </Stack>
            </Box>
        </Paper>
    );
};

export default RiskRadar;

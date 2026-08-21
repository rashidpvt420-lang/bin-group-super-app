import React from 'react';
import { Box, Typography, Paper, Stack } from '@mui/material';
import { Radar, RadarChart, PolarGrid, PolarAngleAxis, ResponsiveContainer } from 'recharts';
import { AlertCircle, ShieldCheck } from 'lucide-react';
import { binThemeTokens } from '../theme/binGroupTheme';

type RiskPoint = {
    subject: string;
    A: number;
    fullMark: number;
};

const clampScore = (value: unknown) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return 0;
    return Math.max(0, Math.min(100, parsed));
};

const normalizeRiskPoints = (data: any): RiskPoint[] => {
    const source = Array.isArray(data)
        ? data
        : data?.riskScores || data?.radarData || data?.systems || data?.assetHealth || [];

    if (!Array.isArray(source)) return [];

    return source
        .map((item: any) => ({
            subject: String(item?.subject || item?.system || item?.name || item?.category || '').trim(),
            A: clampScore(item?.A ?? item?.score ?? item?.healthScore ?? item?.health ?? item?.value),
            fullMark: 100,
        }))
        .filter((item: RiskPoint) => Boolean(item.subject));
};

const resolveRiskAlert = (data: any) => {
    const source = data?.alerts || data?.riskAlerts || data?.maintenanceAlerts || [];
    if (!Array.isArray(source) || source.length === 0) return null;
    const alert = source[0];
    if (typeof alert === 'string') return alert.trim() || null;
    return String(alert?.message || alert?.title || alert?.description || '').trim() || null;
};

const RiskRadar: React.FC<{ data: any }> = ({ data }) => {
    const radarData = normalizeRiskPoints(data);
    const alertMessage = resolveRiskAlert(data);

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

            {radarData.length > 0 ? (
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
            ) : (
                <Box sx={{ height: 250, display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center', px: 3 }}>
                    <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.5)', fontWeight: 600 }}>
                        No live maintenance risk measurements are available yet.
                    </Typography>
                </Box>
            )}

            <Box sx={{ mt: 2, p: 2, borderRadius: 3, bgcolor: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
                <Stack direction="row" spacing={2} alignItems="center">
                    <AlertCircle size={18} color={alertMessage ? '#FACC15' : 'rgba(255,255,255,0.35)'} />
                    <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.6)', fontWeight: 600 }}>
                        {alertMessage || 'No active maintenance risk alerts.'}
                    </Typography>
                </Stack>
            </Box>
        </Paper>
    );
};

export default RiskRadar;

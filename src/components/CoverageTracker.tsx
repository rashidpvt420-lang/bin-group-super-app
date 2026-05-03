import React from 'react';
import { 
    Box, Typography, Paper, Grid, Stack, Chip, 
    Divider, alpha, Button, Tooltip 
} from '@mui/material';
import { 
    ShieldCheck, Calendar, Info, AlertCircle, 
    FileText, CheckCircle2, History 
} from 'lucide-react';
import { binThemeTokens } from '../theme/binGroupTheme';

export interface CoverageItem {
    id: string;
    system: string;
    provider: string;
    expiryDate: Date;
    type: 'WARRANTY' | 'INSURANCE';
    policyNumber: string;
    notes?: string;
    status: 'ACTIVE' | 'EXPIRING' | 'EXPIRED';
}

interface Props {
    items: CoverageItem[];
}

const CoverageTracker: React.FC<Props> = ({ items }) => {
    const getStatusColor = (status: CoverageItem['status']) => {
        switch (status) {
            case 'ACTIVE': return '#10b981';
            case 'EXPIRING': return '#f59e0b';
            case 'EXPIRED': return '#ef4444';
            default: return 'rgba(255,255,255,0.4)';
        }
    };

    return (
        <Paper sx={{ p: 4, bgcolor: 'rgba(22, 22, 24, 0.6)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 6 }}>
            <Box sx={{ mb: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Typography variant="h6" fontWeight="950" sx={{ color: '#FFF', display: 'flex', alignItems: 'center', gap: 2 }}>
                    <ShieldCheck color={binThemeTokens.gold} /> SYSTEM COVERAGE & WARRANTIES
                </Typography>
                <Button size="small" variant="text" sx={{ color: binThemeTokens.gold, fontWeight: 900 }}>VIEW ALL POLICIES</Button>
            </Box>

            <Stack spacing={2}>
                {items.map((item) => (
                    <Box key={item.id} sx={{ 
                        p: 3, bgcolor: 'rgba(255,255,255,0.02)', 
                        border: `1px solid rgba(255,255,255,0.05)`,
                        borderRadius: 3,
                        '&:hover': { bgcolor: 'rgba(255,255,255,0.03)' }
                    }}>
                        <Grid container spacing={2} alignItems="center">
                            <Grid item xs={12} sm={4}>
                                <Typography variant="subtitle2" fontWeight="900" color="#FFF">{item.system.toUpperCase()}</Typography>
                                <Typography variant="caption" color="textSecondary">{item.provider}</Typography>
                            </Grid>
                            <Grid item xs={12} sm={3}>
                                <Stack direction="row" spacing={1} alignItems="center">
                                    <Calendar size={14} color="rgba(255,255,255,0.4)" />
                                    <Box>
                                        <Typography variant="caption" color="textSecondary" display="block">EXPIRY</Typography>
                                        <Typography variant="body2" fontWeight="700" color="#FFF">
                                            {item.expiryDate.toLocaleDateString()}
                                        </Typography>
                                    </Box>
                                </Stack>
                            </Grid>
                            <Grid item xs={12} sm={3}>
                                <Chip 
                                    label={item.type} 
                                    size="small" 
                                    variant="outlined"
                                    sx={{ 
                                        borderColor: 'rgba(255,255,255,0.1)', 
                                        color: 'rgba(255,255,255,0.6)',
                                        fontWeight: 900,
                                        fontSize: '0.6rem'
                                    }} 
                                />
                                <Chip 
                                    label={item.status} 
                                    size="small" 
                                    sx={{ 
                                        ml: 1,
                                        bgcolor: alpha(getStatusColor(item.status), 0.1), 
                                        color: getStatusColor(item.status),
                                        fontWeight: 900,
                                        fontSize: '0.6rem'
                                    }} 
                                />
                            </Grid>
                            <Grid item xs={12} sm={2} sx={{ textAlign: 'right' }}>
                                {item.status === 'ACTIVE' && (
                                    <Tooltip title="Claim Opportunity: Coverage covers current wear markers.">
                                        <Button size="small" variant="outlined" sx={{ color: '#4ADE80', borderColor: alpha('#4ADE80', 0.3), fontWeight: 900, fontSize: '0.65rem' }}>
                                            FLAG CLAIM
                                        </Button>
                                    </Tooltip>
                                )}
                            </Grid>
                        </Grid>
                    </Box>
                ))}
            </Stack>
        </Paper>
    );
};

export default CoverageTracker;

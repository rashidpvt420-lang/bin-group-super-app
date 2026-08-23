import React from 'react';
import { Box, Typography, Paper, Grid, Stack, Chip, alpha, Button, Tooltip } from '@mui/material';
import { ShieldCheck, Calendar } from 'lucide-react';
import { binThemeTokens } from '../theme/binGroupTheme';

export interface CoverageItem {
    id: string;
    system: string;
    provider: string;
    expiryDate: Date | null;
    type: 'WARRANTY' | 'INSURANCE' | 'UNKNOWN';
    policyNumber: string;
    notes?: string;
    status: 'ACTIVE' | 'EXPIRING' | 'EXPIRED' | 'UNKNOWN';
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
            <Box sx={{ mb: 4 }}>
                <Typography variant="h6" fontWeight="950" sx={{ color: '#FFF', display: 'flex', alignItems: 'center', gap: 2 }}>
                    <ShieldCheck color={binThemeTokens.gold} /> SYSTEM COVERAGE & WARRANTIES
                </Typography>
                <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.45)' }}>
                    Persisted coverage evidence only. Missing policy fields remain unknown.
                </Typography>
            </Box>

            <Stack spacing={2}>
                {items.length === 0 && (
                    <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.5)', py: 2 }}>
                        No verified warranty or insurance coverage records are available.
                    </Typography>
                )}
                {items.map((item) => (
                    <Box key={item.id} sx={{
                        p: 3, bgcolor: 'rgba(255,255,255,0.02)',
                        border: '1px solid rgba(255,255,255,0.05)',
                        borderRadius: 3,
                    }}>
                        <Grid container spacing={2} alignItems="center">
                            <Grid item xs={12} sm={4}>
                                <Typography variant="subtitle2" fontWeight="900" color="#FFF">{item.system.toUpperCase()}</Typography>
                                <Typography variant="caption" color="textSecondary">{item.provider || 'Provider not recorded'}</Typography>
                            </Grid>
                            <Grid item xs={12} sm={3}>
                                <Stack direction="row" spacing={1} alignItems="center">
                                    <Calendar size={14} color="rgba(255,255,255,0.4)" />
                                    <Box>
                                        <Typography variant="caption" color="textSecondary" display="block">EXPIRY</Typography>
                                        <Typography variant="body2" fontWeight="700" color="#FFF">
                                            {item.expiryDate ? item.expiryDate.toLocaleDateString() : 'Not recorded'}
                                        </Typography>
                                    </Box>
                                </Stack>
                            </Grid>
                            <Grid item xs={12} sm={3}>
                                <Chip
                                    label={item.type}
                                    size="small"
                                    variant="outlined"
                                    sx={{ borderColor: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.6)', fontWeight: 900, fontSize: '0.6rem' }}
                                />
                                <Chip
                                    label={item.status}
                                    size="small"
                                    sx={{ ml: 1, bgcolor: alpha(getStatusColor(item.status), 0.1), color: getStatusColor(item.status), fontWeight: 900, fontSize: '0.6rem' }}
                                />
                            </Grid>
                            <Grid item xs={12} sm={2} sx={{ textAlign: 'right' }}>
                                {item.status === 'ACTIVE' && (
                                    <Tooltip title="A protected coverage-claim workflow is not connected yet.">
                                        <span>
                                            <Button disabled size="small" variant="outlined" sx={{ fontWeight: 900, fontSize: '0.65rem' }}>
                                                CLAIM UNAVAILABLE
                                            </Button>
                                        </span>
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
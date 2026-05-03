import React, { useState } from 'react';
import { 
    Box, Grid, Paper, Table, TableBody, TableCell, 
    TableContainer, TableHead, TableRow, Chip, Button, Stack, alpha, Divider, Typography 
} from '@mui/material';
import { Download, FileText, TrendingUp, Info } from 'lucide-react';
import { UAE_PRICING_MATRIX_2026, binThemeTokens } from '@bin/shared';
import { useLanguage } from '@bin/shared';
import AdminPageFrame from '../../components/AdminPageFrame';

export default function PricingMatrixPage() {
    const { t } = useLanguage();
    const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

    const categories = Array.from(new Set(UAE_PRICING_MATRIX_2026.assetClasses.map(a => a.category)));
    const filteredClasses = selectedCategory 
        ? UAE_PRICING_MATRIX_2026.assetClasses.filter(a => a.category === selectedCategory)
        : UAE_PRICING_MATRIX_2026.assetClasses;

    return (
        <AdminPageFrame
            title={t('pricing.title') || 'PRICING MATRIX 2026'}
            subtitle={`Institutional Benchmarks · Version ${UAE_PRICING_MATRIX_2026.version}`}
            breadcrumbs={[{ label: 'Pricing Matrix' }]}
            actions={
                <Stack direction="row" spacing={2}>
                    <Button 
                        variant="outlined" 
                        startIcon={<Download size={16} />} 
                        sx={{ borderColor: 'rgba(255,255,255,0.1)', color: '#FFF', fontWeight: 900 }}
                    >
                        EXPORT
                    </Button>
                    <Button 
                        variant="contained" 
                        startIcon={<FileText size={16} />} 
                        sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950 }}
                    >
                        GENERATE REPORT
                    </Button>
                </Stack>
            }
        >
            <Grid container spacing={3}>
                <Grid item xs={12} md={4}>
                    <Paper sx={{ p: 3, borderRadius: 4, bgcolor: 'rgba(255,255,255,0.01)', border: '1px solid rgba(255,255,255,0.05)' }}>
                        <Stack spacing={3}>
                            <Box>
                                <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 900, mb: 2, display: 'block' }}>ZONE MULTIPLIERS</Typography>
                                <Stack spacing={1}>
                                    {Object.entries(UAE_PRICING_MATRIX_2026.zones).map(([key, zone]) => (
                                        <Box key={key} sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', p: 1.5, bgcolor: 'rgba(255,255,255,0.02)', borderRadius: 2 }}>
                                            <Box>
                                                <Typography variant="body2" fontWeight="800" color="#FFF">Zone {key}: {zone.label}</Typography>
                                                <Typography variant="caption" color="rgba(255,255,255,0.3)">{zone.description}</Typography>
                                            </Box>
                                            <Chip label={`${zone.multiplier}x`} size="small" sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950 }} />
                                        </Box>
                                    ))}
                                </Stack>
                            </Box>

                            <Divider sx={{ borderColor: 'rgba(255,255,255,0.05)' }} />

                            <Box>
                                <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 900, mb: 2, display: 'block' }}>EMIRATE ADJUSTMENTS</Typography>
                                <Grid container spacing={1}>
                                    {UAE_PRICING_MATRIX_2026.emirateMultipliers.map((em) => (
                                        <Grid item xs={6} key={em.label}>
                                            <Paper sx={{ p: 1.5, bgcolor: 'rgba(255,255,255,0.02)', borderRadius: 2, textAlign: 'center', border: '1px solid rgba(255,255,255,0.05)' }}>
                                                <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)', display: 'block' }}>{em.label}</Typography>
                                                <Typography variant="body2" fontWeight="950" color={em.isPremium ? binThemeTokens.gold : '#FFF'}>{em.value}</Typography>
                                            </Paper>
                                        </Grid>
                                    ))}
                                </Grid>
                            </Box>
                        </Stack>
                    </Paper>
                </Grid>

                <Grid item xs={12} md={8}>
                    <Paper sx={{ borderRadius: 4, bgcolor: 'rgba(255,255,255,0.01)', border: '1px solid rgba(255,255,255,0.05)', overflow: 'hidden' }}>
                        <Box sx={{ p: 2, borderBottom: '1px solid rgba(255,255,255,0.05)', display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                            <Chip 
                                label="ALL CLASSES" 
                                size="small"
                                onClick={() => setSelectedCategory(null)}
                                sx={{ 
                                    bgcolor: selectedCategory === null ? binThemeTokens.gold : 'transparent',
                                    color: selectedCategory === null ? '#000' : 'rgba(255,255,255,0.4)',
                                    fontWeight: 900, fontSize: '0.65rem'
                                }} 
                            />
                            {categories.map(cat => (
                                <Chip 
                                    key={cat} label={cat.toUpperCase()} 
                                    size="small"
                                    onClick={() => setSelectedCategory(cat)}
                                    sx={{ 
                                        bgcolor: selectedCategory === cat ? binThemeTokens.gold : 'transparent',
                                        color: selectedCategory === cat ? '#000' : 'rgba(255,255,255,0.4)',
                                        fontWeight: 900, fontSize: '0.65rem'
                                    }} 
                                />
                            ))}
                        </Box>
                        <TableContainer sx={{ maxHeight: '60vh' }}>
                            <Table stickyHeader>
                                <TableHead>
                                    <TableRow>
                                        <TableCell sx={{ bgcolor: '#020617', color: 'rgba(255,255,255,0.3)', fontWeight: 900 }}>ASSET CLASS</TableCell>
                                        <TableCell sx={{ bgcolor: '#020617', color: 'rgba(255,255,255,0.3)', fontWeight: 900 }}>MIN AMC</TableCell>
                                        <TableCell sx={{ bgcolor: '#020617', color: 'rgba(255,255,255,0.3)', fontWeight: 900 }}>PM RATE</TableCell>
                                        <TableCell sx={{ bgcolor: '#020617', color: 'rgba(255,255,255,0.3)', fontWeight: 900 }}>UNIT</TableCell>
                                        <TableCell sx={{ bgcolor: '#020617', color: 'rgba(255,255,255,0.3)', fontWeight: 900 }}>RISK</TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {filteredClasses.map((ac) => (
                                        <TableRow key={ac.id} hover>
                                            <TableCell>
                                                <Typography variant="body2" fontWeight="900" color="#FFF">{ac.label}</Typography>
                                                <Typography variant="caption" color="rgba(255,255,255,0.3)">{ac.category}</Typography>
                                            </TableCell>
                                            <TableCell sx={{ color: '#FFF', fontWeight: 800 }}>AED {ac.minimumAnnualContract.toLocaleString()}</TableCell>
                                            <TableCell sx={{ color: binThemeTokens.gold, fontWeight: 900 }}>{ac.pmRate}</TableCell>
                                            <TableCell>
                                                <Chip label={ac.pricingUnit.toUpperCase()} size="small" variant="outlined" sx={{ color: 'rgba(255,255,255,0.3)', borderColor: 'rgba(255,255,255,0.05)', fontSize: '0.6rem' }} />
                                            </TableCell>
                                            <TableCell>
                                                <Chip 
                                                    label={ac.riskLevel.toUpperCase()} size="small" 
                                                    sx={{ 
                                                        bgcolor: ac.riskLevel === 'Critical' ? alpha('#EF4444', 0.1) : 'rgba(255,255,255,0.05)',
                                                        color: ac.riskLevel === 'Critical' ? '#EF4444' : 'rgba(255,255,255,0.5)',
                                                        fontWeight: 950, fontSize: '0.6rem'
                                                    }} 
                                                />
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </TableContainer>
                    </Paper>
                </Grid>
            </Grid>
        </AdminPageFrame>
    );
}

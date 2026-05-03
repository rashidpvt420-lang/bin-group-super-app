import React, { useState } from 'react';
import { 
    Box, Container, Typography, Grid, Paper, Table, TableBody, TableCell, 
    TableContainer, TableHead, TableRow, Chip, Button, Stack, alpha, Divider 
} from '@mui/material';
import { Download, FileText } from 'lucide-react';

// Production Imports
import { UAE_PRICING_MATRIX_2026, binThemeTokens } from '@bin/shared';

/**
 * PricingMatrixPage
 * Institutional dashboard for viewing and managing the 2026 UAE Pricing benchmarks.
 * Includes risk-adjusted multipliers and Integrated Facilities Management (IFM) targets.
 */
export default function PricingMatrixPage() {
    const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

    const categories = Array.from(new Set(UAE_PRICING_MATRIX_2026.assetClasses.map(a => a.category)));
    const filteredClasses = selectedCategory 
        ? UAE_PRICING_MATRIX_2026.assetClasses.filter(a => a.category === selectedCategory)
        : UAE_PRICING_MATRIX_2026.assetClasses;

    return (
        <Container maxWidth="xl" sx={{ py: 6 }}>
            <Box sx={{ mb: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Box>
                    <Typography variant="h3" fontWeight="950" sx={{ color: binThemeTokens.gold, letterSpacing: -1 }}>
                        UAE PRICING MATRIX 2026
                    </Typography>
                    <Typography variant="h6" sx={{ color: 'rgba(255,255,255,0.5)', fontWeight: 500 }}>
                        Institutional Benchmarks · Version {UAE_PRICING_MATRIX_2026.version}
                    </Typography>
                </Box>
                <Stack direction="row" spacing={2}>
                    <Button variant="outlined" startIcon={<Download size={18} />} sx={{ borderColor: 'rgba(255,255,255,0.1)', color: '#FFF' }}>
                        EXPORT CSV
                    </Button>
                    <Button variant="contained" startIcon={<FileText size={18} />} sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 900 }}>
                        GENERATE REPORT
                    </Button>
                </Stack>
            </Box>

            <Grid container spacing={4}>
                {/* GLOBAL CONTROLS SUMMARY */}
                <Grid item xs={12} md={4}>
                    <Paper sx={{ p: 4, borderRadius: 6, bgcolor: 'rgba(22, 22, 24, 0.6)', border: '1px solid rgba(255,255,255,0.05)' }}>
                        <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 900, mb: 3, display: 'block' }}>ZONE MULTIPLIERS</Typography>
                        <Stack spacing={2}>
                            {Object.entries(UAE_PRICING_MATRIX_2026.zones).map(([key, zone]) => (
                                <Box key={key} sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', p: 2, bgcolor: 'rgba(255,255,255,0.02)', borderRadius: 3 }}>
                                    <Box>
                                        <Typography variant="subtitle2" fontWeight="900" color="#FFF">Zone {key}: {zone.label}</Typography>
                                        <Typography variant="caption" color="rgba(255,255,255,0.4)">{zone.description}</Typography>
                                    </Box>
                                    <Chip label={`${zone.multiplier}x`} sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 900 }} />
                                </Box>
                            ))}
                        </Stack>
                        
                        <Divider sx={{ my: 4, borderColor: 'rgba(255,255,255,0.05)' }} />
                        
                        <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 900, mb: 3, display: 'block' }}>EMIRATE ADJUSTMENTS</Typography>
                        <Grid container spacing={1}>
                            {UAE_PRICING_MATRIX_2026.emirateMultipliers.map((em) => (
                                <Grid item xs={6} key={em.label}>
                                    <Box sx={{ p: 1.5, bgcolor: 'rgba(255,255,255,0.02)', borderRadius: 2, textAlign: 'center', border: '1px solid rgba(255,255,255,0.03)' }}>
                                        <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.5)' }}>{em.label}</Typography>
                                        <Typography variant="subtitle2" fontWeight="900" color={em.isPremium ? binThemeTokens.gold : '#FFF'}>{em.value}</Typography>
                                    </Box>
                                </Grid>
                            ))}
                        </Grid>
                    </Paper>
                </Grid>

                {/* ASSET CLASS TABLE */}
                <Grid item xs={12} md={8}>
                    <Paper sx={{ borderRadius: 6, bgcolor: 'rgba(22, 22, 24, 0.6)', border: '1px solid rgba(255,255,255,0.05)', overflow: 'hidden' }}>
                        <Box sx={{ p: 3, borderBottom: '1px solid rgba(255,255,255,0.05)', display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                            <Chip 
                                label="ALL CLASSES" 
                                onClick={() => setSelectedCategory(null)}
                                sx={{ 
                                    bgcolor: selectedCategory === null ? binThemeTokens.gold : 'transparent',
                                    color: selectedCategory === null ? '#000' : 'rgba(255,255,255,0.5)',
                                    fontWeight: 900,
                                    cursor: 'pointer'
                                }} 
                            />
                            {categories.map(cat => (
                                <Chip 
                                    key={cat} label={cat.toUpperCase()} 
                                    onClick={() => setSelectedCategory(cat)}
                                    sx={{ 
                                        bgcolor: selectedCategory === cat ? binThemeTokens.gold : 'transparent',
                                        color: selectedCategory === cat ? '#000' : 'rgba(255,255,255,0.5)',
                                        fontWeight: 900,
                                        cursor: 'pointer'
                                    }} 
                                />
                            ))}
                        </Box>
                        <TableContainer sx={{ maxHeight: '70vh' }}>
                            <Table stickyHeader>
                                <TableHead>
                                    <TableRow>
                                        <TableCell sx={{ bgcolor: '#161618', color: binThemeTokens.gold, fontWeight: 900 }}>ASSET CLASS</TableCell>
                                        <TableCell sx={{ bgcolor: '#161618', color: binThemeTokens.gold, fontWeight: 900 }}>MIN AMC</TableCell>
                                        <TableCell sx={{ bgcolor: '#161618', color: binThemeTokens.gold, fontWeight: 900 }}>PM RATE</TableCell>
                                        <TableCell sx={{ bgcolor: '#161618', color: binThemeTokens.gold, fontWeight: 900 }}>IFM (COMBINED)</TableCell>
                                        <TableCell sx={{ bgcolor: '#161618', color: binThemeTokens.gold, fontWeight: 900 }}>UNIT</TableCell>
                                        <TableCell sx={{ bgcolor: '#161618', color: binThemeTokens.gold, fontWeight: 900 }}>RISK</TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {filteredClasses.map((ac) => (
                                        <TableRow key={ac.id} sx={{ '&:hover': { bgcolor: 'rgba(255,255,255,0.02)' } }}>
                                            <TableCell>
                                                <Typography variant="subtitle2" fontWeight="900" color="#FFF">{ac.label}</Typography>
                                                <Typography variant="caption" color="rgba(255,255,255,0.4)">{ac.category}</Typography>
                                            </TableCell>
                                            <TableCell sx={{ color: '#FFF', fontWeight: 800 }}>AED {ac.minimumAnnualContract.toLocaleString()}</TableCell>
                                            <TableCell sx={{ color: binThemeTokens.gold, fontWeight: 800 }}>{ac.pmRate}</TableCell>
                                            <TableCell sx={{ color: 'rgba(255,255,255,0.7)', fontWeight: 800 }}>{ac.ifm}</TableCell>
                                            <TableCell>
                                                <Chip label={ac.pricingUnit.toUpperCase()} size="small" variant="outlined" sx={{ color: 'rgba(255,255,255,0.5)', borderColor: 'rgba(255,255,255,0.1)' }} />
                                            </TableCell>
                                            <TableCell>
                                                <Chip 
                                                    label={ac.riskLevel.toUpperCase()} size="small" 
                                                    sx={{ 
                                                        bgcolor: ac.riskLevel === 'Critical' ? alpha('#EF4444', 0.1) : (ac.riskLevel === 'High' ? alpha('#F59E0B', 0.1) : 'rgba(255,255,255,0.05)'),
                                                        color: ac.riskLevel === 'Critical' ? '#EF4444' : (ac.riskLevel === 'High' ? '#F59E0B' : 'rgba(255,255,255,0.7)'),
                                                        fontWeight: 900
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
        </Container>
    );
}

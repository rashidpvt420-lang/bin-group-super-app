import React, { useState } from 'react';
import { Container, Grid, Typography, Box, Paper, Stack, alpha, LinearProgress, Table, TableBody, TableCell, TableContainer, TableHead, TableRow } from '@mui/material';
import { binThemeTokens } from '../../theme/adminTheme';
import { useLanguage } from '@bin/shared';

export default function ProfitabilityDashboardPage() {
    const { t, isRTL } = useLanguage();
    const [stats] = useState({
        totalRevenue: 2450000,
        mrr: 210000,
        arr: 2520000,
        expenses: 1120000,
        netProfit: 1330000,
        margin: 54.2,
        overduePayments: 45000,
        unbilledWork: 12500
    });

    return (
        <Container maxWidth="xl" sx={{ py: 6, direction: isRTL ? 'rtl' : 'ltr' }}>
            <Box sx={{ mb: 6 }}>
                <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 950, letterSpacing: 4 }}>{t('admin.profitability_dashboard.eyebrow')}</Typography>
                <Typography variant="h3" fontWeight="950" color="#FFF">{t('admin.profitability_dashboard.page_title_prefix')} <Box component="span" sx={{ color: binThemeTokens.gold }}>{t('admin.profitability_dashboard.page_title_highlight')}</Box></Typography>
                <Typography variant="body1" color="rgba(255,255,255,0.5)">{t('admin.profitability_dashboard.page_desc')}</Typography>
            </Box>

            <Grid container spacing={4} sx={{ mb: 6 }}>
                <Grid item xs={12} md={3}>
                    <Paper sx={{ p: 4, borderRadius: 4, bgcolor: 'rgba(22, 22, 24, 0.6)', border: '1px solid rgba(255,255,255,0.05)' }}>
                        <Typography variant="caption" color="textSecondary">{t('admin.profitability_dashboard.kpi_total_revenue')}</Typography>
                        <Typography variant="h4" fontWeight="950" color="#FFF">{t('admin.profitability_dashboard.currency_aed')} {stats.totalRevenue.toLocaleString()}</Typography>
                        <Typography variant="caption" sx={{ color: '#10b981' }}>{t('admin.profitability_dashboard.yoy_growth')}</Typography>
                    </Paper>
                </Grid>
                <Grid item xs={12} md={3}>
                    <Paper sx={{ p: 4, borderRadius: 4, bgcolor: 'rgba(22, 22, 24, 0.6)', border: '1px solid rgba(255,255,255,0.05)' }}>
                        <Typography variant="caption" color="textSecondary">{t('admin.profitability_dashboard.kpi_mrr_arr')}</Typography>
                        <Typography variant="h4" fontWeight="950" color={binThemeTokens.gold}>{t('admin.profitability_dashboard.currency_aed')} {stats.mrr.toLocaleString()}</Typography>
                        <Typography variant="caption" color="textSecondary">{t('admin.profitability_dashboard.arr_label', { value: stats.arr.toLocaleString() })}</Typography>
                    </Paper>
                </Grid>
                <Grid item xs={12} md={3}>
                    <Paper sx={{ p: 4, borderRadius: 4, bgcolor: 'rgba(22, 22, 24, 0.6)', border: '1px solid rgba(255,255,255,0.05)' }}>
                        <Typography variant="caption" color="textSecondary">{t('admin.profitability_dashboard.kpi_net_profit')}</Typography>
                        <Typography variant="h4" fontWeight="950" color="#10b981">{t('admin.profitability_dashboard.currency_aed')} {stats.netProfit.toLocaleString()}</Typography>
                        <Typography variant="caption" color="textSecondary">{t('admin.profitability_dashboard.margin_label', { value: stats.margin })}</Typography>
                    </Paper>
                </Grid>
                <Grid item xs={12} md={3}>
                    <Paper sx={{ p: 4, borderRadius: 4, bgcolor: alpha('#ef4444', 0.05), border: '1px solid rgba(239,68,68,0.2)' }}>
                        <Typography variant="caption" sx={{ color: '#ef4444', fontWeight: 900 }}>{t('admin.profitability_dashboard.kpi_overdue')}</Typography>
                        <Typography variant="h4" fontWeight="950" color="#ef4444">{t('admin.profitability_dashboard.currency_aed')} {stats.overduePayments.toLocaleString()}</Typography>
                        <Typography variant="caption" sx={{ color: '#ef4444' }}>{t('admin.profitability_dashboard.unbilled_label', { value: stats.unbilledWork.toLocaleString() })}</Typography>
                    </Paper>
                </Grid>
            </Grid>

            <Grid container spacing={4}>
                <Grid item xs={12} lg={8}>
                    <Paper sx={{ p: 4, borderRadius: 6, bgcolor: 'rgba(22, 22, 24, 0.6)', border: '1px solid rgba(255,255,255,0.05)' }}>
                        <Typography variant="h6" fontWeight="950" color="#FFF" sx={{ mb: 4 }}>{t('admin.profitability_dashboard.profit_by_asset_title')}</Typography>
                        <TableContainer>
                            <Table size="small">
                                <TableHead>
                                    <TableRow>
                                        <TableCell sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 900 }}>{t('admin.profitability_dashboard.col_property')}</TableCell>
                                        <TableCell sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 900 }}>{t('admin.profitability_dashboard.col_revenue')}</TableCell>
                                        <TableCell sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 900 }}>{t('admin.profitability_dashboard.col_opex')}</TableCell>
                                        <TableCell sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 900 }} align="right">{t('admin.profitability_dashboard.col_profit')}</TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {[
                                        { name: 'Princess Tower', rev: 450000, opex: 120000 },
                                        { name: 'Marina Gate', rev: 320000, opex: 95000 },
                                        { name: 'Gate Tower 1', rev: 280000, opex: 88000 },
                                        { name: 'Index Tower', rev: 195000, opex: 42000 }
                                    ].map((row, i) => (
                                        <TableRow key={i}>
                                            <TableCell sx={{ color: '#FFF', fontWeight: 700, borderBottom: '1px solid rgba(255,255,255,0.02)' }}>{row.name}</TableCell>
                                            <TableCell sx={{ color: '#FFF', borderBottom: '1px solid rgba(255,255,255,0.02)' }}>{t('admin.profitability_dashboard.currency_aed')} {row.rev.toLocaleString()}</TableCell>
                                            <TableCell sx={{ color: 'rgba(255,255,255,0.4)', borderBottom: '1px solid rgba(255,255,255,0.02)' }}>{t('admin.profitability_dashboard.currency_aed')} {row.opex.toLocaleString()}</TableCell>
                                            <TableCell sx={{ color: '#10b981', fontWeight: 900, borderBottom: '1px solid rgba(255,255,255,0.02)' }} align="right">{t('admin.profitability_dashboard.currency_aed')} {(row.rev - row.opex).toLocaleString()}</TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </TableContainer>
                    </Paper>
                </Grid>

                <Grid item xs={12} lg={4}>
                    <Paper sx={{ p: 4, borderRadius: 6, bgcolor: 'rgba(22, 22, 24, 0.6)', border: '1px solid rgba(255,255,255,0.05)' }}>
                        <Typography variant="h6" fontWeight="950" color="#FFF" sx={{ mb: 4 }}>{t('admin.profitability_dashboard.expense_breakdown_title')}</Typography>
                        <Stack spacing={3}>
                            {[
                                { label: t('admin.profitability_dashboard.expense_staff_salaries'), amount: 450000, color: binThemeTokens.gold },
                                { label: t('admin.profitability_dashboard.expense_material_costs'), amount: 180000, color: '#3b82f6' },
                                { label: t('admin.profitability_dashboard.expense_ai_cloud_ops'), amount: 42000, color: '#a78bfa' },
                                { label: t('admin.profitability_dashboard.expense_broker_disbursal'), amount: 120000, color: '#10b981' }
                            ].map((exp, i) => (
                                <Box key={i}>
                                    <Stack direction="row" justifyContent="space-between" sx={{ mb: 1 }}>
                                        <Typography variant="caption" color="textSecondary">{exp.label.toUpperCase()}</Typography>
                                        <Typography variant="caption" fontWeight="900" color="#FFF">{t('admin.profitability_dashboard.currency_aed')} {exp.amount.toLocaleString()}</Typography>
                                    </Stack>
                                    <LinearProgress variant="determinate" value={(exp.amount / stats.expenses) * 100} sx={{ height: 4, borderRadius: 2, bgcolor: 'rgba(255,255,255,0.05)', '& .MuiLinearProgress-bar': { bgcolor: exp.color } }} />
                                </Box>
                            ))}
                        </Stack>
                    </Paper>
                </Grid>
            </Grid>
        </Container>
    );
}

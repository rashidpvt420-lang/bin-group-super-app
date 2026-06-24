/**
 * ROI Report Modal — Admin Panel
 * Calls generateTrialROIReport Cloud Function, renders result as
 * a clean, printable performance summary.
 */
import React, { useState } from 'react';
import {
    Box, Button, CircularProgress, Dialog, DialogContent, DialogTitle,
    Divider, Grid, IconButton, Paper, Typography, Chip, Alert
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import PrintIcon from '@mui/icons-material/Print';
import AssessmentIcon from '@mui/icons-material/Assessment';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { useLanguage } from '@bin/shared';

interface ROIReport {
    propertyId: string;
    propertyName: string;
    ownerName: string;
    periodStart: string;
    periodEnd: string;
    totalTickets: number;
    totalResolved: number;
    totalPending: number;
    avgResolutionHours: number;
    slaComplianceRate: number;
    totalPreventedCostAED: number;
    assetHealthScore: number | null;
    topCategories: [string, number][];
    trialSummary: { headline: string; recommendation: string };
    generatedAt: string;
}

interface Props {
    propertyId: string;
    propertyName: string;
}

export default function ROIReportModal({ propertyId, propertyName }: Props) {
    const { t, lang, isRTL } = useLanguage();
    const [open, setOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const [report, setReport] = useState<ROIReport | null>(null);
    const [error, setError] = useState('');

    const generate = async () => {
        setLoading(true);
        setError('');
        setReport(null);
        try {
            const fns = getFunctions();
            const fn = httpsCallable<{ propertyId: string }, ROIReport>(fns, 'generateTrialROIReport');
            const res = await fn({ propertyId });
            setReport(res.data);
        } catch (e: any) {
            setError(e.message || t('roi.gen_failed'));
        } finally {
            setLoading(false);
        }
    };

    const handleOpen = async () => {
        setOpen(true);
        await generate();
    };

    const headlineColor = (rate: number) =>
        rate >= 90 ? 'success' : rate >= 75 ? 'warning' : 'error';

    return (
        <>
            {/* Trigger Button */}
            <Button
                variant="contained"
                startIcon={<AssessmentIcon />}
                onClick={handleOpen}
                sx={{
                    background: 'linear-gradient(135deg, #7c3aed 0%, #4f46e5 100%)',
                    color: '#fff',
                    fontWeight: 'bold',
                    letterSpacing: '0.05em',
                    px: 3, py: 1.5,
                    borderRadius: 2,
                    boxShadow: '0 4px 20px rgba(124,58,237,0.35)',
                    '&:hover': { opacity: 0.9, boxShadow: '0 6px 24px rgba(124,58,237,0.45)' }
                }}
            >
                {t('roi.generate_btn')}
            </Button>

            {/* Modal */}
            <Dialog open={open} onClose={() => setOpen(false)} maxWidth="md" fullWidth dir={isRTL ? 'rtl' : 'ltr'}>
                <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', pb: 1, flexDirection: isRTL ? 'row-reverse' : 'row' }}>
                    <Box sx={{ textAlign: isRTL ? 'right' : 'left' }}>
                        <Typography variant="h6" fontWeight="bold">{t('roi.modal_title')}</Typography>
                        <Typography variant="caption" color="text.secondary">{propertyName}</Typography>
                    </Box>
                    <Box sx={{ display: 'flex', gap: 1, flexDirection: isRTL ? 'row-reverse' : 'row' }}>
                        {report && (
                            <IconButton onClick={() => window.print()} size="small" title={t('roi.print_tooltip')}>
                                <PrintIcon />
                            </IconButton>
                        )}
                        <IconButton onClick={() => setOpen(false)} size="small">
                            <CloseIcon />
                        </IconButton>
                    </Box>
                </DialogTitle>

                <DialogContent dividers>
                    {/* Loading */}
                    {loading && (
                        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', py: 8, gap: 2 }}>
                            <CircularProgress sx={{ color: '#7c3aed' }} />
                            <Typography variant="body2" color="text.secondary">{t('roi.analysing')}</Typography>
                        </Box>
                    )}

                    {/* Error */}
                    {error && <Alert severity="error" sx={{ mb: 2, textAlign: isRTL ? 'right' : 'left' }}>{error}</Alert>}

                    {/* Report */}
                    {report && (
                        <Box id="roi-report-printable" sx={{ p: 1, direction: isRTL ? 'rtl' : 'ltr' }}>
                            {/* Header Banner */}
                            <Paper elevation={0} sx={{
                                background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
                                color: '#fff', p: 3, borderRadius: 3, mb: 3
                            }}>
                                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 2, flexDirection: isRTL ? 'row-reverse' : 'row' }}>
                                    <Box sx={{ textAlign: isRTL ? 'right' : 'left' }}>
                                        <Typography variant="overline" sx={{ color: '#10b981', fontWeight: 'bold', letterSpacing: 3 }}>BIN GROUP</Typography>
                                        <Typography variant="h5" fontWeight="black" sx={{ letterSpacing: -1 }}>{t('roi.performance_summary')}</Typography>
                                        <Typography variant="body2" sx={{ color: '#94a3b8', mt: 0.5 }}>
                                            {new Date(report.periodStart).toLocaleDateString(lang === 'ar' ? 'ar-AE' : 'en-AE', { day: 'numeric', month: 'long', year: 'numeric' })} →{' '}
                                            {new Date(report.periodEnd).toLocaleDateString(lang === 'ar' ? 'ar-AE' : 'en-AE', { day: 'numeric', month: 'long', year: 'numeric' })}
                                        </Typography>
                                    </Box>
                                    <Box sx={{ textAlign: isRTL ? 'left' : 'right' }}>
                                        <Typography variant="caption" sx={{ color: '#64748b', display: 'block' }}>{t('roi.report_generated')}</Typography>
                                        <Typography variant="body2" sx={{ color: '#e2e8f0', fontWeight: 'bold' }}>
                                            {new Date(report.generatedAt).toLocaleString(lang === 'ar' ? 'ar-AE' : 'en-AE')}
                                        </Typography>
                                    </Box>
                                </Box>
                            </Paper>

                            {/* Headline verdict */}
                            <Alert
                                severity={headlineColor(report.slaComplianceRate) as any}
                                sx={{ mb: 3, fontWeight: 'bold', borderRadius: 2, textAlign: isRTL ? 'right' : 'left' }}
                            >
                                {report.trialSummary.headline}
                            </Alert>

                            {/* KPI Grid */}
                            <Grid container spacing={2} sx={{ mb: 3, flexDirection: isRTL ? 'row-reverse' : 'row' }}>
                                {[
                                    { label: t('roi.total_tickets'), value: report.totalTickets, unit: '', color: '#3b82f6' },
                                    { label: t('roi.tickets_resolved'), value: report.totalResolved, unit: '', color: '#10b981' },
                                    { label: t('roi.sla_compliance'), value: `${report.slaComplianceRate}%`, unit: '', color: report.slaComplianceRate >= 90 ? '#10b981' : report.slaComplianceRate >= 75 ? '#f59e0b' : '#ef4444' },
                                    { label: t('roi.avg_resolution'), value: `${report.avgResolutionHours}h`, unit: '', color: '#8b5cf6' },
                                    { label: t('roi.prevented_costs'), value: `${t('common.currency_aed')} ${report.totalPreventedCostAED.toLocaleString()}`, unit: '', color: '#10b981' },
                                    { label: t('roi.asset_health_score'), value: report.assetHealthScore != null ? `${report.assetHealthScore}/100` : 'N/A', unit: '', color: '#f59e0b' },
                                ].map(kpi => (
                                    <Grid item xs={6} sm={4} key={kpi.label}>
                                        <Paper elevation={0} sx={{ p: 2.5, borderRadius: 3, border: '1px solid #e2e8f0', height: '100%', textAlign: isRTL ? 'right' : 'left' }}>
                                            <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', display: 'block', mb: 0.5 }}>
                                                {kpi.label}
                                            </Typography>
                                            <Typography variant="h5" fontWeight="black" sx={{ color: kpi.color }}>
                                                {kpi.value}
                                            </Typography>
                                        </Paper>
                                    </Grid>
                                ))}
                            </Grid>

                            {/* Top Categories */}
                            {report.topCategories.length > 0 && (
                                <Paper elevation={0} sx={{ p: 2.5, borderRadius: 3, border: '1px solid #e2e8f0', mb: 3, textAlign: isRTL ? 'right' : 'left' }}>
                                    <Typography variant="subtitle2" fontWeight="bold" gutterBottom>{t('roi.top_categories')}</Typography>
                                    <Divider sx={{ mb: 1.5 }} />
                                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, flexDirection: isRTL ? 'row-reverse' : 'row' }}>
                                        {report.topCategories.map(([cat, count]) => (
                                            <Chip key={cat} label={`${cat}: ${t('roi.jobs_count', { count })}`} variant="outlined" size="small" />
                                        ))}
                                    </Box>
                                </Paper>
                            )}

                            {/* Recommendation */}
                            <Paper elevation={0} sx={{ p: 2.5, borderRadius: 3, bgcolor: '#f0fdf4', border: '1px solid #bbf7d0', textAlign: isRTL ? 'right' : 'left' }}>
                                <Typography variant="subtitle2" fontWeight="bold" color="#166534" gutterBottom>{t('roi.recommendation_title')}</Typography>
                                <Typography variant="body2" color="#15803d">{report.trialSummary.recommendation}</Typography>
                            </Paper>

                            {/* Print footer */}
                            <Box sx={{ mt: 4, pt: 2, borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', flexDirection: isRTL ? 'row-reverse' : 'row' }}>
                                <Typography variant="caption" color="text.disabled">{t('roi.confidential_footer')}</Typography>
                                <Typography variant="caption" color="text.disabled">{propertyName}</Typography>
                            </Box>
                        </Box>
                    )}
                </DialogContent>
            </Dialog>

            {/* Print styles */}
            <style>{`
                @media print {
                    body * { visibility: hidden; }
                    #roi-report-printable, #roi-report-printable * { visibility: visible; }
                    #roi-report-printable { position: fixed; left: 0; top: 0; width: 100%; }
                }
            `}</style>
        </>
    );
}

// admin-panel/src/pages/owners/OwnerDetailsPage.tsx
import React, { useState } from 'react';
import {
    Container,
    Typography,
    Box,
    Paper,
    Grid,
    Button,
    Chip,
    Divider,
    Alert,
    Stack,
    alpha,
} from '@mui/material';
import LockIcon from '@mui/icons-material/Lock';
import GavelIcon from '@mui/icons-material/Gavel';
import FilePresentIcon from '@mui/icons-material/FilePresent';
import ROIReportModal from '../../components/ROIReportModal';
import DigitalTwinTab from '../../components/DigitalTwinTab';
import { useLanguage } from '@bin/shared';

export default function OwnerDetailsPage() {
    const { t, isRTL } = useLanguage();
    const [isTerminated, setIsTerminated] = useState(false);

    const handleTerminate = () => {
        if (window.confirm(t('admin.terminate_confirm'))) {
            setIsTerminated(true);
        }
    };

    return (
        <Container maxWidth="lg" sx={{ py: 4, direction: isRTL ? 'rtl' : 'ltr' }}>
            <Box sx={{ mb: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexDirection: isRTL ? 'row-reverse' : 'row' }}>
                <Typography variant="h4" fontWeight="bold" sx={{ textAlign: isRTL ? 'right' : 'left' }}>
                    {t('admin.owner_profile', { name: 'Al-Mansoori Properties' })}
                </Typography>
                <Chip
                    label={isTerminated ? t('admin.terminated_locked') : t('admin.active_account')}
                    color={isTerminated ? "error" : "success"}
                />
            </Box>

            {isTerminated && (
                <Alert severity="error" sx={{ mb: 4, direction: isRTL ? 'rtl' : 'ltr' }} icon={<LockIcon />}>
                    {t('admin.data_sov_lock', { id: 'OWNER_045' })}
                </Alert>
            )}

            <Grid container spacing={3} sx={{ flexDirection: isRTL ? 'row-reverse' : 'row' }}>
                <Grid item xs={12} md={8}>
                    <Paper sx={{ p: 3, mb: 3 }}>
                        <Typography variant="h6" gutterBottom sx={{ textAlign: isRTL ? 'right' : 'left' }}>{t('admin.asset_overview')}</Typography>
                        <Divider sx={{ mb: 2 }} />
                        <Typography variant="body1" sx={{ textAlign: isRTL ? 'right' : 'left' }}>{t('admin.total_units_count', { count: 42 })}</Typography>
                        <Typography variant="body1" sx={{ textAlign: isRTL ? 'right' : 'left' }}>{t('admin.portfolio_value_count', { value: '142.5M' })}</Typography>
                        <Typography variant="body1" sx={{ mt: 2, fontWeight: 'bold', textAlign: isRTL ? 'right' : 'left' }}>
                            {t('admin.assets_tagged', { percent: 100 })}
                        </Typography>
                    </Paper>

                    {/* ── LAYER 4: 30-Day Trial ROI Report ── */}
                    <Paper sx={{ p: 3, mb: 3, border: '1px solid #7c3aed', bgcolor: '#faf5ff' }}>
                        <Typography variant="h6" sx={{ color: '#7c3aed', fontWeight: 'bold', textAlign: isRTL ? 'right' : 'left' }} gutterBottom>
                            {t('admin.client_perf_report')}
                        </Typography>
                        <Typography variant="body2" color="textSecondary" sx={{ mb: 2, textAlign: isRTL ? 'right' : 'left' }}>
                            {t('admin.client_perf_desc')}
                        </Typography>
                        <ROIReportModal
                            propertyId="OWNER_045"
                            propertyName="Al-Mansoori Properties"
                        />
                    </Paper>

                    {/* Task 5: Document Runner (Ejari Zip) */}
                    <Paper sx={{ p: 3, mb: 3, border: '1px solid #3b82f6', bgcolor: '#eff6ff' }}>
                        <Typography variant="h6" color="primary" sx={{ textAlign: isRTL ? 'right' : 'left' }} gutterBottom>{t('admin.ejari_integration')}</Typography>
                        <Typography variant="body2" color="textSecondary" sx={{ mb: 2, textAlign: isRTL ? 'right' : 'left' }}>
                            {t('admin.ejari_desc')}
                        </Typography>
                        <Button
                            variant="contained"
                            color="primary"
                            onClick={() => alert(t('admin.ejari_alert', { name: 'Al-Mansoori' }))}
                        >
                            {t('admin.gen_ejari_pkg')}
                        </Button>
                    </Paper>

                    <Paper sx={{ p: 3 }}>
                        <Typography variant="h6" gutterBottom sx={{ textAlign: isRTL ? 'right' : 'left' }}>{t('admin.legal_compliance')}</Typography>
                        <Divider sx={{ mb: 2 }} />
                        <Box sx={{ display: 'flex', gap: 2, mt: 2, flexDirection: isRTL ? 'row-reverse' : 'row' }}>
                            <Button startIcon={<FilePresentIcon />} variant="outlined">{t('admin.mgt_agreement')}</Button>
                            <Button startIcon={<GavelIcon />} variant="outlined">{t('admin.uaedds_auth')}</Button>
                        </Box>
                    </Paper>
                </Grid>

                <Grid item xs={12} md={4}>
                    <Paper sx={{ p: 3, border: '1px solid #fee2e2', mb: 3 }}>
                        <Typography variant="h6" color="error" gutterBottom sx={{ textAlign: isRTL ? 'right' : 'left' }}>{t('admin.account_security')}</Typography>
                        <Typography variant="body2" color="textSecondary" sx={{ mb: 3, textAlign: isRTL ? 'right' : 'left' }}>
                            {t('admin.revoke_desc')}
                        </Typography>
                        <Button
                            variant="contained"
                            color="error"
                            fullWidth
                            disabled={isTerminated}
                            onClick={handleTerminate}
                        >
                            {t('admin.terminate_lock_btn')}
                        </Button>
                    </Paper>

                    {/* Stage 6B: Admin Pricing Override Control */}
                    <Paper sx={{ p: 3, borderRadius: 4, bgcolor: 'rgba(2, 6, 23, 0.4)', border: `1px solid ${alpha('#DAA520', 0.3)}` }}>
                        <Typography variant="overline" sx={{ color: '#DAA520', fontWeight: 900, mb: 2, display: 'block' }}>
                            COMMERCIAL OVERRIDE (2026 MATRIX)
                        </Typography>
                        
                        <Box sx={{ mb: 2 }}>
                            <Typography variant="caption" color="textSecondary">Original Engine Quote</Typography>
                            <Typography variant="h6" sx={{ color: '#FFF' }}>AED 127,568</Typography>
                        </Box>

                        <Divider sx={{ my: 2, borderColor: 'rgba(255,255,255,0.05)' }} />

                        <Stack spacing={2}>
                            <Box>
                                <Typography variant="caption" color="textSecondary">SLA Tier Override</Typography>
                                <Chip label="ELITE" size="small" sx={{ ml: 1, bgcolor: '#DAA520', color: '#000', fontWeight: 900 }} />
                            </Box>
                            
                            <Box>
                                <Typography variant="caption" color="textSecondary">Payment Plan</Typography>
                                <Typography variant="body2" color="#FFF">Monthly (+6%)</Typography>
                            </Box>

                            <Button 
                                variant="outlined" 
                                fullWidth 
                                size="small"
                                sx={{ color: '#DAA520', borderColor: '#DAA520', fontWeight: 900, mt: 1 }}
                                onClick={() => alert("Strategic Override Triggered: Reason Required")}
                            >
                                APPLY STRATEGIC DISCOUNT
                            </Button>
                        </Stack>

                        <Box sx={{ mt: 3, p: 1.5, bgcolor: 'rgba(255,255,255,0.03)', borderRadius: 2 }}>
                            <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)', display: 'block' }}>
                                Last Override: 2026-05-02 14:50
                            </Typography>
                            <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)', display: 'block' }}>
                                Admin UID: ADMIN_001_CEO
                            </Typography>
                        </Box>
                    </Paper>
                </Grid>
            </Grid>
            <Box sx={{ mt: 5 }}>
                <Typography variant="h5" fontWeight="bold" sx={{ mb: 3, textAlign: isRTL ? 'right' : 'left' }}>🔩 {t('admin.digital_twin_registry')}</Typography>
                <DigitalTwinTab propertyId="prop_almansoori_01" readOnly={false} />
            </Box>
        </Container>
    );
}

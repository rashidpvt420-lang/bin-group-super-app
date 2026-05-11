import React from 'react';
import {
    Box,
    Typography,
    Grid,
    Paper,
    Button,
    Stack,
    Chip,
    Divider,
    alpha
} from '@mui/material';
import {
    ArrowRight,
    ArrowLeft,
    Check,
    PlusCircle,
    Wrench,
    Paintbrush,
    Sparkles,
    Trees,
    FileCheck
} from 'lucide-react';
import { useOnboardingStore } from '../../store/onboardingStore';
import { binThemeTokens } from '../../theme/binGroupTheme';
import { useLanguage } from '@bin/shared';
import { PRODUCTION_ADD_ONS, getAddOnText, formatAddOnPrice } from '../../data/addOnCatalog';

const categoryIcon: Record<string, React.ReactNode> = {
    maintenance: <Wrench size={16} />,
    renovation: <Paintbrush size={16} />,
    smart: <Sparkles size={16} />,
    outdoor: <Trees size={16} />,
    authority: <FileCheck size={16} />,
    fitout: <PlusCircle size={16} />,
};

const AddOnsStep: React.FC<{ onNext: () => void, onBack: () => void }> = ({ onNext, onBack }) => {
    const { selectedAddOns, toggleAddOn } = useOnboardingStore();
    const { t, tx, isRTL, lang } = useLanguage();
    const safeSelectedAddOns = Array.isArray(selectedAddOns) ? selectedAddOns : [];
    const selected = PRODUCTION_ADD_ONS.filter((a) => safeSelectedAddOns.includes(a.id));
    const selectedTotal = selected.reduce((sum, item) => sum + item.price, 0);

    return (
        <Box sx={{ py: 4 }} dir={isRTL ? 'rtl' : 'ltr'}>
            <Box sx={{ textAlign: 'center', mb: 6 }}>
                <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 950, letterSpacing: 4 }}>
                    {tx('onboarding.addons_title', 'PROPERTY SERVICE ADD-ONS')}
                </Typography>
                <Typography variant="h4" fontWeight="950" sx={{ mb: 1, color: '#FFF' }}>
                    {tx('onboarding.addons_subtitle', 'Select all additional services')}
                </Typography>
                <Typography variant="body1" sx={{ color: 'rgba(255,255,255,0.55)', maxWidth: 860, mx: 'auto' }}>
                    {tx('onboarding.addons_desc', 'Choose optional maintenance, renovation, fit-out, smart home, outdoor and authority/NOC services. These are part of the owner onboarding contract, not the AI Design Studio.')}
                </Typography>
            </Box>

            <Grid container spacing={4}>
                <Grid item xs={12} lg={8}>
                    <Grid container spacing={2}>
                        {PRODUCTION_ADD_ONS.map((addon) => {
                            const isSelected = safeSelectedAddOns.includes(addon.id);
                            const text = getAddOnText(addon, lang);
                            return (
                                <Grid item xs={12} key={addon.id}>
                                    <Paper
                                        onClick={() => toggleAddOn(addon.id)}
                                        sx={{
                                            p: { xs: 2.25, md: 3 },
                                            borderRadius: 5,
                                            cursor: 'pointer',
                                            bgcolor: isSelected ? alpha(binThemeTokens.gold, 0.09) : 'rgba(22,22,24,0.72)',
                                            border: '1px solid',
                                            borderColor: isSelected ? binThemeTokens.gold : 'rgba(255,255,255,0.07)',
                                            transition: 'all 0.2s ease',
                                            '&:hover': { borderColor: binThemeTokens.gold, bgcolor: alpha(binThemeTokens.gold, 0.07) }
                                        }}
                                    >
                                        <Stack direction={{ xs: 'column', md: isRTL ? 'row-reverse' : 'row' }} spacing={2.5} alignItems={{ xs: 'stretch', md: 'center' }} justifyContent="space-between">
                                            <Stack direction={isRTL ? 'row-reverse' : 'row'} spacing={2.25} alignItems="flex-start" sx={{ flex: 1 }}>
                                                <Box sx={{
                                                    width: 46,
                                                    height: 46,
                                                    borderRadius: 3,
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    bgcolor: isSelected ? binThemeTokens.gold : alpha(binThemeTokens.gold, 0.08),
                                                    color: isSelected ? '#000' : binThemeTokens.gold,
                                                    flexShrink: 0
                                                }}>
                                                    {categoryIcon[addon.category] || <PlusCircle size={16} />}
                                                </Box>
                                                <Box sx={{ textAlign: isRTL ? 'right' : 'left' }}>
                                                    <Stack direction={isRTL ? 'row-reverse' : 'row'} spacing={1} alignItems="center" flexWrap="wrap">
                                                        <Typography variant="subtitle1" sx={{ color: '#FFF', fontWeight: 950 }}>{text.name}</Typography>
                                                        <Chip size="small" label={addon.category.toUpperCase()} sx={{ height: 20, bgcolor: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.62)', fontWeight: 900, fontSize: 10 }} />
                                                    </Stack>
                                                    <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.58)', mt: 0.75, lineHeight: 1.6 }}>
                                                        {text.description}
                                                    </Typography>
                                                </Box>
                                            </Stack>

                                            <Stack direction={isRTL ? 'row-reverse' : 'row'} spacing={2} alignItems="center" justifyContent={{ xs: 'space-between', md: 'flex-end' }}>
                                                <Box sx={{ textAlign: isRTL ? 'left' : 'right', minWidth: 140 }}>
                                                    <Typography variant="h6" sx={{ color: '#FFF', fontWeight: 950 }}>{formatAddOnPrice(addon.price)}</Typography>
                                                    <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.42)', fontWeight: 800 }}>{tx('onboarding.annual', 'Annual')}</Typography>
                                                </Box>
                                                {isSelected ? <Check color={binThemeTokens.gold} size={24} strokeWidth={3} /> : <Box sx={{ width: 24, height: 24, borderRadius: '50%', border: '2px solid rgba(255,255,255,0.16)' }} />}
                                            </Stack>
                                        </Stack>
                                    </Paper>
                                </Grid>
                            );
                        })}
                    </Grid>
                </Grid>

                <Grid item xs={12} lg={4}>
                    <Paper sx={{ p: 4, borderRadius: 6, bgcolor: '#111112', border: `1px solid ${alpha(binThemeTokens.gold, 0.24)}`, position: { lg: 'sticky' }, top: 100 }}>
                        <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 950, letterSpacing: 2 }}>
                            {tx('onboarding.sovereign_stack', 'SELECTED SERVICES')}
                        </Typography>
                        <Typography variant="h6" fontWeight="950" sx={{ mb: 3, color: '#FFF' }}>
                            {tx('onboarding.selected_addons', 'Add-on summary')}
                        </Typography>

                        <Stack spacing={2} divider={<Divider sx={{ borderColor: 'rgba(255,255,255,0.06)' }} />}>
                            {selected.length ? selected.map((addon) => {
                                const text = getAddOnText(addon, lang);
                                return (
                                    <Box key={addon.id} sx={{ display: 'flex', justifyContent: 'space-between', gap: 2, flexDirection: isRTL ? 'row-reverse' : 'row' }}>
                                        <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.76)', fontWeight: 800, textAlign: isRTL ? 'right' : 'left' }}>{text.name}</Typography>
                                        <Typography variant="body2" fontWeight="950" sx={{ color: binThemeTokens.gold, whiteSpace: 'nowrap' }}>{formatAddOnPrice(addon.price)}</Typography>
                                    </Box>
                                );
                            }) : (
                                <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)' }}>
                                    {tx('onboarding.no_addons_selected', 'No optional add-on services selected yet.')}
                                </Typography>
                            )}

                            <Box sx={{ pt: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexDirection: isRTL ? 'row-reverse' : 'row' }}>
                                <Typography fontWeight="950" sx={{ color: '#FFF' }}>{tx('onboarding.total_annual', 'Total annual')}</Typography>
                                <Typography variant="h5" fontWeight="950" sx={{ color: binThemeTokens.gold }}>{formatAddOnPrice(selectedTotal)}</Typography>
                            </Box>
                        </Stack>

                        <Stack spacing={2} sx={{ mt: 6 }}>
                            <Button
                                variant="contained"
                                fullWidth
                                size="large"
                                onClick={onNext}
                                endIcon={isRTL ? <ArrowLeft /> : <ArrowRight />}
                                sx={{ bgcolor: binThemeTokens.gold, color: '#000', py: 2, fontWeight: 950, borderRadius: 3 }}
                            >
                                {tx('btn.next', 'Next')}
                            </Button>
                            <Button
                                variant="text"
                                fullWidth
                                onClick={onBack}
                                startIcon={isRTL ? <ArrowRight /> : <ArrowLeft />}
                                sx={{ color: 'rgba(255,255,255,0.55)', fontWeight: 800 }}
                            >
                                {tx('btn.back', 'Back')}
                            </Button>
                        </Stack>
                    </Paper>
                </Grid>
            </Grid>
        </Box>
    );
};

export default AddOnsStep;

import React from 'react';
import { Box, Button, Paper, Stack, Typography, alpha } from '@mui/material';
import { ArrowRight, ShieldCheck } from 'lucide-react';
import { binThemeTokens } from '../theme/binGroupTheme';
import { useLanguage } from '../context/LanguageContext';

/**
 * Legacy quote entry point.
 *
 * BIN GROUP pricing is server-authoritative. This component intentionally does
 * not estimate or fabricate commercial values from partial inputs. The verified
 * five-page onboarding flow collects the complete property profile and issues a
 * protected quote through previewOwnerInspectionQuote before allowing the Owner
 * to continue.
 */
const QuotingWizard: React.FC<{ onResult?: (result: any) => void }> = () => {
    const { t, isRTL } = useLanguage();

    const startVerifiedQuote = () => {
        window.location.assign('/onboarding');
    };

    return (
        <Box sx={{ direction: isRTL ? 'rtl' : 'ltr' }}>
            <Typography variant="h4" fontWeight="950" sx={{ color: '#FFF', mb: 1, letterSpacing: -1 }}>
                {t('quote.title') || 'Verified Property Quote'}
            </Typography>
            <Typography variant="body1" sx={{ color: binThemeTokens.textSecondary, mb: 4, maxWidth: 760 }}>
                BIN GROUP does not display estimated commercial figures from incomplete property data. Complete the secure property application so the protected server pricing engine can issue the current AED quote from your real property details.
            </Typography>

            <Paper sx={{
                p: { xs: 3, md: 4 },
                bgcolor: alpha(binThemeTokens.gold, 0.05),
                border: `1px solid ${alpha(binThemeTokens.gold, 0.25)}`,
                borderRadius: 5,
                maxWidth: 760,
            }}>
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={3} alignItems={{ xs: 'flex-start', sm: 'center' }}>
                    <Box sx={{ p: 1.5, borderRadius: 3, bgcolor: alpha(binThemeTokens.gold, 0.12), color: binThemeTokens.gold }}>
                        <ShieldCheck size={32} />
                    </Box>
                    <Box sx={{ flex: 1 }}>
                        <Typography variant="h6" fontWeight="950" color="#FFF">
                            Server-authoritative pricing only
                        </Typography>
                        <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.62)', mt: 0.75, lineHeight: 1.7 }}>
                            The verified quote is calculated only after the Owner account, property type, location, systems, service plan and supporting evidence are supplied. Missing data stays missing; it is never replaced with demo pricing.
                        </Typography>
                    </Box>
                </Stack>

                <Button
                    fullWidth
                    variant="contained"
                    size="large"
                    onClick={startVerifiedQuote}
                    endIcon={<ArrowRight size={18} />}
                    sx={{
                        mt: 4,
                        bgcolor: binThemeTokens.gold,
                        color: '#000',
                        fontWeight: 950,
                        py: 1.7,
                        borderRadius: 100,
                        boxShadow: `0 10px 30px ${alpha(binThemeTokens.gold, 0.25)}`,
                        '&:hover': { bgcolor: binThemeTokens.gold },
                    }}
                >
                    START VERIFIED PROPERTY QUOTE
                </Button>
            </Paper>
        </Box>
    );
};

export default QuotingWizard;

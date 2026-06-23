import React from 'react';
import { Box, Typography, Breadcrumbs, Link as MuiLink, alpha, CircularProgress, Stack, Button } from '@mui/material';
import { ChevronRight, Home, ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useLanguage } from '../../context/LanguageContext';
import { binThemeTokens } from '../../theme/binGroupTheme';

interface BrokerPageFrameProps {
    title: string;
    subtitle?: string;
    loading?: boolean;
    children: React.ReactNode;
    breadcrumbs?: { label: string; path?: string }[];
    actions?: React.ReactNode;
    showBack?: boolean;
}

const BrokerPageFrame: React.FC<BrokerPageFrameProps> = ({ 
    title, 
    subtitle, 
    loading = false, 
    children, 
    breadcrumbs = [],
    actions,
    showBack = false
}) => {
    const navigate = useNavigate();
    const { isRTL, t } = useLanguage();

    return (
        <Box sx={{ animation: 'fadeIn 0.5s ease-out' }}>
            {/* Header Area */}
            <Box sx={{ mb: 6 }}>
                <Stack 
                    direction={isRTL ? 'row-reverse' : 'row'} 
                    justifyContent="space-between" 
                    alignItems="flex-start"
                >
                    <Box>
                        <Stack direction={isRTL ? 'row-reverse' : 'row'} spacing={2} alignItems="center" sx={{ mb: 1 }}>
                            {showBack && (
                                <Button
                                    onClick={() => navigate(-1)}
                                    size="small"
                                    sx={{ color: binThemeTokens.textSecondary, minWidth: 0, p: 0.5 }}
                                >
                                    <ArrowLeft size={20} style={{ transform: isRTL ? 'rotate(180deg)' : 'none' }} />
                                </Button>
                            )}
                            <Typography
                                variant="overline"
                                sx={{
                                    color: binThemeTokens.gold,
                                    fontWeight: 950,
                                    letterSpacing: 4
                                }}
                            >
                                {t('dash.terminal.broker') || 'SOVEREIGN BROKERAGE'}
                            </Typography>
                        </Stack>
                        <Typography variant="h3" fontWeight="950" color={binThemeTokens.textPrimary} sx={{ letterSpacing: -1 }}>
                            {title}
                        </Typography>
                        {subtitle && (
                            <Typography variant="h6" sx={{ color: binThemeTokens.textSecondary, fontWeight: 800, mt: 1 }}>
                                {subtitle}
                            </Typography>
                        )}
                    </Box>
                    {actions && <Box>{actions}</Box>}
                </Stack>

                {breadcrumbs.length > 0 && (
                    <Breadcrumbs
                        separator={<ChevronRight size={14} style={{ transform: isRTL ? 'rotate(180deg)' : 'none', color: '#9CA3AF' }} />}
                        sx={{ mt: 2, '& .MuiBreadcrumbs-ol': { flexDirection: isRTL ? 'row-reverse' : 'row' } }}
                    >
                        <MuiLink
                            component="button"
                            onClick={() => navigate('/broker')}
                            sx={{ color: binThemeTokens.textSecondary, fontWeight: 800, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 0.5 }}
                        >
                            <Home size={14} /> {t('nav.dashboard') || 'DASHBOARD'}
                        </MuiLink>
                        {breadcrumbs.map((bc, idx) => (
                            <Typography
                                key={idx}
                                sx={{
                                    color: idx === breadcrumbs.length - 1 ? binThemeTokens.gold : binThemeTokens.textSecondary,
                                    fontWeight: 900,
                                    fontSize: '0.8rem'
                                }}
                            >
                                {bc.label}
                            </Typography>
                        ))}
                    </Breadcrumbs>
                )}
            </Box>

            {/* Content Area */}
            {loading ? (
                <Box sx={{ display: 'flex', justifyContent: 'center', py: 20 }}>
                    <CircularProgress sx={{ color: binThemeTokens.gold }} />
                </Box>
            ) : (
                children
            )}
        </Box>
    );
};

export default BrokerPageFrame;

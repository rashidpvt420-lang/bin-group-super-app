import React from 'react';
import { Box, Container, Typography, Paper } from '@mui/material';
import { binThemeTokens } from '../../theme/binGroupTheme';
import { useLanguage } from '../../context/LanguageContext';

const PrivacyPage: React.FC = () => {
    const { t, isRTL } = useLanguage();

    return (
        <Box sx={{ minHeight: '100vh', bgcolor: '#000', py: 8, direction: isRTL ? 'rtl' : 'ltr' }}>
            <Container maxWidth="md">
                <Paper sx={{ p: 6, bgcolor: 'rgba(255,255,255,0.02)', border: '1px solid rgba(198,167,94,0.1)', borderRadius: 4 }}>
                    <Typography variant="h3" fontWeight="900" sx={{ color: binThemeTokens.gold, mb: 4, textAlign: isRTL ? 'right' : 'left' }}>
                        {t('privacy.title')}
                    </Typography>
                    <Typography variant="body1" sx={{ color: '#fff', mb: 2, textAlign: isRTL ? 'right' : 'left' }}>
                        {t('privacy.last_updated')}
                    </Typography>
                    <Typography variant="body1" sx={{ color: binThemeTokens.textSecondary, mb: 4, textAlign: isRTL ? 'right' : 'left' }}>
                        {t('privacy.intro')}
                    </Typography>
                    
                    <Typography variant="h5" sx={{ color: binThemeTokens.gold, mt: 4, mb: 2, textAlign: isRTL ? 'right' : 'left' }}>
                        {t('privacy.section1.title')}
                    </Typography>
                    <Typography variant="body2" sx={{ color: binThemeTokens.textSecondary, mb: 2, textAlign: isRTL ? 'right' : 'left' }}>
                        {t('privacy.section1.desc')}
                    </Typography>

                    <Typography variant="h5" sx={{ color: binThemeTokens.gold, mt: 4, mb: 2, textAlign: isRTL ? 'right' : 'left' }}>
                        {t('privacy.section2.title')}
                    </Typography>
                    <Typography variant="body2" sx={{ color: binThemeTokens.textSecondary, mb: 2, textAlign: isRTL ? 'right' : 'left' }}>
                        {t('privacy.section2.desc')}
                    </Typography>

                    <Typography variant="h5" sx={{ color: binThemeTokens.gold, mt: 4, mb: 2, textAlign: isRTL ? 'right' : 'left' }}>
                        {t('privacy.section3.title')}
                    </Typography>
                    <Typography variant="body2" sx={{ color: binThemeTokens.textSecondary, textAlign: isRTL ? 'right' : 'left' }}>
                        {t('privacy.contact_info')}
                    </Typography>
                </Paper>
            </Container>
        </Box>
    );
};

export default PrivacyPage;

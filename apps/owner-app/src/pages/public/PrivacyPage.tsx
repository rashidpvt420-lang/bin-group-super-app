import React from 'react';
import { Box, Container, Typography, Paper } from '@mui/material';
import { binThemeTokens } from '../../theme/binGroupTheme';

const PrivacyPage: React.FC = () => {
    return (
        <Box sx={{ minHeight: '100vh', bgcolor: '#000', py: 8 }}>
            <Container maxWidth="md">
                <Paper sx={{ p: 6, bgcolor: 'rgba(255,255,255,0.02)', border: '1px solid rgba(198,167,94,0.1)', borderRadius: 4 }}>
                    <Typography variant="h3" fontWeight="900" sx={{ color: binThemeTokens.gold, mb: 4 }}>Privacy Policy</Typography>
                    <Typography variant="body1" sx={{ color: '#fff', mb: 2 }}>
                        Last Updated: March 2026
                    </Typography>
                    <Typography variant="body1" sx={{ color: binThemeTokens.textSecondary, mb: 4 }}>
                        BIN-GROUP UAE ("we", "us", or "our") is committed to protecting the privacy and security of your institutional and asset data. This Privacy Policy describes how we collect, use, and share your personal information.
                    </Typography>
                    
                    <Typography variant="h5" sx={{ color: binThemeTokens.gold, mt: 4, mb: 2 }}>1. Data Collection</Typography>
                    <Typography variant="body2" sx={{ color: binThemeTokens.textSecondary, mb: 2 }}>
                        We collect asset identifiers, administrative contact information, and financial transaction metadata required for the operation of the BIN-GENESIS™ PropTech ecosystem.
                    </Typography>

                    <Typography variant="h5" sx={{ color: binThemeTokens.gold, mt: 4, mb: 2 }}>2. Sovereign Security</Typography>
                    <Typography variant="body2" sx={{ color: binThemeTokens.textSecondary, mb: 2 }}>
                        All data is encrypted using AES-256 standards and stored in ISO-certified data centers. We never sell your data to third-party advertisers.
                    </Typography>

                    <Typography variant="h5" sx={{ color: binThemeTokens.gold, mt: 4, mb: 2 }}>3. Contact</Typography>
                    <Typography variant="body2" sx={{ color: binThemeTokens.textSecondary }}>
                        For privacy inquiries, contact: compliance@bin-group.ae
                    </Typography>
                </Paper>
            </Container>
        </Box>
    );
};

export default PrivacyPage;

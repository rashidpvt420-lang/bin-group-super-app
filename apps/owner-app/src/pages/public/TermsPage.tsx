import React from 'react';
import { Box, Container, Typography, Paper } from '@mui/material';
import { binThemeTokens } from '../../theme/binGroupTheme';

const TermsPage: React.FC = () => {
    return (
        <Box sx={{ minHeight: '100vh', bgcolor: '#000', py: 8 }}>
            <Container maxWidth="md">
                <Paper sx={{ p: 6, bgcolor: 'rgba(255,255,255,0.02)', border: '1px solid rgba(198,167,94,0.1)', borderRadius: 4 }}>
                    <Typography variant="h3" fontWeight="900" sx={{ color: binThemeTokens.gold, mb: 4 }}>Terms of Service</Typography>
                    <Typography variant="body1" sx={{ color: '#fff', mb: 2 }}>
                        Agreement for Sovereign Asset Management
                    </Typography>
                    <Typography variant="body1" sx={{ color: binThemeTokens.textSecondary, mb: 4 }}>
                        Welcome to the BIN-GENESIS™ PropTech ecosystem. By accessing or using our services, you agree to be bound by these Terms of Service.
                    </Typography>
                    
                    <Typography variant="h5" sx={{ color: binThemeTokens.gold, mt: 4, mb: 2 }}>1. Institutional Platform</Typography>
                    <Typography variant="body2" sx={{ color: binThemeTokens.textSecondary, mb: 2 }}>
                        Access to the BIN-GROUP portals (Owner, Tenant, Technician, Broker, Auditor) is limited to authorized representatives of the asset owner.
                    </Typography>

                    <Typography variant="h5" sx={{ color: binThemeTokens.gold, mt: 4, mb: 2 }}>2. Asset Integrity</Typography>
                    <Typography variant="body2" sx={{ color: binThemeTokens.textSecondary, mb: 2 }}>
                        You are responsible for the accuracy of all asset data provided during the intake process. BIN-GROUP is not responsible for errors in automated yield metrics caused by inaccurate input.
                    </Typography>

                    <Typography variant="h5" sx={{ color: binThemeTokens.gold, mt: 4, mb: 2 }}>3. Termination</Typography>
                    <Typography variant="body2" sx={{ color: binThemeTokens.textSecondary }}>
                        BIN-GROUP reserves the right to terminate access if security or financial protocols are breached.
                    </Typography>
                </Paper>
            </Container>
        </Box>
    );
};

export default TermsPage;

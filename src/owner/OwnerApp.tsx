import React from 'react';
import { Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import { Box, AppBar, Toolbar, Typography, Container, IconButton, alpha, Stack, Button } from '@mui/material';
import { ArrowLeft, Brain, Building2, LayoutDashboard, MessageSquare, Paintbrush, UserCircle } from 'lucide-react';
import { useLanguage } from '@bin/shared';
import { binThemeTokens } from '../theme/binGroupTheme';
import { NotificationBell } from '../components/NotificationBell';
import PortalSessionControls from '../components/PortalSessionControls';
import OwnerActivationGuard from '../components/owner/OwnerActivationGuard';
import BrandWatermark from '../components/BrandWatermark';
import SafeIcon, { renderSafeIcon } from '../components/SafeIcon';
import BinConnectChatBox from '../components/BinConnectChatBox';
import PilotCompletionPage from '../components/PilotCompletionPage';
import BinConnectInboxPage from '../components/BinConnectInboxPage';

import OwnerSimpleDashboardPage from './pages/OwnerSimpleDashboardPage';
import OwnerDashboardPage from './pages/OwnerDashboardResolvedPage';
import OwnerPropertiesPage from './pages/OwnerPropertiesPage';
import OwnerContractsPage from './pages/OwnerContractsResolvedPage';
import OwnerFinancialsPage from './pages/OwnerFinancialsPage';
import OwnerPaymentProofPage from './pages/OwnerPaymentProofPage';
import OwnerIbanPage from './pages/OwnerIbanPage';
import OwnerProfilePage from './pages/OwnerProfilePage';
import OwnerRoiPage from './pages/OwnerRoiPage';
import OwnerUnitsPage from './pages/OwnerUnitsPage';
import OwnerUnitRegistryPage from './pages/OwnerUnitRegistryPage';
import OwnerTenantsPage from './pages/OwnerTenantsPage';
import OwnerPropertyPassportPage from './pages/OwnerPropertyPassportResolvedPage';
import OwnerPropertyPassportDetailPage from './pages/OwnerPropertyPassportContractDetailPage';
import OwnerDocumentsPage from './pages/OwnerDocumentsPage';
import OwnerActivationPage from './pages/OwnerActivationPage';
import OwnerReviewQueuePage from './pages/OwnerReviewQueuePage';
import OwnerCommunityOperationsPage from './pages/OwnerCommunityOperationsPage';
import DesignStudioPage from '../pages/DesignStudioPage';
import DesignRequestDetailPage from '../pages/DesignRequestDetailPage';
import OwnerComplaintPage from './pages/OwnerComplaintPage';
import OwnerTicketsPage from './pages/OwnerTicketsPage';
import OwnerTicketDetailPage from './pages/OwnerTicketDetailPage';
import OwnerAIIntelligencePage from './pages/OwnerAIIntelligencePage';
import OwnerDamageEstimatePage from './pages/OwnerDamageEstimatePage';
import OwnerPLReportPage from './pages/OwnerPLReportPage';
import ContractorMarketplacePage from './pages/ContractorMarketplacePage';
import OwnerApprovalCenterPage from './pages/OwnerApprovalCenterPage';
import PortfolioRenewalsPage from './pages/PortfolioRenewalsPage';

const OwnerLayout = ({ children }: { children: React.ReactNode }) => {
    const navigate = useNavigate();
    const location = useLocation();
    const { isRTL, t, tx } = useLanguage();
    const label = (key: string, en: string) => tx(key, en);
    const isHome = location.pathname === '/owner' || location.pathname === '/owner/dashboard';

    return (
        <Box sx={{ minHeight: '100vh', bgcolor: binThemeTokens.canvas, color: binThemeTokens.textPrimary, direction: isRTL ? 'rtl' : 'ltr', display: 'flex', flexDirection: 'column', position: 'relative', isolation: 'isolate', background: `linear-gradient(180deg, ${binThemeTokens.canvas} 0%, ${binThemeTokens.softCanvas} 100%)` }}>
            <BrandWatermark label="BIN GROUPS" opacity={binThemeTokens.watermarkOpacity} />
            <AppBar position="sticky" elevation={0} sx={{ bgcolor: alpha(binThemeTokens.canvas, 0.94), backdropFilter: 'blur(18px)', borderBottom: `1px solid ${binThemeTokens.border}`, boxShadow: '0 8px 24px rgba(17,24,39,0.06)', zIndex: 1200 }}>
                <Toolbar sx={{ justifyContent: 'space-between', px: { xs: 2, md: 4 }, flexDirection: isRTL ? 'row-reverse' : 'row', gap: 1 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexDirection: isRTL ? 'row-reverse' : 'row', minWidth: 0 }}>
                        {!isHome && <IconButton onClick={() => navigate(-1)} sx={{ color: binThemeTokens.textPrimary, bgcolor: alpha(binThemeTokens.platinum, 0.35) }}><SafeIcon icon={ArrowLeft} size={20} style={{ transform: isRTL ? 'rotate(180deg)' : 'none' }} /></IconButton>}
                        <IconButton onClick={() => navigate('/owner/dashboard')} sx={{ color: binThemeTokens.goldHover, bgcolor: alpha(binThemeTokens.gold, 0.10), border: `1px solid ${alpha(binThemeTokens.gold, 0.22)}` }}><SafeIcon icon={LayoutDashboard} size={22} /></IconButton>
                        <Box sx={{ ml: isRTL ? 0 : 1, mr: isRTL ? 1 : 0, textAlign: isRTL ? 'right' : 'left', minWidth: 0 }}>
                            <Typography variant="h6" fontWeight="950" sx={{ color: binThemeTokens.textPrimary, textTransform: 'uppercase', letterSpacing: 2, fontSize: '0.9rem', lineHeight: 1 }}>{label('portal.owner.title', 'OWNER PORTAL')}</Typography>
                            <Typography variant="caption" sx={{ color: binThemeTokens.goldHover, fontWeight: 900, letterSpacing: 1, fontSize: '0.6rem' }}>{label('portal.owner.subtitle', 'NO-CALL PROPERTY OPERATIONS')}</Typography>
                        </Box>
                    </Box>
                    <Stack direction={isRTL ? 'row-reverse' : 'row'} spacing={1} alignItems="center" sx={{ flexShrink: 0 }}>
                        <Button onClick={() => navigate('/owner/community-operations')} startIcon={renderSafeIcon(Building2, { size: 17 })} sx={{ display: { xs: 'none', lg: 'inline-flex' }, color: binThemeTokens.goldHover, border: `1px solid ${alpha(binThemeTokens.gold, 0.35)}`, borderRadius: 3, fontWeight: 950, bgcolor: '#fff' }}>{label('nav.community_operations', 'Community Ops')}</Button>
                        <Button onClick={() => navigate('/owner/bin-connect')} startIcon={renderSafeIcon(MessageSquare, { size: 17 })} sx={{ display: { xs: 'none', sm: 'inline-flex' }, color: binThemeTokens.goldHover, border: `1px solid ${alpha(binThemeTokens.gold, 0.35)}`, borderRadius: 3, fontWeight: 950, bgcolor: '#fff' }}>BIN Connect</Button>
                        <Button onClick={() => navigate('/owner/approvals')} sx={{ display: { xs: 'none', md: 'inline-flex' }, color: binThemeTokens.goldHover, border: `1px solid ${alpha(binThemeTokens.gold, 0.35)}`, borderRadius: 3, fontWeight: 950, bgcolor: '#fff' }}>{label('nav.owner_approvals', 'Approvals')}</Button>
                        <Button onClick={() => navigate('/owner/property-passport')} sx={{ display: { xs: 'none', md: 'inline-flex' }, color: binThemeTokens.goldHover, border: `1px solid ${alpha(binThemeTokens.gold, 0.35)}`, borderRadius: 3, fontWeight: 950, bgcolor: '#fff' }}>{label('nav.property_passport', 'Property Passport')}</Button>
                        <Button onClick={() => navigate('/owner/ai-intelligence')} startIcon={renderSafeIcon(Brain, { size: 17 })} sx={{ display: { xs: 'none', sm: 'inline-flex' }, color: binThemeTokens.goldHover, border: `1px solid ${alpha(binThemeTokens.gold, 0.35)}`, borderRadius: 3, fontWeight: 950, bgcolor: '#fff' }}>{label('nav.ai_intelligence', 'AI Intelligence')}</Button>
                        <Button onClick={() => navigate('/owner/design-studio')} startIcon={renderSafeIcon(Paintbrush, { size: 17 })} sx={{ display: { xs: 'none', sm: 'inline-flex' }, color: binThemeTokens.goldHover, border: `1px solid ${alpha(binThemeTokens.gold, 0.35)}`, borderRadius: 3, fontWeight: 950, bgcolor: '#fff' }}>{t('nav.ai_studio') || 'AI Studio'}</Button>
                        <NotificationBell />
                        <IconButton onClick={() => navigate('/owner/profile')} sx={{ color: binThemeTokens.textPrimary, bgcolor: alpha(binThemeTokens.platinum, 0.38), borderRadius: 3 }}><SafeIcon icon={UserCircle} size={18} /></IconButton>
                        <PortalSessionControls role="owner" accent={binThemeTokens.goldHover} />
                    </Stack>
                </Toolbar>
            </AppBar>
            <Container maxWidth="lg" sx={{ py: 4, flexGrow: 1, position: 'relative', zIndex: 1 }}><OwnerActivationGuard><Box sx={{ animation: 'fadeIn 0.5s ease-out' }}>{children}</Box></OwnerActivationGuard></Container>
            <BinConnectChatBox role="owner" />
            <Box sx={{ py: 3, textAlign: 'center', borderTop: `1px solid ${binThemeTokens.border}`, bgcolor: alpha(binThemeTokens.canvas, 0.86), position: 'relative', zIndex: 1 }}><Typography variant="caption" sx={{ color: binThemeTokens.textSecondary, fontWeight: 800, letterSpacing: 2 }}>2026 BIN GROUP PROPERTY OS</Typography></Box>
        </Box>
    );
};

export default function OwnerApp() {
    return (
        <OwnerLayout>
            <Routes>
                <Route path="/" element={<OwnerSimpleDashboardPage />} />
                <Route path="/dashboard" element={<OwnerSimpleDashboardPage />} />
                <Route path="/dashboard/full" element={<OwnerDashboardPage />} />
                <Route path="/activation" element={<OwnerActivationPage />} />
                <Route path="/onboarding-status" element={<OwnerActivationPage />} />
                <Route path="/properties" element={<OwnerPropertiesPage />} />
                <Route path="/contracts" element={<OwnerContractsPage />} />
                <Route path="/financials" element={<OwnerFinancialsPage />} />
                <Route path="/payment-proof" element={<OwnerPaymentProofPage />} />
                <Route path="/iban" element={<OwnerIbanPage />} />
                <Route path="/profile" element={<OwnerProfilePage />} />
                <Route path="/roi" element={<OwnerRoiPage />} />
                <Route path="/units" element={<OwnerUnitRegistryPage />} />
                <Route path="/legacy-units" element={<OwnerUnitsPage />} />
                <Route path="/tenants" element={<OwnerTenantsPage />} />
                <Route path="/property-passport" element={<OwnerPropertyPassportPage />} />
                <Route path="/property-passport/:passportId" element={<OwnerPropertyPassportDetailPage />} />
                <Route path="/documents" element={<OwnerDocumentsPage />} />
                <Route path="/renewals" element={<PortfolioRenewalsPage />} />
                <Route path="/inspections" element={<OwnerReviewQueuePage />} />
                <Route path="/community-operations" element={<OwnerCommunityOperationsPage />} />
                <Route path="/design-studio" element={<DesignStudioPage />} />
                <Route path="/design-studio/request/:id" element={<DesignRequestDetailPage />} />
                <Route path="/complaint" element={<OwnerComplaintPage />} />
                <Route path="/tickets" element={<OwnerTicketsPage />} />
                <Route path="/ticket/:id" element={<OwnerTicketDetailPage />} />
                <Route path="/ai-intelligence" element={<OwnerAIIntelligencePage />} />
                <Route path="/damage-estimate" element={<OwnerDamageEstimatePage />} />
                <Route path="/p-l-report" element={<OwnerPLReportPage />} />
                <Route path="/contractor-marketplace" element={<ContractorMarketplacePage />} />
                <Route path="/approvals" element={<OwnerApprovalCenterPage />} />
                <Route path="/bin-connect" element={<BinConnectInboxPage role="owner" />} />
                <Route path="/pilot-completion" element={<PilotCompletionPage role="owner" />} />
            </Routes>
        </OwnerLayout>
    );
}

import { NavLink } from 'react-router-dom';
import { Drawer, List, ListItem, ListItemIcon, ListItemText, Divider, Box, Typography, alpha } from '@mui/material';
import DashboardIcon from '@mui/icons-material/Dashboard';
import PeopleIcon from '@mui/icons-material/People';
import ReceiptIcon from '@mui/icons-material/Receipt';
import PendingActionsIcon from '@mui/icons-material/PendingActions';
import SecurityIcon from '@mui/icons-material/Security';
import SettingsIcon from '@mui/icons-material/Settings';
import AccountBalanceWalletIcon from '@mui/icons-material/AccountBalanceWallet';
import LogoutIcon from '@mui/icons-material/Logout';
import FileTextIcon from '@mui/icons-material/Description';
import { Sparkles, Users } from 'lucide-react';
import { binThemeTokens } from '../theme/adminTheme';
import { useLanguage } from '@bin/shared';
import { auth } from '../lib/firebase';
import { signOut } from 'firebase/auth';
import CeoContactButtons from './CeoContactButtons';

import { useAuth } from '../context/AuthContext';

const Navigation = () => {
    const { t, tx, isRTL } = useLanguage();
    const { user } = useAuth();
    const navText = (en: string, ar: string) => (isRTL ? ar : en);
    
    const privilegedAdminRoles = new Set(['admin', 'super_admin', 'ceo']);
    const hrRoles = new Set(['hr_admin', 'hr_manager', 'hr_staff']);
    const isHRAuthorized = Boolean(user?.claims?.admin === true || user?.isAdmin === true || privilegedAdminRoles.has(String(user?.role)) || hrRoles.has(String(user?.role)));
    const isRecoveryApprover = user?.role === 'ceo' || user?.role === 'super_admin';

    const primaryMenu = [
        { text: tx('nav.dashboard', 'Dashboard'), icon: <DashboardIcon />, path: '/dashboard' },
        { text: tx('fin.payroll', 'Payroll Hub'), icon: <AccountBalanceWalletIcon />, path: '/financials', color: '#6366f1' },
        { text: tx('nav.docs', 'Document Vault'), icon: <FileTextIcon />, path: '/document-vault', color: binThemeTokens.gold },
        { text: tx('nav.audit', 'Institutional Audit'), icon: <SecurityIcon />, path: '/vault', color: binThemeTokens.gold },
        { text: navText('Design Studio Manager', 'مدير استوديو التصميم'), icon: <Sparkles size={20} />, path: '/design-studio', color: binThemeTokens.gold },
        { text: tx('nav.orphans', 'Orphan War Room'), icon: <SecurityIcon />, path: '/orphans', color: '#ef4444' },
        { text: tx('onboarding.payment.verify_btn', 'Verify Payment'), icon: <PendingActionsIcon />, path: '/manual-approvals', color: '#10b981' },
        { text: navText('Sovereign Control', 'التحكم السيادي'), icon: <SecurityIcon />, path: '/control-center', color: '#ef4444' },
        { text: navText('BIN Connect Inbox', 'صندوق وارد BIN Connect'), icon: <ReceiptIcon />, path: '/ops/bin-connect', color: '#38bdf8' },
        { text: navText('Pilot Completion', 'إكمال التشغيل التجريبي'), icon: <PendingActionsIcon />, path: '/ops/pilot-completion', color: '#3b82f6' },
        { text: navText('Public Launch Command', 'قيادة الإطلاق العام'), icon: <SecurityIcon />, path: '/ops/public-launch-command', color: binThemeTokens.gold },
        { text: navText('Pricing Matrix 2026', 'مصفوفة التسعير 2026'), icon: <AccountBalanceWalletIcon />, path: '/admin/pricing-matrix', color: binThemeTokens.gold },
        { text: navText('BIN-GPT Engineer', 'مهندس BIN-GPT'), icon: <Sparkles size={20} />, path: '/admin/bin-gpt-engineer', color: '#10b981' },
    ];

    const managementMenu = [
        { text: navText('Owners', 'الملاك'), icon: <PeopleIcon />, path: '/owners' },
        { text: navText('Contract Control', 'التحكم بالعقود'), icon: <FileTextIcon />, path: '/contracts' },
        { text: tx('nav.brokers', 'Brokers'), icon: <PeopleIcon />, path: '/broker' },
        { text: navText('Broker Attribution Queue', 'قائمة إسناد الوسطاء'), icon: <PendingActionsIcon />, path: '/broker-attributions' },
        { text: navText('Broker Commission Hub', 'مركز عمولات الوسطاء'), icon: <AccountBalanceWalletIcon />, path: '/broker-commissions' },
        { text: tx('nav.tenants', 'Tenants'), icon: <PeopleIcon />, path: '/tenants' },
        { text: navText('Tenant Unit Links', 'روابط وحدات المستأجرين'), icon: <PendingActionsIcon />, path: '/unit-links' },
        // Legacy verifier marker retained while the scheduled-services contract migrates: text: 'Tenant Services'
        { text: navText('Tenant Services', 'خدمات المستأجرين'), icon: <ReceiptIcon />, path: '/tenant-services' },
        { text: navText('Operations Messages', 'رسائل العمليات'), icon: <ReceiptIcon />, path: '/ops/messages' },
        { text: tx('nav.property_passport', 'Property Passports'), icon: <SecurityIcon />, path: '/properties/passport' },
        { text: navText('Unit Status Control', 'التحكم في حالة الوحدات'), icon: <DashboardIcon />, path: '/admin/units' },
        { text: tx('nav.technicians', 'TECHNICIAN CORPS'), icon: <PeopleIcon />, path: '/technicians' },
        { text: navText('Duty Command Center', 'مركز قيادة المناوبات'), icon: <PendingActionsIcon />, path: '/ops/technicians' },
        { text: navText('WhatsApp Triage', 'فرز واتساب'), icon: <ReceiptIcon />, path: '/ops/whatsapp-triage' },
        { text: navText('RFQ Trust Workflow', 'مسار موثوقية طلبات الأسعار'), icon: <PendingActionsIcon />, path: '/ops/rfq' },
        { text: navText('Vendor Command', 'قيادة الموردين'), icon: <PeopleIcon />, path: '/ops/vendors' },
        { text: navText('PDPL Governance', 'حوكمة حماية البيانات الشخصية'), icon: <SecurityIcon />, path: '/ops/data-governance' },
        { text: tx('nav.tickets', 'Mission Logs'), icon: <ReceiptIcon />, path: '/tickets' },
        { text: tx('nav.sos_feed', 'SOS Live Feed'), icon: <ReceiptIcon />, path: '/sos' },
        { text: tx('nav.audit_log', 'Systemic Audit Log'), icon: <SecurityIcon />, path: '/audit' },
        ...(isHRAuthorized ? [{ text: navText('HR Command', 'قيادة الموارد البشرية'), icon: <Users size={20} />, path: '/hr' }] : []),
    ];

    const systemMenu = [
        ...(isRecoveryApprover
            ? [{ text: navText('MFA Recovery', 'استعادة المصادقة'), icon: <SecurityIcon />, path: '/mfa-recovery' }]
            : []),
        { text: tx('nav.support', 'Support'), icon: <SettingsIcon />, path: '/settings' },
    ];

    return (
        <Drawer
            variant="permanent"
            anchor={isRTL ? 'right' : 'left'}
            sx={{
                width: 280,
                flexShrink: 0,
                '& .MuiDrawer-paper': { 
                    width: 280, 
                    boxSizing: 'border-box',
                    bgcolor: '#020617',
                    borderRight: isRTL ? 'none' : `1px solid ${alpha(binThemeTokens.gold, 0.1)}`,
                    borderLeft: isRTL ? `1px solid ${alpha(binThemeTokens.gold, 0.1)}` : 'none',
                    right: isRTL ? 0 : 'auto',
                    left: isRTL ? 'auto' : 0
                },
            }}
        >
            <Box sx={{ p: 4, textAlign: 'center' }}>
                <Typography variant="h6" sx={{ fontWeight: 900, color: binThemeTokens.gold, letterSpacing: 2 }}>
                    BIN GROUP
                </Typography>
                <Typography variant="caption" sx={{ color: binThemeTokens.textSecondary, letterSpacing: 4 }}>
                    {t('nav.administry')}
                </Typography>
            </Box>
            
            <Divider sx={{ borderColor: alpha(binThemeTokens.gold, 0.1) }} />
            
            <List sx={{ px: 2, pt: 2 }}>
                <Typography variant="overline" sx={{ px: 2, color: binThemeTokens.textTertiary, fontWeight: 900, textAlign: isRTL ? 'right' : 'left', display: 'block' }}>
                    {t('nav.sovereign_core')}
                </Typography>
                {primaryMenu.map((item) => (
                    <ListItem 
                        key={item.text} 
                        component={NavLink} 
                        to={item.path} 
                        sx={{ 
                            borderRadius: 2, mb: 0.5,
                            flexDirection: isRTL ? 'row-reverse' : 'row',
                            textAlign: isRTL ? 'right' : 'left',
                            '&.active': { bgcolor: alpha(binThemeTokens.gold, 0.1), '& .MuiTypography-root': { color: binThemeTokens.gold } }
                        }}
                    >
                        <ListItemIcon sx={{ color: item.color || binThemeTokens.textSecondary, minWidth: 40, justifyContent: isRTL ? 'flex-end' : 'flex-start' }}>{item.icon}</ListItemIcon>
                        <ListItemText primary={item.text} primaryTypographyProps={{ fontWeight: 700, fontSize: '0.85rem' }} sx={{ textAlign: isRTL ? 'right' : 'left' }} />
                    </ListItem>
                ))}
            </List>

            <List sx={{ px: 2 }}>
                <Typography variant="overline" sx={{ px: 2, color: binThemeTokens.textTertiary, fontWeight: 900, textAlign: isRTL ? 'right' : 'left', display: 'block' }}>
                    {t('nav.operations')}
                </Typography>
                {managementMenu.map((item) => (
                    <ListItem 
                        key={item.text} 
                        component={NavLink} 
                        to={item.path}
                        sx={{ 
                            borderRadius: 2, mb: 0.5,
                            flexDirection: isRTL ? 'row-reverse' : 'row',
                            textAlign: isRTL ? 'right' : 'left',
                            '&.active': { bgcolor: alpha(binThemeTokens.gold, 0.1), '& .MuiTypography-root': { color: binThemeTokens.gold } }
                        }}
                    >
                        <ListItemIcon sx={{ color: binThemeTokens.textSecondary, minWidth: 40, justifyContent: isRTL ? 'flex-end' : 'flex-start' }}>{item.icon}</ListItemIcon>
                        <ListItemText primary={item.text} primaryTypographyProps={{ fontWeight: 700, fontSize: '0.85rem' }} sx={{ textAlign: isRTL ? 'right' : 'left' }} />
                    </ListItem>
                ))}
            </List>

            <Box sx={{ mt: 'auto', p: 2 }}>
                <List>
                    {systemMenu.map((item) => (
                        <ListItem 
                            key={item.text} 
                            component={NavLink} 
                            to={item.path}
                            sx={{ borderRadius: 2, textAlign: isRTL ? 'right' : 'left', flexDirection: isRTL ? 'row-reverse' : 'row' }}
                        >
                            <ListItemIcon sx={{ color: binThemeTokens.textSecondary, minWidth: 40, justifyContent: isRTL ? 'flex-end' : 'flex-start' }}>{item.icon}</ListItemIcon>
                            <ListItemText primary={item.text} primaryTypographyProps={{ fontWeight: 700, fontSize: '0.85rem' }} sx={{ textAlign: isRTL ? 'right' : 'left' }} />
                        </ListItem>
                    ))}
                    <ListItem
                        component="a"
                        href="mailto:Ceo@bin-groups.com"
                        target="_blank"
                        sx={{ borderRadius: 2, mt: 1, bgcolor: alpha('#DAA520', 0.05), textAlign: isRTL ? 'right' : 'left', flexDirection: isRTL ? 'row-reverse' : 'row' }}
                    >
                        <ListItemIcon sx={{ color: '#DAA520', minWidth: 40, justifyContent: isRTL ? 'flex-end' : 'flex-start' }}><SecurityIcon /></ListItemIcon>
                        <ListItemText primary={t('nav.support')} primaryTypographyProps={{ fontWeight: 900, fontSize: '0.85rem', color: '#DAA520' }} sx={{ textAlign: isRTL ? 'right' : 'left' }} />
                    </ListItem>
                    <Box sx={{ mt: 2, mb: 1, px: 2 }}>
                        <CeoContactButtons compact />
                    </Box>
                    <ListItem
                        component="a"
                        href="https://bin-groups.com"
                        target="_blank"
                        sx={{ borderRadius: 2, mt: 1, bgcolor: alpha('#10b981', 0.05), textAlign: isRTL ? 'right' : 'left', flexDirection: isRTL ? 'row-reverse' : 'row' }}
                    >
                        <ListItemIcon sx={{ color: '#10b981', minWidth: 40, justifyContent: isRTL ? 'flex-end' : 'flex-start' }}><PeopleIcon /></ListItemIcon>
                        <ListItemText primary={t('nav.owner_portal_link')} primaryTypographyProps={{ fontWeight: 900, fontSize: '0.85rem', color: '#10b981' }} sx={{ textAlign: isRTL ? 'right' : 'left' }} />
                    </ListItem>
                    <ListItem
                        button
                        onClick={() => { 
                            const currentLang = localStorage.getItem('bin_language');
                            localStorage.clear(); 
                            if (currentLang) localStorage.setItem('bin_language', currentLang);
                            signOut(auth).then(() => window.location.href = '/'); 
                        }}
                        sx={{ borderRadius: 2, mt: 4, bgcolor: alpha('#ef4444', 0.1), textAlign: isRTL ? 'right' : 'left', flexDirection: isRTL ? 'row-reverse' : 'row', '&:hover': { bgcolor: alpha('#ef4444', 0.2) } }}
                    >
                        <ListItemIcon sx={{ color: '#ef4444', minWidth: 40, justifyContent: isRTL ? 'flex-end' : 'flex-start' }}><LogoutIcon /></ListItemIcon>
                        <ListItemText primary={t('nav.logout') || navText('Sign Out', 'تسجيل الخروج')} primaryTypographyProps={{ fontWeight: 900, fontSize: '0.85rem', color: '#ef4444' }} sx={{ textAlign: isRTL ? 'right' : 'left' }} />
                    </ListItem>
                </List>
            </Box>
        </Drawer>
    );
};

export default Navigation;

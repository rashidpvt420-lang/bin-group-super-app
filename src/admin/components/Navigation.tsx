import React from 'react';
import { alpha } from '@mui/material/styles';
import { NavLink } from 'react-router-dom';
import { Drawer, List, ListItemButton, ListItemIcon, ListItemText, Divider, Box, Typography, useMediaQuery } from '@mui/material';
import PeopleIcon from '@mui/icons-material/People';
import ReceiptIcon from '@mui/icons-material/Receipt';
import SecurityIcon from '@mui/icons-material/Security';
import FileTextIcon from '@mui/icons-material/Description';
import LogoutIcon from '@mui/icons-material/Logout';
import TranslateIcon from '@mui/icons-material/Translate';
import { Users, Zap, Shield, Activity, DollarSign, LayoutDashboard, Cpu, Building2, FileSignature, Bot } from 'lucide-react';
import { binThemeTokens } from '../theme/adminTheme';
import { useLanguage } from '../../context/LanguageContext';
import { auth } from '@/lib/firebase';
import { signOut } from 'firebase/auth';
import CeoContactButtons from './CeoContactButtons';
import { useAuth } from '../context/AuthContext';
import SafeIcon from '../../components/SafeIcon';

type AdminMenuItem = {
    text: string;
    icon: React.ElementType;
    path: string;
    color?: string;
    hidden?: boolean;
};

const renderAdminNavIcon = (Icon: React.ElementType, color?: string) => (
    <SafeIcon icon={Icon} size={20} color={color || 'currentColor'} />
);

const Navigation = () => {
    const { tx, isRTL, lang, setLang } = useLanguage();
    const { user } = useAuth();

    const compact = useMediaQuery('(max-width:1100px)');
    const drawerWidth = compact ? 88 : 280;
    const label = (key: string, en: string, ar: string) => lang === 'ar' ? ar : tx(key, en);
    const toggleLanguage = () => setLang(lang === 'en' ? 'ar' : 'en');
    
    const isHRAuthorized = user?.role === 'admin' || user?.role === 'ceo' || user?.role === 'hr_manager' || user?.role === 'hr_staff' || user?.role === 'finance_staff' || user?.role === 'account_manager' || user?.role === 'finance_admin' || user?.role === 'dispatcher' || user?.role === 'operations_manager';

    const primaryMenu: AdminMenuItem[] = [
        { text: label('nav.dashboard', 'Dashboard', 'لوحة التحكم'), icon: LayoutDashboard, path: '/admin/dashboard' },
        { text: label('admin.nav.bingpt_engineer', 'BIN-GPT Engineer™', 'مهندس BIN-GPT™'), icon: Bot, path: '/admin/bingpt-engineer', color: binThemeTokens.gold },
        { text: label('admin.nav.ai_studio', 'Admin AI Studio', 'استوديو ذكاء المسؤول'), icon: Bot, path: '/admin/ai-studio', color: binThemeTokens.gold },
        { text: label('admin.nav.design_studio', 'Design Studio', 'استوديو التصميم'), icon: Zap, path: '/admin/design-studio', color: binThemeTokens.gold },
        { text: label('admin.nav.smart_building', 'Smart Building Monitor', 'مراقبة المباني الذكية'), icon: Cpu, path: '/admin/smart-building', color: binThemeTokens.gold },
        { text: label('admin.nav.sovereign_control', 'Sovereign Control', 'التحكم السيادي'), icon: Shield, path: '/admin/sovereign-control', color: binThemeTokens.gold },
        { text: label('fin.title', 'Financials', 'الماليات'), icon: DollarSign, path: '/admin/financials', color: binThemeTokens.gold },
        { text: label('admin.nav.document_os', 'Document OS™', 'نظام المستندات™'), icon: FileSignature, path: '/admin/document-os', color: binThemeTokens.gold },
        { text: label('nav.docs', 'Document Vault', 'خزنة المستندات'), icon: FileTextIcon, path: '/admin/document-vault', color: binThemeTokens.gold },
        { text: label('admin.nav.company_identity', 'Company Identity', 'هوية الشركة'), icon: Building2, path: '/admin/company-profile', color: binThemeTokens.gold },
        { text: label('nav.audit', 'Institutional Audit', 'التدقيق المؤسسي'), icon: SecurityIcon, path: '/admin/audit-shield', color: binThemeTokens.gold },
        { text: label('admin.nav.pricing_matrix', 'Pricing Matrix 2026', 'مصفوفة التسعير 2026'), icon: Zap, path: '/admin/pricing', color: binThemeTokens.gold },
    ];

    const managementMenu: AdminMenuItem[] = [
        { text: label('nav.owners', 'Owner Registry', 'سجل الملاك'), icon: PeopleIcon, path: '/admin/owners' },
        { text: label('admin.nav.property_passport_registry', 'Property Passport Registry', 'سجل جوازات العقارات'), icon: Building2, path: '/admin/properties/passport', color: binThemeTokens.gold },
        { text: label('nav.tenants', 'Tenant Registry', 'سجل المستأجرين'), icon: PeopleIcon, path: '/admin/tenants' },
        { text: label('nav.technicians', 'Technician Corps', 'فريق الفنيين'), icon: Users, path: '/admin/technicians' },
        { text: label('admin.nav.duty_command', 'Duty Command Center', 'مركز أوامر المهام'), icon: Activity, path: '/admin/duty-command', color: binThemeTokens.gold },
        { text: label('nav.tickets', 'Maintenance Logs', 'سجلات الصيانة'), icon: ReceiptIcon, path: '/admin/tickets' },
        { text: label('admin.nav.hr_command', 'HR Command', 'إدارة الموارد البشرية'), icon: Users, path: '/admin/hr', color: binThemeTokens.gold, hidden: !isHRAuthorized },
    ];

    return (
        <Drawer
            variant="permanent"
            anchor={isRTL ? 'right' : 'left'}
            sx={{
                width: drawerWidth,
                flexShrink: 0,
                transition: 'width 0.22s',
                '& .MuiDrawer-paper': { 
                    width: drawerWidth, 
                    boxSizing: 'border-box',
                    bgcolor: '#FFFFFF',
                    borderRight: isRTL ? 'none' : '1px solid #E5E7EB',
                    borderLeft: isRTL ? '1px solid #E5E7EB' : 'none',
                    overflowX: 'hidden',
                    transition: 'width 0.22s',
                },
            }}
        >
            <Box sx={{ p: compact ? 2 : 4, textAlign: 'center' }}>
                <Typography variant="h6" sx={{ fontWeight: 950, color: '#B8932F', letterSpacing: compact ? 0 : 2 }}>
                    {compact ? 'BG' : label('brand.bin_group', 'BIN GROUP', 'بن جروب')}
                </Typography>
                {!compact && (
                    <Typography variant="caption" sx={{ color: '#667085', letterSpacing: 4, fontWeight: 900 }}>
                        {label('admin.shell.sovereign_admin', 'SOVEREIGN ADMIN', 'المسؤول السيادي')}
                    </Typography>
                )}
            </Box>
            
            <Divider sx={{ borderColor: '#E5E7EB' }} />
            
            <List sx={{ px: compact ? 1 : 2, pt: 2 }}>
                {!compact && (
                    <Typography variant="overline" sx={{ px: 2, color: '#667085', fontWeight: 950, letterSpacing: 1 }}>
                        {label('admin.shell.command_core', 'COMMAND CORE', 'نواة القيادة')}
                    </Typography>
                )}
                {primaryMenu.map((item) => (
                    <ListItemButton
                        key={item.path}
                        component={NavLink as React.ElementType}
                        to={item.path}
                        sx={{
                            borderRadius: 2,
                            mb: 0.5,
                            justifyContent: compact ? 'center' : 'flex-start',
                            px: compact ? 1.5 : 2,
                            color: '#111827',
                            '&.active': { bgcolor: alpha('#B8932F', 0.1), '& .MuiTypography-root': { color: '#B8932F' }, '& .MuiListItemIcon-root': { color: '#B8932F' } }
                        }}
                        title={compact ? item.text : undefined}
                    >
                        <ListItemIcon sx={{ color: item.color || '#667085', minWidth: compact ? 'auto' : 40, justifyContent: 'center' }}>
                            {renderAdminNavIcon(item.icon, item.color)}
                        </ListItemIcon>
                        {!compact && <ListItemText primary={item.text} primaryTypographyProps={{ fontWeight: 800, fontSize: '0.8rem', textAlign: isRTL ? 'right' : 'left', color: 'inherit' }} />}
                    </ListItemButton>
                ))}
            </List>

            <List sx={{ px: compact ? 1 : 2, mt: 2 }}>
                {!compact && (
                    <Typography variant="overline" sx={{ px: 2, color: '#667085', fontWeight: 950, letterSpacing: 1 }}>
                        {label('admin.shell.operations', 'OPERATIONS', 'العمليات')}
                    </Typography>
                )}
                {managementMenu.filter(i => !i.hidden).map((item) => (
                    <ListItemButton
                        key={item.path}
                        component={NavLink as React.ElementType}
                        to={item.path}
                        sx={{
                            borderRadius: 2,
                            mb: 0.5,
                            justifyContent: compact ? 'center' : 'flex-start',
                            px: compact ? 1.5 : 2,
                            color: '#111827',
                            '&.active': { bgcolor: alpha('#B8932F', 0.1), '& .MuiTypography-root': { color: '#B8932F' }, '& .MuiListItemIcon-root': { color: '#B8932F' } }
                        }}
                        title={compact ? item.text : undefined}
                    >
                        <ListItemIcon sx={{ color: item.color || '#667085', minWidth: compact ? 'auto' : 40, justifyContent: 'center' }}>
                            {renderAdminNavIcon(item.icon, item.color)}
                        </ListItemIcon>
                        {!compact && <ListItemText primary={item.text} primaryTypographyProps={{ fontWeight: 800, fontSize: '0.8rem', textAlign: isRTL ? 'right' : 'left', color: 'inherit' }} />}
                    </ListItemButton>
                ))}
            </List>

            <Box sx={{ mt: 'auto', p: compact ? 1 : 2 }}>
                {!compact && <CeoContactButtons compact />}
                <ListItemButton
                    data-testid="admin-language-toggle"
                    onClick={toggleLanguage}
                    sx={{ borderRadius: 2, mt: 2, bgcolor: alpha('#B8932F', 0.1), '&:hover': { bgcolor: alpha('#B8932F', 0.16) }, justifyContent: compact ? 'center' : 'flex-start', px: compact ? 1.5 : 2 }}
                    title={compact ? label('nav.language', 'Language', 'اللغة') : undefined}
                >
                    <ListItemIcon sx={{ color: '#B8932F', minWidth: compact ? 'auto' : 40, justifyContent: 'center' }}>
                        <TranslateIcon />
                    </ListItemIcon>
                    {!compact && <ListItemText primary={lang === 'en' ? 'AR' : 'EN'} primaryTypographyProps={{ fontWeight: 900, fontSize: '0.75rem', color: '#B8932F', textAlign: isRTL ? 'right' : 'left' }} />}
                </ListItemButton>
                <ListItemButton
                    data-testid="admin-logout"
                    onClick={() => { 
                        const currentLang = localStorage.getItem('bin_language');
                        const activeOnboarding = localStorage.getItem('bin-group-onboarding-v3');
                        localStorage.clear(); 
                        if (currentLang) localStorage.setItem('bin_language', currentLang);
                        if (activeOnboarding) localStorage.setItem('bin-group-onboarding-v3', activeOnboarding);
                        signOut(auth).then(() => window.location.href = '/'); 
                    }}
                    sx={{ borderRadius: 2, mt: 2, bgcolor: alpha('#ef4444', 0.1), '&:hover': { bgcolor: alpha('#ef4444', 0.2) }, justifyContent: compact ? 'center' : 'flex-start', px: compact ? 1.5 : 2 }}
                    title={compact ? label('nav.logout', 'Secure Logout', 'تسجيل خروج آمن') : undefined}
                >
                    <ListItemIcon sx={{ color: '#ef4444', minWidth: compact ? 'auto' : 40, justifyContent: 'center' }}>
                        <SafeIcon icon={LogoutIcon} size={20} color="#ef4444" />
                    </ListItemIcon>
                    {!compact && <ListItemText primary={label('nav.logout_secure', 'SECURE LOGOUT', 'تسجيل خروج آمن')} primaryTypographyProps={{ fontWeight: 900, fontSize: '0.75rem', color: '#ef4444', textAlign: isRTL ? 'right' : 'left' }} />}
                </ListItemButton>
            </Box>
        </Drawer>
    );
};

export default Navigation;

import React from 'react';
import { alpha } from '@mui/material/styles';
import { NavLink } from 'react-router-dom';
import { Drawer, List, ListItem, ListItemIcon, ListItemText, Divider, Box, Typography, useMediaQuery } from '@mui/material';
import PeopleIcon from '@mui/icons-material/People';
import ReceiptIcon from '@mui/icons-material/Receipt';
import SecurityIcon from '@mui/icons-material/Security';
import FileTextIcon from '@mui/icons-material/Description';
import LogoutIcon from '@mui/icons-material/Logout';
import { Users, Zap, Shield, Activity, DollarSign, LayoutDashboard, Cpu, Building2, FileSignature, Bot } from 'lucide-react';
import { binThemeTokens } from '../theme/adminTheme';
import { useLanguage } from '../../context/LanguageContext';
import { auth } from '@/lib/firebase';
import { signOut } from 'firebase/auth';
import CeoContactButtons from './CeoContactButtons';
import { useAuth } from '../context/AuthContext';

const Navigation = () => {
    const { tx, isRTL, lang } = useLanguage();
    const { user } = useAuth();

    const compact = useMediaQuery('(max-width:1100px)');
    const drawerWidth = compact ? 88 : 280;
    const label = (key: string, en: string, ar: string) => lang === 'ar' ? ar : tx(key, en);
    
    const isHRAuthorized = user?.role === 'admin' || user?.role === 'ceo' || user?.role === 'hr_manager' || user?.role === 'hr_staff' || user?.role === 'finance_staff' || user?.role === 'account_manager' || user?.role === 'finance_admin' || user?.role === 'dispatcher' || user?.role === 'operations_manager';

    const primaryMenu = [
        { text: label('nav.dashboard', 'Dashboard', 'لوحة التحكم'), icon: <LayoutDashboard size={20} />, path: '/admin/dashboard' },
        { text: label('admin.nav.bingpt_engineer', 'BIN-GPT Engineer™', 'مهندس BIN-GPT™'), icon: <Bot size={20} />, path: '/admin/bingpt-engineer', color: binThemeTokens.gold },
        { text: label('admin.nav.ai_studio', 'Admin AI Studio', 'استوديو ذكاء المسؤول'), icon: <Bot size={20} />, path: '/admin/ai-studio', color: binThemeTokens.gold },
        { text: label('admin.nav.design_studio', 'Design Studio', 'استوديو التصميم'), icon: <Zap size={20} />, path: '/admin/design-studio', color: binThemeTokens.gold },
        { text: label('admin.nav.smart_building', 'Smart Building Monitor', 'مراقبة المباني الذكية'), icon: <Cpu size={20} />, path: '/admin/smart-building', color: binThemeTokens.gold },
        { text: label('admin.nav.sovereign_control', 'Sovereign Control', 'التحكم السيادي'), icon: <Shield size={20} />, path: '/admin/sovereign-control', color: binThemeTokens.gold },
        { text: label('fin.title', 'Financials', 'الماليات'), icon: <DollarSign size={20} />, path: '/admin/financials', color: binThemeTokens.gold },
        { text: label('admin.nav.document_os', 'Document OS™', 'نظام المستندات™'), icon: <FileSignature size={20} />, path: '/admin/document-os', color: binThemeTokens.gold },
        { text: label('nav.docs', 'Document Vault', 'خزنة المستندات'), icon: <FileTextIcon />, path: '/admin/document-vault', color: binThemeTokens.gold },
        { text: label('admin.nav.company_identity', 'Company Identity', 'هوية الشركة'), icon: <Building2 size={20} />, path: '/admin/company-profile', color: binThemeTokens.gold },
        { text: label('nav.audit', 'Institutional Audit', 'التدقيق المؤسسي'), icon: <SecurityIcon />, path: '/admin/audit-shield', color: binThemeTokens.gold },
        { text: label('admin.nav.pricing_matrix', 'Pricing Matrix 2026', 'مصفوفة التسعير 2026'), icon: <Zap size={20} />, path: '/admin/pricing', color: binThemeTokens.gold },
    ];

    const managementMenu = [
        { text: label('nav.owners', 'Owner Registry', 'سجل الملاك'), icon: <PeopleIcon />, path: '/admin/owners' },
        { text: label('admin.nav.property_passport_registry', 'Property Passport Registry', 'سجل جوازات العقارات'), icon: <Building2 size={20} />, path: '/admin/properties/passport', color: binThemeTokens.gold },
        { text: label('nav.tenants', 'Tenant Registry', 'سجل المستأجرين'), icon: <PeopleIcon />, path: '/admin/tenants' },
        { text: label('nav.technicians', 'Technician Corps', 'فريق الفنيين'), icon: <Users size={20} />, path: '/admin/technicians' },
        { text: label('admin.nav.duty_command', 'Duty Command Center', 'مركز أوامر المهام'), icon: <Activity size={20} />, path: '/admin/duty-command', color: binThemeTokens.gold },
        { text: label('nav.tickets', 'Maintenance Logs', 'سجلات الصيانة'), icon: <ReceiptIcon />, path: '/admin/tickets' },
        { text: label('admin.nav.hr_command', 'HR Command', 'إدارة الموارد البشرية'), icon: <Users size={20} />, path: '/admin/hr', color: binThemeTokens.gold, hidden: !isHRAuthorized },
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
                    bgcolor: '#020617',
                    borderRight: isRTL ? 'none' : `1px solid ${alpha(binThemeTokens.gold, 0.1)}`,
                    borderLeft: isRTL ? `1px solid ${alpha(binThemeTokens.gold, 0.1)}` : 'none',
                    overflowX: 'hidden',
                    transition: 'width 0.22s',
                },
            }}
        >
            <Box sx={{ p: compact ? 2 : 4, textAlign: 'center' }}>
                <Typography variant="h6" sx={{ fontWeight: 950, color: binThemeTokens.gold, letterSpacing: compact ? 0 : 2 }}>
                    {compact ? 'BG' : label('brand.bin_group', 'BIN GROUP', 'بن جروب')}
                </Typography>
                {!compact && (
                    <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.3)', letterSpacing: 4, fontWeight: 900 }}>
                        {label('admin.shell.sovereign_admin', 'SOVEREIGN ADMIN', 'المسؤول السيادي')}
                    </Typography>
                )}
            </Box>
            
            <Divider sx={{ borderColor: alpha(binThemeTokens.gold, 0.1) }} />
            
            <List sx={{ px: compact ? 1 : 2, pt: 2 }}>
                {!compact && (
                    <Typography variant="overline" sx={{ px: 2, color: 'rgba(255,255,255,0.2)', fontWeight: 950, letterSpacing: 1 }}>
                        {label('admin.shell.command_core', 'COMMAND CORE', 'نواة القيادة')}
                    </Typography>
                )}
                {primaryMenu.map((item) => (
                    <ListItem 
                        key={item.path} 
                        component={NavLink} 
                        to={item.path} 
                        sx={{ 
                            borderRadius: 2, mb: 0.5,
                            justifyContent: compact ? 'center' : 'flex-start',
                            px: compact ? 1.5 : 2,
                            '&.active': { bgcolor: alpha(binThemeTokens.gold, 0.1), '& .MuiTypography-root': { color: binThemeTokens.gold }, '& .MuiListItemIcon-root': { color: binThemeTokens.gold } }
                        }}
                        title={compact ? item.text : undefined}
                    >
                        <ListItemIcon sx={{ color: item.color || 'rgba(255,255,255,0.4)', minWidth: compact ? 'auto' : 40, justifyContent: 'center' }}>{item.icon}</ListItemIcon>
                        {!compact && <ListItemText primary={item.text} primaryTypographyProps={{ fontWeight: 800, fontSize: '0.8rem', textAlign: isRTL ? 'right' : 'left' }} />}
                    </ListItem>
                ))}
            </List>

            <List sx={{ px: compact ? 1 : 2, mt: 2 }}>
                {!compact && (
                    <Typography variant="overline" sx={{ px: 2, color: 'rgba(255,255,255,0.2)', fontWeight: 950, letterSpacing: 1 }}>
                        {label('admin.shell.operations', 'OPERATIONS', 'العمليات')}
                    </Typography>
                )}
                {managementMenu.filter(i => !i.hidden).map((item) => (
                    <ListItem 
                        key={item.path} 
                        component={NavLink} 
                        to={item.path}
                        sx={{ 
                            borderRadius: 2, mb: 0.5,
                            justifyContent: compact ? 'center' : 'flex-start',
                            px: compact ? 1.5 : 2,
                            '&.active': { bgcolor: alpha(binThemeTokens.gold, 0.1), '& .MuiTypography-root': { color: binThemeTokens.gold }, '& .MuiListItemIcon-root': { color: binThemeTokens.gold } }
                        }}
                        title={compact ? item.text : undefined}
                    >
                        <ListItemIcon sx={{ color: item.color || 'rgba(255,255,255,0.4)', minWidth: compact ? 'auto' : 40, justifyContent: 'center' }}>{item.icon}</ListItemIcon>
                        {!compact && <ListItemText primary={item.text} primaryTypographyProps={{ fontWeight: 800, fontSize: '0.8rem', textAlign: isRTL ? 'right' : 'left' }} />}
                    </ListItem>
                ))}
            </List>

            <Box sx={{ mt: 'auto', p: compact ? 1 : 2 }}>
                {!compact && <CeoContactButtons compact />}
                <ListItem
                    button
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
                    <ListItemIcon sx={{ color: '#ef4444', minWidth: compact ? 'auto' : 40, justifyContent: 'center' }}><LogoutIcon /></ListItemIcon>
                    {!compact && <ListItemText primary={label('nav.logout_secure', 'SECURE LOGOUT', 'تسجيل خروج آمن')} primaryTypographyProps={{ fontWeight: 900, fontSize: '0.75rem', color: '#ef4444', textAlign: isRTL ? 'right' : 'left' }} />}
                </ListItem>
            </Box>
        </Drawer>
    );
};

export default Navigation;

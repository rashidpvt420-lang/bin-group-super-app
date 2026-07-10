import React from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  Box,
  Collapse,
  Divider,
  Drawer,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Typography,
  alpha,
} from '@mui/material';
import {
  AccountBalanceWallet,
  Apartment,
  Assessment,
  AssignmentLate,
  Badge,
  Build,
  Campaign,
  CheckCircle,
  CloudUpload,
  Dashboard,
  Description,
  ExpandLess,
  ExpandMore,
  FactCheck,
  Groups,
  LocalParking,
  Logout,
  Map,
  Payments,
  People,
  Receipt,
  ReportProblem,
  Security,
  Settings,
  Storefront,
  SupportAgent,
} from '@mui/icons-material';
import { Brain, Building2, FileArchive, Landmark, MessageSquare, Package, Rocket, Sparkles, Users, Wrench } from 'lucide-react';
import { useLanguage } from '@bin/shared';
import { binThemeTokens } from '../theme/adminTheme';
import { auth } from '../lib/firebase';
import { signOut } from 'firebase/auth';
import CeoContactButtons from './CeoContactButtons';
import { useAuth } from '../context/AuthContext';

type NavItem = {
  text: string;
  path: string;
  icon: React.ReactNode;
  color?: string;
  roles?: string[];
};

type NavSection = {
  id: string;
  label: string;
  items: NavItem[];
};

const Navigation = () => {
  const { t, tx, isRTL } = useLanguage();
  const { user } = useAuth();
  const location = useLocation();
  const userRole = String(user?.role || '').toLowerCase();
  const [openSections, setOpenSections] = React.useState<Record<string, boolean>>({ command: true, people: true, operations: false, finance: false });

  const sections = React.useMemo<NavSection[]>(() => [
    {
      id: 'command',
      label: tx('nav.sovereign_core', 'Command & Launch'),
      items: [
        { text: tx('nav.dashboard', 'Dashboard'), icon: <Dashboard />, path: '/dashboard' },
        { text: 'Public Launch Command', icon: <Rocket size={20} />, path: '/ops/public-launch-command', color: binThemeTokens.gold },
        { text: 'Sovereign Control', icon: <Security />, path: '/control-center', color: '#ef4444' },
        { text: 'Live Operations', icon: <Assessment />, path: '/ops/live', color: '#38bdf8' },
        { text: 'Geo Repair Center', icon: <Map />, path: '/ops/geo-repair', color: '#22c55e' },
        { text: 'Pilot Completion', icon: <CheckCircle />, path: '/ops/pilot-completion', color: '#3b82f6' },
        { text: 'Pilot Command', icon: <FactCheck />, path: '/pilot', color: '#8b5cf6' },
        { text: 'Five-Profile Smoke Test', icon: <AssignmentLate />, path: '/smoke-test', color: '#f59e0b' },
        { text: 'Public Operations', icon: <Rocket size={20} />, path: '/ops/public', color: '#0ea5e9' },
      ],
    },
    {
      id: 'people',
      label: tx('nav.management', 'People, Properties & Partners'),
      items: [
        { text: 'Owners', icon: <Building2 size={20} />, path: '/owners' },
        { text: 'Property Approvals', icon: <FactCheck />, path: '/properties/approvals', color: '#f59e0b' },
        { text: 'Property Management', icon: <Apartment />, path: '/properties/manage' },
        { text: tx('nav.property_passport', 'Property Passports'), icon: <Security />, path: '/properties/passport', color: binThemeTokens.gold },
        { text: 'Onboard Property', icon: <CloudUpload />, path: '/onboard-property' },
        { text: 'Bulk Import', icon: <CloudUpload />, path: '/bulk-import', color: '#38bdf8' },
        { text: 'Unit Status Control', icon: <Dashboard />, path: '/admin/units', color: binThemeTokens.gold },
        { text: tx('nav.tenants', 'Tenants'), icon: <People />, path: '/tenants' },
        { text: 'Tenant Unit Links', icon: <AssignmentLate />, path: '/unit-links', color: '#f59e0b' },
        { text: 'Tenant Services', icon: <Receipt />, path: '/tenant-services', color: '#38bdf8' },
        { text: tx('nav.technicians', 'Technicians'), icon: <Wrench size={20} />, path: '/technicians' },
        { text: 'Technician Live Map', icon: <Map />, path: '/technicians/map', color: '#22c55e' },
        { text: 'Technician Performance', icon: <Assessment />, path: '/technicians/performance' },
        { text: 'Duty Command Center', icon: <Build />, path: '/ops/technicians', color: binThemeTokens.gold },
        { text: tx('nav.brokers', 'Brokers'), icon: <Groups />, path: '/broker' },
        { text: 'Broker Attribution Queue', icon: <AssignmentLate />, path: '/broker-attributions', color: binThemeTokens.gold },
        { text: 'Broker Commission Hub', icon: <AccountBalanceWallet />, path: '/broker-commissions', color: '#10b981' },
        { text: 'HR Command', icon: <Users size={20} />, path: '/hr', color: binThemeTokens.gold, roles: ['admin', 'ceo', 'hr_manager', 'hr_staff'] },
        { text: 'Staff Access', icon: <Badge />, path: '/staff-access', roles: ['admin', 'ceo', 'hr_manager'] },
      ],
    },
    {
      id: 'operations',
      label: tx('nav.operations', 'Service & Community Operations'),
      items: [
        { text: tx('nav.tickets', 'Maintenance Tickets'), icon: <Receipt />, path: '/tickets' },
        { text: 'Dispute Queue', icon: <ReportProblem />, path: '/disputes', color: '#f59e0b' },
        { text: tx('nav.sos_feed', 'SOS Live Feed'), icon: <ReportProblem />, path: '/sos', color: '#ef4444' },
        { text: 'Emergency Command', icon: <ReportProblem />, path: '/ops/emergency', color: '#ef4444' },
        { text: 'Announcements', icon: <Campaign />, path: '/ops/announcements' },
        { text: 'Amenity Control', icon: <Storefront />, path: '/ops/amenities' },
        { text: 'Parcel Desk', icon: <Package size={20} />, path: '/ops/parcels' },
        { text: 'Visitor Parking', icon: <LocalParking />, path: '/ops/visitor-parking' },
        { text: 'Key Register', icon: <Badge />, path: '/ops/keys' },
        { text: 'Community Moderation', icon: <Groups />, path: '/ops/community' },
        { text: 'Marketplace Approvals', icon: <Storefront />, path: '/ops/marketplace' },
        { text: 'Operations Messages', icon: <MessageSquare size={20} />, path: '/ops/messages', color: '#8b5cf6' },
        { text: 'Staff Directory', icon: <SupportAgent />, path: '/ops/staff-directory' },
        { text: 'BIN Connect Inbox', icon: <MessageSquare size={20} />, path: '/ops/bin-connect', color: '#38bdf8' },
        { text: 'WhatsApp Triage', icon: <SupportAgent />, path: '/ops/whatsapp-triage', color: '#10b981' },
        { text: 'RFQ Trust Workflow', icon: <AssignmentLate />, path: '/ops/rfq', color: binThemeTokens.gold },
        { text: 'Vendor Command', icon: <Storefront />, path: '/ops/vendors', color: '#38bdf8' },
        { text: tx('nav.orphans', 'Orphan War Room'), icon: <Security />, path: '/orphans', color: '#ef4444' },
      ],
    },
    {
      id: 'finance',
      label: 'Finance, Documents & Governance',
      items: [
        { text: 'Financial Command', icon: <Landmark size={20} />, path: '/financials', color: '#6366f1' },
        { text: 'Payroll Hub', icon: <AccountBalanceWallet />, path: '/financials/payroll' },
        { text: 'Transactions', icon: <Receipt />, path: '/transactions' },
        { text: 'Payment Approvals', icon: <Payments />, path: '/payments', color: '#10b981' },
        { text: 'Manual Payment Verification', icon: <AssignmentLate />, path: '/manual-approvals', color: '#f59e0b' },
        { text: 'Profitability Intelligence', icon: <Assessment />, path: '/profitability', color: '#22c55e' },
        { text: tx('nav.docs', 'Document Vault'), icon: <Description />, path: '/document-vault', color: binThemeTokens.gold },
        { text: 'Document Library', icon: <FileArchive size={20} />, path: '/document-library' },
        { text: 'Intake Vault', icon: <FileArchive size={20} />, path: '/vault', color: binThemeTokens.gold },
        { text: tx('nav.audit_log', 'System Audit Log'), icon: <Security />, path: '/audit' },
        { text: 'Audit Shield', icon: <Security />, path: '/audit-shield', color: '#ef4444' },
        { text: 'Compliance Center', icon: <FactCheck />, path: '/compliance' },
        { text: 'PDPL Data Governance', icon: <Security />, path: '/ops/data-governance', color: '#c084fc' },
        { text: 'Operational Reports', icon: <Assessment />, path: '/reports' },
        { text: 'Institutional Reports', icon: <Assessment />, path: '/reports/institutional' },
        { text: 'Contract Termination', icon: <AssignmentLate />, path: '/contracts/termination', color: '#ef4444' },
        { text: 'Pricing Matrix 2026', icon: <AccountBalanceWallet />, path: '/admin/pricing-matrix', color: binThemeTokens.gold },
        { text: 'Design Studio Manager', icon: <Sparkles size={20} />, path: '/design-studio', color: binThemeTokens.gold },
        { text: 'BIN-GPT Engineer', icon: <Brain size={20} />, path: '/admin/bin-gpt-engineer', color: '#10b981' },
        { text: tx('nav.settings', 'Settings & Launch Evidence'), icon: <Settings />, path: '/settings' },
      ],
    },
  ], [tx]);

  React.useEffect(() => {
    const active = sections.find((section) => section.items.some((item) => location.pathname === item.path || location.pathname.startsWith(`${item.path}/`)));
    if (active) setOpenSections((current) => ({ ...current, [active.id]: true }));
  }, [location.pathname, sections]);

  const visibleItems = (items: NavItem[]) => items.filter((item) => !item.roles || item.roles.includes(userRole));
  const toggle = (id: string) => setOpenSections((current) => ({ ...current, [id]: !current[id] }));

  return (
    <Drawer
      variant="permanent"
      anchor={isRTL ? 'right' : 'left'}
      sx={{
        width: 300,
        flexShrink: 0,
        '& .MuiDrawer-paper': {
          width: 300,
          boxSizing: 'border-box',
          bgcolor: '#020617',
          color: '#fff',
          overflowY: 'auto',
          borderRight: isRTL ? 'none' : `1px solid ${alpha(binThemeTokens.gold, 0.1)}`,
          borderLeft: isRTL ? `1px solid ${alpha(binThemeTokens.gold, 0.1)}` : 'none',
          right: isRTL ? 0 : 'auto',
          left: isRTL ? 'auto' : 0,
        },
      }}
    >
      <Box sx={{ p: 3, textAlign: 'center', position: 'sticky', top: 0, zIndex: 2, bgcolor: alpha('#020617', 0.96), backdropFilter: 'blur(12px)' }}>
        <Typography variant="h6" sx={{ fontWeight: 950, color: binThemeTokens.gold, letterSpacing: 2 }}>BIN GROUP</Typography>
        <Typography variant="caption" sx={{ color: binThemeTokens.textSecondary, letterSpacing: 3 }}>{t('nav.administry') || 'ADMIN COMMAND'}</Typography>
      </Box>
      <Divider sx={{ borderColor: alpha(binThemeTokens.gold, 0.1) }} />

      <List sx={{ px: 1.5, py: 1 }}>
        {sections.map((section) => {
          const items = visibleItems(section.items);
          return (
            <React.Fragment key={section.id}>
              <ListItem button onClick={() => toggle(section.id)} sx={{ borderRadius: 2, mt: 0.5, flexDirection: isRTL ? 'row-reverse' : 'row' }}>
                <ListItemText primary={section.label} primaryTypographyProps={{ variant: 'overline', fontWeight: 950, color: binThemeTokens.gold, letterSpacing: 1.3 }} sx={{ textAlign: isRTL ? 'right' : 'left' }} />
                {openSections[section.id] ? <ExpandLess sx={{ color: binThemeTokens.gold }} /> : <ExpandMore sx={{ color: binThemeTokens.textSecondary }} />}
              </ListItem>
              <Collapse in={openSections[section.id]} timeout="auto" unmountOnExit>
                <List disablePadding>
                  {items.map((item) => (
                    <ListItem
                      key={item.path}
                      component={NavLink}
                      to={item.path}
                      sx={{
                        pl: isRTL ? 1.5 : 2.5,
                        pr: isRTL ? 2.5 : 1.5,
                        borderRadius: 2,
                        mb: 0.35,
                        flexDirection: isRTL ? 'row-reverse' : 'row',
                        textAlign: isRTL ? 'right' : 'left',
                        '&.active': { bgcolor: alpha(binThemeTokens.gold, 0.12), '& .MuiTypography-root': { color: binThemeTokens.gold } },
                      }}
                    >
                      <ListItemIcon sx={{ color: item.color || binThemeTokens.textSecondary, minWidth: 38, justifyContent: isRTL ? 'flex-end' : 'flex-start' }}>{item.icon}</ListItemIcon>
                      <ListItemText primary={item.text} primaryTypographyProps={{ fontWeight: 750, fontSize: '0.78rem' }} sx={{ textAlign: isRTL ? 'right' : 'left' }} />
                    </ListItem>
                  ))}
                </List>
              </Collapse>
            </React.Fragment>
          );
        })}
      </List>

      <Box sx={{ mt: 'auto', p: 2, borderTop: `1px solid ${alpha(binThemeTokens.gold, 0.1)}` }}>
        <Box sx={{ mb: 1.5 }}><CeoContactButtons compact /></Box>
        <ListItem
          button
          onClick={() => {
            const currentLang = localStorage.getItem('bin_language');
            localStorage.clear();
            sessionStorage.clear();
            if (currentLang) localStorage.setItem('bin_language', currentLang);
            void signOut(auth).finally(() => { window.location.href = '/login'; });
          }}
          sx={{ borderRadius: 2, bgcolor: alpha('#ef4444', 0.1), flexDirection: isRTL ? 'row-reverse' : 'row' }}
        >
          <ListItemIcon sx={{ color: '#ef4444', minWidth: 40 }}><Logout /></ListItemIcon>
          <ListItemText primary={t('nav.logout') || 'Sign Out'} primaryTypographyProps={{ fontWeight: 900, fontSize: '0.82rem', color: '#ef4444' }} />
        </ListItem>
      </Box>
    </Drawer>
  );
};

export default Navigation;

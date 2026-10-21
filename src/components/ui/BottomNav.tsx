import { Box, ButtonBase, Typography } from '@mui/material';
import { Building2, FileText, Home, List, Map, MessageSquare, User, Users, Wallet, Wrench } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useLanguage } from '@bin/shared';
import SafeIcon from '../SafeIcon';
import { ui } from '../../theme/uiTokens';
import { ROLE_TABS, activeTabKey, type NavIcon, type NavRole } from './roleNav';

const ICONS: Record<NavIcon, unknown> = { home: Home, list: List, map: Map, messages: MessageSquare, profile: User, building: Building2, wrench: Wrench, money: Wallet, file: FileText, users: Users };

/** Phone bottom navigation for role portals. Replaces the floating Back on tab roots. */
export default function BottomNav({ role }: { role: NavRole }) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { lang } = useLanguage();
  const active = activeTabKey(role, pathname);
  return (
    <>
      <Box aria-hidden sx={{ display: { xs: 'block', md: 'none' }, height: `calc(${ui.bottomNavHeight + 16}px + env(safe-area-inset-bottom))` }} />
      <Box component="nav" aria-label={lang === 'ar' ? 'التنقل الرئيسي' : 'Main navigation'} data-testid="role-bottom-nav" sx={{ display: { xs: 'flex', md: 'none' }, position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 1400, bgcolor: ui.card, borderTop: `1px solid #E5E7EB`, pb: 'env(safe-area-inset-bottom)', justifyContent: 'space-around' }}>
        {ROLE_TABS[role].map((tab) => {
          const on = tab.key === active;
          return (
            <ButtonBase key={tab.key} onClick={() => navigate(tab.path)} aria-current={on ? 'page' : undefined} sx={{ flex: 1, minHeight: ui.bottomNavHeight, display: 'flex', flexDirection: 'column', gap: 0.25, color: on ? ui.goldText : ui.muted, '&:focus-visible': { outline: `3px solid ${ui.gold}` } }}>
              <SafeIcon icon={ICONS[tab.icon]} size={22} />
              <Typography component="span" sx={{ fontSize: 12, fontWeight: on ? 800 : 500, color: 'inherit' }}>{lang === 'ar' ? tab.ar : tab.en}</Typography>
            </ButtonBase>
          );
        })}
      </Box>
    </>
  );
}

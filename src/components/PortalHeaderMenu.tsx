import React from 'react';
import { Divider, IconButton, ListItemIcon, ListItemText, Menu, MenuItem, useMediaQuery } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { Globe, LogOut, MoreVertical, UserX } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';
import SafeIcon from './SafeIcon';
import { binThemeTokens } from '../theme/binGroupTheme';
import { usePortalSession, type PortalRole } from './PortalSessionControls';

/** Phone header breakpoint: at or below this width secondary header buttons collapse into the overflow menu. */
export const PHONE_HEADER_QUERY = '(max-width:480px)';
export const usePhoneHeader = () => useMediaQuery(PHONE_HEADER_QUERY, { noSsr: true });

export type PortalHeaderMenuItem = {
  key: string;
  label: string;
  onClick: () => void;
  icon?: React.ElementType;
  danger?: boolean;
};

type Props = { role: PortalRole; items: PortalHeaderMenuItem[]; logoutRedirect?: string };

/**
 * Accessible overflow ("more") menu for portal headers on phones.
 * MUI Menu gives arrow-key / Home / End / Escape handling and focus return; the trigger exposes
 * aria-haspopup, aria-expanded and aria-controls. Opens toward the inline end in both LTR and RTL.
 */
export default function PortalHeaderMenu({ role, items, logoutRedirect }: Props) {
  const { isRTL } = useLanguage();
  const navigate = useNavigate();
  const { nextLang, setLang, logoutLabel, languageSwitchLabel, handleLogout } = usePortalSession(role, logoutRedirect);
  const [anchor, setAnchor] = React.useState<HTMLElement | null>(null);
  const open = Boolean(anchor);
  const menuId = `${role}-header-menu`;
  const close = () => setAnchor(null);
  const run = (fn: () => void | Promise<void>) => () => { close(); void fn(); };
  const side = isRTL ? 'left' : 'right';

  return (
    <>
      <IconButton
        type="button"
        data-testid={`${role}-header-more`}
        aria-label={isRTL ? 'المزيد من الخيارات' : 'More options'}
        aria-haspopup="menu"
        aria-expanded={open ? 'true' : 'false'}
        aria-controls={open ? menuId : undefined}
        onClick={(e) => setAnchor(e.currentTarget)}
        sx={{ color: binThemeTokens.textPrimary, width: 44, height: 44 }}
      >
        <SafeIcon icon={MoreVertical} size={20} />
      </IconButton>
      <Menu
        id={menuId}
        anchorEl={anchor}
        open={open}
        onClose={close}
        anchorOrigin={{ vertical: 'bottom', horizontal: side }}
        transformOrigin={{ vertical: 'top', horizontal: side }}
        slotProps={{ paper: { sx: { minWidth: 220, direction: isRTL ? 'rtl' : 'ltr' } } }}
        MenuListProps={{ 'aria-label': isRTL ? 'خيارات الحساب' : 'Account options', dense: false }}
      >
        {items.map((item) => (
          <MenuItem key={item.key} onClick={run(item.onClick)} sx={{ minHeight: 48, color: item.danger ? '#B91C1C' : binThemeTokens.textPrimary, fontWeight: 800 }}>
            {item.icon && <ListItemIcon sx={{ color: 'inherit' }}><SafeIcon icon={item.icon} size={18} /></ListItemIcon>}
            <ListItemText primary={item.label} />
          </MenuItem>
        ))}
        {items.length > 0 && <Divider />}
        <MenuItem data-testid={`${role}-language-toggle-menu`} lang={nextLang} onClick={run(() => setLang(nextLang))} sx={{ minHeight: 48, color: binThemeTokens.textPrimary, fontWeight: 800 }}>
          <ListItemIcon sx={{ color: 'inherit' }}><SafeIcon icon={Globe} size={18} /></ListItemIcon>
          <ListItemText primary={languageSwitchLabel} />
        </MenuItem>
        <MenuItem data-testid={`${role}-delete-account-menu`} onClick={run(() => navigate('/account-privacy'))} sx={{ minHeight: 48, color: binThemeTokens.textPrimary, fontWeight: 800 }}>
          <ListItemIcon sx={{ color: 'inherit' }}><SafeIcon icon={UserX} size={18} /></ListItemIcon>
          <ListItemText primary={isRTL ? 'طلب حذف الحساب' : 'Request account deletion'} />
        </MenuItem>
        <MenuItem data-testid={`${role}-logout-menu`} onClick={run(handleLogout)} sx={{ minHeight: 48, color: '#B91C1C', fontWeight: 800 }}>
          <ListItemIcon sx={{ color: 'inherit' }}><SafeIcon icon={LogOut} size={18} /></ListItemIcon>
          <ListItemText primary={logoutLabel} />
        </MenuItem>
      </Menu>
    </>
  );
}

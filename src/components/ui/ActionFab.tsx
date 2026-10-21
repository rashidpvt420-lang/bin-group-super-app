import { useState } from 'react';
import { Box, ButtonBase, ClickAwayListener, Fab, Paper, Typography } from '@mui/material';
import { Plus, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useLanguage } from '@bin/shared';
import SafeIcon from '../SafeIcon';
import { ui } from '../../theme/uiTokens';
import { ROLE_FAB_ACTIONS, type FabAction, type NavRole } from './roleNav';
import { emitFabEvent } from './unifiedFab';

/** The one floating button per portal. Opens a short menu (AI, chat, new request...). */
export default function ActionFab({ role, aboveBottomNav }: { role: NavRole | 'admin'; aboveBottomNav: boolean }) {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const { lang, isRTL } = useLanguage();
  const run = (a: FabAction) => { setOpen(false); if (a.event) emitFabEvent(a.event); else if (a.path) navigate(a.path); };
  const bottom = aboveBottomNav ? { xs: `calc(${ui.bottomNavHeight + 16}px + env(safe-area-inset-bottom))`, md: 28 } : { xs: 'calc(16px + env(safe-area-inset-bottom))', md: 28 };
  const side = isRTL ? { left: { xs: 16, md: 28 } } : { right: { xs: 16, md: 28 } };
  return (
    <ClickAwayListener onClickAway={() => setOpen(false)}>
      <Box data-testid="unified-action-fab" sx={{ position: 'fixed', bottom, ...side, zIndex: 1450, display: 'flex', flexDirection: 'column', alignItems: isRTL ? 'flex-start' : 'flex-end', gap: 1 }}>
        {open && (
          <Paper role="menu" elevation={10} sx={{ borderRadius: '16px', p: 0.75, minWidth: 220, border: `1px solid ${ui.line}` }}>
            {ROLE_FAB_ACTIONS[role].map((a) => (
              <ButtonBase key={a.key} role="menuitem" onClick={() => run(a)} sx={{ width: '100%', minHeight: ui.touchTarget, px: 1.5, borderRadius: '12px', justifyContent: isRTL ? 'flex-end' : 'flex-start', '&:hover': { bgcolor: ui.cream } }}>
                <Typography sx={{ fontSize: 15, fontWeight: 700, color: a.danger ? ui.badText : ui.ink }}>{lang === 'ar' ? a.ar : a.en}</Typography>
              </ButtonBase>
            ))}
          </Paper>
        )}
        <Fab aria-expanded={open} aria-label={lang === 'ar' ? 'إجراءات سريعة' : 'Quick actions'} onClick={() => setOpen((v) => !v)} sx={{ bgcolor: ui.ink, color: ui.goldOnInk, '&:hover': { bgcolor: '#1F2937' } }}>
          <SafeIcon icon={open ? X : Plus} size={26} />
        </Fab>
      </Box>
    </ClickAwayListener>
  );
}

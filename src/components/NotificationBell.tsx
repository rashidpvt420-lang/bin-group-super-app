import React, { useState, useEffect } from 'react';
import {
    Box, Badge, IconButton, Paper, Typography, Stack, Chip,
    Divider, CircularProgress, Tooltip, Popover, Button
} from '@mui/material';
import { Bell, BellRing, CheckCheck, Zap, Wrench, MessageSquare, AlertTriangle, Check, X } from 'lucide-react';
import { useRole } from '../context/RoleContext';
import { subscribeToNotifications, markNotificationRead, type BinNotification } from '../services/notificationService';
import SafeIcon from './SafeIcon';

type NotificationTypeConfig = { icon: React.ElementType; color: string };

const TYPE_CONFIG: Record<string, NotificationTypeConfig> = {
    TICKET_CREATED:     { icon: Wrench,        color: '#C6A75E' },
    TICKET_ASSIGNED:    { icon: Wrench,        color: '#60a5fa' },
    STATUS_UPDATE:      { icon: Zap,           color: '#4ade80' },
    COMPLETION_REQUEST: { icon: Check,         color: '#4ade80' },
    TENANT_APPROVED:    { icon: CheckCheck,    color: '#4ade80' },
    TENANT_REJECTED:    { icon: X,             color: '#ef4444' },
    EMERGENCY_SOS:      { icon: AlertTriangle, color: '#ef4444' },
    CHAT_MESSAGE:       { icon: MessageSquare, color: '#a78bfa' },
};

export function NotificationBell() {
    const { user, enableNotifications } = useRole();
    const [notifications, setNotifications] = useState<BinNotification[]>([]);
    const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
    const [loading, setLoading] = useState(true);
    const [pushBusy, setPushBusy] = useState(false);
    const [pushEnabled, setPushEnabled] = useState(false);
    const [pushMessage, setPushMessage] = useState('');
    const open = Boolean(anchorEl);

    useEffect(() => {
        if (!user?.uid) {
            setNotifications([]);
            setLoading(false);
            return undefined;
        }
        setLoading(true);
        const unsub = subscribeToNotifications(user.uid, (notifs) => {
            setNotifications(notifs);
            setLoading(false);
        });
        return () => unsub();
    }, [user?.uid]);

    useEffect(() => {
        if (typeof window === 'undefined' || !('Notification' in window)) {
            setPushEnabled(false);
            return;
        }
        setPushEnabled(Notification.permission === 'granted');
    }, []);

    const unreadCount = notifications.filter(n => !n.read).length;

    const handleOpen = (e: React.MouseEvent<HTMLElement>) => setAnchorEl(e.currentTarget);
    const handleClose = () => setAnchorEl(null);

    const handleMarkRead = async (notifId: string) => {
        await markNotificationRead(notifId!);
    };

    const handleMarkAllRead = async () => {
        const unread = notifications.filter(n => !n.read);
        await Promise.all(unread.map(n => markNotificationRead(n.id!)));
    };

    const handleEnablePushAlerts = async () => {
        if (!user?.uid) {
            setPushMessage('Sign in to enable push alerts.');
            return;
        }

        setPushBusy(true);
        setPushMessage('');

        try {
            const enabled = await enableNotifications();
            setPushEnabled(enabled);
            setPushMessage(enabled
                ? 'Push alerts enabled on this device.'
                : 'Push alerts could not be enabled. Check browser permissions or device support.'
            );
        } catch (err) {
            console.warn('[NotificationBell] Push enable failed.', err);
            setPushMessage('Push alerts could not be enabled.');
        } finally {
            setPushBusy(false);
        }
    };

    const isRinging = unreadCount > 0;

    return (
        <>
            <Tooltip title={`${unreadCount} unread notifications`}>
                <IconButton onClick={handleOpen} sx={{ color: '#FFF', position: 'relative' }}>
                    <Badge badgeContent={unreadCount} color="error" max={99}>
                        {isRinging
                            ? <SafeIcon icon={BellRing} size={22} color="#C6A75E" />
                            : <SafeIcon icon={Bell} size={22} color="rgba(255,255,255,0.5)" />
                        }
                    </Badge>
                </IconButton>
            </Tooltip>

            <Popover
                open={open}
                anchorEl={anchorEl}
                onClose={handleClose}
                anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
                transformOrigin={{ vertical: 'top', horizontal: 'right' }}
                PaperProps={{
                    sx: {
                        bgcolor: '#0f172a',
                        border: '1px solid rgba(255,255,255,0.08)',
                        borderRadius: 3,
                        width: 380,
                        maxHeight: 520,
                        overflow: 'hidden',
                        display: 'flex',
                        flexDirection: 'column',
                    }
                }}
            >
                <Box sx={{ px: 3, py: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                    <Typography variant="overline" sx={{ color: '#C6A75E', fontWeight: 900, letterSpacing: 2 }}>
                        NOTIFICATIONS
                    </Typography>
                    {unreadCount > 0 && (
                        <Button size="small" onClick={handleMarkAllRead} sx={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.65rem', fontWeight: 800 }}>
                            MARK ALL READ
                        </Button>
                    )}
                </Box>

                {!pushEnabled && (
                    <Box sx={{ px: 3, py: 2, borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                        <Button
                            fullWidth
                            size="small"
                            variant="contained"
                            onClick={handleEnablePushAlerts}
                            disabled={pushBusy}
                            sx={{
                                bgcolor: '#C6A75E',
                                color: '#0f172a',
                                fontWeight: 900,
                                '&:hover': { bgcolor: '#d8ba6a' }
                            }}
                        >
                            {pushBusy ? 'ENABLING PUSH ALERTS...' : 'ENABLE PUSH ALERTS'}
                        </Button>
                        {pushMessage && (
                            <Typography variant="caption" sx={{ display: 'block', mt: 1, color: 'rgba(255,255,255,0.55)' }}>
                                {pushMessage}
                            </Typography>
                        )}
                    </Box>
                )}

                {pushEnabled && pushMessage && (
                    <Box sx={{ px: 3, py: 1.5, borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                        <Typography variant="caption" sx={{ color: '#4ade80', fontWeight: 700 }}>
                            {pushMessage}
                        </Typography>
                    </Box>
                )}

                <Box sx={{ overflowY: 'auto', flex: 1 }}>
                    {loading ? (
                        <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
                            <CircularProgress sx={{ color: '#C6A75E' }} size={24} />
                        </Box>
                    ) : notifications.length === 0 ? (
                        <Box sx={{ p: 4, textAlign: 'center' }}>
                            <SafeIcon icon={Bell} size={32} color="rgba(255,255,255,0.1)" style={{ margin: '0 auto 8px auto' }} />
                            <Typography variant="body2" color="textSecondary">No notifications yet</Typography>
                        </Box>
                    ) : (
                        notifications.map((notif, idx) => {
                            const cfg = TYPE_CONFIG[notif.type] || TYPE_CONFIG.STATUS_UPDATE;
                            return (
                                <Box
                                    key={notif.id || idx}
                                    onClick={() => !notif.read && handleMarkRead(notif.id!)}
                                    sx={{
                                        px: 3, py: 2,
                                        bgcolor: notif.read ? 'transparent' : 'rgba(198,167,94,0.04)',
                                        borderBottom: '1px solid rgba(255,255,255,0.04)',
                                        cursor: notif.read ? 'default' : 'pointer',
                                        transition: 'background 0.2s',
                                        '&:hover': { bgcolor: 'rgba(255,255,255,0.03)' }
                                    }}
                                >
                                    <Stack direction="row" spacing={2} alignItems="flex-start">
                                        <Box sx={{
                                            width: 28, height: 28, borderRadius: '50%',
                                            bgcolor: `${cfg.color}18`,
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            flexShrink: 0, color: cfg.color, mt: 0.3
                                        }}>
                                            <SafeIcon icon={cfg.icon} size={14} color={cfg.color} />
                                        </Box>
                                        <Box sx={{ flex: 1, minWidth: 0 }}>
                                            <Stack direction="row" justifyContent="space-between" alignItems="center">
                                                <Typography variant="body2" sx={{ fontWeight: notif.read ? 600 : 900, color: notif.read ? 'rgba(255,255,255,0.5)' : '#FFF', fontSize: '0.82rem' }}>
                                                    {notif.title}
                                                </Typography>
                                                {!notif.read && (
                                                    <Box sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: '#C6A75E', flexShrink: 0, ml: 1 }} />
                                                )}
                                            </Stack>
                                            <Typography variant="caption" color="textSecondary" sx={{ display: 'block', mt: 0.3, lineHeight: 1.4 }}>
                                                {notif.body}
                                            </Typography>
                                            <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.2)', fontSize: '0.65rem', mt: 0.5, display: 'block' }}>
                                                {notif.createdAt?.toDate?.()?.toLocaleString?.() ?? ''}
                                            </Typography>
                                        </Box>
                                    </Stack>
                                </Box>
                            );
                        })
                    )}
                </Box>
            </Popover>
        </>
    );
}

import React, { useState, useEffect, useRef } from 'react';
import {
    Box, Badge, IconButton, Paper, Typography, Stack, Chip,
    Divider, CircularProgress, Tooltip, Popover, Button
} from '@mui/material';
import { Bell, BellRing, CheckCheck, Zap, Wrench, MessageSquare, AlertTriangle, Check, X } from 'lucide-react';
import { useRole } from '../context/RoleContext';
import { subscribeToNotifications, markNotificationRead, BinNotification } from '../services/notificationService';

const TYPE_CONFIG: Record<string, { icon: React.ReactNode; color: string }> = {
    TICKET_CREATED:     { icon: <Wrench size={14} />,       color: '#C6A75E' },
    TICKET_ASSIGNED:    { icon: <Wrench size={14} />,       color: '#60a5fa' },
    STATUS_UPDATE:      { icon: <Zap size={14} />,          color: '#4ade80' },
    COMPLETION_REQUEST: { icon: <Check size={14} />,        color: '#4ade80' },
    TENANT_APPROVED:    { icon: <CheckCheck size={14} />,   color: '#4ade80' },
    TENANT_REJECTED:    { icon: <X size={14} />,            color: '#ef4444' },
    EMERGENCY_SOS:      { icon: <AlertTriangle size={14} />,color: '#ef4444' },
    CHAT_MESSAGE:       { icon: <MessageSquare size={14} />,color: '#a78bfa' },
};

export function NotificationBell() {
    const { user } = useRole();
    const [notifications, setNotifications] = useState<BinNotification[]>([]);
    const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
    const [loading, setLoading] = useState(true);
    const open = Boolean(anchorEl);

    useEffect(() => {
        if (!user?.uid) return;
        const unsub = subscribeToNotifications(user.uid, (notifs) => {
            setNotifications(notifs);
            setLoading(false);
        });
        return () => unsub();
    }, [user?.uid]);

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

    const isRinging = unreadCount > 0;

    return (
        <>
            <Tooltip title={`${unreadCount} unread notifications`}>
                <IconButton onClick={handleOpen} sx={{ color: '#FFF', position: 'relative' }}>
                    <Badge badgeContent={unreadCount} color="error" max={99}>
                        {isRinging
                            ? <BellRing size={22} color="#C6A75E" />
                            : <Bell size={22} color="rgba(255,255,255,0.5)" />
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
                {/* Header */}
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

                {/* Body */}
                <Box sx={{ overflowY: 'auto', flex: 1 }}>
                    {loading ? (
                        <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
                            <CircularProgress sx={{ color: '#C6A75E' }} size={24} />
                        </Box>
                    ) : notifications.length === 0 ? (
                        <Box sx={{ p: 4, textAlign: 'center' }}>
                            <Bell size={32} color="rgba(255,255,255,0.1)" style={{ margin: '0 auto 8px auto' }} />
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
                                            {cfg.icon}
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

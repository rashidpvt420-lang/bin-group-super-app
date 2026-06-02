import React, { useEffect, useMemo, useState } from 'react';
import {
    Container, Typography, Box, Paper, Stack,
    alpha, Chip, CircularProgress, Alert
} from '@mui/material';
import {
    Bell, CheckCircle2, AlertTriangle,
    Info, Clock, ChevronRight, Inbox as InboxIcon
} from 'lucide-react';
import { db, collection, query, where, onSnapshot, doc, updateDoc, serverTimestamp } from '../lib/firebase';
import { useRole } from '../context/RoleContext';
import { useLanguage } from '@bin/shared';
import { binThemeTokens } from '../theme/binGroupTheme';
import { useNavigate } from 'react-router-dom';

interface Notification {
    id: string;
    title: string;
    body: string;
    type: string;
    status?: string;
    read: boolean;
    createdAt: any;
    updatedAt?: any;
    link?: string;
    recipientId?: string;
    recipientRole?: string;
}

const ADMIN_NOTIFICATION_ROLES = new Set([
    'admin',
    'super_admin',
    'ceo',
    'manager',
    'operations_admin',
    'finance_admin',
    'hr_admin',
    'support_admin',
    'hr_manager',
    'hr_staff',
    'finance_staff',
    'account_manager',
    'dispatcher',
    'operations_manager',
]);

function toMillis(value: any): number {
    if (!value) return 0;
    if (typeof value.toMillis === 'function') return value.toMillis();
    if (typeof value.toDate === 'function') return value.toDate().getTime();
    const parsed = Date.parse(String(value));
    return Number.isFinite(parsed) ? parsed : 0;
}

export default function NotificationInboxPage() {
    const { user, role, isAdmin } = useRole();
    const { tx } = useLanguage();
    const navigate = useNavigate();
    const [directNotifications, setDirectNotifications] = useState<Notification[]>([]);
    const [adminGroupNotifications, setAdminGroupNotifications] = useState<Notification[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const normalizedRole = String(role || '').toLowerCase();
    const shouldReadAdminGroup = isAdmin || ADMIN_NOTIFICATION_ROLES.has(normalizedRole);

    useEffect(() => {
        if (!user?.uid) {
            setLoading(false);
            return undefined;
        }

        setLoading(true);
        setError(null);

        const unsubscribers: Array<() => void> = [];
        let settledReaders = 0;
        const expectedReaders = shouldReadAdminGroup ? 2 : 1;
        const markSettled = () => {
            settledReaders += 1;
            if (settledReaders >= expectedReaders) setLoading(false);
        };

        const directQuery = query(
            collection(db, 'notifications'),
            where('recipientId', '==', user.uid)
        );

        unsubscribers.push(onSnapshot(
            directQuery,
            (snapshot) => {
                setDirectNotifications(snapshot.docs.map((item) => ({ id: item.id, ...item.data() } as Notification)));
                markSettled();
            },
            (err) => {
                console.error('[Notifications] Direct listener failed:', err);
                setError('Could not load your personal notifications. Check Firestore rules/indexes.');
                markSettled();
            }
        ));

        if (shouldReadAdminGroup) {
            const adminGroupQuery = query(
                collection(db, 'notifications'),
                where('recipientId', '==', 'ADMIN_GROUP')
            );

            unsubscribers.push(onSnapshot(
                adminGroupQuery,
                (snapshot) => {
                    setAdminGroupNotifications(snapshot.docs.map((item) => ({ id: item.id, ...item.data() } as Notification)));
                    markSettled();
                },
                (err) => {
                    console.error('[Notifications] Admin group listener failed:', err);
                    setError('Could not load admin broadcast notifications. Check Firestore rules/indexes.');
                    markSettled();
                }
            ));
        } else {
            setAdminGroupNotifications([]);
        }

        return () => unsubscribers.forEach((unsubscribe) => unsubscribe());
    }, [user?.uid, shouldReadAdminGroup]);

    const notifications = useMemo(() => {
        const merged = new Map<string, Notification>();
        [...directNotifications, ...adminGroupNotifications].forEach((item) => merged.set(item.id, item));
        return Array.from(merged.values()).sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt));
    }, [directNotifications, adminGroupNotifications]);

    const markAsRead = async (notification: Notification) => {
        try {
            await updateDoc(doc(db, 'notifications', notification.id), {
                read: true,
                updatedAt: serverTimestamp()
            });
        } catch (err) {
            console.error('Failed to mark notification as read:', err);
        }
    };

    const handleAction = (notif: Notification) => {
        void markAsRead(notif);
        if (notif.link) navigate(notif.link);
    };

    const getIcon = (type: string) => {
        switch (type) {
            case 'SLA_BREACH':
            case 'EMERGENCY_SOS':
                return <AlertTriangle color="#ef4444" />;
            case 'PAYMENT_VERIFIED':
            case 'ONBOARDING_VERIFIED':
                return <CheckCircle2 color="#10b981" />;
            case 'NEW_JOB':
            case 'NEW_MISSION':
            case 'TICKET_ASSIGNED':
                return <Bell color={binThemeTokens.gold} />;
            default:
                return <Info color="rgba(255,255,255,0.4)" />;
        }
    };

    if (loading) {
        return (
            <Box sx={{ height: '80vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <CircularProgress sx={{ color: binThemeTokens.gold }} />
            </Box>
        );
    }

    return (
        <Container maxWidth="md" sx={{ py: 6 }}>
            <Box sx={{ mb: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
                <Box>
                    <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 950, letterSpacing: 4 }}>
                        {tx('notifications.overline', 'INSTITUTIONAL ACTIVITY')}
                    </Typography>
                    <Typography variant="h3" fontWeight="950" color="#FFF">
                        {tx('notifications.title_a', 'Notification')} <Box component="span" sx={{ color: binThemeTokens.gold }}>{tx('notifications.title_b', 'Inbox')}</Box>
                    </Typography>
                </Box>
                <Chip
                    label={`${notifications.filter((n) => !n.read).length} ${tx('notifications.unread', 'UNREAD')}`}
                    sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 900 }}
                />
            </Box>

            {error && (
                <Alert severity="warning" sx={{ mb: 3, bgcolor: 'rgba(245,158,11,0.08)', color: '#facc15', border: '1px solid rgba(245,158,11,0.25)' }}>
                    {error}
                </Alert>
            )}

            {notifications.length === 0 ? (
                <Paper sx={{ p: 10, textAlign: 'center', bgcolor: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 4 }}>
                    <InboxIcon size={64} color="rgba(255,255,255,0.1)" style={{ margin: '0 auto 24px' }} />
                    <Typography variant="h5" color="textSecondary">{tx('notifications.empty_title', 'Your inbox is clear.')}</Typography>
                    <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.3)', mt: 1 }}>
                        {tx('notifications.empty_body', 'Institutional updates will appear here as they occur.')}
                    </Typography>
                </Paper>
            ) : (
                <Stack spacing={2}>
                    {notifications.map((notif) => (
                        <Paper
                            key={notif.id}
                            onClick={() => handleAction(notif)}
                            sx={{
                                p: 3,
                                bgcolor: notif.read ? 'rgba(255,255,255,0.01)' : 'rgba(198,167,94,0.03)',
                                border: `1px solid ${notif.read ? 'rgba(255,255,255,0.05)' : alpha(binThemeTokens.gold, 0.2)}`,
                                borderRadius: 3,
                                cursor: 'pointer',
                                transition: 'all 0.2s ease',
                                '&:hover': {
                                    bgcolor: 'rgba(255,255,255,0.03)',
                                    borderColor: binThemeTokens.gold
                                }
                            }}
                        >
                            <Stack direction="row" spacing={3} alignItems="center">
                                <Box sx={{ p: 1.5, bgcolor: 'rgba(255,255,255,0.03)', borderRadius: 2 }}>
                                    {getIcon(notif.type)}
                                </Box>
                                <Box sx={{ flexGrow: 1 }}>
                                    <Typography variant="subtitle1" fontWeight="950" color="#FFF">
                                        {notif.title}
                                    </Typography>
                                    <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.6)', mt: 0.5 }}>
                                        {notif.body}
                                    </Typography>
                                    <Stack direction="row" spacing={2} sx={{ mt: 1.5 }} alignItems="center" flexWrap="wrap">
                                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, color: 'rgba(255,255,255,0.3)' }}>
                                            <Clock size={12} />
                                            <Typography variant="caption">
                                                {notif.createdAt?.toDate ? notif.createdAt.toDate().toLocaleString() : 'Recent'}
                                            </Typography>
                                        </Box>
                                        {notif.recipientRole && <Chip label={notif.recipientRole.toUpperCase()} size="small" sx={{ height: 18, fontSize: '0.6rem', bgcolor: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.6)', fontWeight: 900 }} />}
                                        {!notif.read && <Chip label="NEW" size="small" sx={{ height: 16, fontSize: '0.6rem', bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 900 }} />}
                                    </Stack>
                                </Box>
                                {notif.link && <ChevronRight color="rgba(255,255,255,0.2)" />}
                            </Stack>
                        </Paper>
                    ))}
                </Stack>
            )}
        </Container>
    );
}

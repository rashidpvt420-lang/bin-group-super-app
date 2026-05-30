import React, { useState, useEffect } from 'react';
import { 
    Container, Typography, Box, Paper, Stack, 
    Divider, alpha, Chip, Button, CircularProgress 
} from '@mui/material';
import { 
    Bell, CheckCircle2, AlertTriangle, 
    Info, Clock, ChevronRight, Inbox as InboxIcon 
} from 'lucide-react';
import { db, collection, query, where, orderBy, onSnapshot, doc, updateDoc, serverTimestamp } from '../lib/firebase';
import { useRole } from '../context/RoleContext';
import { useLanguage } from '@bin/shared';
import { binThemeTokens } from '../theme/binGroupTheme';
import { useNavigate } from 'react-router-dom';

interface Notification {
    id: string;
    title: string;
    body: string;
    type: string;
    status: string;
    read: boolean;
    createdAt: any;
    link?: string;
}

export default function NotificationInboxPage() {
    const { user } = useRole();
    const { tx, isRTL } = useLanguage();
    const navigate = useNavigate();
    const [notifications, setNotifications] = useState<Notification[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!user?.uid) return;

        const q = query(
            collection(db, 'notifications'),
            where('recipientId', '==', user.uid),
            orderBy('createdAt', 'desc')
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const fetched = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            })) as Notification[];
            setNotifications(fetched);
            setLoading(false);
        });

        return () => unsubscribe();
    }, [user]);

    const markAsRead = async (id: string) => {
        try {
            await updateDoc(doc(db, 'notifications', id), {
                read: true,
                updatedAt: serverTimestamp()
            });
        } catch (err) {
            console.error("Failed to mark notification as read:", err);
        }
    };

    const handleAction = (notif: Notification) => {
        markAsRead(notif.id);
        if (notif.link) {
            navigate(notif.link);
        }
    };

    const getIcon = (type: string) => {
        switch (type) {
            case 'SLA_BREACH': return <AlertTriangle color="#ef4444" />;
            case 'PAYMENT_VERIFIED': return <CheckCircle2 color="#10b981" />;
            case 'NEW_JOB':
            case 'NEW_MISSION': return <Bell color={binThemeTokens.gold} />;
            default: return <Info color="rgba(255,255,255,0.4)" />;
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
            <Box sx={{ mb: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Box>
                    <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 950, letterSpacing: 4 }}>
                        INSTITUTIONAL ACTIVITY
                    </Typography>
                    <Typography variant="h3" fontWeight="950" color="#FFF">
                        Notification <Box component="span" sx={{ color: binThemeTokens.gold }}>Inbox</Box>
                    </Typography>
                </Box>
                <Chip 
                    label={`${notifications.filter(n => !n.read).length} UNREAD`} 
                    sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 900 }} 
                />
            </Box>

            {notifications.length === 0 ? (
                <Paper sx={{ p: 10, textAlign: 'center', bgcolor: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 4 }}>
                    <InboxIcon size={64} color="rgba(255,255,255,0.1)" style={{ margin: '0 auto 24px' }} />
                    <Typography variant="h5" color="textSecondary">Your inbox is clear.</Typography>
                    <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.3)', mt: 1 }}>
                        Institutional updates will appear here as they occur.
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
                                    <Stack direction="row" spacing={2} sx={{ mt: 1.5 }} alignItems="center">
                                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, color: 'rgba(255,255,255,0.3)' }}>
                                            <Clock size={12} />
                                            <Typography variant="caption">
                                                {notif.createdAt?.toDate ? notif.createdAt.toDate().toLocaleString() : 'Recent'}
                                            </Typography>
                                        </Box>
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


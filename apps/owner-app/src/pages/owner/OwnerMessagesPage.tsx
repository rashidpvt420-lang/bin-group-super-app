import React, { useState, useEffect, useRef } from 'react';
import { Container, Typography, Box, Paper, Grid, Stack, Button, CircularProgress, TextField, IconButton, List, ListItem, ListItemText, ListItemButton, Divider, alpha, Dialog, DialogTitle, DialogContent, DialogActions, FormControl, InputLabel, Select, MenuItem } from '@mui/material';
import { Send, MessageSquare, Plus } from 'lucide-react';
import { db, collection, query, where, getDocs, addDoc, serverTimestamp, onSnapshot, orderBy, updateDoc, doc } from '../../lib/firebase';
import { useRole } from '../../context/RoleContext';
import { useLanguage } from '../../context/LanguageContext';
import { binThemeTokens } from '../../theme/binGroupTheme';

export default function OwnerMessagesPage() {
    const { user } = useRole();
    const { t, tx, isRTL } = useLanguage();
    const [conversations, setConversations] = useState<any[]>([]);
    const [selectedConv, setSelectedConv] = useState<any>(null);
    const [messages, setMessages] = useState<any[]>([]);
    const [properties, setProperties] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [sending, setSending] = useState(false);
    const [newMessageText, setNewMessageText] = useState('');
    const messagesEndRef = useRef<HTMLDivElement>(null);

    // Dialog for new chat
    const [openAdd, setOpenAdd] = useState(false);
    const [newChatProperty, setNewChatProperty] = useState('');

    useEffect(() => {
        if (!user?.uid) return;

        // Fetch properties owned by owner to initialize first conversation context
        const fetchProperties = async () => {
            try {
                const qProp = query(collection(db, 'properties'), where('ownerId', '==', user.uid));
                const snapProp = await getDocs(qProp);
                const props = snapProp.docs.map(d => ({ id: d.id, ...d.data() }));
                setProperties(props);
                if (props.length > 0) {
                    setNewChatProperty(props[0].id);
                }
            } catch (err) {
                console.error("Properties fetch error:", err);
            }
        };
        fetchProperties();

        // Listen to active conversations where user is participant
        const qConv = query(
            collection(db, 'conversations'),
            where('participantUids', 'array-contains', user.uid)
        );

        const unsubscribe = onSnapshot(qConv, (snap) => {
            const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            list.sort((a: any, b: any) => (b.lastMessageAt?.seconds || 0) - (a.lastMessageAt?.seconds || 0));
            setConversations(list);
            setLoading(false);
        }, (err) => {
            console.error("Conversations list listener error:", err);
            setLoading(false);
        });

        return () => unsubscribe();
    }, [user]);

    useEffect(() => {
        if (!selectedConv?.id) {
            setMessages([]);
            return;
        }

        const qMsgs = query(
            collection(db, 'conversations', selectedConv.id, 'messages'),
            orderBy('createdAt', 'asc')
        );

        const unsubscribe = onSnapshot(qMsgs, (snap) => {
            setMessages(snap.docs.map(d => ({ id: d.id, ...d.data() })));
            setTimeout(() => {
                messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
            }, 100);
        });

        return () => unsubscribe();
    }, [selectedConv]);

    const handleSendMessage = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newMessageText.trim() || !selectedConv?.id || !user?.uid) return;
        setSending(true);
        const text = newMessageText.trim();
        try {
            await addDoc(collection(db, 'conversations', selectedConv.id, 'messages'), {
                senderUid: user.uid,
                senderRole: 'owner',
                body: text,
                attachments: [],
                createdAt: serverTimestamp()
            });

            await updateDoc(doc(db, 'conversations', selectedConv.id), {
                lastMessageAt: serverTimestamp()
            });
            setNewMessageText('');
        } catch (err) {
            console.error("Failed to send message:", err);
            alert('Failed to send message. Please try again.');
        } finally {
            setSending(false);
        }
    };

    const handleStartNewChat = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newChatProperty || !user?.uid) return;
        try {
            // Check if conversation already exists for property
            const existing = conversations.find(c => c.propertyId === newChatProperty && c.type === 'owner_admin');
            if (existing) {
                setSelectedConv(existing);
                setOpenAdd(false);
                return;
            }

            const docRef = await addDoc(collection(db, 'conversations'), {
                propertyId: newChatProperty,
                participantUids: [user.uid, 'admin_system'], // default admin anchor
                participantRoles: ['owner', 'admin'],
                type: 'owner_admin',
                status: 'open',
                lastMessageAt: serverTimestamp(),
                createdAt: serverTimestamp()
            });

            setOpenAdd(false);
        } catch (err) {
            console.error("Failed to initialize conversation context:", err);
            alert("Error creating conversation.");
        }
    };

    if (loading) {
        return (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 10 }}>
                <CircularProgress sx={{ color: binThemeTokens.gold }} />
            </Box>
        );
    }

    return (
        <Container maxWidth="xl" sx={{ py: 6, direction: isRTL ? 'rtl' : 'ltr' }}>
            <Box sx={{ mb: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexDirection: isRTL ? 'row-reverse' : 'row' }}>
                <Box sx={{ textAlign: isRTL ? 'right' : 'left' }}>
                    <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 950, letterSpacing: 4 }}>
                        {tx('chat.owner_subtitle', 'SECURE COMMUNICATION ARCHITECTURE')}
                    </Typography>
                    <Typography variant="h3" fontWeight="950" color="#FFF">
                        {tx('chat.owner_title', 'Sovereign Messaging Desk')}
                    </Typography>
                    <Typography variant="body1" color="rgba(255,255,255,0.5)">
                        {tx('chat.owner_desc', 'Secure communication channel with property administration and managers.')}
                    </Typography>
                </Box>
                {properties.length > 0 && (
                    <Button
                        variant="contained"
                        startIcon={<Plus size={18} />}
                        onClick={() => setOpenAdd(true)}
                        sx={{
                            background: binThemeTokens.goldGradient,
                            color: '#000',
                            fontWeight: 'bold',
                            px: 4, py: 2
                        }}
                    >
                        {tx('chat.btn_start', 'NEW CONVERSATION')}
                    </Button>
                )}
            </Box>

            <Grid container spacing={4} sx={{ height: '70vh' }}>
                {/* Conversations List */}
                <Grid item xs={12} md={4} sx={{ height: '100%' }}>
                    <Paper sx={{ height: '100%', display: 'flex', flexDirection: 'column', bgcolor: 'rgba(22, 22, 24, 0.6)', border: '1px solid rgba(255,255,255,0.05)', overflow: 'hidden' }}>
                        <Box sx={{ p: 3, borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                            <Typography variant="h6" fontWeight="bold" color="#FFF">Conversations</Typography>
                        </Box>
                        <List sx={{ flexGrow: 1, overflowY: 'auto', p: 1 }}>
                            {conversations.map((c) => {
                                const prop = properties.find(p => p.id === c.propertyId);
                                const isSelected = selectedConv?.id === c.id;
                                return (
                                    <ListItemButton
                                        key={c.id}
                                        selected={isSelected}
                                        onClick={() => setSelectedConv(c)}
                                        sx={{
                                            borderRadius: 3, mb: 1,
                                            bgcolor: isSelected ? alpha(binThemeTokens.gold, 0.15) : 'transparent',
                                            '&:hover': { bgcolor: 'rgba(255,255,255,0.03)' }
                                        }}
                                    >
                                        <ListItemText
                                            primary={prop?.area || c.propertyId}
                                            primaryTypographyProps={{ color: '#FFF', fontWeight: 'bold' }}
                                            secondary={`${c.type?.toUpperCase()} · Status: ${c.status}`}
                                            secondaryTypographyProps={{ color: 'rgba(255,255,255,0.4)', sx: { mt: 0.5 } }}
                                        />
                                    </ListItemButton>
                                );
                            })}
                            {conversations.length === 0 && (
                                <Box sx={{ p: 4, textAlign: 'center' }}>
                                    <MessageSquare size={32} color={binThemeTokens.gold} style={{ opacity: 0.3, marginBottom: 12 }} />
                                    <Typography color="textSecondary">No conversations yet.</Typography>
                                </Box>
                            )}
                        </List>
                    </Paper>
                </Grid>

                {/* Message Log */}
                <Grid item xs={12} md={8} sx={{ height: '100%' }}>
                    <Paper sx={{ height: '100%', display: 'flex', flexDirection: 'column', bgcolor: 'rgba(22, 22, 24, 0.6)', border: '1px solid rgba(255,255,255,0.05)', overflow: 'hidden' }}>
                        {selectedConv ? (
                            <>
                                <Box sx={{ p: 3, borderBottom: '1px solid rgba(255,255,255,0.05)', bgcolor: 'rgba(255,255,255,0.01)' }}>
                                    <Typography variant="h6" fontWeight="bold" color="#FFF">
                                        {properties.find(p => p.id === selectedConv.propertyId)?.area || selectedConv.propertyId}
                                    </Typography>
                                    <Typography variant="caption" color="textSecondary">
                                        Participant: Administration Desk
                                    </Typography>
                                </Box>
                                <Box sx={{ flexGrow: 1, p: 3, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 2 }}>
                                    {messages.map((m) => {
                                        const isOwn = m.senderUid === user?.uid;
                                        return (
                                            <Box
                                                key={m.id}
                                                sx={{
                                                    alignSelf: isOwn ? 'flex-end' : 'flex-start',
                                                    maxWidth: '70%',
                                                    p: 2,
                                                    borderRadius: isOwn ? '16px 16px 0px 16px' : '16px 16px 16px 0px',
                                                    bgcolor: isOwn ? binThemeTokens.gold : 'rgba(255,255,255,0.05)',
                                                    color: isOwn ? '#000' : '#FFF',
                                                    boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
                                                }}
                                            >
                                                <Typography variant="body2" sx={{ fontWeight: isOwn ? 'bold' : 'normal' }}>
                                                    {m.body}
                                                </Typography>
                                                <Typography variant="caption" sx={{ display: 'block', mt: 0.5, textAlign: 'right', opacity: 0.6, fontSize: '0.65rem' }}>
                                                    {m.createdAt?.toDate ? m.createdAt.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Sending...'}
                                                </Typography>
                                            </Box>
                                        );
                                    })}
                                    <div ref={messagesEndRef} />
                                </Box>
                                <Box component="form" onSubmit={handleSendMessage} sx={{ p: 3, borderTop: '1px solid rgba(255,255,255,0.05)', bgcolor: 'rgba(255,255,255,0.01)' }}>
                                    <Stack direction="row" spacing={2}>
                                        <TextField
                                            fullWidth
                                            placeholder="Write message details..."
                                            value={newMessageText}
                                            onChange={e => setNewMessageText(e.target.value)}
                                            variant="filled"
                                            sx={{ '& .MuiFilledInput-root': { bgcolor: 'rgba(255,255,255,0.03)', color: '#FFF' } }}
                                        />
                                        <IconButton type="submit" disabled={sending || !newMessageText.trim()} sx={{ bgcolor: binThemeTokens.gold, color: '#000', '&:hover': { bgcolor: binThemeTokens.goldLight } }}>
                                            <Send size={18} />
                                        </IconButton>
                                    </Stack>
                                </Box>
                            </>
                        ) : (
                            <Box sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                                <MessageSquare size={48} color={binThemeTokens.gold} style={{ opacity: 0.2, marginBottom: 16 }} />
                                <Typography color="textSecondary">Select a conversation or start a new desk support session.</Typography>
                            </Box>
                        )}
                    </Paper>
                </Grid>
            </Grid>

            {/* Start Chat Dialog */}
            <Dialog open={openAdd} onClose={() => setOpenAdd(false)} PaperProps={{ sx: { bgcolor: '#0b0f19', color: '#FFF', borderRadius: 4, minWidth: 400 } }}>
                <form onSubmit={handleStartNewChat}>
                    <DialogTitle sx={{ fontWeight: 'bold' }}>Start Desk Message Thread</DialogTitle>
                    <DialogContent>
                        <Stack spacing={3} sx={{ mt: 2 }}>
                            <FormControl fullWidth variant="filled">
                                <InputLabel sx={{ color: 'rgba(255,255,255,0.5)' }}>Target Property</InputLabel>
                                <Select value={newChatProperty} onChange={e => setNewChatProperty(e.target.value)} sx={{ bgcolor: 'rgba(255,255,255,0.03)', color: '#FFF' }}>
                                    {properties.map(p => (
                                        <MenuItem key={p.id} value={p.id}>{p.area} • {p.buildingName || p.emirate}</MenuItem>
                                    ))}
                                </Select>
                            </FormControl>
                        </Stack>
                    </DialogContent>
                    <DialogActions>
                        <Button onClick={() => setOpenAdd(false)} sx={{ color: 'rgba(255,255,255,0.5)' }}>CANCEL</Button>
                        <Button type="submit" variant="contained" sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 'bold' }}>
                            START THREAD
                        </Button>
                    </DialogActions>
                </form>
            </Dialog>
        </Container>
    );
}

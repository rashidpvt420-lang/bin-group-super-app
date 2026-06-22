import React, { useState, useEffect, useRef } from 'react';
import { Box, Container, Typography, Paper, Stack, TextField, IconButton, CircularProgress, Grid, Button, alpha, Dialog, DialogTitle, DialogContent, DialogActions, MenuItem, Select, FormControl, InputLabel, List, ListItem, ListItemText, Divider } from '@mui/material';
import { Send, MessageSquare, Plus, ArrowLeft } from 'lucide-react';
import { db, doc, collection, addDoc, getDocs, serverTimestamp, query, where, orderBy, onSnapshot, updateDoc, limit } from '../../lib/firebase';
import { useRole } from '../../context/RoleContext';
import { useLanguage } from '../../context/LanguageContext';
import { binThemeTokens } from '../../theme/binGroupTheme';
import SafeIcon from '../../components/SafeIcon';

const normalizeEmail = (value: unknown) => String(value || '').trim().toLowerCase();

export default function TenantMessagesPage() {
    const { user } = useRole();
    const { tx, isRTL } = useLanguage();
    const [conversations, setConversations] = useState<any[]>([]);
    const [selectedConv, setSelectedConv] = useState<any>(null);
    const [messages, setMessages] = useState<any[]>([]);
    const [newMessage, setNewMessage] = useState('');
    const [loading, setLoading] = useState(true);
    const [openAdd, setOpenAdd] = useState(false);
    const [convType, setConvType] = useState('tenant_admin');
    const [propertyId, setPropertyId] = useState('');
    const messagesEndRef = useRef<HTMLDivElement>(null);

    // 1. Resolve residence info
    useEffect(() => {
        async function resolveResidence() {
            if (!user?.uid) return;
            try {
                let unitSnap = await getDocs(query(collection(db, 'units'), where('tenantId', '==', user.uid), limit(1)));
                if (unitSnap.empty && user.email) {
                    unitSnap = await getDocs(query(collection(db, 'units'), where('tenantEmail', '==', normalizeEmail(user.email)), limit(1)));
                }
                if (!unitSnap.empty) {
                    setPropertyId(unitSnap.docs[0].data().propertyId || '');
                }
            } catch (err) {
                console.error('Failed to resolve tenant unit:', err);
            }
        }
        resolveResidence();
    }, [user]);

    // 2. Fetch conversations
    useEffect(() => {
        if (!user?.uid) {
            setLoading(false);
            return;
        }

        const q = query(
            collection(db, 'conversations'),
            where('participantUids', 'array-contains', user.uid)
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            list.sort((a: any, b: any) => (b.lastMessageAt?.seconds || 0) - (a.lastMessageAt?.seconds || 0));
            setConversations(list);
            setLoading(false);
        }, (err) => {
            console.warn('Conversations listener error:', err);
            setLoading(false);
        });

        return () => unsubscribe();
    }, [user?.uid]);

    // 3. Fetch messages for selected conversation
    useEffect(() => {
        if (!selectedConv?.id) {
            setMessages([]);
            return;
        }

        const q = query(
            collection(db, `conversations/${selectedConv.id}/messages`),
            orderBy('createdAt', 'asc')
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            setMessages(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
            setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
        }, (err) => {
            console.warn('Messages listener error:', err);
        });

        return () => unsubscribe();
    }, [selectedConv?.id]);

    const handleSendMessage = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newMessage.trim() || !selectedConv?.id || !user) return;
        const body = newMessage;
        setNewMessage('');
        try {
            await addDoc(collection(db, `conversations/${selectedConv.id}/messages`), {
                senderUid: user.uid,
                senderRole: 'tenant',
                body,
                createdAt: serverTimestamp()
            });

            await updateDoc(doc(db, 'conversations', selectedConv.id), {
                lastMessageAt: serverTimestamp()
            });
        } catch (err) {
            console.error('Failed to send message:', err);
        }
    };

    const handleCreateConversation = async () => {
        if (!user?.uid || !propertyId) return;
        try {
            const docRef = await addDoc(collection(db, 'conversations'), {
                propertyId,
                participantUids: [user.uid, 'admin_user'], // default to chat with admin
                participantRoles: ['tenant', 'admin'],
                type: convType,
                status: 'open',
                lastMessageAt: serverTimestamp(),
                createdAt: serverTimestamp()
            });
            setOpenAdd(false);
            setSelectedConv({
                id: docRef.id,
                type: convType
            });
        } catch (err) {
            console.error('Failed to start conversation:', err);
            alert('Failed to start conversation.');
        }
    };

    if (loading) return <Box sx={{ display: 'flex', justifyContent: 'center', py: 10 }}><CircularProgress sx={{ color: binThemeTokens.gold }} /></Box>;

    return (
        <Container maxWidth="lg" sx={{ py: 4, direction: isRTL ? 'rtl' : 'ltr' }}>
            <Grid container spacing={3} sx={{ height: 'calc(100vh - 220px)' }}>
                {/* Conversations Sidebar / Selection */}
                {(!selectedConv || !isMobileView()) && (
                    <Grid item xs={12} md={4} sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
                        <Paper sx={{ p: 3, bgcolor: 'rgba(15,23,42,0.7)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 4, height: '100%', display: 'flex', flexDirection: 'column' }}>
                            <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 3 }}>
                                <Typography variant="h6" color="#FFF" fontWeight="950">INBOX</Typography>
                                <IconButton onClick={() => setOpenAdd(true)} sx={{ color: binThemeTokens.gold, border: '1px solid rgba(255,255,255,0.05)' }}>
                                    <SafeIcon icon={Plus} size={18} />
                                </IconButton>
                            </Stack>
                            <Divider sx={{ borderColor: 'rgba(255,255,255,0.05)', mb: 2 }} />
                            <List sx={{ flex: 1, overflowY: 'auto' }}>
                                {conversations.map(conv => (
                                    <ListItem
                                        button
                                        key={conv.id}
                                        onClick={() => setSelectedConv(conv)}
                                        sx={{
                                            borderRadius: 2,
                                            mb: 1,
                                            bgcolor: selectedConv?.id === conv.id ? alpha(binThemeTokens.gold, 0.08) : 'transparent',
                                            '&:hover': { bgcolor: 'rgba(255,255,255,0.02)' }
                                        }}
                                    >
                                        <ListItemText
                                            primary={conv.type === 'tenant_admin' ? 'Support Admin' : 'Technician Dispatch'}
                                            primaryTypographyProps={{ fontWeight: 900, color: selectedConv?.id === conv.id ? binThemeTokens.gold : '#FFF' }}
                                            secondary={`Status: ${conv.status}`}
                                            secondaryTypographyProps={{ color: 'textSecondary' }}
                                        />
                                    </ListItem>
                                ))}
                                {conversations.length === 0 && (
                                    <Typography variant="caption" color="textSecondary" align="center" display="block" sx={{ mt: 5 }}>
                                        No active conversations.
                                    </Typography>
                                )}
                            </List>
                        </Paper>
                    </Grid>
                )}

                {/* Message Pane */}
                {selectedConv && (
                    <Grid item xs={12} md={8} sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
                        <Paper sx={{ p: 3, bgcolor: 'rgba(22, 22, 24, 0.7)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 6, height: '100%', display: 'flex', flexDirection: 'column' }}>
                            <Stack direction="row" alignItems="center" spacing={2} sx={{ mb: 2 }}>
                                {isMobileView() && (
                                    <IconButton onClick={() => setSelectedConv(null)} sx={{ color: '#FFF' }}>
                                        <SafeIcon icon={ArrowLeft} size={20} />
                                    </IconButton>
                                )}
                                <Typography variant="h6" fontWeight="950" color="#FFF">
                                    {selectedConv.type === 'tenant_admin' ? 'Support Team' : 'Assigned Technician'}
                                </Typography>
                            </Stack>
                            <Divider sx={{ borderColor: 'rgba(255,255,255,0.05)', mb: 3 }} />

                            <Box sx={{ flex: 1, overflowY: 'auto', mb: 3, pr: 1 }}>
                                <Stack spacing={2}>
                                    {messages.map(msg => {
                                        const isMe = msg.senderUid === user?.uid;
                                        return (
                                            <Box key={msg.id} sx={{ alignSelf: isMe ? 'flex-end' : 'flex-start', maxWidth: '80%' }}>
                                                <Paper sx={{
                                                    p: 2,
                                                    bgcolor: isMe ? binThemeTokens.gold : 'rgba(255,255,255,0.05)',
                                                    color: isMe ? '#000' : '#FFF',
                                                    borderRadius: isMe ? '16px 16px 4px 16px' : '16px 16px 16px 4px'
                                                }}>
                                                    <Typography variant="body1">{msg.body}</Typography>
                                                </Paper>
                                            </Box>
                                        );
                                    })}
                                    <div ref={messagesEndRef} />
                                </Stack>
                            </Box>

                            <form onSubmit={handleSendMessage}>
                                <Paper sx={{ p: 1, bgcolor: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 10, display: 'flex', alignItems: 'center' }}>
                                    <TextField
                                        fullWidth
                                        placeholder="Type your message..."
                                        variant="standard"
                                        value={newMessage}
                                        onChange={(e) => setNewMessage(e.target.value)}
                                        sx={{ px: 2, '& .MuiInput-root': { color: '#FFF' }, '& .MuiInput-root:before, & .MuiInput-root:after': { display: 'none' } }}
                                    />
                                    <IconButton type="submit" disabled={!newMessage.trim()} sx={{ bgcolor: binThemeTokens.gold, color: '#000', '&:hover': { bgcolor: '#b4954e' }, '&.Mui-disabled': { bgcolor: 'rgba(255,255,255,0.1)' } }}>
                                        <SafeIcon icon={Send} size={20} />
                                    </IconButton>
                                </Paper>
                            </form>
                        </Paper>
                    </Grid>
                )}
            </Grid>

            {/* Dialog for starting new chat */}
            <Dialog open={openAdd} onClose={() => setOpenAdd(false)} PaperProps={{ sx: { bgcolor: '#020617', color: '#FFF', borderRadius: 6, border: '1px solid rgba(255,255,255,0.1)', minWidth: 320 } }}>
                <DialogTitle sx={{ fontWeight: 950, color: binThemeTokens.gold }}>START CONVERSATION</DialogTitle>
                <DialogContent>
                    <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.4)', mb: 3 }}>
                        Select the team or contact you would like to start a private conversation with.
                    </Typography>
                    <FormControl fullWidth variant="filled">
                        <InputLabel sx={{ color: 'rgba(255,255,255,0.5)' }}>Recipient Team</InputLabel>
                        <Select value={convType} onChange={e => setConvType(e.target.value)} sx={{ bgcolor: 'rgba(255,255,255,0.03)', color: '#FFF', borderRadius: 2 }}>
                            <MenuItem value="tenant_admin">Support Admin Team</MenuItem>
                            <MenuItem value="tenant_technician">Technician Dispatch</MenuItem>
                        </Select>
                    </FormControl>
                </DialogContent>
                <DialogActions sx={{ p: 3 }}>
                    <Button onClick={() => setOpenAdd(false)} sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 900 }}>CANCEL</Button>
                    <Button onClick={handleCreateConversation} variant="contained" disabled={!propertyId} sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950, px: 3, borderRadius: 2 }}>
                        START
                    </Button>
                </DialogActions>
            </Dialog>
        </Container>
    );
}

function isMobileView() {
    return window.innerWidth < 900;
}

import React, { useState, useEffect } from 'react';
import { Container, Typography, Box, Paper, Grid, Stack, Button, CircularProgress, Dialog, DialogTitle, DialogContent, DialogActions, TextField, MenuItem, FormControl, InputLabel, Select, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Chip } from '@mui/material';
import { Plus, Megaphone, Bell } from 'lucide-react';
import { db, collection, query, where, getDocs, addDoc, serverTimestamp, onSnapshot, orderBy } from '../../lib/firebase';
import { useRole } from '../../context/RoleContext';
import { useLanguage } from '../../context/LanguageContext';
import { binThemeTokens } from '../../theme/binGroupTheme';

export default function OwnerAnnouncementsPage() {
    const { user } = useRole();
    const { t, tx, isRTL } = useLanguage();
    const [properties, setProperties] = useState<any[]>([]);
    const [announcements, setAnnouncements] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [openAdd, setOpenAdd] = useState(false);
    const [submitting, setSubmitting] = useState(false);

    // Form inputs
    const [targetProperty, setTargetProperty] = useState('');
    const [title, setTitle] = useState('');
    const [body, setBody] = useState('');
    const [category, setCategory] = useState('general');
    const [priority, setPriority] = useState('normal');
    const [audience, setAudience] = useState('all');

    useEffect(() => {
        if (!user?.uid) return;

        // Fetch owner properties
        const fetchProperties = async () => {
            try {
                const q = query(collection(db, 'properties'), where('ownerId', '==', user.uid));
                const snap = await getDocs(q);
                const props = snap.docs.map(d => ({ id: d.id, ...d.data() }));
                setProperties(props);
                if (props.length > 0) {
                    setTargetProperty(props[0].id);
                }
            } catch (err) {
                console.error("Error fetching properties:", err);
            }
        };

        fetchProperties();

        // Listen to announcements created by this owner
        const qAnnounce = query(
            collection(db, 'announcements'),
            where('createdBy', '==', user.uid),
            orderBy('publishedAt', 'desc')
        );

        const unsubscribe = onSnapshot(qAnnounce, (snap) => {
            setAnnouncements(snap.docs.map(d => ({ id: d.id, ...d.data() })));
            setLoading(false);
        }, (err) => {
            console.error("Announcements subscription error:", err);
            setLoading(false);
        });

        return () => unsubscribe();
    }, [user]);

    const handleCreateAnnouncement = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!targetProperty || !title || !body) return;
        setSubmitting(true);
        try {
            // Write announcement
            const docRef = await addDoc(collection(db, 'announcements'), {
                propertyId: targetProperty,
                title,
                body,
                category,
                priority,
                audience,
                published: true,
                publishedAt: serverTimestamp(),
                createdBy: user?.uid,
                readBy: {}
            });

            // Write matching notification to notify tenants
            await addDoc(collection(db, 'notifications'), {
                propertyId: targetProperty,
                title: `${category.toUpperCase()}: ${title}`,
                message: body,
                category,
                priority,
                userId: 'all_tenants', // read by rule or handled in client notices page
                read: false,
                createdAt: serverTimestamp()
            });

            setOpenAdd(false);
            setTitle('');
            setBody('');
        } catch (err) {
            console.error("Failed to broadcast announcement:", err);
            alert("Error broadcasting update.");
        } finally {
            setSubmitting(false);
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
                        {tx('announce.broadcast_subtitle', 'OWNER BROADCAST SYSTEM')}
                    </Typography>
                    <Typography variant="h3" fontWeight="950" color="#FFF">
                        {tx('announce.title', 'Notices & Announcements')}
                    </Typography>
                    <Typography variant="body1" color="rgba(255,255,255,0.5)">
                        {tx('announce.desc', 'Publish building notices and emergency updates to tenants.')}
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
                        {tx('announce.btn_broadcast', 'NEW BROADCAST')}
                    </Button>
                )}
            </Box>

            {properties.length === 0 ? (
                <Paper sx={{ p: 6, textAlign: 'center', bgcolor: 'rgba(255,255,255,0.01)', border: '1px solid rgba(255,255,255,0.05)' }}>
                    <Megaphone size={48} color={binThemeTokens.gold} style={{ marginBottom: 16 }} />
                    <Typography variant="h5" color="#FFF" gutterBottom>No properties linked.</Typography>
                    <Typography variant="body2" color="textSecondary">Onboard a property to broadcast notices.</Typography>
                </Paper>
            ) : (
                <Grid container spacing={4}>
                    <Grid item xs={12}>
                        <Paper sx={{ p: 4, bgcolor: 'rgba(22, 22, 24, 0.6)', border: '1px solid rgba(255,255,255,0.05)' }}>
                            <Typography variant="h6" fontWeight="bold" color="#FFF" sx={{ mb: 4, display: 'flex', alignItems: 'center', gap: 1, flexDirection: isRTL ? 'row-reverse' : 'row' }}>
                                <Bell size={20} color={binThemeTokens.gold} />
                                {tx('announce.broadcast_log', 'Broadcast History Log')}
                            </Typography>
                            <TableContainer>
                                <Table>
                                    <TableHead>
                                        <TableRow sx={{ '& th': { color: 'rgba(255,255,255,0.4)', fontWeight: 900, borderBottom: '1px solid rgba(255,255,255,0.1)' } }}>
                                            <TableCell>{tx('announce.col_property', 'Property')}</TableCell>
                                            <TableCell>{tx('announce.col_title', 'Title')}</TableCell>
                                            <TableCell>{tx('announce.col_category', 'Category')}</TableCell>
                                            <TableCell>{tx('announce.col_priority', 'Priority')}</TableCell>
                                            <TableCell>{tx('announce.col_date', 'Sent Date')}</TableCell>
                                        </TableRow>
                                    </TableHead>
                                    <TableBody>
                                        {announcements.map((ann) => {
                                            const prop = properties.find(p => p.id === ann.propertyId);
                                            return (
                                                <TableRow key={ann.id}>
                                                    <TableCell sx={{ color: '#FFF', fontWeight: 'bold' }}>{prop?.area || ann.propertyId}</TableCell>
                                                    <TableCell sx={{ color: '#FFF' }}>
                                                        <Typography variant="subtitle2" fontWeight="bold">{ann.title}</Typography>
                                                        <Typography variant="body2" color="textSecondary" sx={{ mt: 0.5 }}>{ann.body}</Typography>
                                                    </TableCell>
                                                    <TableCell>
                                                        <Chip label={ann.category?.toUpperCase()} size="small" color={ann.category === 'emergency' ? 'error' : 'secondary'} />
                                                    </TableCell>
                                                    <TableCell>
                                                        <Chip label={ann.priority?.toUpperCase()} size="small" color={ann.priority === 'urgent' || ann.priority === 'high' ? 'warning' : 'default'} />
                                                    </TableCell>
                                                    <TableCell sx={{ color: 'rgba(255,255,255,0.6)' }}>
                                                        {ann.publishedAt?.toDate ? ann.publishedAt.toDate().toLocaleString() : 'Just now'}
                                                    </TableCell>
                                                </TableRow>
                                            );
                                        })}
                                        {announcements.length === 0 && (
                                            <TableRow>
                                                <TableCell colSpan={5} align="center" sx={{ py: 6 }}>
                                                    <Typography color="textSecondary">No broadcasts logged yet.</Typography>
                                                </TableCell>
                                            </TableRow>
                                        )}
                                    </TableBody>
                                </Table>
                            </TableContainer>
                        </Paper>
                    </Grid>
                </Grid>
            )}

            {/* Broadcast dialog */}
            <Dialog open={openAdd} onClose={() => setOpenAdd(false)} PaperProps={{ sx: { bgcolor: '#0b0f19', color: '#FFF', borderRadius: 4, minWidth: 400 } }}>
                <form onSubmit={handleCreateAnnouncement}>
                    <DialogTitle sx={{ fontWeight: 'bold' }}>Broadcast building updates</DialogTitle>
                    <DialogContent>
                        <Stack spacing={3} sx={{ mt: 2 }}>
                            <FormControl fullWidth variant="filled">
                                <InputLabel sx={{ color: 'rgba(255,255,255,0.5)' }}>Target Property</InputLabel>
                                <Select value={targetProperty} onChange={e => setTargetProperty(e.target.value)} sx={{ bgcolor: 'rgba(255,255,255,0.03)', color: '#FFF' }}>
                                    {properties.map(p => (
                                        <MenuItem key={p.id} value={p.id}>{p.area} • {p.buildingName || p.emirate}</MenuItem>
                                    ))}
                                </Select>
                            </FormControl>
                            <TextField fullWidth label="Title" required value={title} onChange={e => setTitle(e.target.value)} variant="filled" sx={{ '& .MuiFilledInput-root': { bgcolor: 'rgba(255,255,255,0.03)', color: '#FFF' } }} />
                            <TextField fullWidth label="Message Details" required multiline rows={4} value={body} onChange={e => setBody(e.target.value)} variant="filled" sx={{ '& .MuiFilledInput-root': { bgcolor: 'rgba(255,255,255,0.03)', color: '#FFF' } }} />
                            <Grid container spacing={2}>
                                <Grid item xs={6}>
                                    <FormControl fullWidth variant="filled">
                                        <InputLabel sx={{ color: 'rgba(255,255,255,0.5)' }}>Category</InputLabel>
                                        <Select value={category} onChange={e => setCategory(e.target.value)} sx={{ bgcolor: 'rgba(255,255,255,0.03)', color: '#FFF' }}>
                                            <MenuItem value="maintenance">Maintenance</MenuItem>
                                            <MenuItem value="safety">Safety</MenuItem>
                                            <MenuItem value="community">Community</MenuItem>
                                            <MenuItem value="policy">Policy</MenuItem>
                                            <MenuItem value="emergency">Emergency</MenuItem>
                                            <MenuItem value="general">General</MenuItem>
                                        </Select>
                                    </FormControl>
                                </Grid>
                                <Grid item xs={6}>
                                    <FormControl fullWidth variant="filled">
                                        <InputLabel sx={{ color: 'rgba(255,255,255,0.5)' }}>Priority</InputLabel>
                                        <Select value={priority} onChange={e => setPriority(e.target.value)} sx={{ bgcolor: 'rgba(255,255,255,0.03)', color: '#FFF' }}>
                                            <MenuItem value="low">Low</MenuItem>
                                            <MenuItem value="normal">Normal</MenuItem>
                                            <MenuItem value="high">High</MenuItem>
                                            <MenuItem value="urgent">Urgent</MenuItem>
                                        </Select>
                                    </FormControl>
                                </Grid>
                            </Grid>
                        </Stack>
                    </DialogContent>
                    <DialogActions>
                        <Button onClick={() => setOpenAdd(false)} sx={{ color: 'rgba(255,255,255,0.5)' }}>CANCEL</Button>
                        <Button type="submit" variant="contained" disabled={submitting} sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 'bold' }}>
                            {submitting ? <CircularProgress size={20} color="inherit" /> : 'BROADCAST'}
                        </Button>
                    </DialogActions>
                </form>
            </Dialog>
        </Container>
    );
}

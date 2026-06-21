import React, { useEffect, useState } from 'react';
import { Container, Typography, Paper, Grid, Stack, Button, Chip, CircularProgress, Box, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Dialog, DialogTitle, DialogContent, DialogActions, TextField, MenuItem, Select, FormControl, InputLabel } from '@mui/material';
import { Plus } from 'lucide-react';
import { useLanguage } from '@bin/shared';
import { db, collection, query, onSnapshot, addDoc, serverTimestamp, doc, deleteDoc, updateDoc } from '../../lib/firebase';
import { binThemeTokens } from '../../theme/adminTheme';

export default function AnnouncementsPage() {
    const { t, isRTL } = useLanguage();
    const [loading, setLoading] = useState(true);
    const [announcements, setAnnouncements] = useState<any[]>([]);
    const [openAdd, setOpenAdd] = useState(false);
    const [submitting, setSubmitting] = useState(false);

    // Form fields
    const [title, setTitle] = useState('');
    const [body, setBody] = useState('');
    const [category, setCategory] = useState('general');
    const [priority, setPriority] = useState('normal');
    const [propertyId, setPropertyId] = useState('prop_a');
    const [audience, setAudience] = useState('all');

    useEffect(() => {
        const q = query(collection(db, 'announcements'));
        const unsub = onSnapshot(q, (snap) => {
            const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            list.sort((a: any, b: any) => (b.publishedAt?.seconds || 0) - (a.publishedAt?.seconds || 0));
            setAnnouncements(list);
            setLoading(false);
        });
        return () => unsub();
    }, []);

    const handleCreateAnnouncement = async (e: React.FormEvent) => {
        e.preventDefault();
        setSubmitting(true);
        try {
            await addDoc(collection(db, 'announcements'), {
                propertyId,
                title,
                body,
                category,
                priority,
                audience,
                published: true,
                publishedAt: serverTimestamp(),
                createdBy: 'Admin'
            });
            setOpenAdd(false);
            setTitle('');
            setBody('');
        } catch (err) {
            console.error('Failed to publish announcement:', err);
            alert('Failed to publish announcement.');
        } finally {
            setSubmitting(false);
        }
    };

    const handleDeleteAnnouncement = async (id: string) => {
        if (!window.confirm('Delete announcement?')) return;
        try {
            await deleteDoc(doc(db, 'announcements', id));
        } catch (err) {
            console.error(err);
        }
    };

    if (loading) {
        return <Box sx={{ display: 'flex', justifyContent: 'center', py: 10 }}><CircularProgress sx={{ color: binThemeTokens.gold }} /></Box>;
    }

    return (
        <Container maxWidth="xl" sx={{ py: 6, direction: isRTL ? 'rtl' : 'ltr' }}>
            <Box sx={{ mb: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexDirection: isRTL ? 'row-reverse' : 'row' }}>
                <Box>
                    <Typography variant="h4" fontWeight="black" color="#FFF" gutterBottom>Announcements Broadcast</Typography>
                    <Typography variant="body2" color="text.secondary">Create and broadcast announcements to buildings, tenants, or owners.</Typography>
                </Box>
                <Button variant="contained" startIcon={<Plus size={16} />} onClick={() => setOpenAdd(true)} sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 'bold' }}>
                    NEW ANNOUNCEMENT
                </Button>
            </Box>

            <Grid container spacing={4}>
                <Grid item xs={12}>
                    <TableContainer component={Paper} elevation={0} sx={{ border: '1px solid rgba(255,255,255,0.05)', borderRadius: 3, bgcolor: 'rgba(255,255,255,0.01)' }}>
                        <Table sx={{ minWidth: 650, '& .MuiTableCell-root': { borderColor: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.7)' } }}>
                            <TableHead sx={{ bgcolor: 'rgba(255,255,255,0.02)' }}>
                                <TableRow sx={{ '& th': { color: '#FFF', fontWeight: 'bold' } }}>
                                    <TableCell>Title</TableCell>
                                    <TableCell>Category</TableCell>
                                    <TableCell>Priority</TableCell>
                                    <TableCell>Property / Audience</TableCell>
                                    <TableCell>Published At</TableCell>
                                    <TableCell align="right">Actions</TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {announcements.map((ann) => (
                                    <TableRow key={ann.id} hover>
                                        <TableCell sx={{ fontWeight: 'bold', color: '#FFF' }}>{ann.title}</TableCell>
                                        <TableCell>{ann.category?.toUpperCase()}</TableCell>
                                        <TableCell>
                                            <Chip label={ann.priority?.toUpperCase()} size="small" color={ann.priority === 'urgent' ? 'error' : ann.priority === 'high' ? 'warning' : 'primary'} />
                                        </TableCell>
                                        <TableCell>{ann.propertyId} / {ann.audience?.toUpperCase()}</TableCell>
                                        <TableCell>{ann.publishedAt?.toDate ? ann.publishedAt.toDate().toLocaleString() : '—'}</TableCell>
                                        <TableCell align="right">
                                            <Button size="small" color="error" onClick={() => handleDeleteAnnouncement(ann.id)}>DELETE</Button>
                                        </TableCell>
                                    </TableRow>
                                ))}
                                {announcements.length === 0 && (
                                    <TableRow>
                                        <TableCell colSpan={6} align="center" sx={{ py: 8 }}>
                                            <Typography color="textSecondary">No announcements found.</Typography>
                                        </TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </TableContainer>
                </Grid>
            </Grid>

            {/* Add Announcement Dialog */}
            <Dialog open={openAdd} onClose={() => setOpenAdd(false)} PaperProps={{ sx: { bgcolor: '#0b0f19', color: '#FFF', borderRadius: 4 } }}>
                <form onSubmit={handleCreateAnnouncement}>
                    <DialogTitle sx={{ fontWeight: 'bold' }}>New Broadcast Announcement</DialogTitle>
                    <DialogContent>
                        <Stack spacing={3} sx={{ mt: 2, minWidth: 320 }}>
                            <TextField fullWidth label="Title" required value={title} onChange={e => setTitle(e.target.value)} variant="filled" sx={{ '& .MuiFilledInput-root': { bgcolor: 'rgba(255,255,255,0.03)', color: '#FFF' } }} />
                            <TextField fullWidth multiline rows={4} label="Message Body" required value={body} onChange={e => setBody(e.target.value)} variant="filled" sx={{ '& .MuiFilledInput-root': { bgcolor: 'rgba(255,255,255,0.03)', color: '#FFF' } }} />
                            <Grid container spacing={2}>
                                <Grid item xs={6}>
                                    <FormControl fullWidth variant="filled">
                                        <InputLabel sx={{ color: 'rgba(255,255,255,0.5)' }}>Category</InputLabel>
                                        <Select value={category} onChange={e => setCategory(e.target.value)} sx={{ bgcolor: 'rgba(255,255,255,0.03)', color: '#FFF' }}>
                                            <MenuItem value="general">General</MenuItem>
                                            <MenuItem value="maintenance">Maintenance</MenuItem>
                                            <MenuItem value="safety">Safety</MenuItem>
                                            <MenuItem value="community">Community</MenuItem>
                                            <MenuItem value="policy">Policy</MenuItem>
                                            <MenuItem value="emergency">Emergency</MenuItem>
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
                            <TextField fullWidth label="Property ID" required value={propertyId} onChange={e => setPropertyId(e.target.value)} variant="filled" sx={{ '& .MuiFilledInput-root': { bgcolor: 'rgba(255,255,255,0.03)', color: '#FFF' } }} />
                            <FormControl fullWidth variant="filled">
                                <InputLabel sx={{ color: 'rgba(255,255,255,0.5)' }}>Target Audience</InputLabel>
                                <Select value={audience} onChange={e => setAudience(e.target.value)} sx={{ bgcolor: 'rgba(255,255,255,0.03)', color: '#FFF' }}>
                                    <MenuItem value="all">All Residents (Tenants & Owners)</MenuItem>
                                    <MenuItem value="tenants">Tenants Only</MenuItem>
                                    <MenuItem value="owners">Owners Only</MenuItem>
                                </Select>
                            </FormControl>
                        </Stack>
                    </DialogContent>
                    <DialogActions>
                        <Button onClick={() => setOpenAdd(false)} sx={{ color: 'rgba(255,255,255,0.5)' }}>CANCEL</Button>
                        <Button type="submit" variant="contained" disabled={submitting} sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 'bold' }}>
                            {submitting ? <CircularProgress size={20} color="inherit" /> : 'PUBLISH'}
                        </Button>
                    </DialogActions>
                </form>
            </Dialog>
        </Container>
    );
}

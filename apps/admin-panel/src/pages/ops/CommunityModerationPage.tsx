import React, { useEffect, useState } from 'react';
import { Container, Typography, Paper, Grid, Stack, Button, Chip, CircularProgress, Box, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, IconButton } from '@mui/material';
import { Check, X } from 'lucide-react';
import { useLanguage } from '@bin/shared';
import { db, collection, query, onSnapshot, doc, updateDoc, serverTimestamp, deleteDoc } from '../../lib/firebase';
import { binThemeTokens } from '../../theme/adminTheme';
import SafeIcon from '../../components/SafeIcon';

export default function CommunityModerationPage() {
    const { isRTL } = useLanguage();
    const [loading, setLoading] = useState(true);
    const [posts, setPosts] = useState<any[]>([]);

    useEffect(() => {
        const q = query(collection(db, 'communityPosts'));
        const unsub = onSnapshot(q, (snap) => {
            const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            list.sort((a: any, b: any) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
            setPosts(list);
            setLoading(false);
        });
        return () => unsub();
    }, []);

    const handleUpdateStatus = async (id: string, status: string) => {
        try {
            await updateDoc(doc(db, 'communityPosts', id), {
                status,
                approvedBy: 'Admin Moderator',
                approvedAt: serverTimestamp()
            });
        } catch (err) {
            console.error('Failed to moderate post:', err);
        }
    };

    const handleDeletePost = async (id: string) => {
        if (!window.confirm('Delete post?')) return;
        try {
            await deleteDoc(doc(db, 'communityPosts', id));
        } catch (err) {
            console.error(err);
        }
    };

    if (loading) {
        return <Box sx={{ display: 'flex', justifyContent: 'center', py: 10 }}><CircularProgress sx={{ color: binThemeTokens.gold }} /></Box>;
    }

    return (
        <Container maxWidth="xl" sx={{ py: 6, direction: isRTL ? 'rtl' : 'ltr' }}>
            <Box sx={{ mb: 4 }}>
                <Typography variant="h4" fontWeight="black" color="#FFF" gutterBottom>Community Board Moderation</Typography>
                <Typography variant="body2" color="text.secondary">Review, approve, or reject resident community board posts.</Typography>
            </Box>

            <Grid container spacing={4}>
                <Grid item xs={12}>
                    <TableContainer component={Paper} elevation={0} sx={{ border: '1px solid rgba(255,255,255,0.05)', borderRadius: 3, bgcolor: 'rgba(255,255,255,0.01)' }}>
                        <Table sx={{ minWidth: 650, '& .MuiTableCell-root': { borderColor: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.7)' } }}>
                            <TableHead sx={{ bgcolor: 'rgba(255,255,255,0.02)' }}>
                                <TableRow sx={{ '& th': { color: '#FFF', fontWeight: 'bold' } }}>
                                    <TableCell>Post details</TableCell>
                                    <TableCell>Author / Role</TableCell>
                                    <TableCell>Category</TableCell>
                                    <TableCell>Status</TableCell>
                                    <TableCell align="right">Actions</TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {posts.map((p) => (
                                    <TableRow key={p.id} hover>
                                        <TableCell sx={{ maxWidth: 400 }}>
                                            <Typography variant="subtitle2" color="#FFF" fontWeight="bold">{p.title}</Typography>
                                            <Typography variant="caption" color="textSecondary" sx={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{p.body}</Typography>
                                        </TableCell>
                                        <TableCell>
                                            <Typography variant="body2" color="#FFF">{p.authorUid}</Typography>
                                            <Typography variant="caption" color="textSecondary">{p.authorRole?.toUpperCase()}</Typography>
                                        </TableCell>
                                        <TableCell>{p.category?.toUpperCase()}</TableCell>
                                        <TableCell>
                                            <Chip label={p.status?.toUpperCase()} size="small" color={p.status === 'approved' ? 'success' : p.status === 'pending' ? 'warning' : 'error'} />
                                        </TableCell>
                                        <TableCell align="right">
                                            <Stack direction="row" spacing={1} justifyContent="flex-end">
                                                {p.status === 'pending' && (
                                                    <>
                                                        <IconButton size="small" color="success" onClick={() => handleUpdateStatus(p.id, 'approved')}>
                                                            <SafeIcon icon={Check} size={16} />
                                                        </IconButton>
                                                        <IconButton size="small" color="error" onClick={() => handleUpdateStatus(p.id, 'rejected')}>
                                                            <SafeIcon icon={X} size={16} />
                                                        </IconButton>
                                                    </>
                                                )}
                                                <Button size="small" color="error" onClick={() => handleDeletePost(p.id)}>DELETE</Button>
                                            </Stack>
                                        </TableCell>
                                    </TableRow>
                                ))}
                                {posts.length === 0 && (
                                    <TableRow>
                                        <TableCell colSpan={5} align="center" sx={{ py: 8 }}>
                                            <Typography color="textSecondary">No community board posts found.</Typography>
                                        </TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </TableContainer>
                </Grid>
            </Grid>
        </Container>
    );
}

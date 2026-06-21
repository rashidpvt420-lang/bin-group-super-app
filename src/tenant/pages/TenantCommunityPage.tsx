import React, { useEffect, useState } from 'react';
import { Box, Container, Typography, Paper, Grid, Stack, Button, Chip, CircularProgress, alpha, Dialog, DialogTitle, DialogContent, DialogActions, TextField, MenuItem, Select, FormControl, InputLabel, Card, CardContent } from '@mui/material';
import { Users, Plus, MessageSquare, Clock, ShieldCheck, AlertCircle } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import { useRole } from '../../context/RoleContext';
import { db, collection, query, where, getDocs, limit, addDoc, onSnapshot, serverTimestamp } from '../../lib/firebase';
import { binThemeTokens } from '../../theme/binGroupTheme';
import SafeIcon from '../../components/SafeIcon';

const normalizeEmail = (value: unknown) => String(value || '').trim().toLowerCase();

export default function TenantCommunityPage() {
  const { tx, lang, isRTL } = useLanguage();
  const { user } = useRole();
  const [loading, setLoading] = useState(true);
  const [posts, setPosts] = useState<any[]>([]);
  const [openAdd, setOpenAdd] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [category, setCategory] = useState('general');
  const [propertyId, setPropertyId] = useState('');

  // Comment state
  const [activePostComments, setActivePostComments] = useState<any[]>([]);
  const [selectedPostForComments, setSelectedPostForComments] = useState<any>(null);
  const [newComment, setNewComment] = useState('');

  const label = (key: string, en: string, ar: string) => lang === 'ar' ? ar : tx(key, en);

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

  // 2. Query posts (approved posts or user's own pending posts)
  useEffect(() => {
    if (!propertyId) {
      if (!loading) setLoading(false);
      return;
    }

    const q = query(
      collection(db, 'communityPosts'),
      where('propertyId', '==', propertyId)
    );

    const unsub = onSnapshot(q, (snap) => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      const filtered = list.filter((item: any) => item.status === 'approved' || item.authorUid === user?.uid);
      filtered.sort((a: any, b: any) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
      setPosts(filtered);
      setLoading(false);
    }, (err) => {
      console.warn('Community posts listener failed:', err);
      setLoading(false);
    });

    return () => unsub();
  }, [propertyId, user?.uid]);

  // 3. Listen to comments on selected post
  useEffect(() => {
    if (!selectedPostForComments?.id) {
      setActivePostComments([]);
      return;
    }

    const q = query(
      collection(db, 'communityComments'),
      where('postId', '==', selectedPostForComments.id)
    );

    const unsub = onSnapshot(q, (snap) => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      list.sort((a: any, b: any) => (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0));
      setActivePostComments(list);
    }, (err) => {
      console.warn('Comments listener error:', err);
    });

    return () => unsub();
  }, [selectedPostForComments?.id]);

  const handleCreatePost = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.uid || !title.trim() || !body.trim() || !propertyId) return;
    setSubmitting(true);
    try {
      await addDoc(collection(db, 'communityPosts'), {
        propertyId,
        authorUid: user.uid,
        authorRole: 'tenant',
        title: title.trim(),
        body: body.trim(),
        category,
        status: 'pending', // strict moderation enforcement
        createdAt: serverTimestamp()
      });
      setOpenAdd(false);
      setTitle('');
      setBody('');
      setCategory('general');
    } catch (err) {
      console.error('Failed to create post:', err);
      alert('Failed to post: ' + (err instanceof Error ? err.message : String(err)));
    } finally {
      setSubmitting(false);
    }
  };

  const handleCreateComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.uid || !newComment.trim() || !selectedPostForComments?.id) return;
    try {
      await addDoc(collection(db, 'communityComments'), {
        postId: selectedPostForComments.id,
        authorUid: user.uid,
        authorRole: 'tenant',
        authorName: user.displayName || 'Resident',
        body: newComment.trim(),
        createdAt: serverTimestamp()
      });
      setNewComment('');
    } catch (err) {
      console.error('Failed to add comment:', err);
    }
  };

  if (loading) {
    return <Box sx={{ display: 'flex', justifyContent: 'center', py: 10 }}><CircularProgress sx={{ color: binThemeTokens.gold }} /></Box>;
  }

  return (
    <Container maxWidth="lg" sx={{ py: 4, direction: isRTL ? 'rtl' : 'ltr' }}>
      <Box sx={{ mb: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 2 }}>
        <Box sx={{ textAlign: isRTL ? 'right' : 'left' }}>
          <Typography variant="h3" sx={{ color: '#fff', fontWeight: 950, display: 'flex', alignItems: 'center', gap: 2, justifyContent: isRTL ? 'flex-end' : 'flex-start' }}>
            <SafeIcon icon={Users} size={36} style={{ color: binThemeTokens.gold }} />
            {label('tenant.community.title', 'Community Board', 'لوحة المجتمع')}
          </Typography>
          <Typography sx={{ color: 'rgba(255,255,255,0.5)', mt: 1 }}>
            {label('tenant.community.desc', 'Share recommendation, rule queries, events, and recommendations with other residents (subject to admin moderation).', 'شارك التوصيات واستفسارات القواعد والفعاليات والتوصيات مع السكان الآخرين (تخضع لرقابة المسؤول).')}
          </Typography>
        </Box>
        <Button
          variant="contained"
          startIcon={<Plus />}
          onClick={() => setOpenAdd(true)}
          disabled={!propertyId}
          sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950, borderRadius: 3, px: 3, py: 1.2 }}
        >
          {label('tenant.community.new_post', 'CREATE POST', 'إنشاء منشور')}
        </Button>
      </Box>

      {!propertyId ? (
        <Paper sx={{ p: 5, textAlign: 'center', bgcolor: 'rgba(255,255,255,0.01)', border: '1px dashed rgba(255,255,255,0.08)', borderRadius: 4 }}>
          <SafeIcon icon={AlertCircle} size={48} style={{ color: 'rgba(255,255,255,0.2)', margin: '0 auto' }} />
          <Typography sx={{ color: '#FFF', fontWeight: 950, mt: 2 }}>
            {label('tenant.community.no_prop', 'No Assigned Property Found', 'لم يتم العثور على عقار معين')}
          </Typography>
        </Paper>
      ) : (
        <Grid container spacing={4}>
          <Grid item xs={12} lg={selectedPostForComments ? 6 : 12}>
            <Stack spacing={3}>
              {posts.map((p) => {
                const isPending = p.status === 'pending';
                return (
                  <Card key={p.id} sx={{
                    bgcolor: 'rgba(15,23,42,0.7)',
                    border: isPending ? '1px dashed rgba(218, 165, 32, 0.4)' : '1px solid rgba(255,255,255,0.06)',
                    borderRadius: 4
                  }}>
                    <CardContent sx={{ p: 4 }}>
                      <Stack spacing={2}>
                        <Stack direction="row" justifyContent="space-between" alignItems="center">
                          <Stack direction="row" spacing={1.5} alignItems="center">
                            <Chip label={p.category?.toUpperCase()} size="small" sx={{ bgcolor: 'rgba(255,255,255,0.05)', color: binThemeTokens.gold, fontWeight: 900 }} />
                            {isPending && (
                              <Chip
                                size="small"
                                icon={<Clock size={12} />}
                                label="PENDING MODERATION"
                                sx={{ bgcolor: alpha(binThemeTokens.gold, 0.1), color: binThemeTokens.gold, fontWeight: 950, '& .MuiChip-icon': { color: binThemeTokens.gold } }}
                              />
                            )}
                          </Stack>
                          <Typography variant="caption" color="textSecondary">
                            {p.createdAt?.toDate ? p.createdAt.toDate().toLocaleDateString() : 'Just now'}
                          </Typography>
                        </Stack>

                        <Box>
                          <Typography variant="h6" fontWeight="950" color="#FFF" sx={{ mb: 1 }}>{p.title}</Typography>
                          <Typography sx={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.95rem', lineHeight: 1.6 }}>{p.body}</Typography>
                        </Box>

                        <Stack direction="row" justifyContent="flex-end" spacing={2} sx={{ pt: 2, borderTop: '1px solid rgba(255,255,255,0.03)' }}>
                          <Button
                            size="small"
                            variant="text"
                            startIcon={<SafeIcon icon={MessageSquare} size={15} />}
                            onClick={() => setSelectedPostForComments(p)}
                            sx={{ color: binThemeTokens.gold, fontWeight: 950 }}
                          >
                            COMMENTS
                          </Button>
                        </Stack>
                      </Stack>
                    </CardContent>
                  </Card>
                );
              })}
            </Stack>
          </Grid>

          {/* Comments Panel */}
          {selectedPostForComments && (
            <Grid item xs={12} lg={6}>
              <Paper sx={{ p: 4, bgcolor: 'rgba(22, 22, 24, 0.7)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 5 }}>
                <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 3 }}>
                  <Typography variant="h6" color="#FFF" fontWeight="950">
                    Comments: {selectedPostForComments.title}
                  </Typography>
                  <Button size="small" onClick={() => setSelectedPostForComments(null)} sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 900 }}>CLOSE</Button>
                </Stack>

                <Stack spacing={2} sx={{ mb: 4, maxHeight: 400, overflowY: 'auto', pr: 1 }}>
                  {activePostComments.map((c) => (
                    <Box key={c.id} sx={{ p: 2, bgcolor: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.03)', borderRadius: 3 }}>
                      <Stack direction="row" justifyContent="space-between" sx={{ mb: 1 }}>
                        <Typography variant="caption" sx={{ color: binThemeTokens.gold, fontWeight: 950 }}>{c.authorName}</Typography>
                        <Typography variant="caption" color="textSecondary">
                          {c.createdAt?.toDate ? c.createdAt.toDate().toLocaleDateString() : ''}
                        </Typography>
                      </Stack>
                      <Typography variant="body2" sx={{ color: '#FFF' }}>{c.body}</Typography>
                    </Box>
                  ))}
                  {activePostComments.length === 0 && (
                    <Typography variant="caption" color="textSecondary" align="center" display="block" sx={{ py: 3 }}>
                      No comments yet. Write the first comment!
                    </Typography>
                  )}
                </Stack>

                <form onSubmit={handleCreateComment}>
                  <Stack direction="row" spacing={1.5}>
                    <TextField
                      fullWidth
                      size="small"
                      placeholder="Write a comment..."
                      value={newComment}
                      onChange={(e) => setNewComment(e.target.value)}
                      variant="filled"
                      sx={{ '& .MuiFilledInput-root': { bgcolor: 'rgba(255,255,255,0.03)', borderRadius: 2, color: '#FFF' } }}
                    />
                    <Button type="submit" variant="contained" disabled={!newComment.trim()} sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950 }}>
                      SEND
                    </Button>
                  </Stack>
                </form>
              </Paper>
            </Grid>
          )}
        </Grid>
      )}

      <Dialog open={openAdd} onClose={() => setOpenAdd(false)} PaperProps={{ sx: { bgcolor: '#020617', color: '#FFF', borderRadius: 6, border: '1px solid rgba(255,255,255,0.1)', minWidth: { xs: '90%', sm: 480 } } }}>
        <form onSubmit={handleCreatePost}>
          <DialogTitle sx={{ p: 4, pb: 0, fontWeight: 950, color: binThemeTokens.gold, textTransform: 'uppercase', letterSpacing: 2 }}>Create Community Post</DialogTitle>
          <DialogContent sx={{ p: 4 }}>
            <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.4)', mb: 3 }}>
              Create a new building post. All posts are held in review and will appear to other residents once moderated.
            </Typography>
            <Stack spacing={3}>
              <TextField fullWidth label="Title *" required value={title} onChange={e => setTitle(e.target.value)} variant="filled" sx={{ '& .MuiFilledInput-root': { bgcolor: 'rgba(255,255,255,0.03)', borderRadius: 2, color: '#FFF' } }} />
              <TextField fullWidth multiline rows={4} label="Message *" required value={body} onChange={e => setBody(e.target.value)} variant="filled" sx={{ '& .MuiFilledInput-root': { bgcolor: 'rgba(255,255,255,0.03)', borderRadius: 2, color: '#FFF' } }} />
              <FormControl fullWidth variant="filled">
                <InputLabel sx={{ color: 'rgba(255,255,255,0.5)' }}>Category</InputLabel>
                <Select value={category} onChange={e => setCategory(e.target.value)} sx={{ bgcolor: 'rgba(255,255,255,0.03)', color: '#FFF', borderRadius: 2 }}>
                  <MenuItem value="general">General</MenuItem>
                  <MenuItem value="event">Event</MenuItem>
                  <MenuItem value="notice">Notice</MenuItem>
                  <MenuItem value="rule">Rule Query</MenuItem>
                  <MenuItem value="recommendation">Recommendation</MenuItem>
                </Select>
              </FormControl>
            </Stack>
          </DialogContent>
          <DialogActions sx={{ p: 4, borderTop: '1px solid rgba(255,255,255,0.05)' }}>
            <Button onClick={() => setOpenAdd(false)} sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 900 }}>CANCEL</Button>
            <Button type="submit" variant="contained" disabled={submitting || !title.trim() || !body.trim()} sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950, px: 4, py: 1.2, borderRadius: 3 }}>
              {submitting ? <CircularProgress size={20} color="inherit" /> : 'SUBMIT POST'}
            </Button>
          </DialogActions>
        </form>
      </Dialog>
    </Container>
  );
}

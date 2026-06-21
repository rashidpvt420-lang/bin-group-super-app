import React, { useEffect, useState } from 'react';
import { Box, Container, Typography, Paper, Grid, Stack, Button, Chip, CircularProgress, alpha, TextField, InputAdornment, MenuItem, Select, FormControl, InputLabel } from '@mui/material';
import { FileText, Bell, Search, AlertCircle, Eye, CheckCircle2 } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import { useRole } from '../../context/RoleContext';
import { db, collection, query, where, getDocs, limit, doc, updateDoc, orderBy, onSnapshot } from '../../lib/firebase';
import { binThemeTokens } from '../../theme/binGroupTheme';
import SafeIcon from '../../components/SafeIcon';

const normalizeEmail = (value: unknown) => String(value || '').trim().toLowerCase();

export default function TenantNoticesPage() {
  const { tx, lang, isRTL } = useLanguage();
  const { user } = useRole();
  const [loading, setLoading] = useState(true);
  const [notices, setNotices] = useState<any[]>([]);
  const [propertyId, setPropertyId] = useState<string>('');
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  const label = (key: string, en: string, ar: string) => lang === 'ar' ? ar : tx(key, en);

  // 1. Resolve tenant propertyId
  useEffect(() => {
    async function resolveProperty() {
      if (!user?.uid) return;
      try {
        let unitSnap = await getDocs(query(collection(db, 'units'), where('tenantId', '==', user.uid), limit(1)));
        if (unitSnap.empty && user.email) {
          unitSnap = await getDocs(query(collection(db, 'units'), where('tenantEmail', '==', normalizeEmail(user.email)), limit(1)));
        }
        if (!unitSnap.empty) {
          const unit = unitSnap.docs[0].data();
          setPropertyId(unit.propertyId || '');
        } else {
          // Check contracts
          const contractSnap = await getDocs(query(collection(db, 'contracts'), where('tenantId', '==', user.uid), limit(1)));
          if (!contractSnap.empty) {
            setPropertyId(contractSnap.docs[0].data().propertyId || '');
          }
        }
      } catch (err) {
        console.error('Failed to resolve tenant propertyId:', err);
      }
    }
    resolveProperty();
  }, [user]);

  // 2. Fetch notices
  useEffect(() => {
    if (!propertyId || !user?.uid) {
      if (!propertyId && !loading) {
        setLoading(false);
      }
      return;
    }

    const q = query(
      collection(db, 'announcements'),
      where('propertyId', '==', propertyId),
      where('published', '==', true)
    );

    const unsub = onSnapshot(q, (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      // Sort in-memory to avoid needing index constraints right away
      list.sort((a: any, b: any) => {
        const ta = a.publishedAt?.seconds || 0;
        const tb = b.publishedAt?.seconds || 0;
        return tb - ta;
      });
      setNotices(list.filter((item: any) => item.audience === 'tenants' || item.audience === 'all'));
      setLoading(false);
    }, (err) => {
      console.error('Notices listener failed:', err);
      setLoading(false);
    });

    return () => unsub();
  }, [propertyId, user?.uid]);

  const handleMarkAsRead = async (noticeId: string) => {
    if (!user?.uid) return;
    try {
      await updateDoc(doc(db, 'announcements', noticeId), {
        [`readBy.${user.uid}`]: true
      });
    } catch (err) {
      console.error('Failed to mark notice as read:', err);
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'urgent': return '#ef4444';
      case 'high': return '#f97316';
      case 'normal': return binThemeTokens.gold;
      default: return '#3b82f6';
    }
  };

  const filteredNotices = notices.filter((notice) => {
    const categoryMatch = filterCategory === 'all' || notice.category === filterCategory;
    const searchMatch = !searchQuery.trim() || 
      (notice.title || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (notice.body || '').toLowerCase().includes(searchQuery.toLowerCase());
    return categoryMatch && searchMatch;
  });

  if (loading) {
    return <Box sx={{ display: 'flex', justifyContent: 'center', py: 10 }}><CircularProgress sx={{ color: binThemeTokens.gold }} /></Box>;
  }

  return (
    <Container maxWidth="lg" sx={{ py: 4, direction: isRTL ? 'rtl' : 'ltr' }}>
      <Box sx={{ mb: 4, textAlign: isRTL ? 'right' : 'left' }}>
        <Typography variant="h3" sx={{ color: '#fff', fontWeight: 950, display: 'flex', alignItems: 'center', gap: 2, justifyContent: isRTL ? 'flex-end' : 'flex-start' }}>
          <SafeIcon icon={Bell} size={36} style={{ color: binThemeTokens.gold }} />
          {label('tenant.notices.title', 'Notices & Announcements', 'الإخطارات والإعلانات')}
        </Typography>
        <Typography sx={{ color: 'rgba(255,255,255,0.5)', mt: 1 }}>
          {label('tenant.notices.desc', 'Stay updated with active announcements, maintenance alerts, and emergency updates for your building.', 'ابق على اطلاع بالإعلانات النشطة وتنبيهات الصيانة وتحديثات الطوارئ لمبناك.')}
        </Typography>
      </Box>

      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ mb: 4 }}>
        <TextField
          fullWidth
          placeholder={label('tenant.notices.search', 'Search announcements...', 'البحث عن الإعلانات...')}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          variant="filled"
          InputProps={{
            startAdornment: (
              <InputAdornment position="start" sx={{ color: 'rgba(255,255,255,0.4)' }}>
                <SafeIcon icon={Search} size={18} />
              </InputAdornment>
            ),
            sx: { bgcolor: 'rgba(255,255,255,0.03)', color: '#FFF', borderRadius: 2 }
          }}
        />
        <FormControl variant="filled" sx={{ minWidth: 160 }}>
          <InputLabel sx={{ color: 'rgba(255,255,255,0.5)' }}>{label('tenant.notices.category', 'Category', 'الفئة')}</InputLabel>
          <Select
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value)}
            sx={{ bgcolor: 'rgba(255,255,255,0.03)', color: '#FFF', borderRadius: 2 }}
          >
            <MenuItem value="all">{label('tenant.notices.all', 'All Categories', 'جميع الفئات')}</MenuItem>
            <MenuItem value="maintenance">{label('tenant.notices.maintenance', 'Maintenance', 'الصيانة')}</MenuItem>
            <MenuItem value="safety">{label('tenant.notices.safety', 'Safety', 'السلامة')}</MenuItem>
            <MenuItem value="community">{label('tenant.notices.community', 'Community', 'المجتمع')}</MenuItem>
            <MenuItem value="policy">{label('tenant.notices.policy', 'Policy', 'السياسة')}</MenuItem>
            <MenuItem value="emergency">{label('tenant.notices.emergency', 'Emergency', 'الطوارئ')}</MenuItem>
            <MenuItem value="general">{label('tenant.notices.general', 'General', 'عام')}</MenuItem>
          </Select>
        </FormControl>
      </Stack>

      <Grid container spacing={3}>
        {filteredNotices.map((notice) => {
          const isRead = notice.readBy?.[user?.uid || ''] === true;
          const priorityColor = getPriorityColor(notice.priority);

          return (
            <Grid item xs={12} key={notice.id}>
              <Paper sx={{
                p: 3,
                bgcolor: isRead ? 'rgba(255,255,255,0.01)' : 'rgba(255,255,255,0.03)',
                border: isRead ? '1px solid rgba(255,255,255,0.05)' : `1px solid ${alpha(priorityColor, 0.3)}`,
                borderRadius: 4,
                position: 'relative'
              }}>
                <Stack spacing={2}>
                  <Stack direction="row" justifyContent="space-between" alignItems="center">
                    <Stack direction="row" spacing={1.5} alignItems="center">
                      <Chip
                        size="small"
                        label={(notice.category || 'general').toUpperCase()}
                        sx={{ bgcolor: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.7)', fontWeight: 900 }}
                      />
                      <Chip
                        size="small"
                        label={(notice.priority || 'normal').toUpperCase()}
                        sx={{ bgcolor: alpha(priorityColor, 0.12), color: priorityColor, fontWeight: 900 }}
                      />
                    </Stack>
                    <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)' }}>
                      {notice.publishedAt?.toDate ? notice.publishedAt.toDate().toLocaleString() : 'Just now'}
                    </Typography>
                  </Stack>

                  <Box>
                    <Typography variant="h6" fontWeight="950" color="#FFF" sx={{ mb: 1, textTransform: 'uppercase' }}>
                      {notice.title}
                    </Typography>
                    <Typography sx={{ color: 'rgba(255,255,255,0.7)', whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>
                      {notice.body}
                    </Typography>
                  </Box>

                  <Stack direction="row" justifyContent="flex-end" alignItems="center" spacing={2}>
                    {isRead ? (
                      <Chip
                        icon={<CheckCircle2 size={14} color="#10b981" />}
                        label={label('tenant.notices.read', 'Read', 'مقروء')}
                        sx={{ bgcolor: alpha('#10b981', 0.1), color: '#10b981', fontWeight: 900, '& .MuiChip-icon': { color: '#10b981' } }}
                      />
                    ) : (
                      <Button
                        size="small"
                        variant="outlined"
                        startIcon={<SafeIcon icon={Eye} size={14} />}
                        onClick={() => handleMarkAsRead(notice.id)}
                        sx={{ borderColor: binThemeTokens.gold, color: binThemeTokens.gold, fontWeight: 950, borderRadius: 2 }}
                      >
                        {label('tenant.notices.mark_read', 'MARK AS READ', 'تحديد كمقروء')}
                      </Button>
                    )}
                  </Stack>
                </Stack>
              </Paper>
            </Grid>
          );
        })}
      </Grid>

      {filteredNotices.length === 0 && (
        <Paper sx={{ p: 6, textAlign: 'center', bgcolor: 'rgba(255,255,255,0.01)', border: '1px dashed rgba(255,255,255,0.08)', borderRadius: 4 }}>
          <SafeIcon icon={AlertCircle} size={48} style={{ color: 'rgba(255,255,255,0.2)', margin: '0 auto' }} />
          <Typography sx={{ color: '#FFF', fontWeight: 950, mt: 2 }}>
            {label('tenant.notices.none', 'No Announcements Found', 'لم يتم العثور على إعلانات')}
          </Typography>
          <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)', display: 'block', mt: 1 }}>
            {label('tenant.notices.none_hint', 'Check back later for updates or alerts.', 'تحقق مرة أخرى لاحقًا لمعرفة التحديثات والتنبيهات.')}
          </Typography>
        </Paper>
      )}
    </Container>
  );
}

import React, { useEffect, useState } from 'react';
import { Box, Container, Typography, Paper, Grid, Stack, Button, Chip, CircularProgress, alpha, TextField, Card, CardContent } from '@mui/material';
import { Store, Phone, Mail, MessageSquare, Tag, Search, Star } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import { db, collection, query, where, onSnapshot } from '../../lib/firebase';
import { binThemeTokens } from '../../theme/binGroupTheme';
import SafeIcon from '../../components/SafeIcon';

export default function TenantMarketplacePage() {
  const { tx, lang, isRTL } = useLanguage();
  const [loading, setLoading] = useState(true);
  const [providers, setProviders] = useState<any[]>([]);
  const [offers, setOffers] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');

  const label = (key: string, en: string, ar: string) => lang === 'ar' ? ar : tx(key, en);

  const categories = [
    { key: 'all', label: label('market.cat.all', 'All Services', 'جميع الخدمات') },
    { key: 'cleaning', label: label('market.cat.cleaning', 'Cleaning', 'التنظيف') },
    { key: 'laundry', label: label('market.cat.laundry', 'Laundry', 'الغسيل') },
    { key: 'moving', label: label('market.cat.moving', 'Moving', 'النقل') },
    { key: 'maintenance', label: label('market.cat.maintenance', 'Maintenance', 'الصيانة') },
    { key: 'food', label: label('market.cat.food', 'Food & Dining', 'الأغذية والمطاعم') }
  ];

  useEffect(() => {
    // Read approved providers
    const qProviders = query(collection(db, 'marketplaceProviders'), where('approved', '==', true));
    const unsubProviders = onSnapshot(qProviders, (snap) => {
      setProviders(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoading(false);
    }, (err) => {
      console.warn('Providers listener failed:', err);
      setLoading(false);
    });

    // Read active offers
    const qOffers = query(collection(db, 'marketplaceOffers'), where('active', '==', true));
    const unsubOffers = onSnapshot(qOffers, (snap) => {
      setOffers(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, (err) => {
      console.warn('Offers listener failed:', err);
    });

    return () => {
      unsubProviders();
      unsubOffers();
    };
  }, []);

  const filteredProviders = providers.filter((p) => {
    const categoryMatch = selectedCategory === 'all' || p.category === selectedCategory;
    const searchMatch = !searchQuery.trim() ||
      (p.name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (p.description || '').toLowerCase().includes(searchQuery.toLowerCase());
    return categoryMatch && searchMatch;
  });

  if (loading) {
    return <Box sx={{ display: 'flex', justifyContent: 'center', py: 10 }}><CircularProgress sx={{ color: binThemeTokens.gold }} /></Box>;
  }

  return (
    <Container maxWidth="lg" sx={{ py: 4, direction: isRTL ? 'rtl' : 'ltr' }}>
      <Box sx={{ mb: 4, textAlign: isRTL ? 'right' : 'left' }}>
        <Typography variant="h3" sx={{ color: '#fff', fontWeight: 950, display: 'flex', alignItems: 'center', gap: 2, justifyContent: isRTL ? 'flex-end' : 'flex-start' }}>
          <SafeIcon icon={Store} size={36} style={{ color: binThemeTokens.gold }} />
          {label('tenant.market.title', 'Business Directory & Marketplace', 'دليل الأعمال والسوق')}
        </Typography>
        <Typography sx={{ color: 'rgba(255,255,255,0.5)', mt: 1 }}>
          {label('tenant.market.desc', 'Discover approved local home services, laundry, cleaning, maintenance providers, and exclusive community discounts.', 'اكتشف الخدمات المنزلية المحلية المعتمدة، والغسيل، والتنظيف، ومزودي الصيانة، والخصومات المجتمعية الحصرية.')}
        </Typography>
      </Box>

      {/* Offers Showcase */}
      {offers.length > 0 && (
        <Box sx={{ mb: 6 }}>
          <Typography variant="h6" sx={{ color: binThemeTokens.gold, fontWeight: 950, mb: 3, display: 'flex', alignItems: 'center', gap: 1 }}>
            <SafeIcon icon={Tag} size={18} />
            {label('tenant.market.offers', 'EXCLUSIVE RESIDENT OFFERS', 'عروض حصرية للسكان')}
          </Typography>
          <Grid container spacing={3}>
            {offers.map((offer) => {
              const provider = providers.find(p => p.id === offer.providerId);
              return (
                <Grid item xs={12} md={4} key={offer.id}>
                  <Paper sx={{
                    p: 3,
                    bgcolor: 'rgba(218, 165, 32, 0.05)',
                    border: `1px solid ${alpha(binThemeTokens.gold, 0.25)}`,
                    borderRadius: 4,
                    height: '100%',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between'
                  }}>
                    <Stack spacing={1.5}>
                      <Typography variant="h6" sx={{ color: binThemeTokens.gold, fontWeight: 950, fontSize: '1.1rem' }}>
                        {offer.discountText}
                      </Typography>
                      <Typography variant="subtitle2" color="#FFF" fontWeight="900">
                        {offer.title}
                      </Typography>
                      <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.6)' }}>
                        {offer.description}
                      </Typography>
                    </Stack>
                    {provider && (
                      <Box sx={{ mt: 3, pt: 1.5, borderTop: '1px dashed rgba(255,255,255,0.1)' }}>
                        <Typography variant="caption" color="textSecondary">OFFERED BY</Typography>
                        <Typography variant="body2" sx={{ color: '#FFF', fontWeight: 900 }}>{provider.name}</Typography>
                      </Box>
                    )}
                  </Paper>
                </Grid>
              );
            })}
          </Grid>
        </Box>
      )}

      {/* Search & Filter */}
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ mb: 4 }}>
        <TextField
          fullWidth
          placeholder={label('tenant.market.search', 'Search providers...', 'البحث عن مزودين...')}
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
      </Stack>

      <Stack direction="row" spacing={1} sx={{ mb: 4, overflowX: 'auto', pb: 1, '&::-webkit-scrollbar': { display: 'none' } }}>
        {categories.map((c) => (
          <Chip
            key={c.key}
            label={c.label}
            onClick={() => setSelectedCategory(c.key)}
            sx={{
              bgcolor: selectedCategory === c.key ? binThemeTokens.gold : 'rgba(255,255,255,0.03)',
              color: selectedCategory === c.key ? '#000' : '#FFF',
              fontWeight: 900,
              '&:hover': { bgcolor: selectedCategory === c.key ? binThemeTokens.gold : 'rgba(255,255,255,0.06)' }
            }}
          />
        ))}
      </Stack>

      <Grid container spacing={3}>
        {filteredProviders.map((p) => (
          <Grid item xs={12} md={6} key={p.id}>
            <Card sx={{ bgcolor: 'rgba(15,23,42,0.7)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 4, height: '100%' }}>
              <CardContent sx={{ p: 4, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', height: '100%' }}>
                <Stack spacing={2}>
                  <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
                    <Box>
                      <Typography variant="h6" fontWeight="950" color="#FFF" sx={{ mb: 0.5 }}>{p.name}</Typography>
                      <Chip label={p.category?.toUpperCase()} size="small" sx={{ bgcolor: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.6)', fontWeight: 900, fontSize: '0.6rem' }} />
                    </Box>
                    {p.ratingSummary ? (
                      <Stack direction="row" spacing={0.5} alignItems="center" sx={{ bgcolor: 'rgba(255,255,255,0.03)', px: 1.5, py: 0.5, borderRadius: 2 }}>
                        <SafeIcon icon={Star} size={14} style={{ color: binThemeTokens.gold, fill: binThemeTokens.gold }} />
                        <Typography variant="body2" sx={{ color: binThemeTokens.gold, fontWeight: 950 }}>{p.ratingSummary}</Typography>
                      </Stack>
                    ) : null}
                  </Stack>

                  <Typography sx={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.9rem', lineHeight: 1.6 }}>
                    {p.description}
                  </Typography>

                  {p.serviceAreas && (
                    <Box>
                      <Typography variant="caption" color="textSecondary" display="block">SERVICE AREAS</Typography>
                      <Typography variant="body2" color="#FFF" sx={{ fontWeight: 800 }}>{p.serviceAreas}</Typography>
                    </Box>
                  )}
                </Stack>

                <Stack direction="row" spacing={2} sx={{ mt: 4, pt: 2, borderTop: '1px solid rgba(255,255,255,0.03)' }}>
                  {p.whatsapp && (
                    <Button
                      variant="contained"
                      fullWidth
                      startIcon={<SafeIcon icon={MessageSquare} size={16} />}
                      onClick={() => window.open(`https://wa.me/${p.whatsapp.replace(/[^0-9]/g, '')}`, '_blank')}
                      sx={{ bgcolor: '#10b981', color: '#000', fontWeight: 950, borderRadius: 2, '&:hover': { bgcolor: '#059669' } }}
                    >
                      WHATSAPP
                    </Button>
                  )}
                  {p.phone && (
                    <Button
                      variant="outlined"
                      fullWidth
                      startIcon={<SafeIcon icon={Phone} size={16} />}
                      onClick={() => window.open(`tel:${p.phone}`, '_blank')}
                      sx={{ borderColor: 'rgba(255,255,255,0.15)', color: '#FFF', fontWeight: 950, borderRadius: 2 }}
                    >
                      CALL
                    </Button>
                  )}
                </Stack>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      {filteredProviders.length === 0 && (
        <Paper sx={{ p: 6, textAlign: 'center', bgcolor: 'rgba(255,255,255,0.01)', border: '1px dashed rgba(255,255,255,0.08)', borderRadius: 4 }}>
          <SafeIcon icon={Store} size={48} style={{ color: 'rgba(255,255,255,0.2)', margin: '0 auto' }} />
          <Typography sx={{ color: '#FFF', fontWeight: 950, mt: 2 }}>
            {label('tenant.market.none', 'No Service Providers Found', 'لم يتم العثور على مزودي خدمة')}
          </Typography>
        </Paper>
      )}
    </Container>
  );
}
import { InputAdornment } from '@mui/material';

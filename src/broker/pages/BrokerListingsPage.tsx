import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Box, Chip, CircularProgress, Grid, Paper, Stack, Typography } from '@mui/material';
import { Building2, MapPin, ShieldCheck } from 'lucide-react';
import { functions, httpsCallable } from '../../lib/firebase';
import { useLanguage } from '../../context/LanguageContext';
import BrokerPageFrame from '../components/BrokerPageFrame';
import SafeIcon from '../../components/SafeIcon';

type Listing = {
  id: string;
  title: string;
  propertyType?: string;
  area?: string;
  emirate?: string;
  publicLocationQuery?: string;
  annualRent?: number;
  bedrooms?: number;
  bathrooms?: number;
  furnishing?: string;
  coverImageUrl?: string;
  imageUrls?: string[];
  permitVerificationUrl?: string;
  availabilityStatus?: string;
};

export default function BrokerListingsPage() {
  const { lang } = useLanguage();
  const label = (en: string, ar: string) => lang === 'ar' ? ar : en;
  const [state, setState] = useState<'LOADING' | 'AVAILABLE' | 'EMPTY' | 'FAILED'>('LOADING');
  const [rows, setRows] = useState<Listing[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setState('LOADING');
      setError('');
      try {
        const call = httpsCallable(functions, 'getBrokerVerifiedListings');
        const result: any = await call({});
        if (cancelled) return;
        const listings = Array.isArray(result?.data?.listings) ? result.data.listings as Listing[] : [];
        setRows(listings);
        setState(listings.length ? 'AVAILABLE' : 'EMPTY');
      } catch (err: any) {
        if (cancelled) return;
        const code = String(err?.code || '').toLowerCase();
        setRows([]);
        setState('FAILED');
        setError(
          code.includes('failed-precondition')
            ? label(
                'Verified Broker KYC/RERA approval is required before listing access.',
                'يلزم اعتماد تحقق الوسيط ورخصة ريرا قبل الوصول إلى العقارات.',
              )
            : label(
                'Verified listings could not be loaded. This is a loading failure, not an empty inventory result.',
                'تعذر تحميل العقارات الموثقة. هذا فشل في التحميل وليس دليلاً على عدم وجود عقارات.',
              ),
        );
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [lang]);

  const countLabel = useMemo(() => rows.length === 1
    ? label('1 verified listing', 'عقار موثق واحد')
    : label(`${rows.length} verified listings`, `${rows.length} عقارات موثقة`), [rows.length, lang]);

  return (
    <BrokerPageFrame
      title={label('Verified Listings', 'العقارات الموثقة')}
      subtitle={label(
        'Read-only BIN verified inventory for approved Brokers. Owner identity, exact address and private property data remain protected.',
        'مخزون موثق للعرض فقط للوسطاء المعتمدين. تبقى هوية المالك والعنوان الدقيق وبيانات العقار الخاصة محمية.',
      )}
      loading={false}
    >
      <Stack spacing={3}>
        <Alert severity="info" icon={<ShieldCheck size={20} />}>
          {label(
            'Listing access is read-only. Brokers cannot claim, publish, approve, or change Owner inventory from the browser.',
            'الوصول إلى العقارات للقراءة فقط. لا يمكن للوسيط حجز أو نشر أو اعتماد أو تعديل مخزون المالك من المتصفح.',
          )}
        </Alert>

        {state === 'LOADING' && (
          <Paper sx={{ p: 5, textAlign: 'center' }}>
            <CircularProgress />
            <Typography sx={{ mt: 2, fontWeight: 800 }}>{label('Loading verified listings…', 'جارٍ تحميل العقارات الموثقة…')}</Typography>
          </Paper>
        )}

        {state === 'FAILED' && <Alert severity="error" data-testid="broker-listings-load-failed">{error}</Alert>}

        {state === 'EMPTY' && (
          <Paper data-testid="broker-listings-empty" sx={{ p: 5, textAlign: 'center' }}>
            <SafeIcon icon={Building2} size={32} />
            <Typography variant="h6" sx={{ mt: 2, fontWeight: 950 }}>
              {label('There are currently zero verified listings available to Brokers.', 'لا توجد حالياً عقارات موثقة متاحة للوسطاء.')}
            </Typography>
          </Paper>
        )}

        {state === 'AVAILABLE' && (
          <>
            <Typography sx={{ fontWeight: 900 }}>{countLabel}</Typography>
            <Grid container spacing={2.5}>
              {rows.map((listing) => (
                <Grid item xs={12} md={6} lg={4} key={listing.id}>
                  <Paper sx={{ p: 2.5, borderRadius: 4, height: '100%', border: '1px solid #E5E7EB' }}>
                    {listing.coverImageUrl && (
                      <Box component="img" src={listing.coverImageUrl} alt="" sx={{ width: '100%', height: 180, objectFit: 'cover', borderRadius: 3, mb: 2 }} />
                    )}
                    <Stack spacing={1.1}>
                      <Typography variant="h6" sx={{ fontWeight: 950 }}>{listing.title}</Typography>
                      <Stack direction="row" spacing={1} flexWrap="wrap">
                        <Chip size="small" label={listing.propertyType || label('PROPERTY', 'عقار')} />
                        <Chip size="small" label={listing.availabilityStatus || 'AVAILABLE'} />
                      </Stack>
                      <Stack direction="row" spacing={1} alignItems="center">
                        <MapPin size={16} />
                        <Typography variant="body2">{listing.publicLocationQuery || [listing.area, listing.emirate].filter(Boolean).join(', ') || 'UAE'}</Typography>
                      </Stack>
                      <Typography sx={{ fontWeight: 900 }}>
                        {listing.annualRent ? `AED ${Number(listing.annualRent).toLocaleString()} / year` : label('Rent on request', 'الإيجار عند الطلب')}
                      </Typography>
                      <Typography variant="caption">
                        {[listing.bedrooms ? `${listing.bedrooms} bed` : '', listing.bathrooms ? `${listing.bathrooms} bath` : '', listing.furnishing || ''].filter(Boolean).join(' · ')}
                      </Typography>
                    </Stack>
                  </Paper>
                </Grid>
              ))}
            </Grid>
          </>
        )}
      </Stack>
    </BrokerPageFrame>
  );
}

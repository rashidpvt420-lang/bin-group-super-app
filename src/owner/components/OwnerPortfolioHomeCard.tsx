import { useEffect, useState } from 'react';
import { Box, Stack, Typography } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { collection, db, onSnapshot, query, where } from '../../lib/firebase';
import { useRole } from '../../context/RoleContext';
import { useLanguage } from '@bin/shared';
import { EmptyState, ErrorState, ListRow, UiButton, UiCard } from '../../components/ui';

export const ADD_PROPERTY_PATH = '/owner/add-property';

/**
 * Unlocked owners land on Home ("My properties"). The register button used to live only on
 * /owner/properties, so an empty portfolio looked like a dead title. This card always offers
 * the real five-page add-property flow, which includes the map pin.
 */
export default function OwnerPortfolioHomeCard() {
  const navigate = useNavigate();
  const { user } = useRole();
  const { isRTL, lang, tx } = useLanguage();
  const t = (key: string, en: string, ar: string) => (lang === 'ar' ? ar : tx(key, en));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [properties, setProperties] = useState<Array<{ id: string; name: string; emirate: string }>>([]);

  useEffect(() => {
    if (!user?.uid) {
      setProperties([]);
      setLoading(false);
      return undefined;
    }
    setLoading(true);
    const unsubscribe = onSnapshot(
      query(collection(db, 'properties'), where('ownerId', '==', user.uid)),
      (snap) => {
        setProperties(snap.docs.map((docSnap) => {
          const data = docSnap.data() as { propertyName?: string; name?: string; emirate?: string };
          return {
            id: docSnap.id,
            name: String(data.propertyName || data.name || '').trim() || t('owner.home.unnamedProperty', 'Property', 'عقار'),
            emirate: String(data.emirate || '').trim(),
          };
        }));
        setError('');
        setLoading(false);
      },
      () => {
        setProperties([]);
        setError(t('owner.home.propertiesFailed', 'Properties could not be loaded. This is not an empty portfolio.', 'تعذر تحميل العقارات. هذا ليس ملفاً فارغاً.'));
        setLoading(false);
      },
    );
    return () => unsubscribe();
  }, [user?.uid, lang]);

  const addProperty = () => navigate(ADD_PROPERTY_PATH);

  return (
    <UiCard isRTL={isRTL} testId="owner-portfolio-home" label={t('owner.home.portfolio', 'Your properties', 'عقاراتك')}>
      <Stack spacing={1.25} sx={{ position: 'relative', zIndex: 2 }}>
        {error && <ErrorState isRTL={isRTL} title={error} />}
        {!loading && !error && properties.length === 0 && (
          <EmptyState
            isRTL={isRTL}
            title={t('owner.home.noProperties', 'No properties yet', 'لا توجد عقارات بعد')}
            detail={t('owner.home.noPropertiesDetail', 'Add a property and place the map pin so maintenance can find it.', 'أضف عقاراً وضع دبوس الخريطة حتى تصل إليه الصيانة.')}
          />
        )}
        {!loading && properties.map((property) => (
          <ListRow
            key={property.id}
            isRTL={isRTL}
            title={property.name}
            subtitle={property.emirate || undefined}
            onClick={() => navigate('/owner/properties')}
          />
        ))}
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.25}>
          <UiButton tone="primary" onClick={addProperty} data-testid="owner-add-property">{t('owner.home.addProperty', 'Add property', 'إضافة عقار')}</UiButton>
          <UiButton tone="outline" onClick={() => navigate('/owner/find-room-rent')} data-testid="owner-list-empty-unit">{t('owner.home.list', 'List empty unit', 'عرض وحدة شاغرة')}</UiButton>
          <UiButton tone="outline" onClick={() => navigate('/owner/tenants')}>{t('owner.home.invite', 'Invite tenant', 'دعوة مستأجر')}</UiButton>
        </Stack>
        {!loading && properties.length > 0 && (
          <Box>
            <Typography component="button" type="button" onClick={() => navigate('/owner/properties')} sx={{ border: 0, background: 'none', p: 0, color: '#7A5C12', fontWeight: 800, cursor: 'pointer' }}>
              {t('owner.home.openPortfolio', 'Open the full property list', 'افتح قائمة العقارات')}
            </Typography>
          </Box>
        )}
      </Stack>
    </UiCard>
  );
}

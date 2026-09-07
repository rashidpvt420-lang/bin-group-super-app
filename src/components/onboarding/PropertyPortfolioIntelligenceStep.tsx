import React from 'react';
import { Alert, Box, Button, Chip, Stack, Typography } from '@mui/material';
import { ArrowLeft, ArrowRight, Sparkles } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import { useOnboardingStore } from '../../store/onboardingStore';
import PropertyInventoryPanel from './PropertyInventoryPanel';

interface Props {
  onNext: () => void;
  onBack: () => void;
}

export default function PropertyPortfolioIntelligenceStep({ onNext, onBack }: Props) {
  const { properties, updateProperty } = useOnboardingStore();
  const { isRTL, lang } = useLanguage();
  const ar = lang === 'ar';
  const label = (en: string, arText: string) => ar ? arText : en;
  const [activeIndex, setActiveIndex] = React.useState(0);

  React.useEffect(() => {
    if (activeIndex >= properties.length) setActiveIndex(Math.max(0, properties.length - 1));
  }, [activeIndex, properties.length]);

  if (!properties.length) {
    return <Alert severity="warning">{label('Add a property profile before completing rooms, floor plan and AI inventory.', 'أضف ملف العقار قبل إكمال الغرف والمخطط وجرد الذكاء الاصطناعي.')}</Alert>;
  }

  const active = properties[activeIndex];
  return (
    <Box>
      <Stack direction={isRTL ? 'row-reverse' : 'row'} justifyContent="space-between" alignItems="flex-start" gap={2} flexWrap="wrap" sx={{ mb: 2 }}>
        <Box>
          <Stack direction={isRTL ? 'row-reverse' : 'row'} spacing={1} alignItems="center">
            <Sparkles size={20} />
            <Typography variant="h5" fontWeight={950}>{label('Rooms, floor plan & property AI', 'الغرف والمخطط وذكاء العقار')}</Typography>
          </Stack>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            {label('Add what is actually inside each property. AI suggestions stay unverified until you confirm them and BIN GROUP verifies the property visit.', 'أضف ما هو موجود فعلياً داخل كل عقار. تبقى اقتراحات الذكاء الاصطناعي غير موثقة حتى تؤكدها ويتحقق فريق BIN GROUP أثناء زيارة العقار.')}
          </Typography>
        </Box>
        <Stack direction={isRTL ? 'row-reverse' : 'row'} spacing={1} flexWrap="wrap" useFlexGap>
          {properties.map((property, index) => (
            <Chip
              key={property.id || index}
              label={`${label('Property', 'العقار')} ${index + 1} · ${property.propertyType || label('Unclassified', 'غير مصنف')}`}
              onClick={() => setActiveIndex(index)}
              color={index === activeIndex ? 'primary' : 'default'}
              variant={index === activeIndex ? 'filled' : 'outlined'}
              sx={{ fontWeight: 900 }}
            />
          ))}
        </Stack>
      </Stack>

      <Alert severity="info" sx={{ mb: 2 }}>
        {label('This layer does not set legal capacity, compliance, contract approval or price. Verified property facts and server-authoritative pricing remain separate.', 'لا تحدد هذه الطبقة السعة القانونية أو الامتثال أو اعتماد العقد أو السعر. تبقى حقائق العقار الموثقة والتسعير المعتمد من الخادم منفصلة.')}
      </Alert>

      <PropertyInventoryPanel
        property={active}
        onChange={(patch) => updateProperty(activeIndex, patch)}
        ar={ar}
        isRTL={isRTL}
      />

      <Stack direction={{ xs: 'column', sm: isRTL ? 'row-reverse' : 'row' }} spacing={2} justifyContent="space-between" sx={{ mt: 4 }}>
        <Button variant="outlined" onClick={onBack} startIcon={!isRTL ? <ArrowLeft /> : undefined} endIcon={isRTL ? <ArrowLeft style={{ transform: 'rotate(180deg)' }} /> : undefined}>
          {label('Back to property profile', 'الرجوع إلى ملف العقار')}
        </Button>
        <Button variant="contained" onClick={onNext} endIcon={isRTL ? <ArrowRight style={{ transform: 'rotate(180deg)' }} /> : <ArrowRight />}>
          {label('Continue to location & GPS', 'المتابعة إلى الموقع وGPS')}
        </Button>
      </Stack>
    </Box>
  );
}

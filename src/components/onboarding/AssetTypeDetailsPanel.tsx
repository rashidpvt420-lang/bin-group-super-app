import React from 'react';
import { Alert, Grid, MenuItem, Paper, TextField, Typography } from '@mui/material';
import type { AssetDetailField, AssetDetailGroup, AssetDetailValue } from '../../utils/assetTypeDetails';
import { ASSET_TYPE_DETAIL_GROUPS, applyAssetDetailsToProperty, sanitizeAssetDetails } from '../../utils/assetTypeDetails';
import type { PropertyData } from '../../store/onboardingStore';
import { binThemeTokens } from '../../theme/binGroupTheme';

type Props = {
  propertyType: string;
  property: PropertyData;
  arabic: boolean;
  onChange: (patch: Partial<PropertyData>) => void;
};

const labelOf = (field: AssetDetailField, arabic: boolean) => (arabic ? field.labelAr : field.labelEn);
const helperOf = (field: AssetDetailField, arabic: boolean) => (arabic ? field.helperAr : field.helperEn);
const displayValue = (field: AssetDetailField, details: Record<string, AssetDetailValue>, property: PropertyData) => {
  if (field.key in details) {
    const value = details[field.key];
    if (field.type === 'boolean') return value === true ? 'yes' : 'no';
    return value as string | number;
  }
  if (field.syncTo === 'bedrooms' && property.bedrooms !== undefined && property.bedrooms !== null && String(property.bedrooms) !== '') {
    const bedrooms = Number(property.bedrooms);
    return bedrooms >= 4 ? 4 : bedrooms;
  }
  if (field.syncTo === 'floors' && Number(property.floors) > 0) return Number(property.floors);
  if (field.syncTo === 'units' && Number(property.units) > 0) return Number(property.units);
  if (field.syncTo === 'beds' && Number(property.beds || property.units) > 0) return Number(property.beds || property.units);
  if (field.type === 'boolean' && field.syncTo && property[field.syncTo] === true) return 'yes';
  return '';
};

const AssetTypeDetailsPanel: React.FC<Props> = ({ propertyType, property, arabic, onChange }) => {
  const groups = ASSET_TYPE_DETAIL_GROUPS[propertyType] || [];
  if (!groups.length) return null;
  const details = sanitizeAssetDetails(propertyType, property.assetDetails);
  const label = (en: string, ar: string) => (arabic ? ar : en);

  const updateField = (field: AssetDetailField, raw: string) => {
    const nextDetails = { ...details };
    if (raw === '') delete nextDetails[field.key];
    else if (field.type === 'boolean') nextDetails[field.key] = raw === 'yes';
    else if (field.type === 'number') {
      const parsed = Number(raw);
      if (!Number.isFinite(parsed)) delete nextDetails[field.key];
      else nextDetails[field.key] = parsed;
    } else nextDetails[field.key] = raw;
    onChange(applyAssetDetailsToProperty(propertyType, nextDetails));
  };

  const renderField = (field: AssetDetailField) => {
    const value = displayValue(field, details, property);
    const helper = helperOf(field, arabic);
    const common = {
      fullWidth: true as const,
      label: labelOf(field, arabic),
      required: Boolean(field.required),
      helperText: helper,
      value,
    };
    if (field.type === 'select' || field.type === 'boolean') {
      const options = field.options || [];
      return (
        <TextField select {...common} onChange={(event) => updateField(field, event.target.value)}>
          <MenuItem value="">{label('Select', 'اختر')}</MenuItem>
          {options.map((option) => (
            <MenuItem key={option.value} value={option.value}>{arabic ? option.ar : option.en}</MenuItem>
          ))}
        </TextField>
      );
    }
    if (field.type === 'number') {
      return (
        <TextField
          {...common}
          type="number"
          inputProps={{ min: field.min ?? 0, max: field.max ?? 1_000_000, step: 'any' }}
          onChange={(event) => updateField(field, event.target.value)}
        />
      );
    }
    return (
      <TextField
        {...common}
        type={field.type === 'date' ? 'date' : 'text'}
        InputLabelProps={field.type === 'date' ? { shrink: true } : undefined}
        inputProps={{ maxLength: field.maxLength ?? 200 }}
        onChange={(event) => updateField(field, event.target.value)}
      />
    );
  };

  return (
    <Paper className="asset-type-details-panel" sx={{ p: { xs: 3, md: 4 }, mt: 4, borderRadius: 6, bgcolor: 'rgba(22,22,24,0.72)', border: '1px solid rgba(255,255,255,0.08)' }}>
      <Typography variant="h6" fontWeight={950} sx={{ color: binThemeTokens.gold, mb: 1 }}>
        {label('Type-specific details', 'تفاصيل نوع العقار')}
      </Typography>
      <Typography variant="body2" sx={{ mb: 2 }}>
        {label(
          'Optional unless marked required. These help BIN GROUP plan the visit. Only units, floors, measured area and apartment bedrooms change the pre-visit estimate, and only with the existing rates.',
          'اختيارية ما لم تُعلَّم كمطلوبة. تساعد هذه البيانات BIN GROUP في التخطيط للزيارة. لا تغيّر التقدير قبل الزيارة سوى الوحدات والطوابق والمساحة المقاسة وغرف نوم الشقق، ووفق الأسعار الحالية فقط.',
        )}
      </Typography>
      <Alert severity="info" sx={{ mb: 3 }}>
        {label(
          'Entering more detail does not invent a new price. Lift, fire, cooling and similar answers can pre-fill the systems step and may use existing add-on or complexity factors already in the quote engine.',
          'إدخال مزيد من التفاصيل لا ينشئ سعراً جديداً. إجابات المصاعد والحريق والتبريد وما شابهها قد تملأ خطوة الأنظمة مسبقاً وقد تستخدم عوامل الإضافات أو التعقيد الحالية في محرك التسعير.',
        )}
      </Alert>
      {groups.map((group: AssetDetailGroup) => (
        <Grid container spacing={2} key={group.id} sx={{ mb: 2 }}>
          <Grid item xs={12}>
            <Typography variant="subtitle2" fontWeight={900} sx={{ color: binThemeTokens.gold, mt: 1 }}>
              {arabic ? group.titleAr : group.titleEn}
            </Typography>
          </Grid>
          {group.fields.map((field) => (
            <Grid item xs={12} sm={6} md={4} key={`${group.id}-${field.key}`}>{renderField(field)}</Grid>
          ))}
        </Grid>
      ))}
    </Paper>
  );
};

export default AssetTypeDetailsPanel;

import React, { useMemo, useState } from 'react';
import { Box, Typography, TextField, MenuItem, Slider, ToggleButton, ToggleButtonGroup, Chip, Stack } from '@mui/material';
import { binThemeTokens } from '../../theme/binGroupTheme';
import {
  computeLiveQuote, areasForEmirate, areaLabel, OTHER_AREA, LIVE_EMIRATES, LIVE_PROPERTY_TYPES, ZONE_LABEL,
  type LiveQuoteState, type LiveContract,
} from './liveQuoteModel';

const T = {
  en: {
    title: 'Live contract estimate', region: 'Region', scale: 'Scale', amc: 'Annual AMC', mgmt: 'Management fee', total: 'Total contract',
    emirate: 'Emirate', area: 'Area', other: 'Other area (not listed)', bedrooms: 'Bedrooms', studio: 'Studio', type: 'Property type', scope: 'Management scope', standard: 'Standard', luxury: 'Luxury',
    size: 'Size (sqft)', rent: 'Annual rent (AED)', age: 'Property age (years)', contract: 'Contract type',
    fm: 'Maintenance', pm: 'Management', both: 'Combined', remote: 'Remote', none: '—',
    note: 'Pre-visit estimate. The final price is confirmed by the BIN GROUP server quote when you submit.',
  },
  ar: {
    title: 'تقدير العقد المباشر', region: 'المنطقة', scale: 'الحجم', amc: 'عقد الصيانة السنوي', mgmt: 'رسوم الإدارة', total: 'إجمالي العقد',
    emirate: 'الإمارة', area: 'المنطقة السكنية', other: 'منطقة أخرى (غير مدرجة)', bedrooms: 'غرف النوم', studio: 'استوديو', type: 'نوع العقار', scope: 'نطاق الإدارة', standard: 'قياسي', luxury: 'فاخر',
    size: 'المساحة (قدم مربع)', rent: 'الإيجار السنوي (درهم)', age: 'عمر العقار (سنوات)', contract: 'نوع العقد',
    fm: 'صيانة', pm: 'إدارة', both: 'مدمج', remote: 'نائية', none: '—',
    note: 'تقدير قبل الزيارة. يتم تأكيد السعر النهائي من خلال عرض سعر خادم BIN GROUP عند الإرسال.',
  },
};

const aed = (n: number | null) => (n === null ? null : `AED ${Math.round(n).toLocaleString('en-US')}`);
const field = { '& .MuiOutlinedInput-root': { bgcolor: 'rgba(255,255,255,0.03)', color: '#FFF' }, '& .MuiInputLabel-root': { color: 'rgba(255,255,255,0.6)' } };

export interface LiveQuoteCardProps { isRTL?: boolean; initial?: Partial<LiveQuoteState> }

export default function LiveQuoteCard({ isRTL = false, initial }: LiveQuoteCardProps) {
  const lang = isRTL ? 'ar' : 'en';
  const t = T[lang];
  const [s, setS] = useState<LiveQuoteState>({
    emirate: 'Dubai', area: 'Palm Jumeirah', propertyType: 'Villa', bedrooms: 1, scope: 'Standard',
    sqft: 3500, annualRent: 250000, age: 1, contractType: 'BOTH', ...initial,
  });
  const set = (patch: Partial<LiveQuoteState>) => setS((prev) => ({ ...prev, ...patch }));
  const areas = useMemo(() => areasForEmirate(s.emirate), [s.emirate]);
  const q = useMemo(() => computeLiveQuote(s, lang), [s, lang]);
  const tiles: Array<[string, number | null, boolean]> = [[t.amc, q.maintenance, false], [t.mgmt, q.management, false], [t.total, q.total, true]];

  return (
    <Box data-testid="owner-live-quote-card" dir={isRTL ? 'rtl' : 'ltr'} sx={{ maxWidth: 560, mx: 'auto', mb: 4, borderRadius: 5, overflow: 'hidden', bgcolor: '#0B0B0C', border: `1px solid ${binThemeTokens.gold}44` }}>
      <Box sx={{ p: 3, background: `linear-gradient(135deg, #1c1a14 0%, #0B0B0C 70%)`, borderBottom: `1px solid ${binThemeTokens.gold}33` }}>
        <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 900 }}>{t.title}</Typography>
        <Box sx={{ mt: 1, display: "grid", gridTemplateColumns: "1fr 1fr", columnGap: 3 }}>
          <Box><Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.5)' }}>{t.region}</Typography><Typography data-testid="live-quote-region" fontWeight={900} color="#FFF">{q.regionLabel}</Typography></Box>
          <Box><Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.5)' }}>{t.scale}</Typography><Typography fontWeight={900} color="#FFF">{q.scaleLabel}</Typography></Box>
        </Box>
      </Box>
      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 1, p: 2 }}>
        {tiles.map(([label, value, strong]) => (
          <Box key={label} sx={{ p: 1.5, borderRadius: 3, textAlign: 'center', bgcolor: strong ? `${binThemeTokens.gold}22` : 'rgba(255,255,255,0.03)' }}>
            <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.6)', display: 'block' }}>{label}</Typography>
            <Typography data-testid={strong ? 'live-quote-total' : undefined} fontWeight={900} sx={{ color: strong ? binThemeTokens.goldLight : '#FFF', fontSize: { xs: 14, sm: 18 } }}>{aed(value) ?? t.none}</Typography>
          </Box>
        ))}
      </Box>
      <Box sx={{ px: 3, pb: 2 }}>
        {q.warnings.map((w) => (
          <Typography key={w} data-testid="live-quote-warning" variant="caption" display="block" sx={{ color: '#F59E0B', fontWeight: 800, mb: 0.5 }}>⚠ {w}</Typography>
        ))}
        {(q.blockers.length ? q.blockers : q.lines).map((l) => (
          <Typography key={l} data-testid="live-quote-line" variant="caption" display="block" sx={{ color: q.blockers.length ? '#F59E0B' : 'rgba(255,255,255,0.7)' }}>• {l}</Typography>
        ))}
      </Box>
      <Stack spacing={2} sx={{ p: 3, pt: 1 }}>
        <TextField select fullWidth size="small" label={t.emirate} value={s.emirate} sx={field}
          onChange={(e) => { const emirate = e.target.value; set({ emirate, area: areasForEmirate(emirate)[0]?.area || '' }); }}>
          {LIVE_EMIRATES.map((e) => <MenuItem key={e.id} value={e.id}>{e[lang]}</MenuItem>)}
        </TextField>
        <TextField select fullWidth size="small" label={t.area} value={s.area} sx={field} SelectProps={{ renderValue: (v) => { const hit = areas.find((a) => a.area === v); return hit ? areaLabel(hit, lang) : v === OTHER_AREA ? t.other : String(v); } }} onChange={(e) => set({ area: e.target.value })}>
          {areas.map((a) => (
            <MenuItem key={a.area} value={a.area} data-testid="live-quote-area-option">
              <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', width: '100%' }}>
                <span style={{ flex: 1 }}>{areaLabel(a, lang)}</span>
                <Chip size="small" label={ZONE_LABEL[a.zone][lang]} sx={{ bgcolor: a.zone === 'A' ? binThemeTokens.gold : 'rgba(255,255,255,0.1)', color: a.zone === 'A' ? '#000' : '#FFF', fontWeight: 800 }} />
                {a.remote ? <Chip size="small" label={t.remote} variant="outlined" sx={{ color: binThemeTokens.gold, borderColor: binThemeTokens.gold }} /> : null}
              </Box>
            </MenuItem>
          ))}
          <MenuItem value={OTHER_AREA} data-testid="live-quote-area-other">{t.other}</MenuItem>
        </TextField>
        <Stack direction="row" sx={{ gap: 1 }}>
          <TextField select fullWidth size="small" label={t.type} value={s.propertyType} sx={field} onChange={(e) => set({ propertyType: e.target.value })}>
            {LIVE_PROPERTY_TYPES.map((p) => <MenuItem key={p.id} value={p.id}>{p[lang]}</MenuItem>)}
          </TextField>
          <TextField select fullWidth size="small" label={t.scope} value={s.scope} sx={field} onChange={(e) => set({ scope: e.target.value as LiveQuoteState['scope'] })}>
            <MenuItem value="Standard">{t.standard}</MenuItem>
            <MenuItem value="Luxury">{t.luxury}</MenuItem>
          </TextField>
        </Stack>
        {s.propertyType === 'Apartment' ? (
          <TextField select fullWidth size="small" label={t.bedrooms} value={s.bedrooms} sx={field} data-testid="live-quote-bedrooms" onChange={(e) => set({ bedrooms: Number(e.target.value) })}>
            {[0, 1, 2, 3, 4].map((n) => <MenuItem key={n} value={n}>{n === 0 ? t.studio : n === 4 ? '4+' : n}</MenuItem>)}
          </TextField>
        ) : null}
        <Box><Typography variant="caption" color="rgba(255,255,255,0.6)">{t.size}: {s.sqft.toLocaleString('en-US')}</Typography>
          <Slider value={s.sqft} min={300} max={50000} step={100} onChange={(_, v) => set({ sqft: v as number })} sx={{ color: binThemeTokens.gold }} /></Box>
        <Box><Typography variant="caption" color="rgba(255,255,255,0.6)">{t.rent}: {s.annualRent.toLocaleString('en-US')}</Typography>
          <Slider value={s.annualRent} min={0} max={2000000} step={5000} disabled={s.contractType === 'FM_ONLY'} onChange={(_, v) => set({ annualRent: v as number })} sx={{ color: binThemeTokens.gold }} /></Box>
        <TextField type="number" size="small" label={t.age} value={s.age} sx={field} inputProps={{ min: 0, max: 80 }} onChange={(e) => set({ age: Math.max(0, Number(e.target.value) || 0) })} />
        <Box><Typography variant="caption" color="rgba(255,255,255,0.6)">{t.contract}</Typography>
          <ToggleButtonGroup exclusive fullWidth size="small" value={s.contractType} onChange={(_, v: LiveContract | null) => v && set({ contractType: v })}
            sx={{ mt: 0.5, '& .MuiToggleButton-root': { color: 'rgba(255,255,255,0.7)', borderColor: 'rgba(255,255,255,0.15)' }, '& .Mui-selected': { bgcolor: `${binThemeTokens.gold} !important`, color: '#000 !important', fontWeight: 900 } }}>
            <ToggleButton value="FM_ONLY">{t.fm}</ToggleButton>
            <ToggleButton value="PM_ONLY">{t.pm}</ToggleButton>
            <ToggleButton value="BOTH">{t.both}</ToggleButton>
          </ToggleButtonGroup></Box>
        <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.45)' }}>{t.note}</Typography>
      </Stack>
    </Box>
  );
}

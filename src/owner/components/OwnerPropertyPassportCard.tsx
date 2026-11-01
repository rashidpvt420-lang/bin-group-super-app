import { useCallback, useEffect, useState } from 'react';
import { Box, MenuItem, Stack, TextField, Typography } from '@mui/material';
import { QRCodeSVG } from 'qrcode.react';
import { useLanguage } from '@bin/shared';
import { functions, httpsCallable } from '../../lib/firebase';
import { EmptyState, ErrorState, ListRow, StatusChip, UiButton, UiCard } from '../../components/ui';

type Asset = {
  assetId: string; propertyId: string; name: string; category: string; serialNumber: string | null; room: string | null;
  photoUrls: string[]; qrPath: string; warranty: { state: string; expiry: string | null };
};
type Passport = { properties: { propertyId: string; label: string }[]; assets: Asset[]; inspections: { inspectionId: string; propertyId: string; type: string | null; status: string | null }[] };
const CATEGORIES = ['HVAC', 'PLUMBING', 'ELECTRICAL', 'APPLIANCE', 'FIXTURE', 'SAFETY', 'OTHER'];

/** Property Passport: the owner's own asset register with serials, warranties, room photos, a QR per asset and linked inspections. */
export default function OwnerPropertyPassportCard() {
  const { lang, isRTL } = useLanguage();
  const t = (en: string, ar: string) => (lang === 'ar' ? ar : en);
  const [data, setData] = useState<Passport | null>(null);
  const [failed, setFailed] = useState(false);
  const [form, setForm] = useState({ propertyId: '', name: '', category: 'OTHER', serialNumber: '', warrantyExpiry: '', room: '' });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const load = useCallback(() => {
    httpsCallable(functions, 'getOwnerPropertyPassport')({})
      .then((res: any) => { setData(res?.data ?? null); setFailed(false); })
      .catch(() => setFailed(true));
  }, []);
  useEffect(() => { load(); }, [load]);
  const save = async () => {
    setSaving(true); setSaveError('');
    try {
      await httpsCallable(functions, 'ownerUpsertPropertyAsset')(form);
      setForm((f) => ({ ...f, name: '', serialNumber: '', warrantyExpiry: '', room: '' }));
      load();
    } catch {
      setSaveError(t('The asset could not be saved. Check the fields and try again.', 'تعذر حفظ الأصل. تحقق من الحقول وحاول مرة أخرى.'));
    } finally { setSaving(false); }
  };
  const wTone = (s: string) => (s === 'EXPIRED' ? 'bad' as const : s === 'EXPIRING' ? 'warn' as const : s === 'ACTIVE' ? 'ok' as const : 'neutral' as const);
  const wLabel = (s: string, e: string | null) => ({ EXPIRED: t('Warranty expired', 'انتهى الضمان'), EXPIRING: t('Warranty ending', 'الضمان ينتهي قريباً'), ACTIVE: t('Under warranty', 'ضمن الضمان') }[s] ?? t('Warranty not recorded', 'الضمان غير مسجل')) + (e ? ` ${e}` : '');
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  return (
    <UiCard isRTL={isRTL} testId="owner-property-passport" label={t('Property Passport', 'جواز العقار')}>
      {failed && <ErrorState isRTL={isRTL} title={t('The passport could not load. Refresh to retry.', 'تعذر تحميل جواز العقار. حدّث الصفحة للمحاولة.')} />}
      {data && data.assets.length === 0 && <EmptyState isRTL={isRTL} title={t('No assets recorded yet', 'لا توجد أصول مسجلة بعد')} />}
      {data?.assets.map((a) => {
        const linked = data.inspections.filter((i) => i.propertyId === a.propertyId).length;
        return (
          <Box key={a.assetId} sx={{ display: 'flex', gap: 1.5, alignItems: 'center', mb: 1 }}>
            <QRCodeSVG value={`${origin}${a.qrPath}`} size={56} aria-label={t('Asset QR code', 'رمز QR للأصل')} />
            <Box sx={{ flex: 1 }}>
              <ListRow isRTL={isRTL} title={`${a.name} · ${a.category}`}
                subtitle={[a.room, a.serialNumber ? `S/N ${a.serialNumber}` : t('No serial recorded', 'لا يوجد رقم تسلسلي'), t(`${linked} linked inspections`, `${linked} فحوصات مرتبطة`)].filter(Boolean).join(' · ')}
                trailing={<StatusChip tone={wTone(a.warranty.state)} label={wLabel(a.warranty.state, a.warranty.expiry)} />} />
              {a.photoUrls.length > 0 && (
                <Stack direction="row" spacing={0.5}>{a.photoUrls.map((u) => <img key={u} src={u} alt={t('Room photo', 'صورة الغرفة')} width={48} height={48} style={{ objectFit: 'cover', borderRadius: 4 }} />)}</Stack>
              )}
            </Box>
          </Box>
        );
      })}
      {data && data.properties.length > 0 && (
        <Stack spacing={1} sx={{ mt: 2 }}>
          <Typography variant="subtitle2">{t('Add an asset', 'إضافة أصل')}</Typography>
          <TextField select size="small" label={t('Property', 'العقار')} value={form.propertyId} onChange={(e) => setForm({ ...form, propertyId: e.target.value })}>
            {data.properties.map((p) => <MenuItem key={p.propertyId} value={p.propertyId}>{p.label}</MenuItem>)}
          </TextField>
          <TextField size="small" label={t('Name', 'الاسم')} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <TextField select size="small" label={t('Category', 'الفئة')} value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
            {CATEGORIES.map((c) => <MenuItem key={c} value={c}>{c}</MenuItem>)}
          </TextField>
          <TextField size="small" label={t('Serial number', 'الرقم التسلسلي')} value={form.serialNumber} onChange={(e) => setForm({ ...form, serialNumber: e.target.value })} />
          <TextField size="small" type="date" InputLabelProps={{ shrink: true }} label={t('Warranty expiry', 'انتهاء الضمان')} value={form.warrantyExpiry} onChange={(e) => setForm({ ...form, warrantyExpiry: e.target.value })} />
          <TextField size="small" label={t('Room', 'الغرفة')} value={form.room} onChange={(e) => setForm({ ...form, room: e.target.value })} />
          {saveError && <Typography color="error" variant="body2">{saveError}</Typography>}
          <UiButton disabled={saving || !form.propertyId || !form.name} onClick={save}>{t('Save asset', 'حفظ الأصل')}</UiButton>
        </Stack>
      )}
    </UiCard>
  );
}

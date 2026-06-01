import React, { useEffect, useState } from 'react';
import { Box, Button, Card, CardContent, Chip, CircularProgress, Grid, Stack, TextField, Typography } from '@mui/material';
import { Save } from 'lucide-react';
import { useSnackbar } from 'notistack';
import { db, doc, onSnapshot, setDoc } from '../../../lib/firebase';
import { useLanguage } from '../../../context/LanguageContext';
import { COMPANY_PROFILE_DOC_PATH, DEFAULT_COMPANY_PROFILE, CompanyProfile, normalizeCompanyProfile } from '../../../lib/companyProfile';

export default function CompanyProfileAdminPage() {
  const { isRTL } = useLanguage();
  const { enqueueSnackbar } = useSnackbar();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [profile, setProfile] = useState<CompanyProfile>(DEFAULT_COMPANY_PROFILE);

  useEffect(() => {
    const unsub = onSnapshot(doc(db, ...COMPANY_PROFILE_DOC_PATH), (snap) => {
      setProfile(normalizeCompanyProfile(snap.exists() ? (snap.data() as Partial<CompanyProfile>) : null));
      setLoading(false);
    }, (err) => {
      console.error('Company profile load failed', err);
      setProfile(DEFAULT_COMPANY_PROFILE);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      await setDoc(doc(db, ...COMPANY_PROFILE_DOC_PATH), normalizeCompanyProfile(profile), { merge: true });
      enqueueSnackbar('Company profile synchronized across public and admin views', { variant: 'success' });
    } catch (err) {
      console.error(err);
      enqueueSnackbar('Company profile synchronization failed', { variant: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const patch = (value: Partial<CompanyProfile>) => setProfile((current) => normalizeCompanyProfile({ ...current, ...value }));
  const patchContact = (value: Partial<CompanyProfile['contact']>) => patch({ contact: { ...profile.contact, ...value } });
  const serviceAreasText = profile.serviceAreas.join(', ');

  if (loading) {
    return (
      <Box sx={{ p: 10, display: 'flex', gap: 2, alignItems: 'center', justifyContent: 'center' }}>
        <CircularProgress />
        <Typography>Loading canonical company profile...</Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ p: 4, direction: isRTL ? 'rtl' : 'ltr' }}>
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 4 }}>
        <Box>
          <Typography variant="h4" fontWeight={950} color="#fff">Company Identity Control</Typography>
          <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.55)', fontWeight: 800 }}>
            One canonical profile powers the public company page and admin editor.
          </Typography>
        </Box>
        <Button variant="contained" startIcon={saving ? <CircularProgress size={18} /> : <Save size={18} />} onClick={save} disabled={saving}>
          {saving ? 'Saving...' : 'Save canonical profile'}
        </Button>
      </Stack>

      <Grid container spacing={3}>
        <Grid item xs={12} md={8}>
          <Card sx={{ bgcolor: 'rgba(255,255,255,0.03)', borderRadius: 4 }}>
            <CardContent sx={{ p: 4 }}>
              <Stack spacing={3}>
                <TextField label="Company Name" value={profile.companyName} onChange={(e) => patch({ companyName: e.target.value })} fullWidth />
                <TextField label="Trade License / Registration" value={profile.licenseInfo} onChange={(e) => patch({ licenseInfo: e.target.value })} fullWidth />
                <TextField label="Public Headline" value={profile.headline} onChange={(e) => patch({ headline: e.target.value, aboutText: e.target.value })} fullWidth multiline minRows={2} />
                <TextField label="Mission" value={profile.mission} onChange={(e) => patch({ mission: e.target.value })} fullWidth multiline minRows={3} />
                <TextField label="Vision" value={profile.vision} onChange={(e) => patch({ vision: e.target.value })} fullWidth multiline minRows={3} />
                <TextField label="Promise" value={profile.promise} onChange={(e) => patch({ promise: e.target.value })} fullWidth multiline minRows={2} />
              </Stack>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={4}>
          <Card sx={{ bgcolor: 'rgba(255,255,255,0.03)', borderRadius: 4, mb: 3 }}>
            <CardContent sx={{ p: 4 }}>
              <Stack spacing={3}>
                <TextField label="WhatsApp" value={profile.contact.whatsapp} onChange={(e) => patchContact({ whatsapp: e.target.value })} fullWidth />
                <TextField label="Email" value={profile.contact.email} onChange={(e) => patchContact({ email: e.target.value })} fullWidth />
                <TextField label="Phone" value={profile.contact.phone} onChange={(e) => patchContact({ phone: e.target.value })} fullWidth />
                <TextField label="Terms URL" value={profile.termsUrl} onChange={(e) => patch({ termsUrl: e.target.value })} fullWidth />
                <TextField label="Privacy URL" value={profile.privacyUrl} onChange={(e) => patch({ privacyUrl: e.target.value })} fullWidth />
              </Stack>
            </CardContent>
          </Card>

          <Card sx={{ bgcolor: 'rgba(255,255,255,0.03)', borderRadius: 4 }}>
            <CardContent sx={{ p: 4 }}>
              <Typography fontWeight={900} sx={{ mb: 2 }}>Coverage Zones</Typography>
              <TextField
                label="Comma-separated service areas"
                value={serviceAreasText}
                onChange={(e) => patch({ serviceAreas: e.target.value.split(',').map((item) => item.trim()).filter(Boolean) })}
                fullWidth
                multiline
                minRows={3}
              />
              <Stack direction="row" spacing={1} sx={{ mt: 2, flexWrap: 'wrap', gap: 1 }}>
                {profile.serviceAreas.map((area) => <Chip key={area} label={area} />)}
              </Stack>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
}

import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Box, Button, Card, CardContent, Chip, CircularProgress, Divider, Grid, Stack, TextField, Typography } from '@mui/material';
import { ExternalLink, Mail, MessageCircle, RotateCcw, Save } from 'lucide-react';
import { useSnackbar } from 'notistack';
import { db, doc, onSnapshot, serverTimestamp, setDoc } from '../../../lib/firebase';
import { useLanguage } from '../../../context/LanguageContext';
import { COMPANY_PROFILE_DOC_PATH, DEFAULT_COMPANY_PROFILE, normalizeCompanyProfile } from '../../../lib/companyProfile';
import type { CompanyProfile } from '../../../lib/companyProfile';

const normalizePhoneForWhatsApp = (value: string) => value.replace(/[^0-9]/g, '');
const linesToArray = (value: string) => value.split('\n').map((item) => item.trim()).filter(Boolean);
const servicesToText = (services: CompanyProfile['services']) => services.map((service) => `${service.title} :: ${service.desc}`).join('\n');
const textToServices = (value: string): CompanyProfile['services'] => linesToArray(value).map((line, index) => {
  const [title, ...descParts] = line.split('::');
  return {
    id: title.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || `service-${index + 1}`,
    title: title.trim() || `Service ${index + 1}`,
    desc: descParts.join('::').trim() || 'Service description pending.',
    icon: 'wrench',
  };
});

export default function CompanyProfileAdminPage() {
  const { isRTL } = useLanguage();
  const { enqueueSnackbar } = useSnackbar();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [profile, setProfile] = useState<CompanyProfile>(DEFAULT_COMPANY_PROFILE);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    const unsub = onSnapshot(doc(db, ...COMPANY_PROFILE_DOC_PATH), (snap) => {
      setProfile(normalizeCompanyProfile(snap.exists() ? (snap.data() as Partial<CompanyProfile>) : null));
      setDirty(false);
      setLoading(false);
    }, (err) => {
      console.error('Company profile load failed', err);
      setProfile(DEFAULT_COMPANY_PROFILE);
      setDirty(false);
      setLoading(false);
      enqueueSnackbar('Company profile load failed. Default profile loaded locally.', { variant: 'warning' });
    });
    return () => unsub();
  }, [enqueueSnackbar]);

  const save = async () => {
    setSaving(true);
    try {
      await setDoc(doc(db, ...COMPANY_PROFILE_DOC_PATH), {
        ...normalizeCompanyProfile(profile),
        updatedAt: serverTimestamp(),
        source: 'admin_company_profile_page',
      }, { merge: true });
      setDirty(false);
      enqueueSnackbar('Company profile synchronized across public and admin views', { variant: 'success' });
    } catch (err) {
      console.error(err);
      enqueueSnackbar('Company profile synchronization failed', { variant: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const patch = (value: Partial<CompanyProfile>) => {
    setProfile((current) => normalizeCompanyProfile({ ...current, ...value }));
    setDirty(true);
  };
  const patchContact = (value: Partial<CompanyProfile['contact']>) => patch({ contact: { ...profile.contact, ...value } });

  const serviceAreasText = profile.serviceAreas.join(', ');
  const workflowsText = profile.workflows.join('\n');
  const technologiesText = profile.technologies.join('\n');
  const servicesText = useMemo(() => servicesToText(profile.services), [profile.services]);
  const whatsappNumber = normalizePhoneForWhatsApp(profile.contact.whatsapp || profile.contact.phone || '');
  const canOpenWhatsApp = whatsappNumber.length >= 8;

  const openWindow = (url: string) => {
    if (!url) return;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const resetDraft = () => {
    setProfile(DEFAULT_COMPANY_PROFILE);
    setDirty(true);
    enqueueSnackbar('Default BIN GROUP profile loaded. Press Save to publish it.', { variant: 'info' });
  };

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
      <Stack direction={{ xs: 'column', lg: 'row' }} justifyContent="space-between" alignItems={{ xs: 'stretch', lg: 'center' }} sx={{ mb: 4, gap: 2 }}>
        <Box>
          <Typography variant="h4" fontWeight={950} color="#fff">Company Identity Control</Typography>
          <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.55)', fontWeight: 800 }}>
            One canonical profile powers the public company page, demo, owner trust copy, and admin editor.
          </Typography>
        </Box>
        <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', gap: 1 }}>
          <Button variant="outlined" startIcon={<ExternalLink size={18} />} onClick={() => openWindow('/')}>Preview Public</Button>
          <Button variant="outlined" startIcon={<ExternalLink size={18} />} onClick={() => openWindow('/request-demo')}>Preview Demo</Button>
          <Button variant="outlined" startIcon={<MessageCircle size={18} />} disabled={!canOpenWhatsApp} onClick={() => openWindow(`https://wa.me/${whatsappNumber}`)}>Test WhatsApp</Button>
          <Button variant="outlined" startIcon={<Mail size={18} />} disabled={!profile.contact.email} onClick={() => openWindow(`mailto:${profile.contact.email}`)}>Test Email</Button>
          <Button variant="outlined" color="warning" startIcon={<RotateCcw size={18} />} onClick={resetDraft}>Reset Draft</Button>
          <Button variant="contained" startIcon={saving ? <CircularProgress size={18} /> : <Save size={18} />} onClick={save} disabled={saving}>
            {saving ? 'Saving...' : dirty ? 'Save & Publish Profile' : 'Saved'}
          </Button>
        </Stack>
      </Stack>

      <Alert severity={dirty ? 'warning' : 'success'} sx={{ mb: 3 }}>
        {dirty
          ? 'You have unpublished company profile changes. Press Save & Publish Profile to update the public app.'
          : 'Canonical company profile is loaded and synchronized.'}
      </Alert>

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
                <Divider sx={{ borderColor: 'rgba(255,255,255,0.08)' }} />
                <TextField
                  label="Public Services"
                  helperText="One service per line. Format: Service title :: Service description"
                  value={servicesText}
                  onChange={(e) => patch({ services: textToServices(e.target.value) })}
                  fullWidth
                  multiline
                  minRows={7}
                />
                <TextField
                  label="Workflows"
                  helperText="One workflow per line. These explain how BIN GROUP solves owner, tenant, technician, broker, and admin problems."
                  value={workflowsText}
                  onChange={(e) => patch({ workflows: linesToArray(e.target.value) })}
                  fullWidth
                  multiline
                  minRows={5}
                />
                <TextField
                  label="Technologies / Trust Features"
                  helperText="One feature per line. Example: GPS dispatch, PDF proof, property passport, AI quote."
                  value={technologiesText}
                  onChange={(e) => patch({ technologies: linesToArray(e.target.value) })}
                  fullWidth
                  multiline
                  minRows={5}
                />
              </Stack>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={4}>
          <Card sx={{ bgcolor: 'rgba(255,255,255,0.03)', borderRadius: 4, mb: 3 }}>
            <CardContent sx={{ p: 4 }}>
              <Typography fontWeight={900} sx={{ mb: 2, color: '#fff' }}>Contact & Legal Links</Typography>
              <Stack spacing={3}>
                <TextField label="WhatsApp" value={profile.contact.whatsapp} onChange={(e) => patchContact({ whatsapp: e.target.value })} fullWidth />
                <TextField label="Email" value={profile.contact.email} onChange={(e) => patchContact({ email: e.target.value })} fullWidth />
                <TextField label="Phone" value={profile.contact.phone} onChange={(e) => patchContact({ phone: e.target.value })} fullWidth />
                <TextField label="Terms URL" value={profile.termsUrl} onChange={(e) => patch({ termsUrl: e.target.value })} fullWidth />
                <TextField label="Privacy URL" value={profile.privacyUrl} onChange={(e) => patch({ privacyUrl: e.target.value })} fullWidth />
                <Stack direction="row" spacing={1}>
                  <Button size="small" variant="outlined" onClick={() => openWindow(profile.termsUrl)}>Open Terms</Button>
                  <Button size="small" variant="outlined" onClick={() => openWindow(profile.privacyUrl)}>Open Privacy</Button>
                </Stack>
              </Stack>
            </CardContent>
          </Card>

          <Card sx={{ bgcolor: 'rgba(255,255,255,0.03)', borderRadius: 4 }}>
            <CardContent sx={{ p: 4 }}>
              <Typography fontWeight={900} sx={{ mb: 2, color: '#fff' }}>Coverage Zones</Typography>
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

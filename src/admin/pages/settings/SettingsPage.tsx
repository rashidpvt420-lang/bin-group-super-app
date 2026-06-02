// admin-panel/src/pages/settings/SettingsPage.tsx
import React, { useEffect, useState } from 'react';
import {
  Container,
  Paper,
  TextField,
  Button,
  Grid,
  Typography,
  Box,
  Switch,
  FormControlLabel,
  Divider,
  Alert,
  Card,
  CardContent,
  alpha,
  CircularProgress
} from '@mui/material';
import { Building2, ArrowRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { binThemeTokens } from '@/theme/binGroupTheme';
import { db, doc, onSnapshot, serverTimestamp, setDoc } from '@/lib/firebase';

interface SystemSettings {
  maintenanceMode: boolean;
  autoDispatchEnabled: boolean;
  maxTicketsPerTechnician: number;
  sosResponseTimeMinutes: number;
  turnoverQuoteAutoGeneration: boolean;
  paymentReminderDays: number;
  suspensionThreshold: number;
  binGroupFeePercent: number;
  partsMarkupPercent: number;
  emailNotificationsEnabled: boolean;
  smsNotificationsEnabled: boolean;
}

const DEFAULT_SETTINGS: SystemSettings = {
  maintenanceMode: false,
  autoDispatchEnabled: true,
  maxTicketsPerTechnician: 8,
  sosResponseTimeMinutes: 30,
  turnoverQuoteAutoGeneration: true,
  paymentReminderDays: 3,
  suspensionThreshold: 2,
  binGroupFeePercent: 5,
  partsMarkupPercent: 20,
  emailNotificationsEnabled: true,
  smsNotificationsEnabled: true,
};

const SETTINGS_DOC = ['settings', 'system'] as const;
const safeNumber = (value: string, fallback: number) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};
const normalizeSettings = (value?: Partial<SystemSettings> | null): SystemSettings => ({ ...DEFAULT_SETTINGS, ...(value || {}) });

export default function SettingsPage() {
  const navigate = useNavigate();
  const [settings, setSettings] = useState<SystemSettings>(DEFAULT_SETTINGS);
  const [saved, setSaved] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const unsub = onSnapshot(doc(db, ...SETTINGS_DOC), (snap) => {
      setSettings(normalizeSettings(snap.exists() ? (snap.data() as Partial<SystemSettings>) : null));
      setDirty(false);
      setLoading(false);
      setError(null);
    }, (err) => {
      console.error('Failed to load settings:', err);
      setSettings(DEFAULT_SETTINGS);
      setDirty(false);
      setLoading(false);
      setError('Settings could not be loaded from Firestore. Default settings are shown locally.');
    });
    return () => unsub();
  }, []);

  const handleChange = (key: keyof SystemSettings, value: any) => {
    setSettings({ ...settings, [key]: value });
    setSaved(false);
    setDirty(true);
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      setError(null);
      await setDoc(doc(db, ...SETTINGS_DOC), {
        ...settings,
        updatedAt: serverTimestamp(),
        source: 'admin_settings_page',
      }, { merge: true });
      setSaved(true);
      setDirty(false);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      console.error('Failed to save settings:', err);
      setError('Failed to save settings to Firestore. Check admin permissions and rules.');
    } finally {
      setSaving(false);
    }
  };

  const resetToDefaults = () => {
    setSettings(DEFAULT_SETTINGS);
    setSaved(false);
    setDirty(true);
  };

  if (loading) {
    return (
      <Container maxWidth="md" sx={{ py: 8, color: '#fff', display: 'flex', gap: 2, alignItems: 'center' }}>
        <CircularProgress />
        <Typography>Loading admin settings...</Typography>
      </Container>
    );
  }

  return (
    <Container maxWidth="md" sx={{ py: 4 }}>
      <Typography variant="h4" sx={{ mb: 4 }}>
        System Settings
      </Typography>

      {saved && <Alert severity="success" sx={{ mb: 2 }}>Settings saved successfully to Firestore.</Alert>}
      {dirty && <Alert severity="warning" sx={{ mb: 2 }}>You have unpublished settings changes. Press Save Settings to publish them.</Alert>}
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      <Card sx={{ 
          mb: 4, 
          background: 'linear-gradient(135deg, rgba(218, 165, 32, 0.1) 0%, rgba(218, 165, 32, 0.05) 100%)', 
          border: '1px solid rgba(218, 165, 32, 0.3)',
          borderRadius: 4
      }}>
        <CardContent sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', p: 3, gap: 2, flexWrap: 'wrap' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 3 }}>
            <Box sx={{ p: 2, bgcolor: 'rgba(218, 165, 32, 0.1)', borderRadius: 3, color: '#DAA520' }}>
              <Building2 size={32} />
            </Box>
            <Box>
              <Typography variant="h6" fontWeight="950" sx={{ color: '#FFF' }}>Sovereign Institutional Profile</Typography>
              <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.6)', fontWeight: 700 }}>
                Manage company services, licenses, UAE coverage, and public profile data.
              </Typography>
            </Box>
          </Box>
          <Button 
            variant="contained" 
            endIcon={<ArrowRight size={18} />}
            onClick={() => navigate('/admin/company-profile')}
            sx={{ 
                bgcolor: '#DAA520', 
                color: '#000', 
                fontWeight: 950,
                px: 3,
                '&:hover': { bgcolor: alpha('#DAA520', 0.8) }
            }}
          >
            MANAGE IDENTITY
          </Button>
        </CardContent>
      </Card>

      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Typography variant="h6" sx={{ mb: 2 }}>
            System Status
          </Typography>
          <FormControlLabel
            control={
              <Switch
                checked={settings.maintenanceMode}
                onChange={(e) => handleChange('maintenanceMode', e.target.checked)}
              />
            }
            label={
              <Box>
                <Typography variant="body1">Maintenance Mode</Typography>
                <Typography variant="caption" color="textSecondary">
                  {settings.maintenanceMode
                    ? 'Users cannot access the system'
                    : 'System is operating normally'}
                </Typography>
              </Box>
            }
          />
        </CardContent>
      </Card>

      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Typography variant="h6" sx={{ mb: 2 }}>
            Operational Settings
          </Typography>

          <Grid container spacing={2} sx={{ mb: 2 }}>
            <Grid item xs={12} sm={6}>
              <FormControlLabel
                control={
                  <Switch
                    checked={settings.autoDispatchEnabled}
                    onChange={(e) => handleChange('autoDispatchEnabled', e.target.checked)}
                  />
                }
                label="Auto-Dispatch Tickets"
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                type="number"
                label="Max Tickets per Technician"
                value={settings.maxTicketsPerTechnician}
                onChange={(e) => handleChange('maxTicketsPerTechnician', safeNumber(e.target.value, DEFAULT_SETTINGS.maxTicketsPerTechnician))}
              />
            </Grid>
          </Grid>

          <Grid container spacing={2}>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                type="number"
                label="SOS Response Time (minutes)"
                value={settings.sosResponseTimeMinutes}
                onChange={(e) => handleChange('sosResponseTimeMinutes', safeNumber(e.target.value, DEFAULT_SETTINGS.sosResponseTimeMinutes))}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <FormControlLabel
                control={
                  <Switch
                    checked={settings.turnoverQuoteAutoGeneration}
                    onChange={(e) => handleChange('turnoverQuoteAutoGeneration', e.target.checked)}
                  />
                }
                label="Auto-Generate Turnover Quotes"
              />
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Typography variant="h6" sx={{ mb: 2 }}>
            Financial Settings
          </Typography>

          <Grid container spacing={2}>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                type="number"
                label="BIN Group Fee (%)"
                value={settings.binGroupFeePercent}
                onChange={(e) => handleChange('binGroupFeePercent', safeNumber(e.target.value, DEFAULT_SETTINGS.binGroupFeePercent))}
                inputProps={{ step: 0.1 }}
              />
              <Typography variant="caption" color="textSecondary">
                Deducted from rent collections
              </Typography>
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                type="number"
                label="Parts Markup (%)"
                value={settings.partsMarkupPercent}
                onChange={(e) => handleChange('partsMarkupPercent', safeNumber(e.target.value, DEFAULT_SETTINGS.partsMarkupPercent))}
                inputProps={{ step: 0.1 }}
              />
              <Typography variant="caption" color="textSecondary">
                Added to technician costs
              </Typography>
            </Grid>
          </Grid>

          <Divider sx={{ my: 2 }} />

          <Grid container spacing={2}>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                type="number"
                label="Payment Reminder (days)"
                value={settings.paymentReminderDays}
                onChange={(e) => handleChange('paymentReminderDays', safeNumber(e.target.value, DEFAULT_SETTINGS.paymentReminderDays))}
              />
              <Typography variant="caption" color="textSecondary">
                Send reminder after X days
              </Typography>
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                type="number"
                label="Suspension Threshold"
                value={settings.suspensionThreshold}
                onChange={(e) => handleChange('suspensionThreshold', safeNumber(e.target.value, DEFAULT_SETTINGS.suspensionThreshold))}
              />
              <Typography variant="caption" color="textSecondary">
                Unpaid invoices before suspension
              </Typography>
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Typography variant="h6" sx={{ mb: 2 }}>
            Notification Settings
          </Typography>

          <FormControlLabel
            control={
              <Switch
                checked={settings.emailNotificationsEnabled}
                onChange={(e) => handleChange('emailNotificationsEnabled', e.target.checked)}
              />
            }
            label="Email Notifications"
          />
          <FormControlLabel
            control={
              <Switch
                checked={settings.smsNotificationsEnabled}
                onChange={(e) => handleChange('smsNotificationsEnabled', e.target.checked)}
              />
            }
            label="SMS Notifications"
          />
        </CardContent>
      </Card>

      <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
        <Button variant="contained" onClick={handleSave} disabled={saving}>
          {saving ? 'Saving...' : 'Save Settings'}
        </Button>
        <Button variant="outlined" onClick={resetToDefaults} disabled={saving}>
          Reset Draft to Defaults
        </Button>
      </Box>

      <Paper sx={{ p: 3, mt: 4, backgroundColor: '#f5f5f5' }}>
        <Typography variant="h6" sx={{ mb: 2 }}>
          System Information
        </Typography>
        <Grid container spacing={2}>
          <Grid item xs={12} sm={6}>
            <Typography variant="body2">
              <strong>Version:</strong> 1.0.0
            </Typography>
            <Typography variant="body2">
              <strong>Database:</strong> Firebase Firestore
            </Typography>
          </Grid>
          <Grid item xs={12} sm={6}>
            <Typography variant="body2">
              <strong>API Server:</strong> Firebase Functions / Firestore
            </Typography>
            <Typography variant="body2">
              <strong>Last Updated:</strong> {new Date().toLocaleString()}
            </Typography>
          </Grid>
        </Grid>
      </Paper>
    </Container>
  );
}

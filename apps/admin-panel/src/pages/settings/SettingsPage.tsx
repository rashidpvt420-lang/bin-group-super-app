// admin-panel/src/pages/settings/SettingsPage.tsx
import React, { useState } from 'react';
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
} from '@mui/material';
import { apiClient } from '../../services/api';
import { useLanguage } from '@bin/shared';

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

export default function SettingsPage() {
  const { t, isRTL } = useLanguage();
  const [settings, setSettings] = useState<SystemSettings>({
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
  });

  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleChange = (key: keyof SystemSettings, value: any) => {
    setSettings({ ...settings, [key]: value });
    setSaved(false);
  };

  const handleSave = async () => {
    try {
      setLoading(true);
      await apiClient.post('/api/admin/settings', settings);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (error) {
      console.error('Failed to save settings:', error);
      alert(t('admin.settings.save_failed'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Container maxWidth="md" sx={{ py: 4, direction: isRTL ? 'rtl' : 'ltr' }}>
      <Typography variant="h4" sx={{ mb: 4 }}>
        {t('admin.settings.page_title')}
      </Typography>

      {saved && <Alert severity="success" sx={{ mb: 2 }}>{t('admin.settings.saved_success')}</Alert>}

      {/* System Status */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Typography variant="h6" sx={{ mb: 2 }}>
            {t('admin.settings.system_status')}
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
                <Typography variant="body1">{t('admin.settings.maintenance_mode')}</Typography>
                <Typography variant="caption" color="textSecondary">
                  {settings.maintenanceMode
                    ? t('admin.settings.maintenance_mode_on_desc')
                    : t('admin.settings.maintenance_mode_off_desc')}
                </Typography>
              </Box>
            }
          />
        </CardContent>
      </Card>

      {/* Operational Settings */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Typography variant="h6" sx={{ mb: 2 }}>
            {t('admin.settings.operational_settings')}
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
                label={t('admin.settings.auto_dispatch_tickets')}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                type="number"
                label={t('admin.settings.max_tickets_per_technician')}
                value={settings.maxTicketsPerTechnician}
                onChange={(e) => handleChange('maxTicketsPerTechnician', parseInt(e.target.value))}
              />
            </Grid>
          </Grid>

          <Grid container spacing={2}>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                type="number"
                label={t('admin.settings.sos_response_time')}
                value={settings.sosResponseTimeMinutes}
                onChange={(e) => handleChange('sosResponseTimeMinutes', parseInt(e.target.value))}
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
                label={t('admin.settings.auto_generate_turnover_quotes')}
              />
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      {/* Financial Settings */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Typography variant="h6" sx={{ mb: 2 }}>
            {t('admin.settings.financial_settings')}
          </Typography>

          <Grid container spacing={2}>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                type="number"
                label={t('admin.settings.bin_group_fee_percent')}
                value={settings.binGroupFeePercent}
                onChange={(e) => handleChange('binGroupFeePercent', parseFloat(e.target.value))}
                inputProps={{ step: 0.1 }}
              />
              <Typography variant="caption" color="textSecondary">
                {t('admin.settings.deducted_from_rent')}
              </Typography>
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                type="number"
                label={t('admin.settings.parts_markup_percent')}
                value={settings.partsMarkupPercent}
                onChange={(e) => handleChange('partsMarkupPercent', parseFloat(e.target.value))}
                inputProps={{ step: 0.1 }}
              />
              <Typography variant="caption" color="textSecondary">
                {t('admin.settings.added_to_technician_costs')}
              </Typography>
            </Grid>
          </Grid>

          <Divider sx={{ my: 2 }} />

          <Grid container spacing={2}>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                type="number"
                label={t('admin.settings.payment_reminder_days')}
                value={settings.paymentReminderDays}
                onChange={(e) => handleChange('paymentReminderDays', parseInt(e.target.value))}
              />
              <Typography variant="caption" color="textSecondary">
                {t('admin.settings.send_reminder_after_days')}
              </Typography>
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                type="number"
                label={t('admin.settings.suspension_threshold')}
                value={settings.suspensionThreshold}
                onChange={(e) => handleChange('suspensionThreshold', parseInt(e.target.value))}
              />
              <Typography variant="caption" color="textSecondary">
                {t('admin.settings.unpaid_invoices_before_suspension')}
              </Typography>
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      {/* Notification Settings */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Typography variant="h6" sx={{ mb: 2 }}>
            {t('admin.settings.notification_settings')}
          </Typography>

          <FormControlLabel
            control={
              <Switch
                checked={settings.emailNotificationsEnabled}
                onChange={(e) => handleChange('emailNotificationsEnabled', e.target.checked)}
              />
            }
            label={t('admin.settings.email_notifications')}
          />
          <FormControlLabel
            control={
              <Switch
                checked={settings.smsNotificationsEnabled}
                onChange={(e) => handleChange('smsNotificationsEnabled', e.target.checked)}
              />
            }
            label={t('admin.settings.sms_notifications')}
          />
        </CardContent>
      </Card>

      {/* Action Buttons */}
      <Box sx={{ display: 'flex', gap: 2 }}>
        <Button variant="contained" onClick={handleSave} disabled={loading}>
          {loading ? t('admin.settings.saving') : t('admin.settings.save_settings')}
        </Button>
        <Button
          variant="outlined"
          onClick={() => alert(t('admin.settings.reset_to_defaults_alert'))}
        >
          {t('admin.settings.reset_to_defaults')}
        </Button>
      </Box>

      {/* System Information */}
      <Paper sx={{ p: 3, mt: 4, backgroundColor: '#f5f5f5' }}>
        <Typography variant="h6" sx={{ mb: 2 }}>
          {t('admin.settings.system_information')}
        </Typography>
        <Grid container spacing={2}>
          <Grid item xs={12} sm={6}>
            <Typography variant="body2">
              <strong>{t('admin.settings.version_label')}</strong> 1.0.0
            </Typography>
            <Typography variant="body2">
              <strong>{t('admin.settings.database_label')}</strong> {t('admin.settings.database_value')}
            </Typography>
          </Grid>
          <Grid item xs={12} sm={6}>
            <Typography variant="body2">
              <strong>{t('admin.settings.api_server_label')}</strong> {t('admin.settings.api_server_value')}
            </Typography>
            <Typography variant="body2">
              <strong>{t('admin.settings.last_updated_label')}</strong> {new Date().toLocaleString()}
            </Typography>
          </Grid>
        </Grid>
      </Paper>
    </Container>
  );
}

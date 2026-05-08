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
  alpha
} from '@mui/material';
import { Building2, ShieldCheck, ArrowRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { binThemeTokens } from '@/theme/binGroupTheme';
import { apiClient } from '@/services/api';

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
  const navigate = useNavigate();
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
      alert('Failed to save settings');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Container maxWidth="md" sx={{ py: 4 }}>
      <Typography variant="h4" sx={{ mb: 4 }}>
        System Settings
      </Typography>

      {saved && <Alert severity="success" sx={{ mb: 2 }}>Settings saved successfully!</Alert>}

      {/* Institutional Profile Link */}
      <Card sx={{ 
          mb: 4, 
          background: 'linear-gradient(135deg, rgba(218, 165, 32, 0.1) 0%, rgba(218, 165, 32, 0.05) 100%)', 
          border: '1px solid rgba(218, 165, 32, 0.3)',
          borderRadius: 4
      }}>
        <CardContent sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', p: 3 }}>
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

      {/* System Status */}
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

      {/* Operational Settings */}
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
                onChange={(e) => handleChange('maxTicketsPerTechnician', parseInt(e.target.value))}
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
                label="Auto-Generate Turnover Quotes"
              />
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      {/* Financial Settings */}
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
                onChange={(e) => handleChange('binGroupFeePercent', parseFloat(e.target.value))}
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
                onChange={(e) => handleChange('partsMarkupPercent', parseFloat(e.target.value))}
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
                onChange={(e) => handleChange('paymentReminderDays', parseInt(e.target.value))}
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
                onChange={(e) => handleChange('suspensionThreshold', parseInt(e.target.value))}
              />
              <Typography variant="caption" color="textSecondary">
                Unpaid invoices before suspension
              </Typography>
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      {/* Notification Settings */}
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

      {/* Action Buttons */}
      <Box sx={{ display: 'flex', gap: 2 }}>
        <Button variant="contained" onClick={handleSave} disabled={loading}>
          {loading ? 'Saving...' : 'Save Settings'}
        </Button>
        <Button
          variant="outlined"
          onClick={() => alert('Settings reset to defaults')}
        >
          Reset to Defaults
        </Button>
      </Box>

      {/* System Information */}
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
              <strong>API Server:</strong> Production
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

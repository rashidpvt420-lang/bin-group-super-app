import React, { useState } from 'react';
import { Box, Card, CardContent, Typography, alpha, Stack, Button, Chip, TextField, Select, MenuItem, FormControl, InputLabel, CircularProgress, IconButton } from '@mui/material';
import { Users, Shield, UserPlus, X, AlertCircle } from 'lucide-react';
import { binThemeTokens } from '../../theme/binGroupTheme';
import { useLanguage } from '../../context/LanguageContext';
import { PropertyReporter } from '../utils/ownerReporterResolver';

interface OwnerAuthorizedReportersSectionProps {
  properties: any[];
  reporters: PropertyReporter[];
  onAddReporter: (reporter: any) => Promise<void>;
  onRemoveReporter: (reporterId: string) => Promise<void>;
  loading: boolean;
}

const cardSx = {
  bgcolor: 'rgba(22,22,24,0.72)',
  border: `1px solid ${alpha(binThemeTokens.gold, 0.16)}`,
  borderRadius: 4,
  minWidth: 0,
  overflow: 'hidden',
};

const textSafeSx = {
  minWidth: 0,
  overflowWrap: 'anywhere',
  wordBreak: 'break-word',
};

export default function OwnerAuthorizedReportersSection({ properties, reporters, onAddReporter, onRemoveReporter, loading }: OwnerAuthorizedReportersSectionProps) {
  const { t, isRTL } = useLanguage();
  const [showAddForm, setShowAddForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    propertyId: '',
    reporterName: '',
    reporterEmail: '',
    reporterPhone: '',
    roleLabel: 'Facility Manager'
  });

  const roles = [
    "Facility Manager",
    "Security",
    "Reception",
    "School Admin",
    "Hospital Admin",
    "Majlis Supervisor",
    "Government Representative",
    "Other"
  ];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await onAddReporter(formData);
      setShowAddForm(false);
      setFormData({ propertyId: '', reporterName: '', reporterEmail: '', reporterPhone: '', roleLabel: 'Facility Manager' });
    } catch (err) {
      console.error(err);
      alert('Failed to add reporter. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card sx={cardSx}>
      <CardContent sx={{ p: { xs: 2.25, md: 4 } }}>
        <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" alignItems={{ xs: 'flex-start', md: 'center' }} spacing={2} sx={{ mb: 3, minWidth: 0 }}>
          <Stack direction="row" alignItems="center" spacing={1.5} sx={{ minWidth: 0 }}>
            <Box sx={{ p: 1, bgcolor: alpha(binThemeTokens.gold, 0.1), borderRadius: 2, color: binThemeTokens.gold, flexShrink: 0 }}>
              <Users size={22} />
            </Box>
            <Box sx={{ minWidth: 0 }}>
              <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 900, letterSpacing: 2, ...textSafeSx }}>
                {t('owner.authorizedReporters') || 'Authorized Property Reporters'}
              </Typography>
              <Typography variant="h5" fontWeight={950} sx={{ color: '#fff', ...textSafeSx }}>
                Non-Tenant Personnel Access
              </Typography>
            </Box>
          </Stack>
          {!showAddForm && (
            <Button variant="outlined" startIcon={<UserPlus size={16} />} onClick={() => setShowAddForm(true)} sx={{ borderColor: binThemeTokens.gold, color: binThemeTokens.gold, fontWeight: 900 }}>
              {t('owner.addReporter') || 'Add Reporter'}
            </Button>
          )}
        </Stack>

        <Box sx={{ p: 2, mb: 3, bgcolor: alpha(binThemeTokens.gold, 0.05), borderRadius: 3, border: `1px solid ${alpha(binThemeTokens.gold, 0.15)}` }}>
          <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 1 }}>
            <Shield size={16} color={binThemeTokens.gold} />
            <Typography variant="subtitle2" fontWeight={900} sx={{ color: binThemeTokens.gold }}>Security Notice</Typography>
          </Stack>
          <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.7)', lineHeight: 1.6, ...textSafeSx }}>
            {t('owner.tenantReporterUidNote') || 'Each tenant or authorized reporter uses a separate Firebase Auth UID. They are linked to this owner through ownerId + propertyId + unitId/reporterId + userUid + email.'}
          </Typography>
        </Box>

        {showAddForm && (
          <Box component="form" onSubmit={handleSubmit} sx={{ p: 3, mb: 4, bgcolor: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 3 }}>
            <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
              <Typography variant="h6" fontWeight={950} sx={{ color: '#fff' }}>Invite New Reporter</Typography>
              <IconButton onClick={() => setShowAddForm(false)} sx={{ color: 'rgba(255,255,255,0.5)' }}><X size={20} /></IconButton>
            </Stack>
            <Stack spacing={2.5}>
              <FormControl fullWidth>
                <InputLabel sx={{ color: 'rgba(255,255,255,0.5)' }}>Select Property</InputLabel>
                <Select
                  value={formData.propertyId}
                  label="Select Property"
                  required
                  onChange={(e) => setFormData({ ...formData, propertyId: e.target.value })}
                  sx={{ color: '#fff', '& .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.2)' } }}
                >
                  {properties.map(p => (
                    <MenuItem key={p.id || p.propertyId} value={p.id || p.propertyId}>
                      {p.propertyName || p.name || 'Unnamed Property'} ({p.city || p.emirate})
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                <TextField fullWidth required label="Full Name" value={formData.reporterName} onChange={(e) => setFormData({ ...formData, reporterName: e.target.value })} InputLabelProps={{ style: { color: 'rgba(255,255,255,0.5)' } }} InputProps={{ style: { color: '#fff' } }} sx={{ '& .MuiOutlinedInput-root': { '& fieldset': { borderColor: 'rgba(255,255,255,0.2)' } } }} />
                <FormControl fullWidth>
                  <InputLabel sx={{ color: 'rgba(255,255,255,0.5)' }}>Role / Designation</InputLabel>
                  <Select value={formData.roleLabel} label="Role / Designation" required onChange={(e) => setFormData({ ...formData, roleLabel: e.target.value })} sx={{ color: '#fff', '& .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.2)' } }}>
                    {roles.map(r => <MenuItem key={r} value={r}>{r}</MenuItem>)}
                  </Select>
                </FormControl>
              </Stack>
              
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                <TextField fullWidth required type="email" label="Email Address" value={formData.reporterEmail} onChange={(e) => setFormData({ ...formData, reporterEmail: e.target.value })} InputLabelProps={{ style: { color: 'rgba(255,255,255,0.5)' } }} InputProps={{ style: { color: '#fff' } }} sx={{ '& .MuiOutlinedInput-root': { '& fieldset': { borderColor: 'rgba(255,255,255,0.2)' } } }} />
                <TextField fullWidth required label="Phone Number" value={formData.reporterPhone} onChange={(e) => setFormData({ ...formData, reporterPhone: e.target.value })} InputLabelProps={{ style: { color: 'rgba(255,255,255,0.5)' } }} InputProps={{ style: { color: '#fff' } }} sx={{ '& .MuiOutlinedInput-root': { '& fieldset': { borderColor: 'rgba(255,255,255,0.2)' } } }} />
              </Stack>
              
              <Button type="submit" variant="contained" disabled={submitting} sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950, '&:hover': { bgcolor: '#c6a75e' }, py: 1.5 }}>
                {submitting ? <CircularProgress size={24} sx={{ color: '#000' }} /> : 'Send Invitation & Grant Access'}
              </Button>
            </Stack>
          </Box>
        )}

        {loading ? (
          <Box sx={{ p: 4, display: 'flex', justifyContent: 'center' }}><CircularProgress sx={{ color: binThemeTokens.gold }} /></Box>
        ) : reporters.length === 0 ? (
          <Box sx={{ p: 4, textAlign: 'center', border: '1px dashed rgba(255,255,255,0.1)', borderRadius: 3 }}>
            <AlertCircle size={32} color="rgba(255,255,255,0.2)" style={{ margin: '0 auto 12px' }} />
            <Typography sx={{ color: 'rgba(255,255,255,0.5)', fontWeight: 900 }}>{t('owner.noReportersYet') || 'No authorized reporters have been added yet.'}</Typography>
          </Box>
        ) : (
          <Stack spacing={1.5}>
            {reporters.map((reporter) => (
              <Box key={reporter.id} sx={{ p: 2, bgcolor: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 3, display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, justifyContent: 'space-between', alignItems: { xs: 'flex-start', sm: 'center' }, gap: 2 }}>
                <Box>
                  <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.5 }}>
                    <Typography variant="subtitle1" fontWeight={950} sx={{ color: '#fff' }}>{reporter.reporterName}</Typography>
                    <Chip label={reporter.accessStatus} size="small" sx={{ bgcolor: reporter.accessStatus === 'ACTIVE' ? alpha('#10b981', 0.12) : alpha('#f59e0b', 0.12), color: reporter.accessStatus === 'ACTIVE' ? '#10b981' : '#f59e0b', fontWeight: 900, fontSize: '0.65rem', height: 20 }} />
                  </Stack>
                  <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.5)', mb: 0.5 }}>{reporter.roleLabel} • {reporter.propertyName}</Typography>
                  <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.3)', fontFamily: 'monospace' }}>{reporter.reporterEmail} • {reporter.reporterPhone}</Typography>
                </Box>
                <Button size="small" color="error" variant="outlined" onClick={() => onRemoveReporter(reporter.id)} sx={{ fontWeight: 900, borderRadius: 2 }}>
                  Revoke
                </Button>
              </Box>
            ))}
          </Stack>
        )}
      </CardContent>
    </Card>
  );
}

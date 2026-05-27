import React, { useMemo, useState } from 'react';
import { Box, Card, CardContent, Typography, alpha, Stack, Button, Chip, TextField, Select, MenuItem, FormControl, InputLabel, CircularProgress, IconButton, Grid, Alert } from '@mui/material';
import { Users, Shield, UserPlus, X, AlertCircle, Eye, ClipboardCheck, KeyRound } from 'lucide-react';
import { binThemeTokens } from '../../theme/binGroupTheme';
import { useLanguage } from '../../context/LanguageContext';
import type { PropertyReporter, ReporterAccessType, ReporterPermissionScope } from '../utils/ownerReporterResolver';

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

const accessOptions: Array<{ value: ReporterAccessType; label: string; role: string; scope: ReporterPermissionScope }> = [
  { value: 'MAJLIS_RESIDENT', label: 'Majlis Resident / Occupant', role: 'Majlis Resident', scope: 'COMPLAINTS_ONLY' },
  { value: 'OWNER_DELEGATE', label: 'Owner Delegate / On-Behalf Representative', role: 'Owner Delegate', scope: 'OWNER_DELEGATE' },
  { value: 'FACILITY_MANAGER', label: 'Facility Manager', role: 'Facility Manager', scope: 'VIEW_AND_COMPLAIN' },
  { value: 'SECURITY', label: 'Security / Reception', role: 'Security', scope: 'COMPLAINTS_ONLY' },
  { value: 'STAFF', label: 'Staff / Site Employee', role: 'Staff', scope: 'COMPLAINTS_ONLY' },
  { value: 'OTHER', label: 'Other Authorized Reporter', role: 'Other', scope: 'COMPLAINTS_ONLY' },
];

const permissionOptions: Array<{ value: ReporterPermissionScope; label: string; helper: string }> = [
  { value: 'COMPLAINTS_ONLY', label: 'Complaints Only', helper: 'Can report AC, plumbing, electrical, cleaning, safety issues and view own tickets.' },
  { value: 'VIEW_AND_COMPLAIN', label: 'View Property + Complain', helper: 'Can see property complaint history and submit new issues.' },
  { value: 'OWNER_DELEGATE', label: 'Owner Delegate', helper: 'Can monitor the property on behalf of the owner. Financial access remains blocked unless explicitly enabled later.' },
];

const defaultForm = {
  propertyId: '',
  reporterName: '',
  reporterEmail: '',
  reporterPhone: '',
  roleLabel: 'Majlis Resident',
  accessType: 'MAJLIS_RESIDENT' as ReporterAccessType,
  permissionScope: 'COMPLAINTS_ONLY' as ReporterPermissionScope,
  occupiedArea: '',
  unitId: '',
  notes: '',
};

export default function OwnerAuthorizedReportersSection({ properties, reporters, onAddReporter, onRemoveReporter, loading }: OwnerAuthorizedReportersSectionProps) {
  const { t } = useLanguage();
  const [showAddForm, setShowAddForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formData, setFormData] = useState(defaultForm);

  const activeReporters = useMemo(() => reporters.filter((r) => r.accessStatus !== 'SUSPENDED').length, [reporters]);
  const ownerDelegates = useMemo(() => reporters.filter((r) => r.canActOnOwnerBehalf && r.accessStatus !== 'SUSPENDED').length, [reporters]);
  const complaintReporters = useMemo(() => reporters.filter((r) => r.canCreateComplaints && r.accessStatus !== 'SUSPENDED').length, [reporters]);

  const handleAccessTypeChange = (value: ReporterAccessType) => {
    const selected = accessOptions.find((option) => option.value === value) || accessOptions[0];
    setFormData({
      ...formData,
      accessType: selected.value,
      roleLabel: selected.role,
      permissionScope: selected.scope,
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await onAddReporter(formData);
      setShowAddForm(false);
      setFormData(defaultForm);
    } catch (err) {
      console.error(err);
      alert('Failed to add authorized person. Please check the property, name, email, and phone.');
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
                {t('owner.authorizedReporters') || 'Authorized Property Access'}
              </Typography>
              <Typography variant="h5" fontWeight={950} sx={{ color: '#fff', ...textSafeSx }}>
                Majlis Residents, Staff & Owner Delegates
              </Typography>
            </Box>
          </Stack>
          {!showAddForm && (
            <Button variant="outlined" startIcon={<UserPlus size={16} />} onClick={() => setShowAddForm(true)} sx={{ borderColor: binThemeTokens.gold, color: binThemeTokens.gold, fontWeight: 900 }}>
              Add Person
            </Button>
          )}
        </Stack>

        <Grid container spacing={2} sx={{ mb: 3 }}>
          {[
            { label: 'Active Authorized People', value: activeReporters, icon: <Users size={18} /> },
            { label: 'Complaint Reporters', value: complaintReporters, icon: <ClipboardCheck size={18} /> },
            { label: 'Owner Delegates', value: ownerDelegates, icon: <Eye size={18} /> },
          ].map((metric) => (
            <Grid item xs={12} md={4} key={metric.label}>
              <Box sx={{ p: 2, bgcolor: alpha(binThemeTokens.gold, 0.04), border: `1px solid ${alpha(binThemeTokens.gold, 0.12)}`, borderRadius: 3 }}>
                <Stack direction="row" spacing={1.2} alignItems="center" sx={{ color: binThemeTokens.gold, mb: 1 }}>
                  {metric.icon}
                  <Typography variant="caption" sx={{ fontWeight: 950, letterSpacing: 1 }}>{metric.label.toUpperCase()}</Typography>
                </Stack>
                <Typography variant="h4" sx={{ color: '#fff', fontWeight: 950 }}>{metric.value}</Typography>
              </Box>
            </Grid>
          ))}
        </Grid>

        <Alert severity="info" sx={{ mb: 3, bgcolor: alpha('#38bdf8', 0.08), color: '#dbeafe', border: `1px solid ${alpha('#38bdf8', 0.22)}` }}>
          For Majlis, hospitals, schools, government sites, villas, and non-tenant buildings: add the resident, site supervisor, receptionist, security officer, or owner delegate here. They use their own login/UID and can report AC or maintenance complaints without using the owner account.
        </Alert>

        {showAddForm && (
          <Box component="form" onSubmit={handleSubmit} sx={{ p: { xs: 2, md: 3 }, mb: 4, bgcolor: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 3 }}>
            <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
              <Typography variant="h6" fontWeight={950} sx={{ color: '#fff' }}>Add Authorized Person</Typography>
              <IconButton onClick={() => setShowAddForm(false)} sx={{ color: 'rgba(255,255,255,0.5)' }}><X size={20} /></IconButton>
            </Stack>
            <Stack spacing={2.5}>
              <FormControl fullWidth>
                <InputLabel sx={{ color: 'rgba(255,255,255,0.5)' }}>Select Property</InputLabel>
                <Select
                  value={formData.propertyId}
                  label="Select Property"
                  required
                  onChange={(e) => setFormData({ ...formData, propertyId: String(e.target.value) })}
                  sx={{ color: '#fff', '& .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.2)' } }}
                >
                  {properties.map(p => (
                    <MenuItem key={p.id || p.propertyId} value={p.id || p.propertyId}>
                      {p.propertyName || p.name || 'Unnamed Property'} ({p.city || p.emirate || 'UAE'})
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>

              <Grid container spacing={2}>
                <Grid item xs={12} md={6}>
                  <FormControl fullWidth>
                    <InputLabel sx={{ color: 'rgba(255,255,255,0.5)' }}>Access Type</InputLabel>
                    <Select value={formData.accessType} label="Access Type" required onChange={(e) => handleAccessTypeChange(e.target.value as ReporterAccessType)} sx={{ color: '#fff', '& .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.2)' } }}>
                      {accessOptions.map((option) => <MenuItem key={option.value} value={option.value}>{option.label}</MenuItem>)}
                    </Select>
                  </FormControl>
                </Grid>
                <Grid item xs={12} md={6}>
                  <FormControl fullWidth>
                    <InputLabel sx={{ color: 'rgba(255,255,255,0.5)' }}>Permission Scope</InputLabel>
                    <Select value={formData.permissionScope} label="Permission Scope" required onChange={(e) => setFormData({ ...formData, permissionScope: e.target.value as ReporterPermissionScope })} sx={{ color: '#fff', '& .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.2)' } }}>
                      {permissionOptions.map((option) => <MenuItem key={option.value} value={option.value}>{option.label}</MenuItem>)}
                    </Select>
                  </FormControl>
                </Grid>
              </Grid>

              <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.55)', mt: -1 }}>
                {permissionOptions.find((option) => option.value === formData.permissionScope)?.helper}
              </Typography>
              
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                <TextField fullWidth required label="Full Name" value={formData.reporterName} onChange={(e) => setFormData({ ...formData, reporterName: e.target.value })} InputLabelProps={{ style: { color: 'rgba(255,255,255,0.5)' } }} InputProps={{ style: { color: '#fff' } }} sx={{ '& .MuiOutlinedInput-root': { '& fieldset': { borderColor: 'rgba(255,255,255,0.2)' } } }} />
                <TextField fullWidth required label="Role / Designation" value={formData.roleLabel} onChange={(e) => setFormData({ ...formData, roleLabel: e.target.value })} InputLabelProps={{ style: { color: 'rgba(255,255,255,0.5)' } }} InputProps={{ style: { color: '#fff' } }} sx={{ '& .MuiOutlinedInput-root': { '& fieldset': { borderColor: 'rgba(255,255,255,0.2)' } } }} />
              </Stack>
              
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                <TextField fullWidth required type="email" label="Email Address / Login Email" value={formData.reporterEmail} onChange={(e) => setFormData({ ...formData, reporterEmail: e.target.value })} InputLabelProps={{ style: { color: 'rgba(255,255,255,0.5)' } }} InputProps={{ style: { color: '#fff' } }} sx={{ '& .MuiOutlinedInput-root': { '& fieldset': { borderColor: 'rgba(255,255,255,0.2)' } } }} />
                <TextField fullWidth required label="Phone Number" value={formData.reporterPhone} onChange={(e) => setFormData({ ...formData, reporterPhone: e.target.value })} InputLabelProps={{ style: { color: 'rgba(255,255,255,0.5)' } }} InputProps={{ style: { color: '#fff' } }} sx={{ '& .MuiOutlinedInput-root': { '& fieldset': { borderColor: 'rgba(255,255,255,0.2)' } } }} />
              </Stack>

              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                <TextField fullWidth label="Majlis Room / Area / Department" value={formData.occupiedArea} onChange={(e) => setFormData({ ...formData, occupiedArea: e.target.value })} InputLabelProps={{ style: { color: 'rgba(255,255,255,0.5)' } }} InputProps={{ style: { color: '#fff' } }} sx={{ '& .MuiOutlinedInput-root': { '& fieldset': { borderColor: 'rgba(255,255,255,0.2)' } } }} />
                <TextField fullWidth label="Unit / Room Ref. (optional)" value={formData.unitId} onChange={(e) => setFormData({ ...formData, unitId: e.target.value })} InputLabelProps={{ style: { color: 'rgba(255,255,255,0.5)' } }} InputProps={{ style: { color: '#fff' } }} sx={{ '& .MuiOutlinedInput-root': { '& fieldset': { borderColor: 'rgba(255,255,255,0.2)' } } }} />
              </Stack>

              <TextField fullWidth multiline minRows={2} label="Owner Instructions / Notes" value={formData.notes} onChange={(e) => setFormData({ ...formData, notes: e.target.value })} InputLabelProps={{ style: { color: 'rgba(255,255,255,0.5)' } }} InputProps={{ style: { color: '#fff' } }} sx={{ '& .MuiOutlinedInput-root': { '& fieldset': { borderColor: 'rgba(255,255,255,0.2)' } } }} />
              
              <Button type="submit" variant="contained" disabled={submitting || properties.length === 0} sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950, '&:hover': { bgcolor: '#c6a75e' }, py: 1.5 }}>
                {submitting ? <CircularProgress size={24} sx={{ color: '#000' }} /> : 'Create Access & Complaint Rights'}
              </Button>
            </Stack>
          </Box>
        )}

        {loading ? (
          <Box sx={{ p: 4, display: 'flex', justifyContent: 'center' }}><CircularProgress sx={{ color: binThemeTokens.gold }} /></Box>
        ) : reporters.length === 0 ? (
          <Box sx={{ p: 4, textAlign: 'center', border: '1px dashed rgba(255,255,255,0.1)', borderRadius: 3 }}>
            <AlertCircle size={32} color="rgba(255,255,255,0.2)" style={{ margin: '0 auto 12px' }} />
            <Typography sx={{ color: 'rgba(255,255,255,0.5)', fontWeight: 900 }}>{t('owner.noReportersYet') || 'No authorized people have been added yet.'}</Typography>
          </Box>
        ) : (
          <Stack spacing={1.5}>
            {reporters.map((reporter) => (
              <Box key={reporter.id} sx={{ p: 2, bgcolor: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 3, display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, justifyContent: 'space-between', alignItems: { xs: 'flex-start', sm: 'center' }, gap: 2 }}>
                <Box sx={{ minWidth: 0 }}>
                  <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.5, flexWrap: 'wrap' }}>
                    <Typography variant="subtitle1" fontWeight={950} sx={{ color: '#fff', ...textSafeSx }}>{reporter.reporterName}</Typography>
                    <Chip label={reporter.accessStatus} size="small" sx={{ bgcolor: reporter.accessStatus === 'ACTIVE' ? alpha('#10b981', 0.12) : reporter.accessStatus === 'SUSPENDED' ? alpha('#ef4444', 0.12) : alpha('#f59e0b', 0.12), color: reporter.accessStatus === 'ACTIVE' ? '#10b981' : reporter.accessStatus === 'SUSPENDED' ? '#ef4444' : '#f59e0b', fontWeight: 900, fontSize: '0.65rem', height: 20 }} />
                    <Chip label={reporter.permissionScope.replace(/_/g, ' ')} size="small" sx={{ bgcolor: alpha(binThemeTokens.gold, 0.12), color: binThemeTokens.gold, fontWeight: 900, fontSize: '0.62rem', height: 20 }} />
                  </Stack>
                  <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.5)', mb: 0.5, ...textSafeSx }}>{reporter.roleLabel} • {reporter.propertyName}</Typography>
                  <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.3)', fontFamily: 'monospace', ...textSafeSx }}>{reporter.reporterEmail} • {reporter.reporterPhone}</Typography>
                  {reporter.occupiedArea && <Typography variant="caption" sx={{ display: 'block', color: 'rgba(255,255,255,0.42)', mt: 0.5 }}>Area: {reporter.occupiedArea}</Typography>}
                  {reporter.inviteCode && <Typography variant="caption" sx={{ display: 'flex', alignItems: 'center', gap: 0.5, color: binThemeTokens.gold, mt: 0.5, fontWeight: 900 }}><KeyRound size={13} /> Invite Code: {reporter.inviteCode}</Typography>}
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

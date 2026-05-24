import React, { useMemo } from 'react';
import { Alert, Box, Card, CardContent, Chip, Grid, Stack, Typography, alpha } from '@mui/material';
import { Building2, FileCheck2, ShieldCheck, Users, Wrench } from 'lucide-react';
import { binThemeTokens } from '../../theme/binGroupTheme';
import { getContractModeProfile, getPropertyIntelligenceProfile, resolveContractMode, summarizePortfolioIntelligence } from '../../utils/contractIntelligence';
import type { SovereignContractMode } from '../../utils/contractIntelligence';

interface Props {
  contract: any;
  properties: any[];
  tenantCount?: number;
  reporterCount?: number;
}

const cardSx = {
  bgcolor: 'rgba(22,22,24,0.72)',
  border: `1px solid ${alpha(binThemeTokens.gold, 0.16)}`,
  borderRadius: 4,
};

const safeTextSx = { overflowWrap: 'anywhere', wordBreak: 'break-word' };

function modeColor(mode: SovereignContractMode) {
  if (mode === 'HYBRID') return '#10b981';
  if (mode === 'PROPERTY_MANAGEMENT_ONLY') return '#3b82f6';
  return binThemeTokens.gold;
}

function Metric({ label, value, caption, color = '#fff' }: { label: string; value: React.ReactNode; caption?: React.ReactNode; color?: string }) {
  return (
    <Grid item xs={12} sm={6} md={3}>
      <Box sx={{ p: 2.25, bgcolor: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 3, height: '100%' }}>
        <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.45)', fontWeight: 950 }}>{label.toUpperCase()}</Typography>
        <Typography variant="h5" sx={{ color, fontWeight: 950, mt: 0.8, ...safeTextSx }}>{value}</Typography>
        {caption && <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.52)', mt: 0.8, display: 'block', ...safeTextSx }}>{caption}</Typography>}
      </Box>
    </Grid>
  );
}

export default function OwnerContractIntelligenceSection({ contract, properties, tenantCount = 0, reporterCount = 0 }: Props) {
  const mode = resolveContractMode(contract || {});
  const profile = getContractModeProfile(mode);
  const portfolio = useMemo(() => summarizePortfolioIntelligence(properties || [], contract), [properties, contract]);
  const propertyProfiles = useMemo(() => (properties || []).map((property) => ({ property, profile: getPropertyIntelligenceProfile(property, contract) })), [properties, contract]);

  return (
    <Stack spacing={3}>
      <Card sx={cardSx}>
        <CardContent sx={{ p: { xs: 2.25, md: 4 } }}>
          <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" alignItems={{ xs: 'flex-start', md: 'center' }} spacing={2} sx={{ mb: 3 }}>
            <Stack direction="row" spacing={1.5} alignItems="center">
              <Box sx={{ p: 1, bgcolor: alpha(modeColor(mode), 0.12), color: modeColor(mode), borderRadius: 2 }}>
                {mode === 'MAINTENANCE_ONLY' ? <Wrench size={22} /> : mode === 'PROPERTY_MANAGEMENT_ONLY' ? <Users size={22} /> : <ShieldCheck size={22} />}
              </Box>
              <Box>
                <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 950, letterSpacing: 2 }}>CONTRACT INTELLIGENCE</Typography>
                <Typography variant="h5" sx={{ color: '#fff', fontWeight: 950, ...safeTextSx }}>{profile.ownerTitle}</Typography>
              </Box>
            </Stack>
            <Chip label={mode.replace(/_/g, ' ')} sx={{ bgcolor: alpha(modeColor(mode), 0.14), color: modeColor(mode), fontWeight: 950 }} />
          </Stack>

          <Alert severity="info" sx={{ mb: 3, bgcolor: alpha(modeColor(mode), 0.06), border: `1px solid ${alpha(modeColor(mode), 0.22)}`, color: '#dbeafe', borderRadius: 3 }}>
            <Typography variant="body2" sx={{ fontWeight: 800, ...safeTextSx }}>{profile.ownerSummary}</Typography>
          </Alert>

          <Grid container spacing={2.5}>
            <Metric label="Maintenance" value={profile.showMaintenance ? 'Visible' : 'Hidden / Add-on'} caption={profile.showMaintenance ? 'Complaints, SLA and technician proof' : 'Not part of this contract'} color={profile.showMaintenance ? '#10b981' : '#f59e0b'} />
            <Metric label="Property Management" value={profile.showPropertyManagement ? 'Visible' : 'Not Included'} caption={profile.showPropertyManagement ? 'Tenant, rent and occupancy tools' : 'Owner controls tenant management'} color={profile.showPropertyManagement ? '#3b82f6' : '#f59e0b'} />
            <Metric label="Tenant Records" value={portfolio.needsTenantContracts ? `${tenantCount} linked` : 'Not Required'} caption={portfolio.needsTenantContracts ? 'Lease/unit visibility needed' : 'Use reporters where needed'} />
            <Metric label="Authorized Reporters" value={portfolio.needsAuthorizedReporters ? `${reporterCount} linked` : 'Optional'} caption={portfolio.needsAuthorizedReporters ? 'Majlis/staff/security access needed' : 'Useful for maintenance access'} />
          </Grid>
        </CardContent>
      </Card>

      <Card sx={cardSx}>
        <CardContent sx={{ p: { xs: 2.25, md: 4 } }}>
          <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 3 }}>
            <Box sx={{ p: 1, bgcolor: alpha(binThemeTokens.gold, 0.1), color: binThemeTokens.gold, borderRadius: 2 }}><Building2 size={22} /></Box>
            <Box>
              <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 950, letterSpacing: 2 }}>UAE ASSET CLASSIFICATION</Typography>
              <Typography variant="h5" sx={{ color: '#fff', fontWeight: 950 }}>Contract Recommendation Matrix</Typography>
            </Box>
          </Stack>

          <Grid container spacing={2.5} sx={{ mb: 3 }}>
            <Metric label="Tenant-Based Assets" value={portfolio.tenantBased} caption="Villas, buildings, towers and leased assets" />
            <Metric label="Reporter-Based Assets" value={portfolio.reporterBased} caption="Majlis, schools, hospitals and government sites" />
            <Metric label="Missing Title Deeds" value={portfolio.missingTitleDeeds} caption="Ownership proof required" color={portfolio.missingTitleDeeds ? '#ef4444' : '#10b981'} />
            <Metric label="Hybrid Recommended" value={portfolio.recommendedHybrid} caption="Maintenance + PM suggested" color={portfolio.recommendedHybrid ? '#10b981' : '#fff'} />
          </Grid>

          <Stack spacing={2}>
            {propertyProfiles.length === 0 ? (
              <Alert severity="warning" sx={{ borderRadius: 3 }}>No property asset is linked yet. Submit property details and title deed evidence to activate recommendations.</Alert>
            ) : propertyProfiles.map(({ property, profile: asset }) => (
              <Box key={property.id || property.propertyId || property.propertyName} sx={{ p: 2.2, borderRadius: 3, border: '1px solid rgba(255,255,255,0.07)', bgcolor: 'rgba(255,255,255,0.025)' }}>
                <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" alignItems={{ xs: 'flex-start', md: 'center' }} spacing={2}>
                  <Box>
                    <Typography variant="subtitle1" sx={{ color: '#fff', fontWeight: 950, ...safeTextSx }}>{property.propertyName || property.name || 'Property'}</Typography>
                    <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.55)', ...safeTextSx }}>{asset.ownerProblemStatement}</Typography>
                  </Box>
                  <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', gap: 1 }}>
                    <Chip label={asset.propertyClass.replace(/_/g, ' ')} size="small" sx={{ bgcolor: alpha('#3b82f6', 0.12), color: '#93c5fd', fontWeight: 900 }} />
                    <Chip label={asset.occupancyModel.replace(/_/g, ' ')} size="small" sx={{ bgcolor: alpha(binThemeTokens.gold, 0.12), color: binThemeTokens.gold, fontWeight: 900 }} />
                    <Chip label={`Deed: ${asset.titleDeedStatus}`} size="small" sx={{ bgcolor: alpha(asset.titleDeedStatus === 'MISSING' ? '#ef4444' : '#10b981', 0.12), color: asset.titleDeedStatus === 'MISSING' ? '#fca5a5' : '#10b981', fontWeight: 900 }} />
                    <Chip label={`Recommend: ${asset.contractRecommendation.replace(/_/g, ' ')}`} size="small" sx={{ bgcolor: alpha(modeColor(asset.contractRecommendation), 0.12), color: modeColor(asset.contractRecommendation), fontWeight: 900 }} />
                  </Stack>
                </Stack>
                <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', gap: 1, mt: 1.5 }}>
                  {asset.requiredEvidence.map((item) => (
                    <Chip key={item} icon={<FileCheck2 size={13} />} label={item} size="small" sx={{ color: 'rgba(255,255,255,0.72)', bgcolor: 'rgba(255,255,255,0.04)', '& .MuiChip-icon': { color: binThemeTokens.gold } }} />
                  ))}
                </Stack>
              </Box>
            ))}
          </Stack>
        </CardContent>
      </Card>
    </Stack>
  );
}

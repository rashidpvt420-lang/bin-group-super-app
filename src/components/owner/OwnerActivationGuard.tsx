import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Alert, Box, Button, Chip, Paper, Stack, Typography, alpha } from '@mui/material';
import { LockKeyhole, CreditCard, FileText, ShieldCheck } from 'lucide-react';
import { useRole } from '../../context/RoleContext';
import { useLanguage } from '../../context/LanguageContext';
import { binThemeTokens } from '../../theme/binGroupTheme';

const ALWAYS_ALLOWED_OWNER_PATHS = new Set([
  '/owner/contracts',
  '/owner/activation',
  '/owner/property-passport',
  '/owner/documents',
  '/owner/iban',
]);

function isAllowedPath(pathname: string) {
  if (pathname === '/owner' || pathname === '/owner/dashboard') return true;
  if (ALWAYS_ALLOWED_OWNER_PATHS.has(pathname)) return true;
  return pathname.startsWith('/owner/property-passport/');
}

function ownerContractId(profile: any) {
  return String(
    profile?.pendingContractId ||
    profile?.latestActivationContractId ||
    profile?.activeContractId ||
    profile?.contractId ||
    profile?.latestContractId ||
    ''
  ).trim();
}

function contractRoute(profile: any) {
  const contractId = ownerContractId(profile);
  return contractId ? `/owner/contracts?contractId=${encodeURIComponent(contractId)}` : '/owner/contracts';
}

export default function OwnerActivationGuard({ children }: { children: React.ReactNode }) {
  const { user } = useRole();
  const { isRTL } = useLanguage();
  const navigate = useNavigate();
  const location = useLocation();
  const profile = user as any;

  const isOwner = String(profile?.role || '').toLowerCase() === 'owner';
  const adminApproved = !!profile?.adminApproved || profile?.status === 'active';
  const paymentVerified = !!profile?.paymentVerified;
  const hasActiveContract = !!profile?.activeContractId || !!profile?.dashboardUnlocked;
  const activated = !isOwner || (adminApproved && paymentVerified && hasActiveContract);

  if (activated || isAllowedPath(location.pathname)) return <>{children}</>;

  return (
    <Box sx={{ direction: isRTL ? 'rtl' : 'ltr', py: 4 }}>
      <Paper sx={{ p: { xs: 3, md: 5 }, bgcolor: 'rgba(15, 23, 42, 0.72)', border: `1px solid ${alpha(binThemeTokens.gold, 0.22)}`, borderRadius: 6 }}>
        <Stack spacing={3} alignItems={isRTL ? 'flex-end' : 'flex-start'}>
          <Chip
            icon={<LockKeyhole size={14} />}
            label="ACTIVATION REQUIRED"
            sx={{ bgcolor: alpha('#f59e0b', 0.12), color: '#f59e0b', fontWeight: 950 }}
          />
          <Box sx={{ textAlign: isRTL ? 'right' : 'left' }}>
            <Typography variant="h4" fontWeight="950" sx={{ color: '#FFF', mb: 1 }}>
              Owner dashboard is protected until contract payment is verified
            </Typography>
            <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.62)', maxWidth: 760, lineHeight: 1.8 }}>
              BIN GROUP uses a gated activation model: property passport, contract scope, mobilization payment, admin verification, then full dashboard access. This prevents orphan contracts and keeps every owner profile tied to a verified payment and active service agreement.
            </Typography>
          </Box>

          <Stack direction={{ xs: 'column', sm: isRTL ? 'row-reverse' : 'row' }} spacing={2} sx={{ width: '100%' }}>
            <Button
              variant="contained"
              startIcon={<CreditCard size={18} />}
              onClick={() => navigate('/owner/activation')}
              sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950, borderRadius: 3, px: 3, py: 1.4 }}
            >
              Activate Contract / Pay 15%
            </Button>
            <Button
              variant="outlined"
              startIcon={<FileText size={18} />}
              onClick={() => navigate(contractRoute(profile))}
              sx={{ borderColor: alpha(binThemeTokens.gold, 0.45), color: binThemeTokens.gold, fontWeight: 950, borderRadius: 3, px: 3, py: 1.4 }}
            >
              Review Contracts
            </Button>
            <Button
              variant="outlined"
              startIcon={<ShieldCheck size={18} />}
              onClick={() => navigate('/owner/property-passport')}
              sx={{ borderColor: 'rgba(255,255,255,0.18)', color: '#FFF', fontWeight: 900, borderRadius: 3, px: 3, py: 1.4 }}
            >
              View Property Passport
            </Button>
          </Stack>

          <Alert severity="warning" sx={{ width: '100%', bgcolor: alpha('#f59e0b', 0.08), color: '#f8fafc', border: `1px solid ${alpha('#f59e0b', 0.25)}` }}>
            Required flags: adminApproved, paymentVerified, and activeContractId/dashboardUnlocked on the owner profile.
          </Alert>
        </Stack>
      </Paper>
    </Box>
  );
}

import { Box, Button, Stack, Typography } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { useLanguage } from '@bin/shared';
import RoleQuickActionsPanel from '../../components/RoleQuickActionsPanel';
import BrokerLiveAttributionCard from '../components/BrokerLiveAttributionCard';
import CanonicalNextActions from '../../components/CanonicalNextActions';

export default function BrokerSimpleDashboardPage() {
  const navigate = useNavigate();
  const { isRTL, tx } = useLanguage();

  return (
    <Box sx={{ direction: isRTL ? 'rtl' : 'ltr' }}>
      <Stack spacing={4}>
        <Box sx={{ textAlign: isRTL ? 'right' : 'left' }}>
          <Typography variant="overline" sx={{ color: '#B8932F', fontWeight: 950, letterSpacing: 3 }}>{tx('broker.simple.overline', 'BROKER SIMPLE MODE')}</Typography>
          <Typography variant="h3" sx={{ color: '#111827', fontWeight: 950, mt: 1 }}>{tx('broker.simple.title', 'Bring leads and protect attribution')}</Typography>
          <Typography sx={{ color: '#667085', mt: 1, maxWidth: 760 }}>{tx('broker.simple.desc', 'Brokers need a clear path to submit leads, prove attribution, track contracts, and see commission status.')}</Typography>
        </Box>

        <CanonicalNextActions actions={[
          { id: 'lead', label: tx('broker.next.lead', 'Submit or update a lead'), detail: tx('broker.next.leadDetail', 'Create identity-bound attribution before commercial discussions advance.'), path: '/broker/leads' },
          { id: 'commission', label: tx('broker.next.commission', 'Review commission status'), detail: tx('broker.next.commissionDetail', 'See qualification, approval, payout readiness and payment state.'), path: '/broker/commissions' },
          { id: 'profile', label: tx('broker.next.profile', 'Complete payout profile'), detail: tx('broker.next.profileDetail', 'Resolve masked KYC, RERA, identity or bank requirements.'), path: '/broker/profile' },
        ]} />

        <RoleQuickActionsPanel role="broker" isRTL={isRTL} title={tx('broker.simple.primaryTitle', 'Main broker actions')} subtitle={tx('broker.simple.primarySubtitle', 'Lead capture, referrals, commission timeline, and documents first.')} />

        <BrokerLiveAttributionCard isRTL={isRTL} />

        <Button onClick={() => navigate('/broker/dashboard/full')} sx={{ alignSelf: isRTL ? 'flex-end' : 'flex-start', color: '#B8932F', fontWeight: 950 }}>{tx('broker.simple.advanced', 'Open advanced dashboard')}</Button>
      </Stack>
    </Box>
  );
}

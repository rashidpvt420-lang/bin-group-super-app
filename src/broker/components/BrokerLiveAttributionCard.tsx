import { Alert, Box, CircularProgress } from '@mui/material';
import BrokerAttributionQuickStartCard from '../../components/BrokerAttributionQuickStartCard';
import { useBrokerAttributionSignals } from '../hooks/useBrokerAttributionSignals';

type BrokerLiveAttributionCardProps = {
  isRTL?: boolean;
};

export default function BrokerLiveAttributionCard({ isRTL = false }: BrokerLiveAttributionCardProps) {
  const signals = useBrokerAttributionSignals();

  if (signals.loading) {
    return <Box role="status" sx={{ py: 6, display: 'grid', placeItems: 'center' }}><CircularProgress /></Box>;
  }

  if (signals.error) {
    return <Alert severity="warning">{signals.error}</Alert>;
  }

  return (
    <BrokerAttributionQuickStartCard
      isRTL={isRTL}
      referralLinkReady={signals.referralLinkReady}
      qrReady={signals.qrReady}
      activeLeads={signals.activeLeads}
      attributedContracts={signals.attributedContracts}
      pendingCommissionAmount={signals.pendingCommissionAmount}
    />
  );
}

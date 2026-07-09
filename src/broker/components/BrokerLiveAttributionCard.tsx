import BrokerAttributionQuickStartCard from '../../components/BrokerAttributionQuickStartCard';
import { useBrokerAttributionSignals } from '../hooks/useBrokerAttributionSignals';

type BrokerLiveAttributionCardProps = {
  isRTL?: boolean;
};

export default function BrokerLiveAttributionCard({ isRTL = false }: BrokerLiveAttributionCardProps) {
  const signals = useBrokerAttributionSignals();

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

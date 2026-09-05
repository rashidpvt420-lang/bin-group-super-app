export const BROKER_EVIDENCE_TYPE = 'broker-contract-to-payout-production-proof';
export const BROKER_EVIDENCE_COMMISSION_PREFIX = 'commission_e2e_broker_contract_';
export const BROKER_COMMISSION_SCAN_LIMIT = 200;

const clean = (value) => String(value ?? '').trim();

export function isStaleSyntheticBrokerCommission({
  documentId,
  data,
  brokerUid,
  canonicalCommissionId,
}) {
  const id = clean(documentId);
  const uid = clean(brokerUid);
  const canonicalId = clean(canonicalCommissionId);
  if (!id || !uid || id === canonicalId || !data || typeof data !== 'object' || Array.isArray(data)) {
    return false;
  }

  const belongsToDedicatedBroker = clean(data.brokerId) === uid || clean(data.brokerUid) === uid;
  if (!belongsToDedicatedBroker) return false;

  const deterministicLifecycleFixture = id.startsWith(BROKER_EVIDENCE_COMMISSION_PREFIX)
    && clean(data.contractId).startsWith('e2e_broker_contract_');
  return data.e2eLaunchSeed === true
    || clean(data.e2eEvidenceType) === BROKER_EVIDENCE_TYPE
    || deterministicLifecycleFixture;
}

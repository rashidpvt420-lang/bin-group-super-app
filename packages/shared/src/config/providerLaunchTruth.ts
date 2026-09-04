export type LaunchEvidenceLayer = 'source' | 'hosted' | 'physical_device';
export type ProviderRuntimeState = 'UNKNOWN' | 'UNCONFIGURED' | 'CONFIGURED' | 'VERIFIED' | 'DISABLED';
export type PublicGateStatus = 'pending' | 'passed' | 'blocked' | 'waived';

export type ProviderLaunchRequirement = {
  id: string;
  label: string;
  required: boolean;
  requiredEvidenceLayer: LaunchEvidenceLayer;
  configurationAuthority: 'client_env' | 'server_secret' | 'server_policy' | 'firebase';
  liveProof: string;
};

export type LaunchEvidenceRecord = {
  status?: PublicGateStatus | string | null;
  evidenceLayer?: LaunchEvidenceLayer | string | null;
  commitSha?: string | null;
};

export const PHASE1_PAYMENT_POLICY = Object.freeze({
  version: 'PHASE1_CASH_CHEQUE_V1',
  currency: 'AED' as const,
  approvedMethods: Object.freeze(['CASH', 'CHEQUE'] as const),
  bankTransferEnabled: false,
  stripeEnabled: false,
  cardPaymentsEnabled: false,
  policyText: 'Phase 1 payment methods: Cash or Cheque only. Bank Transfer and Card/Stripe are unavailable.',
});

export const PROVIDER_LAUNCH_REQUIREMENTS: readonly ProviderLaunchRequirement[] = Object.freeze([
  {
    id: 'firebaseAuth',
    label: 'Firebase Auth',
    required: true,
    requiredEvidenceLayer: 'hosted',
    configurationAuthority: 'firebase',
    liveProof: 'Fresh hosted production login proof for all five roles.',
  },
  {
    id: 'storageRules',
    label: 'Firebase Storage',
    required: true,
    requiredEvidenceLayer: 'hosted',
    configurationAuthority: 'firebase',
    liveProof: 'Hosted upload/read/delete proof with production security enforcement.',
  },
  {
    id: 'firebaseFunctionsLiveSmoke',
    label: 'Firebase Functions',
    required: true,
    requiredEvidenceLayer: 'hosted',
    configurationAuthority: 'firebase',
    liveProof: 'Fresh production callable/trigger proof. Deployment alone is not sufficient.',
  },
  {
    id: 'firebaseCloudMessaging',
    label: 'Push notifications',
    required: true,
    requiredEvidenceLayer: 'physical_device',
    configurationAuthority: 'client_env',
    liveProof: 'Real device token registration plus foreground/background delivery and denied-permission fallback.',
  },
  {
    id: 'googleMaps',
    label: 'Google Maps / GPS',
    required: true,
    requiredEvidenceLayer: 'physical_device',
    configurationAuthority: 'client_env',
    liveProof: 'Real device GPS permission, map render, technician check-in/tracking, and denied-location fallback.',
  },
  {
    id: 'aiVisionOrTriage',
    label: 'Sovereign AI',
    required: true,
    requiredEvidenceLayer: 'hosted',
    configurationAuthority: 'server_secret',
    liveProof: 'Signed-in production callable proof with secrets server-side and safe fallback behavior.',
  },
  {
    id: 'phase1Payments',
    label: 'Phase 1 payments',
    required: true,
    requiredEvidenceLayer: 'physical_device',
    configurationAuthority: 'server_policy',
    liveProof: 'Real owner Cash/Cheque activation, approval, rejection, receipt/evidence, and dashboard-unlock proof.',
  },
  {
    id: 'appCheckEnforcement',
    label: 'Firebase App Check',
    required: true,
    requiredEvidenceLayer: 'hosted',
    configurationAuthority: 'firebase',
    liveProof: 'Hosted verified-token traffic and enforced protected Firebase/callable operations.',
  },
]);

const EVIDENCE_LAYER_RANK: Record<LaunchEvidenceLayer, number> = {
  source: 0,
  hosted: 1,
  physical_device: 2,
};

export function normalizeEvidenceLayer(value: unknown): LaunchEvidenceLayer | null {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'source' || normalized === 'hosted' || normalized === 'physical_device') return normalized;
  return null;
}

export function normalizeCommitSha(value: unknown): string {
  const normalized = String(value || '').trim().toLowerCase();
  return /^[a-f0-9]{40}$/.test(normalized) ? normalized : '';
}

export function evidenceLayerSatisfies(actual: unknown, required: LaunchEvidenceLayer): boolean {
  const normalized = normalizeEvidenceLayer(actual);
  return normalized !== null && EVIDENCE_LAYER_RANK[normalized] >= EVIDENCE_LAYER_RANK[required];
}

export function evidenceCountsForPublicLaunch(
  evidence: LaunchEvidenceRecord | null | undefined,
  expectedCommitSha: unknown,
  requiredLayer: LaunchEvidenceLayer,
): boolean {
  if (!evidence) return false;
  if (String(evidence.status || '').trim().toLowerCase() !== 'passed') return false;
  const expected = normalizeCommitSha(expectedCommitSha);
  const observed = normalizeCommitSha(evidence.commitSha);
  if (!expected || !observed || expected !== observed) return false;
  return evidenceLayerSatisfies(evidence.evidenceLayer, requiredLayer);
}

export function providerRuntimeState({
  configured,
  verified,
  disabled = false,
}: {
  configured?: boolean | null;
  verified?: boolean | null;
  disabled?: boolean;
}): ProviderRuntimeState {
  if (disabled) return 'DISABLED';
  if (verified === true) return 'VERIFIED';
  if (configured === true) return 'CONFIGURED';
  if (configured === false) return 'UNCONFIGURED';
  return 'UNKNOWN';
}

export function requiredEvidenceLayerForGate(gateId: string, gateGroup?: string): LaunchEvidenceLayer {
  const providerRequirement = PROVIDER_LAUNCH_REQUIREMENTS.find((item) => item.id === gateId);
  if (providerRequirement) return providerRequirement.requiredEvidenceLayer;

  if (
    gateGroup === 'Device' ||
    gateId === 'technicianGpsAndDeniedFallback' ||
    gateId === 'technicianMissionLifecycle' ||
    gateId === 'technicianCompletionAudit'
  ) {
    return 'physical_device';
  }

  return 'hosted';
}

export const OPTIONAL_PROVIDER_POLICY = Object.freeze({
  whatsappBusiness: {
    requiredForPhase1: false,
    defaultState: 'UNKNOWN' as ProviderRuntimeState,
    rule: 'Do not describe WhatsApp as live without approved sender/template and hosted send evidence.',
  },
  smsVoiceFallback: {
    requiredForPhase1: false,
    defaultState: 'UNKNOWN' as ProviderRuntimeState,
    rule: 'Do not describe SMS/voice as live without provider approval and delivery evidence.',
  },
  stripe: {
    requiredForPhase1: false,
    defaultState: 'DISABLED' as ProviderRuntimeState,
    rule: 'Stripe/Card is disabled by the Phase 1 payment policy.',
  },
  bankTransfer: {
    requiredForPhase1: false,
    defaultState: 'DISABLED' as ProviderRuntimeState,
    rule: 'Bank Transfer is disabled by the Phase 1 payment policy.',
  },
});

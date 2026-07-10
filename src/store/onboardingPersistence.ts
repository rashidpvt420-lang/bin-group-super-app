import { useOnboardingStore } from './onboardingStore';

const STORAGE_KEY = 'bin-group-onboarding-v3';

function safeSignupData(signupData: any) {
  return {
    name: String(signupData?.name || ''),
    email: String(signupData?.email || ''),
    phone: String(signupData?.phone || ''),
  };
}

export function sanitizePersistedOnboardingStorage() {
  if (typeof window === 'undefined') return;
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return;

  try {
    const parsed = JSON.parse(raw);
    const state = parsed?.state && typeof parsed.state === 'object' ? parsed.state : null;
    if (!state) return;

    const sanitized = {
      ...parsed,
      state: {
        ...state,
        signupData: safeSignupData(state.signupData),
      },
    };

    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(sanitized));
  } catch (error) {
    console.warn('[onboarding] Invalid persisted state removed.', error);
    window.localStorage.removeItem(STORAGE_KEY);
  }
}

export function installSafeOnboardingPersistence() {
  sanitizePersistedOnboardingStorage();

  useOnboardingStore.persist.setOptions({
    partialize: (state: any) => ({
      step: state.step,
      properties: state.properties,
      portfolioSummary: state.portfolioSummary,
      selectedPlan: state.selectedPlan,
      selectedAddOns: state.selectedAddOns,
      contractId: state.contractId,
      paymentVerified: state.paymentVerified,
      paymentRequested: state.paymentRequested,
      accountCreated: state.accountCreated,
      valuationResult: state.valuationResult,
      intakeId: state.intakeId,
      onboardingSessionId: state.onboardingSessionId,
      paymentManifest: state.paymentManifest,
      paymentMethod: state.paymentMethod,
      companyProfile: state.companyProfile,
      signupData: safeSignupData(state.signupData),
      isContractSigned: state.isContractSigned,
      signatureName: state.signatureName,
      kycUrls: state.kycUrls,
      ownerAccount: state.ownerAccount,
      proofDocuments: state.proofDocuments,
      propertyData: state.propertyData,
    }),
  });
}

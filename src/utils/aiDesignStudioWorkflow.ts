export const DESIGN_SPACE_TYPES = [
  'room', 'bedroom', 'master bedroom', 'guest room', 'living room', 
  'family hall', 'hall', 'majlis', 'government majlis', 'dining', 
  'kitchen', 'pantry', 'bathroom', 'office', 'lobby', 'reception', 
  'corridor', 'garden', 'landscape', 'terrace', 'balcony', 'pool area', 
  'facade', 'retail unit', 'clinic room', 'classroom', 'hotel suite'
];

export const DESIGN_OBJECTIVES = [
  'refresh', 'redesign', 'renovation', 'luxury upgrade', 'fit-out', 
  'landscape upgrade', 'compliance upgrade', 'maintenance correction'
];

export const DESIGN_STYLES = [
  'Modern', 'Arabic Luxury', 'Contemporary', 'Minimalist', 'Classic', 
  'Executive', 'Hotel Premium', 'Family Comfort', 'Resort Style', 'Traditional Majlis'
];

export function normalizeDesignRole(role?: string | null): string {
  return String(role || '').toLowerCase().trim();
}

export function isTenantDesignRole(role?: string | null): boolean {
  return normalizeDesignRole(role) === 'tenant';
}

export function isOwnerDesignRole(role?: string | null): boolean {
  const normalized = normalizeDesignRole(role);
  return ['owner', 'admin', 'ceo', 'super_admin', 'manager'].includes(normalized);
}

export function getDepositAmount(total: number, percent = 15): number {
  return Math.round(total * (percent / 100));
}

export function getInitialDesignStatus(role?: string | null, hasImages = false): string {
  if (!hasImages) return 'DRAFT';
  if (isTenantDesignRole(role)) return 'AWAITING_OWNER_APPROVAL';
  return 'DEPOSIT_PENDING';
}

export function getApprovalRequired(role?: string | null): boolean {
  return isTenantDesignRole(role);
}

export function friendlyDesignStatus(status: string): string {
  return status.replace(/_/g, ' ').toUpperCase();
}

export function buildConceptPrompt(input: {
  zoneType: string;
  designStyle: string;
  designObjective: string;
  notes?: string;
}): string {
  return `Generate a high-quality interior design rendering for a ${input.zoneType}. 
Style: ${input.designStyle}. 
Objective: ${input.designObjective}.
${input.notes ? `Additional requirements: ${input.notes}` : ''}`;
}

export function buildDesignConcepts(input: {
  zoneType: string;
  designStyle: string;
  designObjective: string;
  uploadedImageUrl?: string;
  notes?: string;
}) {
  const basePrompt = buildConceptPrompt(input);
  const beforeImage = input.uploadedImageUrl || '';

  return [
    {
      id: 'premium_functional',
      title: 'Premium Functional Concept',
      style: input.designStyle,
      beforeImageUrl: beforeImage,
      afterImageUrl: '',
      prompt: `${basePrompt}. Focus on functionality and premium finishes.`,
      scopeSummary: 'Standard upgrades with durable, high-quality materials.',
      generationStatus: 'READY_FOR_AI_RENDER',
    },
    {
      id: 'luxury_signature',
      title: 'Luxury Signature Concept',
      style: input.designStyle,
      beforeImageUrl: beforeImage,
      afterImageUrl: '',
      prompt: `${basePrompt}. Focus on absolute luxury, bespoke elements, and signature lighting.`,
      scopeSummary: 'Bespoke design, premium lighting, high-end materials.',
      generationStatus: 'READY_FOR_AI_RENDER',
    },
    {
      id: 'cost_controlled',
      title: 'Cost-Controlled Upgrade',
      style: input.designStyle,
      beforeImageUrl: beforeImage,
      afterImageUrl: '',
      prompt: `${basePrompt}. Focus on impactful visual changes while retaining structural integrity to minimize cost.`,
      scopeSummary: 'Smart cosmetic upgrades, retain core structure, impactful finishes.',
      generationStatus: 'READY_FOR_AI_RENDER',
    }
  ];
}

export function resolveDesignWorkflowView(request: any) {
  return {
    isDepositPending: request?.status === 'DEPOSIT_PENDING' || request?.quoteStatus === 'DEPOSIT_PENDING',
    isAwaitingApproval: request?.status === 'AWAITING_OWNER_APPROVAL' || request?.approvalStatus === 'PENDING_OWNER_APPROVAL',
    isApproved: request?.approvalStatus === 'OWNER_APPROVED',
    isRejected: request?.approvalStatus === 'OWNER_REJECTED',
    isPaid: request?.paymentStatus === 'PAID',
    isExecuting: ['SITE_SURVEY_PENDING', 'SITE_SURVEY_SCHEDULED', 'READY_FOR_EXECUTION', 'IN_EXECUTION'].includes(request?.status)
  };
}

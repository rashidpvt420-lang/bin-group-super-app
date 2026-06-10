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

export const DESIGN_CONCEPT_RENDER_STATUS = {
  READY_FOR_ENGINE: 'READY_FOR_RENDER_ENGINE',
  RENDER_PENDING: 'AI_RENDER_PENDING',
  RENDER_COMPLETE: 'AI_RENDER_COMPLETE',
  RENDER_FAILED: 'AI_RENDER_FAILED',
} as const;

export type DesignExecutionDetail = {
  category: string;
  items: string[];
};

export type DesignConcept = {
  id: string;
  title: string;
  style: string;
  prompt: string;
  scopeSummary: string;
  beforeImageUrl: string;
  afterImageUrl: string;
  renderEngineRequired: boolean;
  renderStatus: string;
  generationStatus: string;
  productionNote?: string;
  finishTier?: string;
  quoteTotal?: number;
  mobilizationAmount?: number;
  executionDetails?: DesignExecutionDetail[];
};

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

function text(value: unknown, fallback = '') {
  const resolved = String(value || '').trim();
  return resolved || fallback;
}

function money(value: unknown) {
  const numeric = Number(value || 0);
  return Number.isFinite(numeric) ? Math.round(numeric).toLocaleString() : '0';
}

function requiresPlumbing(zoneType: string) {
  const zone = zoneType.toLowerCase();
  return ['bathroom', 'kitchen', 'pantry', 'garden', 'landscape', 'pool'].some((keyword) => zone.includes(keyword));
}

function requiresMep(zoneType: string) {
  const zone = zoneType.toLowerCase();
  return ['bathroom', 'kitchen', 'pantry', 'garden', 'landscape', 'pool', 'clinic', 'hotel', 'retail', 'facade'].some((keyword) => zone.includes(keyword));
}

export function buildDesignExecutionDetails(input: {
  zoneType: string;
  designStyle: string;
  designObjective: string;
  finishTier?: string;
  dimensions?: number;
  notes?: string;
  quoteTotal?: number;
  mobilizationAmount?: number;
}): DesignExecutionDetail[] {
  const zoneType = text(input.zoneType, 'design area');
  const designStyle = text(input.designStyle, 'Modern');
  const designObjective = text(input.designObjective, 'redesign');
  const finishTier = text(input.finishTier, 'Premium');
  const dimensions = Number(input.dimensions || 0);
  const quoteTotal = Number(input.quoteTotal || 0);
  const mobilizationAmount = Number(input.mobilizationAmount || (quoteTotal > 0 ? getDepositAmount(quoteTotal, 15) : 0));
  const plumbing = requiresPlumbing(zoneType);
  const mep = requiresMep(zoneType);

  return [
    { category: 'Lighting', items: [`${designStyle} ambient lighting layout for ${zoneType}.`, 'Feature lighting for focal wall, seating zone, or circulation path.', 'Warm LED and dimming provision subject to site wiring.'] },
    { category: 'Ceiling', items: [`${finishTier} ceiling treatment with clean junctions.`, 'Optional gypsum cove, recessed light detail, or access panel where site clearance allows.', 'Final paint and ceiling line to match approved concept.'] },
    { category: 'Walls & paint', items: ['Surface preparation, primer, crack filling, and final paint system.', `${designStyle} feature wall or texture treatment for main visual angle.`, 'Moisture-resistant treatment where site condition requires it.'] },
    { category: 'Flooring', items: [`${finishTier} flooring allowance for ${Math.max(1, Math.round(dimensions || 1))} sq ft.`, 'Skirting, threshold, and edge transition alignment.', 'Substrate repair subject to inspection.'] },
    { category: 'Furniture', items: ['Furniture layout based on circulation, access, and room function.', `${finishTier} furniture or built-in allowance based on approved scope.`, 'Final fabric, finish, and model approval before procurement.'] },
    { category: 'Curtains & soft furnishings', items: ['Curtains, blinds, rugs, cushions, or upholstery coordinated with the palette.', 'Privacy and daylight control considered in selection.', 'Site measurements required before ordering.'] },
    { category: 'Decor & accessories', items: ['Artwork, mirrors, planters, decorative pieces, or majlis accessories as relevant.', 'Accessory package aligned with lighting and furniture materials.', 'Owner approval required before final purchase.'] },
    { category: 'Electrical points', items: ['Switches, sockets, lighting controls, and cable routing review.', 'Concealed routing where practical and compliant.', 'Electrical load check required before any added circuit.'] },
    { category: 'MEP / HVAC', items: mep ? ['MEP coordination required for this zone type.', 'HVAC diffuser, access panel, drainage, waterproofing, and service clearance review.', 'Hidden MEP defects are excluded until inspection.'] : ['Light MEP review only.', 'Existing HVAC retained unless owner approves variation.', 'No major MEP relocation included without revised approval.'] },
    { category: 'Plumbing', items: plumbing ? ['Plumbing, drainage, waterproofing, and fixture location review included.', 'Waterproofing integrity to be verified before finishes.', 'Fixture brand and sanitaryware selections require owner approval.'] : ['No plumbing scope assumed.', 'Any discovered leak, drainage, or waterproofing issue requires separate approval.'] },
    { category: 'Smart controls', items: ['Optional smart lighting scene, motion sensor, or app control provision.', 'Compatibility with existing wiring must be verified.', 'Smart systems are optional unless selected in approved scope.'] },
    { category: 'Safety & compliance', items: ['Works must follow building management, landlord, and UAE safety rules.', 'Fire routes, emergency access, and electrical safety cannot be compromised.', 'Permits/NOCs are subject to authority or building process.'] },
    { category: 'Materials grade', items: [`Quote assumes ${finishTier} material grade.`, 'Final materials locked after sample approval and supplier confirmation.', 'Equivalent approved alternatives may be used if selected stock is unavailable.'] },
    { category: 'Site protection', items: ['Protect floors, walls, lifts, and access routes during execution.', 'Dust control and waste removal per building rules.', 'Working hours subject to property management approval.'] },
    { category: 'Timeline stages', items: ['Stage 1: approval, site verification, final scope lock.', 'Stage 2: 15% mobilization, procurement, scheduling.', 'Stage 3: execution, photo evidence, inspection, handover.'] },
    { category: 'Assumptions', items: [`Area assumption: ${Math.max(1, Math.round(dimensions || 1))} sq ft.`, `Objective: ${designObjective}.`, input.notes ? `Client note: ${text(input.notes).slice(0, 240)}` : 'No extra client note declared.', 'Final execution price depends on site verification and material selection.'] },
    { category: 'Exclusions', items: ['Hidden structural, waterproofing, pest, mold, electrical, or authority issues excluded until inspected.', 'Major layout changes and landlord/authority variation costs require separate approval.', 'No execution starts before approval, confirmed scope, and mobilization/payment.'] },
    { category: 'Payment / 15% mobilization', items: [`Estimated execution quote: AED ${money(quoteTotal)}.`, `15% mobilization: AED ${money(mobilizationAmount)}.`, 'Remaining payment path follows approved BIN GROUP owner/tenant workflow.'] },
  ];
}

export function buildConceptPrompt(input: {
  zoneType: string;
  designStyle: string;
  designObjective: string;
  notes?: string;
}): string {
  return `Generate a high-quality interior/property redesign rendering for a ${input.zoneType}.
Style: ${input.designStyle}.
Objective: ${input.designObjective}.
Preserve the original space geometry and upgrade lighting, ceiling, walls, flooring, furniture, decor, and visible finishes.
${input.notes ? `Additional requirements: ${input.notes}` : ''}`;
}

export function buildDesignConcepts(input: {
  zoneType: string;
  designStyle: string;
  designObjective: string;
  uploadedImageUrl?: string;
  notes?: string;
  finishTier?: string;
  quoteTotal?: number;
  mobilizationAmount?: number;
}): DesignConcept[] {
  const basePrompt = buildConceptPrompt(input);
  const beforeImage = input.uploadedImageUrl || '';
  const executionDetails = buildDesignExecutionDetails(input);
  const base = {
    beforeImageUrl: beforeImage,
    afterImageUrl: '',
    renderEngineRequired: true,
    renderStatus: DESIGN_CONCEPT_RENDER_STATUS.RENDER_PENDING,
    generationStatus: DESIGN_CONCEPT_RENDER_STATUS.RENDER_PENDING,
    productionNote: 'AI render pending. Scope is still saved for owner approval, quote, and execution handoff.',
    finishTier: input.finishTier || 'Premium',
    quoteTotal: Number(input.quoteTotal || 0),
    mobilizationAmount: Number(input.mobilizationAmount || 0),
    executionDetails,
  };

  return [
    { ...base, id: 'premium_functional', title: 'Premium Functional Concept', style: input.designStyle, prompt: `${basePrompt}. Focus on functionality and premium finishes.`, scopeSummary: 'Standard upgrades with durable, high-quality materials.' },
    { ...base, id: 'luxury_signature', title: 'Luxury Signature Concept', style: input.designStyle, prompt: `${basePrompt}. Focus on absolute luxury, bespoke elements, and signature lighting.`, scopeSummary: 'Bespoke design, premium lighting, high-end materials.' },
    { ...base, id: 'cost_controlled', title: 'Cost-Controlled Upgrade', style: input.designStyle, prompt: `${basePrompt}. Focus on impactful visual changes while retaining structural integrity to minimize cost.`, scopeSummary: 'Smart cosmetic upgrades, retain core structure, impactful finishes.' },
  ];
}

export function resolveDesignWorkflowView(request: any) {
  return {
    isDepositPending: request?.status === 'DEPOSIT_PENDING' || request?.quoteStatus === 'DEPOSIT_PENDING',
    isAwaitingApproval: request?.status === 'AWAITING_OWNER_APPROVAL' || request?.approvalStatus === 'PENDING_OWNER_APPROVAL',
    isApproved: request?.approvalStatus === 'OWNER_APPROVED',
    isRejected: request?.approvalStatus === 'OWNER_REJECTED',
    isPaid: request?.paymentStatus === 'PAID',
    isRenderPending: Array.isArray(request?.concepts) && request.concepts.some((concept: any) => concept?.renderEngineRequired === true && !concept?.afterImageUrl),
    isExecuting: ['SITE_SURVEY_PENDING', 'SITE_SURVEY_SCHEDULED', 'READY_FOR_EXECUTION', 'IN_EXECUTION'].includes(request?.status)
  };
}

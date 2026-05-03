/**
 * BIN-GROUP Enterprise SaaS — Canonical TypeScript Models
 * Layer 1: Foundation Types (RBAC + Core Entities)
 * Layer 3/4: Predictive & Financial Engine Fields included
 */

// ─── RBAC ────────────────────────────────────────────────────────────────────
export type UserRole = 'ADMIN' | 'OWNER' | 'TECHNICIAN' | 'TENANT';

export interface BinUser {
    uid: string;
    phoneNumber: string;
    role: UserRole;
    isSuspended: boolean;
    hasActiveContract: boolean;
    displayName?: string;
    email?: string;
    createdAt: string;
    lastLoginAt?: string;
}

// ─── SLA Tiers ───────────────────────────────────────────────────────────────
export type SlaTier = 'EMERGENCY' | 'URGENT' | 'NORMAL';

export const SLA_DEADLINES_HOURS: Record<SlaTier, number> = {
    EMERGENCY: 2,
    URGENT: 6,
    NORMAL: 24,
};

// ─── Assets (Layer 3: Predictive Inputs) ────────────────────────────────────
export interface Asset {
    id: string;
    propertyId: string;
    unitId?: string;
    assetType: 'AC' | 'Lift' | 'Pump' | 'Chiller' | 'Electrical' | 'Plumbing' | 'Other';
    brand?: string;
    model?: string;
    serialNumber?: string;
    qrCode?: string;

    // Layer 3 — Predictive Maintenance Fields
    installationDate: string;           // ISO date
    warrantyExpiry: string;             // ISO date
    repairFrequency: number;            // repair count per year
    cumulativeRepairCost: number;       // AED total lifetime repairs
    estimatedReplacementCost: number;   // AED
    lastServiceDate?: string;
    nextServiceDue?: string;
    healthScore?: number;               // 0–100, computed
}

// ─── Units ───────────────────────────────────────────────────────────────────
export interface Unit {
    id: string;
    propertyId: string;
    unitNumber: string;
    floor?: number;
    type: 'Apartment' | 'Office' | 'Retail' | 'Villa';
    bedrooms?: number;
    builtUpAreaSqft?: number;
    tenantId?: string;
    tenantPhone?: string;
    annualRentAED?: number;
    leaseStart?: string;
    leaseEnd?: string;
    status: 'Vacant' | 'Occupied' | 'Under Maintenance';
}

// ─── Properties (Layer 4: Financial Engine Fields) ──────────────────────────
export interface Property {
    id: string;
    ownerId: string;
    propertyName: string;
    zone: string;
    address?: string;
    numUnits: number;
    buildingAge: number;
    type: 'villa' | 'apartment' | 'building' | 'tower';
    status: 'unlocked' | 'pending' | 'suspended';

    // AMC Contract
    amcValue: number;                   // AED annual contract
    amcTier?: 'maintenance_only' | 'management_only' | 'comprehensive';
    contractStartDate?: string;
    contractEndDate?: string;

    // Layer 4 — Financial Engine Fields
    totalAnnualRent: number;            // sum of all unit rents
    complianceExpiries: {
        fireSystem?: string;            // ISO date
        lifts?: string;
        chiller?: string;
        civilDefense?: string;
    };
    assetHealthScore: number;           // 0–100, weighted average of all assets
    totalAssetsValue?: number;          // AED
    cumulativeRepairCostYTD?: number;   // AED year-to-date

    createdAt: string;
}

// ─── Work Orders (Layer 3 + Layer 4 Fields) ─────────────────────────────────
export interface WorkOrder {
    id: string;
    propertyId: string;
    unitId?: string;
    tenantId: string;
    technicianAssigned?: string;
    assetId?: string;

    title: string;
    description: string;
    category: 'Plumbing' | 'Electrical' | 'AC/HVAC' | 'Structural' | 'Lift' | 'General';
    priority: 'low' | 'medium' | 'high' | 'critical';
    status: 'open' | 'assigned' | 'in_progress' | 'resolved' | 'closed' | 'cancelled' | 'PENDING_OWNER_APPROVAL' | 'FRAUD_REVIEW';

    // Dynamic Approval Thresholds
    outOfScopeQuoteAED?: number;
    approvalRequired?: boolean;
    autoApproved?: boolean;
    approvalThreshold?: number;

    // Layer 3 — SLA & Fraud Audit Fields
    slaTier: SlaTier;
    slaDeadline: string;                // ISO timestamp
    slaBreached: boolean;
    sla_breached?: boolean;             // Sync alias for server logic

    // Operational Security & Review
    needsAdminReview?: boolean;
    flaggedForFraud?: boolean;
    reviewReason?: string;
    fraudDetection_v4?: {
        breachSeverity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
        detectedAt: string;
    };

    // Layer 3 — Resolution Metrics
    timeToResolution?: number;          // minutes from open to resolved
    preventedEmergencyCost?: number;    // AED: estimated cost if issue escalated
    technicianHoursLogged?: number;
    technicianRatePerHour?: number;     // AED
    materialsUsed?: MaterialItem[];
    totalJobCost?: number;              // labor + materials

    photoUrls?: string[];
    createdAt: string;
    assignedAt?: string;
    resolvedAt?: string;
    closedAt?: string;
}

export interface MaterialItem {
    name: string;
    quantity: number;
    unitCostAED: number;
    totalCostAED: number;
    supplier?: string;
}

// ─── Technicians ─────────────────────────────────────────────────────────────
export interface Technician {
    uid: string;
    displayName: string;
    phoneNumber: string;
    specialization: string[];
    ratePerHour: number;               // AED
    isAvailable: boolean;
    isApproved: boolean;
    currentLocation?: { lat: number; lng: number };

    // Layer 4 — Efficiency Metrics
    jobsCompletedTotal: number;
    jobsCompletedThisMonth: number;
    averageResolutionTimeMinutes: number;
    callbackRate: number;              // % of jobs requiring a callback within 7 days
    customerRating: number;            // 0–5
    revenueGeneratedAED: number;       // jobs billed to clients
    
    // SLA Performance Scoring
    reliability_score: number;         // default 100, decrements on breach
    speed_score: number;               // increments on high-speed emergency fixes
}

// ─── Contracts ───────────────────────────────────────────────────────────────
export interface AMCContract {
    id: string;
    ownerId: string;
    propertyId: string;
    tier: 'maintenance_only' | 'management_only' | 'comprehensive';
    annualValueAED: number;
    vatAED: number;
    totalPaidAED: number;
    paymentSchedule: 'Annual' | 'Quarterly';
    status: 'active' | 'suspended' | 'expired' | 'pending';
    startDate: string;
    endDate: string;
    autoRenew: boolean;
    createdAt: string;
}

// ─── Profitability (Layer 4 — Profit Engine) ─────────────────────────────────
export interface PropertyProfitability {
    propertyId: string;
    propertyName: string;
    ownerId: string;
    contractValueAED: number;           // revenue from AMC
    technicianLaborCostAED: number;     // hours × rate
    materialsCostAED: number;
    overheadCostAED?: number;
    netProfitAED: number;               // contract - labor - materials - overhead
    profitMarginPercent: number;
    periodStart: string;
    periodEnd: string;
}

export interface TechnicianEfficiency {
    technicianId: string;
    displayName: string;
    jobsPerDay: number;
    averageResolutionTimeMinutes: number;
    callbackRate: number;
    revenueGeneratedAED: number;
    laborCostAED: number;
    profitContributionAED: number;
}

// ─── Financial State Machine (Enterprise Escrow) ─────────────────────────────
export type PaymentStatus = 
    | 'INITIATED' 
    | 'VERIFIED' 
    | 'LOCKED_IN_ESCROW' 
    | 'DISTRIBUTED' 
    | 'SETTLED';

export interface PaymentRecord {
    id: string;
    amount: number;
    status: PaymentStatus;
    is_disputed: boolean;
    type: 'rent' | 'maintenance' | 'amc';
    method: 'manual' | 'stripe' | 'uaedds';
    propertyId: string;
    ownerId: string;
    tenantId?: string;
    ticketId?: string;
    receiptUrl?: string;
    approvedBy?: string;
    approvedAt?: string;
    escrowedAt?: string;
    distributedAt?: string;
    settledAt?: string;
    createdAt: string;
}

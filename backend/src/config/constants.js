const PRICING = {
  // Tier 1: Maintenance Plus (AMC) logic constants
  AMC_PACK: {
    RESIDENTIAL_FLOOR: 1200,
    OFFICE_FLOOR: 1800,
    OFFICE_MARKUP: 1.15,
    AGE_RATES: {
      "NEW (0-5)": 0.80, // AED per sqft
      "OLD (5+)": 1.30,
    }
  },
  // Tier 2: Smart Management (PM Only)
  SMART_MGMT: {
    PERCENT: 0.045,
    BULK_PERCENT: 0.035,
    BULK_THRESHOLD: 10,
    FLOOR: 4000,
  },
  // Tier 3: Executive Package
  EXECUTIVE_PACK: {
    RENT_PERCENT: 0.055,
    SURCHARGE: {
      "NEW (0-3)": 0.40,
      "MID (4-9)": 0.85,
      "OLD (10+)": 1.30
    }
  },
  LEASING: {
    COMMISSION_PERCENT: 0.05,
    ADMIN_FEE: 500,
    FITOUT_COORDINATION_PERCENT: 0.025,
  },
  PAY_PER_USE: {
    HANDYMAN_HOURLY: 130,
    AC_SERVICE_PER_UNIT: 150,
    EMERGENCY_CALL_OUT: 350,
  }
};

const RULES = {
  PARTS_MARKUP_RANGE: { MIN: 0.15, MAX: 0.20 },
  TWO_STRIKE_THRESHOLD: 2,
  BOUNCED_CHEQUE_PENALTY: 250,
  HEALTH_SCORE: {
    BASE: 100,
    OPEN_TICKET_PENALTY: 5,
    COMPLETED_PPM_BONUS: 10,
  },
  DISPATCH_GOVERNANCE: {
    TIERS: {
      ELITE: { minScore: 90, allowedPriorities: ["CRITICAL", "HIGH", "MEDIUM", "LOW"], disputeLimit: 0.05, workloadLimit: 0.8 },
      PRO: { minScore: 75, allowedPriorities: ["HIGH", "MEDIUM", "LOW"], disputeLimit: 0.15, workloadLimit: 0.9 },
      STANDARD: { minScore: 50, allowedPriorities: ["MEDIUM", "LOW"], disputeLimit: 0.25, workloadLimit: 1.0 },
      RISK: { minScore: 0, allowedPriorities: ["LOW"], disputeLimit: 1.0, workloadLimit: 0.5 },
    },
    AUTO_SUSPEND_DISPUTE_THRESHOLD: 0.30, 
    SLA_COMPLIANCE_BONUS: 0.10, // 10% boost for high compliance
    LOAD_PENALTY_FACTOR: 0.50, // 50% reduction in score if at 100% load
  },
  ROI_INTELLIGENCE: {
    RENEWAL_ROI_THRESHOLD: 1.5, // 150% ROI to trigger High ROI message
    MARKET_RATES: {
      AC: 1200,         // Avg AED for reactive AC fix in UAE
      PLUMBING: 750,    // Avg AED for reactive plumbing fix
      ELECTRICAL: 625,  // Avg AED for reactive electrical fix
      GENERAL: 450      // Avg AED for general reactive callout
    }
  },
  PREDICTIVE_MAINTENANCE: {
    FAILURE_PROBABILITY_THRESHOLD: 0.8,
    SAME_ISSUE_LIMIT_30_DAYS: 2,
    AGE_PENALTY_THRESHOLD_YEARS: 5,
    USAGE_STRESS_BASELINE: 1.5, // 1.5x monthly ticket count vs baseline
    PREVENTED_COST_FACTOR: 1.25  // Emergency repair would have cost 1.25x original
  },
  INCIDENT_SEVERITY: {
    CRITICAL: { responseMins: 120, resolutionMins: 240, label: "S0 - Emergency" },
    HIGH: { responseMins: 240, resolutionMins: 480, label: "S1 - High Priority" },
    MEDIUM: { responseMins: 1440, resolutionMins: 2880, label: "S2 - Standard" },
    LOW: { responseMins: 4320, resolutionMins: 8640, label: "S3 - Cosmetic" }
  }
};

const CRITICAL_CATEGORIES = new Set(["AC_FAILURE", "WATER_LEAK", "EMERGENCY_SOS"]);

module.exports = {
  PRICING,
  RULES,
  CRITICAL_CATEGORIES,
};


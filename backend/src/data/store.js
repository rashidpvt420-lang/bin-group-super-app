const { v4: uuidv4 } = require("uuid");

const db = {
  owners: [
    {
      ownerId: "OWNER_045",
      name: "Al-Mansoori Properties LLC",
      totalBuildings: 4,
      unpaidInvoiceCount: 0,
      suspensionStatus: "ACTIVE",
    },
  ],
  properties: [
    {
      propertyId: "PROP_045",
      ownerId: "OWNER_045",
      name: "Downtown Dubai Towers",
      completedPPM: 2,
    },
  ],
  units: [
    {
      unitId: "UNIT_402",
      propertyId: "PROP_045",
      ownerId: "OWNER_045",
      tenantId: "TENANT_001",
      unitType: "1-BED",
      moveOutPending: false,
      moveOutDate: null,
    },
    {
      unitId: "UNIT_101",
      propertyId: "PROP_045",
      ownerId: "OWNER_045",
      tenantId: "TENANT_002",
      unitType: "STUDIO",
      moveOutPending: false,
      moveOutDate: null,
    },
  ],
  tickets: [],
  turnoverQuotes: [
    {
      quoteId: "QT_001",
      propertyId: "PROP_045",
      unitId: "UNIT_402",
      unitType: "1-BED",
      status: "PENDING",
      paintingCost: 1200,
      deepCleaningCost: 450,
      totalQuote: 1650,
      discount: 55,
      finalPrice: 1595,
      expiryDate: new Date(Date.now() + 86400000 * 7).toISOString(),
      createdAt: new Date().toISOString(),
    },
    {
      quoteId: "QT_002",
      propertyId: "PROP_045",
      unitId: "UNIT_101",
      unitType: "STUDIO",
      status: "APPROVED",
      paintingCost: 800,
      deepCleaningCost: 350,
      totalQuote: 1150,
      discount: 0,
      finalPrice: 1150,
      expiryDate: new Date(Date.now() + 86400000 * 3).toISOString(),
      createdAt: new Date().toISOString(),
    }
  ],
  jobs: [
    {
      jobId: "JOB_001",
      ticketId: "TKT_BOOTSTRAP",
      technicianId: "TECH_042",
      status: "IN_PROGRESS",
      laborCost: 200,
      partsUsed: [],
    },
  ],
  invoices: [
    {
      invoiceId: "INV_001",
      ownerId: "OWNER_045",
      totalAmount: 380,
      status: "PENDING",
    },
  ],
  payments: [
    {
      paymentId: "PAY_001",
      ownerId: "OWNER_045",
      amount: 45000,
      paymentType: "RENT_COLLECTION",
      createdAt: new Date().toISOString(),
    },
  ],
  technicianCheckIns: [],
  liabilityWaivers: [],
  sensors: [
    { sensorId: "SENS_001", propertyId: "PROP_045", type: "AC_COMPRESSOR", status: "OK", lastReading: "42 PSI" },
    { sensorId: "SENS_002", propertyId: "PROP_045", type: "WATER_FLOW", status: "ANOMALY", lastReading: "Unusual spike detected in Tower A" },
  ],
  inventory: [
    { itemId: "PART_001", name: "AC Capacitor 45uF", stockQty: 8, reorderThreshold: 10, supplierEmail: "parts@hvac-uae.com" },
    { itemId: "PART_002", name: "Freon R-410A (kg)", stockQty: 50, reorderThreshold: 10, supplierEmail: "gas@cool-dubai.ae" },
  ],
  permits: [],
  users: [
    { 
      userId: "TECH_ELITE_001", 
      name: "Ahmed Hassan", 
      role: "TECHNICIAN", 
      tier: "ELITE", 
      specialties: ["HVAC", "CHULLER_SYSTEMS"],
      activeTicketsCount: 2, 
      maxCapacity: 5,
      disputeRate: 0.02, 
      avgSLACompliance: 0.98,
      emiratesId: "784-1992-1234567-1" 
    },
    { 
      userId: "TECH_PRO_002", 
      name: "Suresh Kumar", 
      role: "TECHNICIAN", 
      tier: "PRO", 
      specialties: ["PLUMBING", "ELECTRICAL"],
      activeTicketsCount: 4, 
      maxCapacity: 6,
      disputeRate: 0.08, 
      avgSLACompliance: 0.85,
      emiratesId: "784-1988-9876543-2" 
    },
    { 
      userId: "TECH_STD_003", 
      name: "John Doe", 
      role: "TECHNICIAN", 
      tier: "STANDARD", 
      specialties: ["GENERAL_MAINTENANCE"],
      activeTicketsCount: 1, 
      maxCapacity: 4,
      disputeRate: 0.15, 
      avgSLACompliance: 0.72,
      emiratesId: "784-1995-1122334-3" 
    },
    { 
      userId: "TECH_RISK_004", 
      name: "Zayn Malik", 
      role: "TECHNICIAN", 
      tier: "RISK", 
      specialties: ["PAINTING"],
      activeTicketsCount: 3, 
      maxCapacity: 5,
      disputeRate: 0.35, 
      avgSLACompliance: 0.45,
      emiratesId: "784-1990-5566778-4" 
    },
  ],
  propertyROI: [
    {
      propertyId: "PROP_045",
      ownerId: "OWNER_045",
      contractValue: 120000,
      totalTickets: 142,
      preventiveTickets: 110,
      reactiveTickets: 32,
      totalMaintenanceCost: 85400,
      estimatedReactiveCost: 168000,
      savings: 82600,
      avgResolutionTime: 4.2, // hours
      slaComplianceRate: 0.98,
      lastUpdated: Date.now()
    }
  ],
  predictedIssues: [
    {
      issueId: "PRED_001",
      propertyId: "PROP_045",
      unitId: "UNIT_402",
      assetType: "AC",
      probability: 0.82,
      estimatedFailureDate: Date.now() + (12 * 24 * 60 * 60 * 1000), // 12 days
      recommendedAction: "AUTO_PREVENTIVE_MAINTENANCE",
      preventedCost: 1500,
      status: "OPEN"
    },
    {
      issueId: "PRED_002",
      propertyId: "PROP_045",
      unitId: "UNIT_101",
      assetType: "PLUMBING",
      probability: 0.45,
      estimatedFailureDate: Date.now() + (25 * 24 * 60 * 60 * 1000), 
      recommendedAction: "INSPECT_VALVES",
      preventedCost: 800,
      status: "MONITORING"
    }
  ],
  auditLogs: [],
};


function nowISO() {
  return new Date().toISOString();
}

function addAudit(action, resourceId, details = {}) {
  db.auditLogs.push({
    logId: `LOG_${uuidv4().slice(0, 8)}`,
    action,
    resourceId,
    details,
    timestamp: nowISO(),
  });
}

module.exports = {
  db,
  nowISO,
  addAudit,
};

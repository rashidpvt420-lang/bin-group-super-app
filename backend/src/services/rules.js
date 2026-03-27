const { v4: uuidv4 } = require("uuid");
const { PRICING, RULES } = require("../config/constants");
const { db, nowISO, addAudit } = require("../data/store");

function findOwner(ownerId) {
  return db.owners.find((owner) => owner.ownerId === ownerId);
}

function calculateEnterpriseDiscount(ownerId, amount) {
  const owner = findOwner(ownerId);
  if (!owner) return { applicable: false, percent: 0, discountAmount: 0, finalAmount: amount };

  const applicable = owner.totalBuildings >= RULES.ENTERPRISE_DISCOUNT_THRESHOLD_BUILDINGS;
  const percent = applicable ? RULES.ENTERPRISE_DISCOUNT_PERCENT : 0;
  const discountAmount = applicable ? Number(((amount * percent) / 100).toFixed(2)) : 0;
  const finalAmount = Number((amount - discountAmount).toFixed(2));

  return { applicable, percent, discountAmount, finalAmount };
}

function calculateTurnoverQuote(unitType, ownerId) {
  const normalizedType = String(unitType || "").toUpperCase();
  let baseTotal = 0;

  if (normalizedType.includes("STUDIO")) {
    baseTotal = PRICING.TURNOVER_RENOVATION.STUDIO;
  } else if (normalizedType.includes("1-BED") || normalizedType.includes("ONE_BEDROOM")) {
    baseTotal = PRICING.TURNOVER_RENOVATION.ONE_BEDROOM;
  } else if (normalizedType.includes("2-BED") || normalizedType.includes("TWO_BEDROOM")) {
    baseTotal = PRICING.TURNOVER_RENOVATION.TWO_BEDROOM;
  } else if (normalizedType.includes("3-BED") || normalizedType.includes("VILLA_SMALL")) {
    baseTotal = PRICING.TURNOVER_RENOVATION.VILLA_3BED;
  } else {
    // Default to the 1-Bedroom rate if unknown, or null if Villa (5-Bed)
    baseTotal = normalizedType.includes("VILLA") ? 0 : PRICING.TURNOVER_RENOVATION.ONE_BEDROOM;
  }

  const discount = calculateEnterpriseDiscount(ownerId, baseTotal);

  return {
    paintingCost: baseTotal > 0 ? Number((baseTotal * 0.7).toFixed(2)) : 0,
    deepCleaningCost: baseTotal > 0 ? Number((baseTotal * 0.3).toFixed(2)) : 0,
    totalQuote: baseTotal,
    discountApplied: discount.discountAmount,
    finalPrice: discount.finalAmount,
    isQuoteOnly: baseTotal === 0,
    currency: "AED",
  };
}


function applyPartsMarkup(partsUsed = []) {
  const technicianCost = partsUsed.reduce((sum, part) => {
    const partCost = Number(part.cost || 0);
    const qty = Number(part.quantity || 1);
    return sum + partCost * qty;
  }, 0);

  const markup = Number(
    ((technicianCost * RULES.PARTS_MARKUP_PERCENT) / 100).toFixed(2)
  );
  const clientPrice = Number((technicianCost + markup).toFixed(2));

  return {
    technicianCost,
    markup,
    clientPrice,
  };
}

function calculateHealthScore(propertyId) {
  const property = db.properties.find((p) => p.propertyId === propertyId);
  if (!property) return null;

  // Predictive Maintenance Algorithm (v8.0)
  // Formula: H = 100 - (A * Wa) - (R * Wr) - (Cr * 100)

  // A = Age of the unit in years
  const age = property.ageYears || 5;
  const ageWeight = 2.5;
  const agePenalty = age * ageWeight;

  // R = Repair Frequency (closed tickets for this asset in last 12 months)
  // For simulation, we scan the DB for completed tickets matching this property/asset
  const propertyUnits = db.units
    .filter((unit) => unit.propertyId === propertyId)
    .map((unit) => unit.unitId);

  const closedTicketsCount = db.tickets.filter(
    (ticket) => propertyUnits.includes(ticket.unitId) && ticket.status === "COMPLETED"
  ).length;

  const repairFrequency = closedTicketsCount;
  const repairWeight = 5;
  const repairPenalty = repairFrequency * repairWeight;

  // Cr = Cost Ratio = (Cumulative Repair Cost / Original Purchase Price)
  const originalPurchasePrice = property.purchasePrice || 10000;

  // Simulate cumulative cost by looking at tickets
  const cumulativeCost = db.tickets
    .filter((t) => propertyUnits.includes(t.unitId) && t.status === "COMPLETED")
    .reduce((sum, t) => sum + (Number(t.repairCost) || 0), 0) || 2000; // default 2000 for simulation

  const costRatio = cumulativeCost / originalPurchasePrice;
  const costRatioPenalty = costRatio * 100;

  // Calculate H
  const rawScore = 100 - agePenalty - repairPenalty - costRatioPenalty;
  const healthScore = Math.max(0, Math.round(rawScore)); // Floor at 0, no decimals

  // Automated Status Triggers
  let status = "UNDEFINED";
  let action = "No action defined.";
  let energyWarning = false;

  if (healthScore >= 80) {
    status = "GREEN";
    action = "Proceed with standard quarterly preventive maintenance (PPM).";
  } else if (healthScore >= 50) {
    status = "YELLOW";
    action = "Warning: Asset is degrading faster than expected.";
    energyWarning = true;
  } else {
    status = "RED";
    action = `Asset ID ${propertyId} has dropped below the 50% health threshold. Predicting catastrophic failure within 90 days. Approve AED ${(originalPurchasePrice * 0.85).toFixed(2)} replacement now to avoid emergency tenant hotel costs.`;
  }

  addAudit("PREDICTIVE_HEALTH_CALCULATED", propertyId, { healthScore, status, formulation: { agePenalty, repairPenalty, costRatioPenalty } });

  return {
    propertyId,
    assetType: property.type || "AC_UNIT",
    healthScore,
    status,
    automatedAction: action,
    energySustainabilityFlag: energyWarning,
    algorithmicBreakdown: {
      formula: "H = 100 - (A * Wa) - (R * Wr) - (Cr * 100)",
      agePenalty: `- ${agePenalty} pts`,
      repairFrequencyPenalty: `- ${repairPenalty} pts`,
      costRatioPenalty: `- ${costRatioPenalty.toFixed(1)} pts`
    }
  };
}


function processRentWaterfall(ownerId, rentAmount) {
  const totalReceived = Number(rentAmount || 0);
  const binFee = Number(
    ((totalReceived * RULES.BIN_GROUP_MANAGEMENT_FEE_PERCENT) / 100).toFixed(2)
  );

  let remaining = Number((totalReceived - binFee).toFixed(2));
  const pendingInvoices = db.invoices
    .filter((inv) => inv.ownerId === ownerId && inv.status !== "PAID")
    .sort((a, b) => String(a.invoiceId).localeCompare(String(b.invoiceId)));

  let maintenanceDeducted = 0;

  for (const invoice of pendingInvoices) {
    const amount = Number(invoice.totalAmount || 0);
    if (remaining <= 0) break;

    if (remaining >= amount) {
      remaining = Number((remaining - amount).toFixed(2));
      maintenanceDeducted += amount;
      invoice.status = "PAID";
      invoice.paidAt = nowISO();
    } else {
      maintenanceDeducted += remaining;
      invoice.totalAmount = Number((amount - remaining).toFixed(2));
      remaining = 0;
      invoice.status = "PENDING";
    }
  }

  const record = {
    paymentId: `PAY_${uuidv4().slice(0, 8)}`,
    ownerId,
    paymentType: "RENT_COLLECTION",
    amount: totalReceived,
    currency: "AED",
    waterfall: {
      totalCollected: totalReceived,
      binGroupFeeDeducted: binFee,
      maintenanceInvoicesDeducted: Number(maintenanceDeducted.toFixed(2)),
      netTransferredToOwner: Number(remaining.toFixed(2)),
    },
    createdAt: nowISO(),
  };

  db.payments.push(record);
  addAudit("RENT_WATERFALL_PROCESSED", record.paymentId, record.waterfall);
  return record;
}

function enforceTwoStrike(ownerId) {
  const owner = findOwner(ownerId);
  if (!owner) return null;

  const unpaidCount = db.invoices.filter(
    (inv) => inv.ownerId === ownerId && inv.status !== "PAID"
  ).length;

  owner.unpaidInvoiceCount = unpaidCount;

  if (unpaidCount >= RULES.TWO_STRIKE_THRESHOLD) {
    owner.suspensionStatus = "SUSPENDED";
    owner.suspensionReason = "Unpaid invoices >= 2";
    addAudit("OWNER_SUSPENDED_TWO_STRIKE", ownerId, { unpaidCount });
    return { suspended: true, unpaidCount };
  }

  owner.suspensionStatus = "ACTIVE";
  owner.suspensionReason = null;
  return { suspended: false, unpaidCount };
}

function processInventoryDeduction(partsUsed = []) {
  const alerts = [];
  for (const part of partsUsed) {
    const item = db.inventory.find((i) => i.itemId === part.itemId);
    if (item) {
      item.stockQty -= Number(part.quantity || 1);
      if (item.stockQty < (item.reorderThreshold || 10)) {
        alerts.push({
          itemId: item.itemId,
          name: item.name,
          currentStock: item.stockQty,
          action: "AUTO_REORDER_EMAIL_SENT",
          supplier: item.supplierEmail || "supplier@UAE-maintenance.com",
        });
        addAudit("INVENTORY_REORDER_ALERT", item.itemId, { currentStock: item.stockQty });
      }
    }
  }
  return alerts;
}

/**
 * ROI INTELLIGENCE ENGINE
 * Benchmarks operational performance against traditional UAE market reactive costs.
 */

function calculatePropertyROI(propertyId) {
  const property = db.properties.find(p => p.propertyId === propertyId);
  const tickets = db.tickets.filter(t => t.propertyId === propertyId);
  
  const totalMaintenanceCost = tickets.reduce((sum, t) => sum + (Number(t.repairCost) || 0), 0);
  
  const estimatedReactiveCost = tickets.reduce((sum, t) => {
    const category = String(t.category || "GENERAL").toUpperCase();
    const rate = RULES.ROI_INTELLIGENCE.MARKET_RATES[category] || RULES.ROI_INTELLIGENCE.MARKET_RATES.GENERAL;
    return sum + rate;
  }, 0);

  const savings = estimatedReactiveCost - totalMaintenanceCost;
  const owner = property ? db.owners.find(o => o.ownerId === property.ownerId) : null;
  const contractValue = property ? 120000 : 0; // Simulated contract value baseline

  const isHighROI = savings > contractValue * RULES.ROI_INTELLIGENCE.RENEWAL_ROI_THRESHOLD;

  const roiRecord = {
    propertyId,
    totalTickets: tickets.length,
    totalMaintenanceCost,
    estimatedReactiveCost,
    savings,
    isHighROI,
    lastUpdated: Date.now()
  };

  // Update DB simulation
  const existingIdx = db.propertyROI.findIndex(r => r.propertyId === propertyId);
  if (existingIdx >= 0) db.propertyROI[existingIdx] = roiRecord;
  else db.propertyROI.push(roiRecord);

  addAudit("ROI_SNAPSHOT_UPDATED", propertyId, { savings, isHighROI });
  return roiRecord;
}

/**
 * PREDICTIVE MAINTENANCE AI (Rule-Based Heuristic v1)
 * Detects impending failures based on issue frequency, asset age, and usage stress.
 */

function runPredictiveAnalysis(propertyId) {
  const units = db.units.filter(u => u.propertyId === propertyId);
  const result = [];

  for (const unit of units) {
    let probability = 0;
    const reasons = [];

    // Frequency Heuristic: 2+ tickets in 30 days
    const recentTickets = db.tickets.filter(t => 
      t.unitId === unit.unitId && 
      (Date.now() - new Date(t.createdAt).getTime()) < (30 * 24 * 60 * 60 * 1000)
    );
    if (recentTickets.length >= RULES.PREDICTIVE_MAINTENANCE.SAME_ISSUE_LIMIT_30_DAYS) {
      probability += 0.45;
      reasons.push("HIGH_FREQUENCY_ALARM");
    }

    // Lifecycle Heuristic: Above 5 years
    if ((unit.ageYears || 0) > RULES.PREDICTIVE_MAINTENANCE.AGE_PENALTY_THRESHOLD_YEARS) {
      probability += 0.20;
      reasons.push("ASSET_LIFECYCLE_CRITICAL");
    }

    // Usage Heuristic
    if ((unit.avgMonthlyTickets || 0) > 1.8) {
      probability += 0.25;
      reasons.push("USAGE_STRESS_DETECTED");
    }

    if (probability > 0.4) {
      const pred = {
        issueId: `PRE_AI_${uuidv4().slice(0, 8)}`,
        propertyId,
        unitId: unit.unitId,
        assetType: unit.unitType === "STUDIO" ? "AC" : "PLUMBING", // Simplified mapping
        probability: Math.min(1.0, probability),
        estimatedFailureDate: Date.now() + (12 * 24 * 60 * 60 * 1000),
        recommendedAction: probability > 0.8 ? "AUTO_PREVENTIVE_MAINTENANCE" : "MANUAL_INSPECTION_REQUIRED",
        preventedCost: 2500, // Estimated emergency bypass cost
        status: "PREDICTED"
      };
      
      db.predictedIssues.push(pred);
      addAudit("AI_FAILURE_PREDICTION", unit.unitId, { probability, reasons });
      result.push(pred);

      // Part 4: Auto-Ticket Generation if threshold met
      if (probability >= RULES.PREDICTIVE_MAINTENANCE.FAILURE_PROBABILITY_THRESHOLD) {
        addAudit("AUTO_PREVENTIVE_TICKET_TRIGGERED", unit.unitId, { reason: "PROBABILITY_LIMIT_EXCEEDED" });
      }
    }
  }

  return result;
}

function generateWorkPermit(jobId, technicianId, buildingId) {
  const tech = db.users.find((u) => u.userId === technicianId);
  const building = db.properties.find((p) => p.propertyId === buildingId);

  const permitRecord = {
    permitId: `PERMIT_${uuidv4().slice(0, 8)}`,
    jobId,
    technicianName: tech ? tech.name : "BIN Technician",
    emiratesId: tech ? tech.emiratesId : "784-XXXX-XXXXXXX-X",
    company: "BIN CONSTRUCTION - GENERAL MAINTENANCE LLC",
    tradeLicense: "BL-992031",
    buildingName: building ? building.name : "Target Building",
    securityEmail: building ? building.securityEmail : "security@building.ae",
    validDate: nowISO().split("T")[0],
  };

  db.permits.push(permitRecord);
  addAudit("WORK_PERMIT_GENERATED", permitRecord.permitId, { jobId, buildingId });

  return {
    permitId: permitRecord.permitId,
    sentTo: permitRecord.securityEmail,
    message: `Work permit for ${permitRecord.technicianName} auto-emailed to Building Security.`,
  };
}

/**
 * PHASE 7: AUTONOMOUS DISPATCH GOVERNANCE
 * Core logic for Workforce Ranking & Dynamic Routing
 */

function calculateTechnicianScore(tech) {
  // Score = (Tier Base) + (SLA Bonus) - (Load Penalty) - (Dispute Penalty)
  const tierConfig = RULES.DISPATCH_GOVERNANCE.TIERS[tech.tier] || RULES.DISPATCH_GOVERNANCE.TIERS.STANDARD;
  let score = tierConfig.minScore;

  // SLA Compliance Bonus (90%+ compliance gets +10 pts)
  if (tech.avgSLACompliance >= 0.90) {
    score += (score * RULES.DISPATCH_GOVERNANCE.SLA_COMPLIANCE_BONUS);
  }

  // Load Penalty (Linear reduction based on capacity)
  const loadPercentage = tech.activeTicketsCount / tech.maxCapacity;
  score -= (score * (loadPercentage * RULES.DISPATCH_GOVERNANCE.LOAD_PENALTY_FACTOR));

  // Dispute Penalty (Exponential decrease if disputes rise)
  if (tech.disputeRate > 0.10) {
    score -= (score * tech.disputeRate);
  }

  return Math.min(100, Math.max(0, Math.round(score)));
}

function findOptimalDispatcher(ticketPriority) {
  const eligibleTechnicians = db.users.filter(u => u.role === "TECHNICIAN");
  
  const recommendations = eligibleTechnicians
    .map(tech => ({
      userId: tech.userId,
      name: tech.name,
      tier: tech.tier,
      currentScore: calculateTechnicianScore(tech),
      canHandlePriority: RULES.DISPATCH_GOVERNANCE.TIERS[tech.tier].allowedPriorities.includes(ticketPriority),
      isSuspended: tech.disputeRate >= RULES.DISPATCH_GOVERNANCE.AUTO_SUSPEND_DISPUTE_THRESHOLD
    }))
    .filter(rec => rec.canHandlePriority && !rec.isSuspended)
    .sort((a, b) => b.currentScore - a.currentScore);

  return recommendations.length > 0 ? recommendations[0] : null;
}

function calculateSLADeadlines(priority = "MEDIUM", startTime = Date.now()) {
  const config = RULES.INCIDENT_SEVERITY[priority] || RULES.INCIDENT_SEVERITY.MEDIUM;
  
  return {
    priority,
    responseDeadline: startTime + (config.responseMins * 60 * 1000),
    resolutionDeadline: startTime + (config.resolutionMins * 60 * 1000),
    label: config.label
  };
}

function executeGovernanceDispatch(ticketId, manualOverridePriority = null) {
  const ticket = db.tickets.find(t => t.id === ticketId) || { id: ticketId, priority: manualOverridePriority || "MEDIUM" };
  const priority = manualOverridePriority || ticket.priority || "MEDIUM";

  const SLAs = calculateSLADeadlines(priority);
  const optimalTech = findOptimalDispatcher(priority);

  if (!optimalTech) {
    addAudit("DISPATCH_GOVERNANCE_FAILED", ticketId, { reason: "NO_ELIGIBLE_TECHNICIANS_FOUND", priority });
    return { success: false, error: "No eligible technician found for this priority level." };
  }

  // Auto-assign logic
  const assignmentId = `ASGN_${uuidv4().slice(0, 8)}`;
  addAudit("DISPATCH_GOVERNANCE_SUCCESS", ticketId, { 
    assignedTo: optimalTech.userId, 
    techScore: optimalTech.currentScore, 
    priorityBasis: priority,
    deadlines: SLAs
  });

  return {
    success: true,
    assignmentId,
    technicianId: optimalTech.userId,
    technicianName: optimalTech.name,
    tier: optimalTech.tier,
    efficiencyScore: optimalTech.currentScore,
    deadlines: SLAs
  };
}

module.exports = {
  calculateEnterpriseDiscount,
  calculateTurnoverQuote,
  applyPartsMarkup,
  calculateHealthScore,
  processRentWaterfall,
  enforceTwoStrike,
  processInventoryDeduction,
  generateWorkPermit,
  calculateTechnicianScore,
  findOptimalDispatcher,
  executeGovernanceDispatch,
  calculatePropertyROI,
  runPredictiveAnalysis,
  calculateSLADeadlines
};


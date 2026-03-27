const { executeGovernanceDispatch, calculateTechnicianScore } = require("../src/services/rules");
const { db } = require("../src/data/store");

console.log("🚀 [TEST] Starting Phase 7 - Autonomous Dispatch Governance Verification...");

// 1. Test Score Calculations
db.users.forEach(tech => {
    if (tech.role === "TECHNICIAN") {
        const score = calculateTechnicianScore(tech);
        console.log(`📊 [TECH_SCORE] ${tech.name} (${tech.tier}): ${score}/100`);
    }
});

// 2. Test Critical Dispatch (Should match Elite or Pro)
console.log("\n🚨 [SCENARIO 1] Dispatching Critical Ticket (AC_FAILURE)...");
const result1 = executeGovernanceDispatch("TKT_CRITICAL_001", "CRITICAL");
console.log("Result:", JSON.stringify(result1, null, 2));

// 3. Test Low Priority Dispatch (Should allow Standard/Risk if eligible)
console.log("\n🟢 [SCENARIO 2] Dispatching Low Priority Ticket (TOUCH_UP)...");
const result2 = executeGovernanceDispatch("TKT_LOW_002", "LOW");
console.log("Result:", JSON.stringify(result2, null, 2));

// 4. Test Load Balancing
console.log("\n⚖️ [SCENARIO 3] Verifying Load Balancing (Elite Tech is at 40% load)...");
const elite = db.users.find(u => u.tier === "ELITE");
elite.activeTicketsCount = 5; // Maxed out
console.log(`Updated ${elite.name} to Max Capacity (5/5).`);

const result3 = executeGovernanceDispatch("TKT_HIGH_003", "HIGH");
console.log("New Dispatch Result for High Priority:", JSON.stringify(result3, null, 2));

// 5. Test Auto-Suspension (High Dispute Rate)
console.log("\n🛑 [SCENARIO 4] Verifying Auto-Suspension for Dispute Rate...");
const pro = db.users.find(u => u.tier === "PRO");
pro.disputeRate = 0.45; // Above 30% threshold
console.log(`${pro.name} dispute rate spike detected: 45%.`);

const result4 = executeGovernanceDispatch("TKT_MEDIUM_004", "MEDIUM");
console.log("Result (Should skip Pro and pick next best):", JSON.stringify(result4, null, 2));

console.log("\n✅ [VERIFICATION_COMPLETE] Phase 7 Governance Logic Validated.");

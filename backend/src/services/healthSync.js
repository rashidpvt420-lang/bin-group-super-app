const { calculateHealthScore } = require("./rules");
const { db } = require("../data/store");

/**
 * Generates the weekly "Building Health Sync" report for Owners.
 * Scheduled for Sunday 9:00 PM.
 */
async function generateWeeklyHealthReport(ownerId) {
    const properties = db.properties.filter((p) => p.ownerId === ownerId);
    const report = {
        ownerId,
        timestamp: new Date().toISOString(),
        properties: [],
    };

    for (const prop of properties) {
        const healthData = calculateHealthScore(prop.propertyId);

        // Predictive AI Recommendations (Simulated)
        const recommendations = [];
        if (healthData.healthScore < 85) {
            recommendations.push({
                task: "Proactive AC Service - Tower A",
                reason: "Detected performance drop via IoT sensors",
                estCost: 1200,
                roi: "Prevents compressor failure (+AED 4,500 saving)"
            });
        }

        report.properties.push({
            propertyName: prop.name,
            healthScore: healthData.healthScore,
            status: healthData.status,
            recommendations,
            financialSummary: {
                rentCollectedThisWeek: 12500,
                maintenanceSpend: 450,
            }
        });
    }

    console.log(`[HealthSync] Generated report for ${ownerId}. Sending PDF email...`);
    return report;
}

module.exports = { generateWeeklyHealthReport };

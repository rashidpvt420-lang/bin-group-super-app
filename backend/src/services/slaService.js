const { db } = require('../config/firebase');
const GovernanceService = require('./governanceService');

/**
 * 🚦 SLA & Operational Performance Engine (Missing Gap 2)
 * Compliance Layer: P1–P4 Response Time Enforcement.
 * Features: Breach detection, escalation triggers, and owner alerts.
 */
class SLAService {
    /**
     * Define the Institutional SLA Rules (UAE Market Standard)
     * P1: Emergency, P2: Critical, P3: Routine, P4: Planned
     */
    getSLARules(priority) {
        const rules = {
            'P1': { 
                label: 'Emergency', 
                responseMs: 15 * 60 * 1000, 
                resolutionMs: 2 * 60 * 60 * 1000 
            },
            'P2': { 
                label: 'Critical', 
                responseMs: 2 * 60 * 60 * 1000, 
                resolutionMs: 24 * 60 * 60 * 1000 
            },
            'P3': { 
                label: 'Routine', 
                responseMs: 24 * 60 * 60 * 1000, 
                resolutionMs: 72 * 60 * 60 * 1000 
            },
            'P4': { 
                label: 'Planned', 
                responseMs: 72 * 60 * 60 * 1000, 
                resolutionMs: 7 * 24 * 60 * 60 * 1000 
            }
        };
        return rules[priority] || rules['P3'];
    }

    /**
     * Track a Ticket Creation (SLA Dual-Timer Start)
     */
    async trackTicketCreation(ticketId, priority, actor) {
        const startTime = Date.now();
        const rule = this.getSLARules(priority);
        
        const slaRecord = {
            ticketId,
            priority,
            startTime,
            responseDeadline: startTime + rule.responseMs,
            resolutionDeadline: startTime + rule.resolutionMs,
            status: 'HEALTHY',
            isResponseBreached: false,
            isResolutionBreached: false,
            breachLevel: 0,
            lastEscalatedAt: null
        };

        await db.collection('sla_tracking').doc(ticketId).set(slaRecord);

        // 🛡️ Log Governance: Dual-Chain SLA Init
        await GovernanceService.logInstitutionalAction({
            actorId: 'SLA_SERVICE_BOT',
            actorRole: 'SYSTEM_BOT',
            actionType: 'SLA_DUAL_CHAIN_START',
            entityType: 'TICKET',
            entityId: ticketId,
            payload: { 
                p: priority, 
                res_d: new Date(slaRecord.responseDeadline).toISOString(),
                resol_d: new Date(slaRecord.resolutionDeadline).toISOString()
            }
        });

        return slaRecord;
    }

    /**
     * Check for SLA Breaches (Dual-Chain Monitor)
     */
    async checkBreach(ticketId) {
        const slaRef = db.collection('sla_tracking').doc(ticketId);
        const snap = await slaRef.get();
        if (!snap.exists) return null;

        const sla = snap.data();
        const now = Date.now();
        const updates = {};
        
        // 1. Check Response Breach
        if (now > sla.responseDeadline && !sla.isResponseBreached && sla.status !== 'ASSIGNED') {
            updates.isResponseBreached = true;
            updates.status = 'BREACHED';
            updates.breachLevel = (sla.breachLevel || 0) + 1;
            updates.lastEscalatedAt = now;
            await this.triggerEscalation(ticketId, 'RESPONSE_BREACH', updates.breachLevel);
        }

        // 2. Check Resolution Breach
        if (now > sla.resolutionDeadline && !sla.isResolutionBreached) {
            updates.isResolutionBreached = true;
            updates.status = 'BREACHED_CRITICAL';
            updates.breachLevel = (sla.breachLevel || 0) + 2; // Critical jump
            updates.lastEscalatedAt = now;
            await this.triggerEscalation(ticketId, 'RESOLUTION_BREACH', updates.breachLevel);
        }

        if (Object.keys(updates).length > 0) {
            await slaRef.update(updates);
            return { breached: true, updates };
        }

        return { breached: false };
    }

    /**
     * Triggers multi-level notifications (Owner -> Asset Manager -> Board)
     */
    async triggerEscalation(ticketId, type, level) {
        console.warn(`🚨 [SLA ${type}] Ticket ${ticketId} reached Level ${level}.`);
        
        // 🛡️ Log to Governance: Performance Failure
        await GovernanceService.logInstitutionalAction({
            actorId: 'SLA_SERVICE_BOT',
            actorRole: 'SYSTEM_BOT',
            actionType: `SLA_${type}_LEVEL_${level}`,
            entityType: 'TICKET',
            entityId: ticketId,
            payload: { severity: 'CRITICAL', escalationLevel: level }
        });
        
        // Notification logic would go here (FCM / Email / Dashboard)
    }

    async getComplianceRate() {
        const snap = await db.collection('sla_tracking').get();
        const total = snap.size;
        if (total === 0) return 100;

        const breached = snap.docs.filter(d => d.data().isResponseBreached || d.data().isResolutionBreached).length;
        return ((total - breached) / total) * 100;
    }
}

module.exports = new SLAService();

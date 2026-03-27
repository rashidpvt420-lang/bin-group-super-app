/**
 * Multi-Level Approval Workflow Engine (2026 Strategy)
 * Essential for institutional REITs, Private Developers, and Government Facilities.
 * Prevents unauthorized financial variations and ensures fiduciary control.
 */
class MultiLevelApprovalWorkflow {
    
    constructor() {
        this.rules = [
            { id: 'AUTO_APPROVE', max: 10000, level: 'AUTO', role: 'SYSTEM' },
            { id: 'ASSET_MANAGER', max: 50000, level: 'TIER_1', role: 'ASSET_MANAGER' },
            { id: 'FINANCIAL_CONTROLLER', max: 250000, level: 'TIER_2', role: 'FINANCE_CONTROLLER' },
            { id: 'CEO_BOARD', max: Infinity, level: 'TIER_3', role: 'BOARD_DIRECTOR' }
        ];
    }

    /**
     * Determine the required approval routing for a given figure
     */
    determineApprovalChain(amount) {
        const chain = [];
        this.rules.forEach(rule => {
            if (amount > rule.max && rule.max !== Infinity) {
                chain.push({
                    level: rule.level,
                    role: rule.role,
                    status: 'PENDING',
                    actor: null
                });
            } else if (amount <= rule.max) {
                // This is our terminal approval layer
                chain.push({
                    level: rule.level,
                    role: rule.role,
                    status: amount <= 10000 ? 'APPROVED' : 'PENDING',
                    actor: amount <= 10000 ? 'SYSTEM_BOT' : null
                });
                return chain;
            }
        });

        // If it reaches the end, we need the last rule (Infinity)
        if (chain.length === 0 || chain[chain.length - 1].max !== Infinity) {
            const lastRule = this.rules[this.rules.length - 1];
            if (amount > 250000) {
                 chain.push({
                    level: lastRule.level,
                    role: lastRule.role,
                    status: 'PENDING',
                    actor: null
                 });
            }
        }
        
        return chain;
    }

    /**
     * Evaluates a variation order or contract add-on against the current budget
     */
    evaluateFinancialVariation(orderId, currentSpend, budgetCap, amount) {
        const isOverBudget = (currentSpend + amount) > budgetCap;
        const baseChain = this.determineApprovalChain(amount);

        // If it's over budget, we force an extra Finance TIER enrichment regardless of amount
        if (isOverBudget) {
            const hasFinance = baseChain.find(c => c.role === 'FINANCE_CONTROLLER');
            if (!hasFinance) {
                baseChain.push({
                    level: 'OVER_BUDGET_EXCEPTION',
                    role: 'FINANCE_CONTROLLER',
                    status: 'PENDING',
                    actor: null
                });
            }
        }

        return {
            orderId,
            routing: baseChain,
            status: amount <= 10000 && !isOverBudget ? 'APPROVED' : 'LOCKED_WAITING_APPROVAL',
            requiresComplianceCheck: amount > 50000
        };
    }
}

module.exports = new MultiLevelApprovalWorkflow();

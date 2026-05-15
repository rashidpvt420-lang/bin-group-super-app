// src/utils/ticketConstants.ts

/**
 * Technician Active Statuses - Lowercase (Legacy/Internal)
 */
export const TECHNICIAN_ACTIVE_STATUSES_LOWER = [
    'accepted',
    'on_the_way',
    'arrived',
    'in_progress',
    'waiting_parts',
    'escalated'
];

/**
 * Technician Active Statuses - Uppercase (Standard/External)
 */
export const TECHNICIAN_ACTIVE_STATUSES_UPPER = [
    'ASSIGNED',
    'EN_ROUTE',
    'ARRIVED',
    'IN_PROGRESS',
    'WAITING_PARTS'
];

/**
 * Combined list for cross-compatibility queries
 */
export const ALL_TECHNICIAN_ACTIVE_STATUSES = [
    ...TECHNICIAN_ACTIVE_STATUSES_LOWER,
    ...TECHNICIAN_ACTIVE_STATUSES_UPPER
];

/**
 * Audit Log Actions
 */
export const TICKET_AUDIT_ACTIONS = {
    STATUS_UPDATE: 'TECHNICIAN_STATUS_UPDATE',
    DUTY_CHANGE: 'TECHNICIAN_DUTY_CHANGE',
    JOB_ACCEPTED: 'JOB_ACCEPTED_FROM_POOL'
};

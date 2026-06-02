// src/utils/ticketConstants.ts

/**
 * Ticket statuses should be written in uppercase for new production records.
 * Lowercase values remain here only for legacy compatibility queries.
 */
export const TICKET_STATUS = {
    OPEN: 'OPEN',
    PENDING_ASSIGNMENT: 'PENDING_ASSIGNMENT',
    ASSIGNED: 'ASSIGNED',
    AUTO_ASSIGNED: 'AUTO_ASSIGNED',
    ACCEPTED: 'ACCEPTED',
    EN_ROUTE: 'EN_ROUTE',
    ARRIVED: 'ARRIVED',
    IN_PROGRESS: 'IN_PROGRESS',
    WAITING_PARTS: 'WAITING_PARTS',
    ESCALATED: 'ESCALATED',
    COMPLETED: 'COMPLETED',
    CLOSED: 'CLOSED'
} as const;

/**
 * Technician Active Statuses - Lowercase (Legacy/Internal)
 */
export const TECHNICIAN_ACTIVE_STATUSES_LOWER = [
    'accepted',
    'auto_assigned',
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
    TICKET_STATUS.ASSIGNED,
    TICKET_STATUS.AUTO_ASSIGNED,
    TICKET_STATUS.ACCEPTED,
    TICKET_STATUS.EN_ROUTE,
    TICKET_STATUS.ARRIVED,
    TICKET_STATUS.IN_PROGRESS,
    TICKET_STATUS.WAITING_PARTS,
    TICKET_STATUS.ESCALATED
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
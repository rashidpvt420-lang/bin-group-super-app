// New-hire default schedule (Rashid, 9 Nov 2026): 8 AM - 5 PM with a 1 hour unpaid break = 8 working hours.
// Mirrors functions/hrPayConfig.ts (DEFAULT_WORKING_HOURS / DEFAULT_SHIFT_START / DEFAULT_SHIFT_END);
// test/nov9-default-working-hours.test.mjs keeps the two in step.
export const DEFAULT_SHIFT_START = '08:00';
export const DEFAULT_SHIFT_END = '17:00';
export const DEFAULT_UNPAID_BREAK_MINUTES = 60;
export const DEFAULT_WORKING_HOURS = '8 AM - 5 PM (1 h unpaid break)';

/**
 * BIN-GROUP Sovereign Platform - Standard Formatters
 * Enforces resilient UI rendering by preventing crashes on undefined values.
 */

/**
 * Safely formats a value as AED currency according to Sovereign Platform specs.
 */
export const formatAED = (value: unknown): string => {
    const n = typeof value === "number" ? value : Number(value);
    return Number.isFinite(n) ? n.toLocaleString("en-AE") : "0";
};

/**
 * Safely formats a number with comma separators.
 */
export const formatNumber = (value: unknown): string => {
    const n = typeof value === "number" ? value : Number(value);
    return Number.isFinite(n) ? n.toLocaleString() : "0";
};

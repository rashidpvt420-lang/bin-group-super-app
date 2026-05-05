import { Timestamp } from 'firebase/firestore';

/**
 * Safely converts any value to a string for React rendering.
 * Prevents "Objects are not valid as a React child" (Error #31).
 */
export const safeText = (value: any): string => {
    if (value === null || value === undefined) return '';
    if (typeof value === 'string') return value;
    if (typeof value === 'number') return String(value);
    
    // Handle Firestore Timestamp
    if (value instanceof Timestamp || (value && typeof value.toDate === 'function')) {
        return value.toDate().toLocaleString();
    }
    
    // Handle Date objects
    if (value instanceof Date) {
        return value.toLocaleString();
    }

    // Handle standard Error objects or Firebase errors
    if (value && typeof value.message === 'string') {
        return value.message;
    }

    if (value && typeof value.code === 'string') {
        return value.code;
    }

    // Handle complex objects
    try {
        if (typeof value === 'object') {
            // Priority fields for display
            const display = value.displayName || value.name || value.label || value.title;
            if (display && typeof display === 'string') return display;
            
            return JSON.stringify(value);
        }
    } catch (e) {
        return 'Object [Unrenderable]';
    }

    return String(value);
};

/**
 * Safely formats currency values.
 */
export const safeCurrency = (value: any, lang: string = 'en'): string => {
    const num = Number(value || 0);
    if (isNaN(num)) return 'AED 0';
    return num.toLocaleString(lang === 'ar' ? 'ar-AE' : 'en-AE', {
        style: 'currency',
        currency: 'AED',
        maximumFractionDigits: 0
    });
};

/**
 * Safely formats numbers.
 */
export const safeNumber = (value: any): string => {
    const num = Number(value || 0);
    return isNaN(num) ? '0' : num.toLocaleString();
};

/**
 * Safely formats dates.
 */
export const safeDate = (value: any, lang: string = 'en'): string => {
    if (!value) return 'N/A';
    
    let date: Date;
    if (value instanceof Date) {
        date = value;
    } else if (value instanceof Timestamp || (value && typeof value.toDate === 'function')) {
        date = value.toDate();
    } else if (typeof value === 'number') {
        date = new Date(value);
    } else if (value && typeof value.seconds === 'number') {
        date = new Date(value.seconds * 1000);
    } else if (typeof value === 'string') {
        date = new Date(value);
    } else {
        return 'Invalid Date';
    }

    if (isNaN(date.getTime())) return 'Invalid Date';

    return date.toLocaleDateString(lang === 'ar' ? 'ar-AE' : 'en-AE');
};

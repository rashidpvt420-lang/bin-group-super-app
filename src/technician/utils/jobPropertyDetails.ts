// Display ticket facts without presenting internal identifiers as property names.
export function jobPropertyName(ticket: Record<string, any>): string {
    const name = typeof ticket.propertyName === 'string' ? ticket.propertyName.trim() : '';
    if (!name || name === String(ticket.propertyId || '').trim()
        || /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(?:_property_\d+)?$/i.test(name)) return '';
    return name;
}

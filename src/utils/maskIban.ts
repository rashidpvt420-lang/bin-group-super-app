/** Show only the last four IBAN characters by default. Never invent digits. */

export function maskIban(value: unknown): string {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  const compact = raw.replace(/\s+/g, '').toUpperCase();
  if (/[•*xX]{2,}/.test(compact) && /\d{4}$/.test(compact)) {
    const last4 = compact.slice(-4);
    return `•••• ${last4}`;
  }
  const alnum = compact.replace(/[^A-Z0-9]/g, '');
  if (alnum.length < 4) return '••••';
  return `•••• ${alnum.slice(-4)}`;
}

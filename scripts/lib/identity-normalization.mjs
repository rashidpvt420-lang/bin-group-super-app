export function normalizeAuthorizedEmail(value, label = 'Founder email') {
  const normalized = String(value || '')
    .replace(/\s+/g, '')
    .toLowerCase();

  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(normalized)) {
    throw new Error(`${label} must be a valid email address`);
  }

  return normalized;
}

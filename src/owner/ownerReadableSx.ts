import { alpha } from '@mui/material';
import { binThemeTokens } from '../theme/binGroupTheme';

/** Light Owner portal surfaces — dark text on white/platinum cards (never white-on-white). */
export const ownerInk = {
  title: binThemeTokens.textPrimary,
  body: binThemeTokens.textSecondary,
  muted: binThemeTokens.textTertiary,
  paper: binThemeTokens.card,
  paperSoft: binThemeTokens.softCanvas,
  border: binThemeTokens.border,
  goldBorder: alpha(binThemeTokens.gold, 0.35),
  goldWash: alpha(binThemeTokens.gold, 0.1),
  success: '#059669',
  warning: '#B45309',
  danger: '#B91C1C',
};

export function firstProperty(contract: any): Record<string, any> {
  if (Array.isArray(contract?.properties) && contract.properties[0]) return contract.properties[0];
  if (contract?.propertyDetails && typeof contract.propertyDetails === 'object') return contract.propertyDetails;
  if (contract?.property && typeof contract.property === 'object') return contract.property;
  return {};
}

export function ownerDisplayName(contract: any, fallback = ''): string {
  return String(
    contract?.ownerName
    || contract?.signatureName
    || contract?.companyProfile?.contactPerson
    || contract?.companyProfile?.name
    || contract?.fullName
    || fallback
    || '',
  ).trim();
}

export function propertyDisplayName(contract: any): string {
  const property = firstProperty(contract);
  return String(
    contract?.propertyName
    || property?.name
    || property?.propertyName
    || property?.address
    || property?.formattedAddress
    || 'Property',
  ).trim();
}

export function propertyAddressLine(contract: any): string {
  const property = firstProperty(contract);
  const parts = [
    property?.address || property?.formattedAddress || contract?.address,
    property?.emirate || property?.location?.emirate || contract?.emirate,
  ].map((part) => String(part || '').trim()).filter(Boolean);
  return parts.join(' · ') || 'Address pending verification';
}

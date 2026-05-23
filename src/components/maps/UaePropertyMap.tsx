import React from 'react';
import { Alert, Box, Button, Paper, Stack, Typography, alpha } from '@mui/material';
import { ExternalLink, MapPin, Navigation, AlertTriangle } from 'lucide-react';
import { binThemeTokens } from '../../theme/binGroupTheme';

type UaePropertyMapProps = {
  title?: string;
  address?: string;
  emirate?: string;
  lat?: number | string | null;
  lng?: number | string | null;
  googleMapsUrl?: string;
  plusCode?: string;
  locationQuality?: "EXACT_GPS" | "PLUS_CODE" | "MAP_URL" | "ADDRESS_ONLY" | "MISSING";
  requireExactPin?: boolean;
  onUpdateGps?: () => void;
  height?: number;
};

const toCoord = (value: number | string | null | undefined) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const readMapsKey = () => {
  const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env || {};
  return env.VITE_GOOGLE_MAPS_API_KEY || env.VITE_MAPS_API_KEY || '';
};

export default function UaePropertyMap({
  title = 'Property Location',
  address,
  emirate,
  lat,
  lng,
  googleMapsUrl: customGoogleMapsUrl,
  plusCode,
  locationQuality,
  requireExactPin = false,
  onUpdateGps,
  height = 280
}: UaePropertyMapProps) {
  const apiKey = readMapsKey();
  const latitude = toCoord(lat);
  const longitude = toCoord(lng);
  const hasCoords = latitude !== null && longitude !== null;

  // 1. Resolve open link
  let finalGoogleMapsUrl = customGoogleMapsUrl;
  if (!finalGoogleMapsUrl) {
    if (hasCoords) {
      finalGoogleMapsUrl = `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`;
    } else if (plusCode) {
      finalGoogleMapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(plusCode)}`;
    } else {
      finalGoogleMapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
        [address, emirate, 'United Arab Emirates'].filter(Boolean).join(', ')
      )}`;
    }
  }

  // 2. Resolve embed query
  let query = '';
  if (hasCoords) {
    query = `${latitude},${longitude}`;
  } else if (plusCode) {
    query = plusCode;
  } else {
    query = [address, emirate, 'United Arab Emirates'].filter(Boolean).join(', ');
  }

  const embedUrl = apiKey && query
    ? `https://www.google.com/maps/embed/v1/place?key=${apiKey}&q=${encodeURIComponent(query)}`
    : '';

  const handleUpdateClick = () => {
    if (onUpdateGps) {
      onUpdateGps();
    } else {
      alert("To update the exact GPS pin, please use the Asset Registry edit form in the Admin portal, or contact BIN GROUP operations support.");
    }
  };

  return (
    <Paper 
      sx={{ 
        overflow: 'hidden', 
        bgcolor: 'rgba(15,23,42,0.55)', 
        border: '1px solid rgba(255,255,255,0.08)', 
        borderRadius: 5,
        pr: { xs: 9, md: 0 },
        pb: { xs: 12, md: 6 },
        minWidth: 0,
        wordBreak: 'break-word',
        overflowWrap: 'anywhere'
      }}
    >
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ p: 2.5, borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
        <Stack direction="row" spacing={1.5} alignItems="center">
          <Box sx={{ width: 36, height: 36, display: 'grid', placeItems: 'center', bgcolor: alpha(binThemeTokens.gold, 0.12), color: binThemeTokens.gold, borderRadius: 2 }}>
            <MapPin size={18} />
          </Box>
          <Box>
            <Typography variant="subtitle2" fontWeight="950" sx={{ color: '#FFF' }}>{title}</Typography>
            <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.42)', fontWeight: 800 }}>
              {address || emirate || 'UAE location pending'}
            </Typography>
          </Box>
        </Stack>
        <Button href={finalGoogleMapsUrl} target="_blank" rel="noreferrer" size="small" endIcon={<ExternalLink size={14} />} sx={{ color: binThemeTokens.gold, fontWeight: 950 }}>
          Open
        </Button>
      </Stack>

      {/* Warnings & Action Items */}
      {!hasCoords && (
        <Box sx={{ p: 2, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          <Alert 
            severity="warning" 
            icon={<AlertTriangle size={16} />}
            sx={{ 
              bgcolor: alpha('#f59e0b', 0.08), 
              color: '#f8fafc', 
              border: `1px solid ${alpha('#f59e0b', 0.25)}`,
              '& .MuiAlert-icon': { color: '#f59e0b' }
            }}
          >
            Exact GPS pin is not saved yet. This map is using address-level lookup only.
          </Alert>

          {requireExactPin && (
            <Stack 
              direction={{ xs: 'column', sm: 'row' }} 
              justifyContent="space-between" 
              alignItems={{ xs: 'stretch', sm: 'center' }} 
              spacing={2}
              sx={{ 
                p: 2, 
                bgcolor: alpha('#ef4444', 0.08), 
                border: '1px solid rgba(239, 68, 68, 0.25)', 
                borderRadius: 2 
              }}
            >
              <Typography variant="body2" sx={{ color: '#fca5a5', fontWeight: 900 }}>
                Exact dispatch location required
              </Typography>
              <Button 
                variant="contained" 
                size="small" 
                onClick={handleUpdateClick}
                sx={{ 
                  bgcolor: '#ef4444', 
                  color: '#FFF', 
                  fontWeight: 950,
                  fontSize: '0.75rem',
                  '&:hover': { bgcolor: '#dc2626' } 
                }}
              >
                Update Exact GPS Pin
              </Button>
            </Stack>
          )}
        </Box>
      )}

      {embedUrl ? (
        <Box component="iframe" title={title} src={embedUrl} sx={{ width: '100%', height, border: 0, display: 'block', filter: 'saturate(0.9)' }} loading="lazy" referrerPolicy="no-referrer-when-downgrade" />
      ) : (
        <Box sx={{ height, display: 'grid', placeItems: 'center', p: 3, background: 'linear-gradient(135deg, rgba(198,167,94,0.12), rgba(15,23,42,0.6))' }}>
          <Stack spacing={2} alignItems="center" textAlign="center" maxWidth={560}>
            <Navigation size={36} color={binThemeTokens.gold} />
            <Typography variant="h6" fontWeight="950" sx={{ color: '#FFF' }}>Google Maps key not configured</Typography>
            <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.58)' }}>
              Add VITE_GOOGLE_MAPS_API_KEY in Firebase/Vite environment to show embedded maps. The external Google Maps link still works for dispatch and location verification.
            </Typography>
          </Stack>
        </Box>
      )}
    </Paper>
  );
}

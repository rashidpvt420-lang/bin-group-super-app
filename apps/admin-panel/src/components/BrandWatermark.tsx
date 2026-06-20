import React from 'react';
import { Box, alpha } from '@mui/material';
import { binThemeTokens } from '../theme/binGroupTheme';

type BrandWatermarkProps = {
  label?: string;
  opacity?: number;
  compact?: boolean;
};

export default function BrandWatermark({ label = 'BIN GROUP', opacity = 0.06, compact = false }: BrandWatermarkProps) {
  return (
    <Box
      aria-hidden="true"
      sx={{
        pointerEvents: 'none',
        position: 'fixed',
        inset: 0,
        zIndex: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
      }}
    >
      <Box
        sx={{
          position: 'absolute',
          fontWeight: 950,
          letterSpacing: { xs: 10, md: 24 },
          fontSize: { xs: '5.8rem', sm: '9rem', md: '13rem' },
          lineHeight: 0.9,
          textAlign: 'center',
          whiteSpace: 'nowrap',
          textTransform: 'uppercase',
          color: 'rgba(191,157,65,0.9)',
          opacity,
          transform: 'rotate(-12deg)',
          textShadow: `0 0 48px ${alpha(binThemeTokens.gold, 0.18)}`,
        }}
      >
        {label}
      </Box>

      <Box
        sx={{
          width: { xs: compact ? 270 : 360, sm: compact ? 380 : 520, md: compact ? 520 : 720 },
          height: { xs: compact ? 270 : 360, sm: compact ? 380 : 520, md: compact ? 520 : 720 },
          borderRadius: '50%',
          border: `2px solid ${alpha(binThemeTokens.gold, 0.26)}`,
          opacity: opacity * 0.82,
          transform: 'rotate(-12deg)',
          background: `radial-gradient(circle, ${alpha(binThemeTokens.gold, 0.18)} 0%, transparent 66%)`,
          boxShadow: `0 0 150px ${alpha(binThemeTokens.gold, 0.16)}`,
        }}
      />
    </Box>
  );
}

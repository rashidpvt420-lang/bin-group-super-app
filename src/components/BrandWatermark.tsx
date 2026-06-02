import React from 'react';
import { Box, alpha } from '@mui/material';
import { binThemeTokens } from '../theme/binGroupTheme';

type BrandWatermarkProps = {
  label?: string;
  opacity?: number;
  compact?: boolean;
};

export default function BrandWatermark({ label = 'BIN GROUP', opacity = 0.045, compact = false }: BrandWatermarkProps) {
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
          width: { xs: compact ? 240 : 300, sm: compact ? 320 : 430, md: compact ? 420 : 560 },
          height: { xs: compact ? 240 : 300, sm: compact ? 320 : 430, md: compact ? 420 : 560 },
          borderRadius: '50%',
          border: `1px solid ${alpha(binThemeTokens.gold, 0.16)}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          opacity,
          transform: 'rotate(-12deg)',
          background: `radial-gradient(circle, ${alpha(binThemeTokens.gold, 0.26)} 0%, transparent 62%)`,
          boxShadow: `0 0 120px ${alpha(binThemeTokens.gold, 0.12)}`,
        }}
      >
        <Box
          sx={{
            px: { xs: 2, md: 4 },
            py: { xs: 1.5, md: 2.5 },
            borderTop: `2px solid ${binThemeTokens.gold}`,
            borderBottom: `2px solid ${binThemeTokens.gold}`,
            color: binThemeTokens.gold,
            fontWeight: 950,
            letterSpacing: { xs: 5, md: 10 },
            fontSize: { xs: compact ? '1.35rem' : '1.75rem', sm: compact ? '2rem' : '2.7rem', md: compact ? '2.8rem' : '3.8rem' },
            lineHeight: 1,
            textAlign: 'center',
            whiteSpace: 'nowrap',
            textTransform: 'uppercase',
            textShadow: `0 0 28px ${alpha(binThemeTokens.gold, 0.35)}`,
          }}
        >
          {label}
        </Box>
      </Box>
    </Box>
  );
}

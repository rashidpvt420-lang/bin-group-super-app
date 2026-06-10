import React from 'react';
import { Box, alpha } from '@mui/material';
import { binThemeTokens } from '../theme/binGroupTheme';

type BrandWatermarkProps = {
  label?: string;
  opacity?: number;
  compact?: boolean;
};

export default function BrandWatermark({ label = 'BIN GROUP', opacity = 0.07, compact = false }: BrandWatermarkProps) {
  const size = compact ? { xs: 260, sm: 360, md: 480 } : { xs: 360, sm: 560, md: 760 };

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
          width: size,
          height: size,
          borderRadius: '50%',
          border: `1px solid ${alpha(binThemeTokens.gold, 0.34)}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          opacity,
          transform: 'rotate(-12deg)',
          background: `radial-gradient(circle, ${alpha(binThemeTokens.gold, 0.34)} 0%, ${alpha(binThemeTokens.gold, 0.12)} 44%, transparent 70%)`,
          boxShadow: `0 0 160px ${alpha(binThemeTokens.gold, 0.18)}`,
        }}
      >
        <Box
          sx={{
            px: { xs: 2.4, md: 5 },
            py: { xs: 1.6, md: 3 },
            borderTop: `2px solid ${alpha(binThemeTokens.gold, 0.95)}`,
            borderBottom: `2px solid ${alpha(binThemeTokens.gold, 0.95)}`,
            color: alpha(binThemeTokens.gold, 0.95),
            fontWeight: 950,
            letterSpacing: { xs: 6, md: 13 },
            fontSize: { xs: compact ? '1.6rem' : '2.2rem', sm: compact ? '2.3rem' : '3.6rem', md: compact ? '3.2rem' : '5.4rem' },
            lineHeight: 1,
            textAlign: 'center',
            whiteSpace: 'nowrap',
            textTransform: 'uppercase',
            textShadow: `0 0 36px ${alpha(binThemeTokens.gold, 0.42)}`,
          }}
        >
          {label}
        </Box>
      </Box>
    </Box>
  );
}

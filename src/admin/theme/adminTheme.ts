import { createTheme } from '@mui/material/styles';
import { binGroupTheme, binThemeTokens } from '../../theme/binGroupTheme';

/**
 * BIN GROUP Admin Theme
 * Extends the root White + Platinum + Gold sovereign theme.
 * Do not duplicate theme tokens here; keep root theme as the single source of truth.
 */
export { binThemeTokens };

export const adminTheme = createTheme(binGroupTheme, {
  shape: {
    borderRadius: 18,
  },
});

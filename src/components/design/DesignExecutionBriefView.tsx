import { Alert, Box, Grid, Paper, Stack, Typography } from '@mui/material';
import { binThemeTokens } from '../../theme/binGroupTheme';

type BriefSection = { category?: string; items?: string[] };

export type DesignExecutionBrief = {
  lockedOptionLabel?: string;
  lightingNotes?: string;
  style?: string;
  finishTier?: string;
  zoneType?: string;
  followThePicture?: string;
  incompleteScope?: Array<{ field?: string; label?: string }>;
  sections?: BriefSection[];
  scope?: {
    unitNumber?: string;
    floorLevel?: string;
    dimensions?: number | null;
    existingCondition?: string;
    requiredWork?: string;
    propertyName?: string;
  };
};

const DARK_LABEL = '#D1D5DB';
const DARK_BODY = '#F3F4F6';

function text(value: unknown, fallback = '') {
  const resolved = String(value ?? '').trim();
  return resolved || fallback;
}

export default function DesignExecutionBriefView({
  brief,
  chosenImageUrl = '',
  referenceImageUrl = '',
  tone = 'dark',
}: {
  brief: DesignExecutionBrief | null | undefined;
  chosenImageUrl?: string;
  referenceImageUrl?: string;
  tone?: 'dark' | 'light';
}) {
  if (!brief) return null;
  const dark = tone === 'dark';
  const label = dark ? DARK_LABEL : '#4B5563';
  const body = dark ? DARK_BODY : '#111827';
  const cardBg = dark ? 'rgba(255,255,255,0.03)' : '#F8F9FB';
  const gaps = Array.isArray(brief.incompleteScope) ? brief.incompleteScope.map((gap) => text(gap?.label)).filter(Boolean) : [];
  const sections = Array.isArray(brief.sections) ? brief.sections : [];

  return (
    <Box data-testid="design-execution-brief" sx={{ mt: 1 }}>
      <Typography variant="h6" fontWeight={950} sx={{ color: binThemeTokens.gold, mb: 1 }}>
        LAYOUT BRIEF FOR THE ENGINEER
      </Typography>
      <Typography variant="body2" sx={{ color: body, mb: 2 }}>
        {text(brief.followThePicture, `Build this room to match ${text(brief.lockedOptionLabel, 'the locked design')}.`)}
      </Typography>
      <Grid container spacing={2} sx={{ mb: 2 }}>
        <Grid item xs={12} md={7}>
          {chosenImageUrl ? (
            <Box component="img" alt={text(brief.lockedOptionLabel, 'Locked design')} src={chosenImageUrl} sx={{ width: '100%', height: 280, objectFit: 'cover', borderRadius: 2, border: `2px solid ${binThemeTokens.gold}` }} />
          ) : (
            <Alert severity="warning">The locked design image is not available yet. Do not start from a different picture.</Alert>
          )}
          <Typography variant="caption" sx={{ color: binThemeTokens.gold, fontWeight: 900, display: 'block', mt: 0.75 }}>
            Locked design: {text(brief.lockedOptionLabel, 'Chosen option')}
          </Typography>
        </Grid>
        <Grid item xs={12} md={5}>
          {referenceImageUrl ? (
            <Box component="img" alt="Before - your photo" src={referenceImageUrl} sx={{ width: '100%', height: 180, objectFit: 'cover', borderRadius: 2 }} />
          ) : (
            <Alert severity="warning">The before photo is not available.</Alert>
          )}
          <Typography variant="caption" sx={{ color: label, fontWeight: 800, display: 'block', mt: 0.75 }}>Before (your photo)</Typography>
          <Typography variant="body2" sx={{ color: body, mt: 1 }}>{text(brief.lightingNotes)}</Typography>
        </Grid>
      </Grid>
      {gaps.length > 0 && (
        <Alert severity="warning" sx={{ mb: 2 }} data-testid="design-scope-gaps">
          Incomplete scope. {gaps.join(' ')}
        </Alert>
      )}
      <Stack spacing={1.25}>
        {sections.map((section) => (
          <Paper key={text(section.category)} sx={{ p: 1.5, bgcolor: cardBg, borderRadius: 2, border: '1px solid rgba(198,167,94,0.2)' }}>
            <Typography fontWeight={950} sx={{ color: binThemeTokens.gold }}>{text(section.category)}</Typography>
            <Box component="ul" sx={{ m: 0, mt: 0.75, pl: 2.4 }}>
              {(section.items || []).map((item) => (
                <li key={item}><Typography variant="body2" sx={{ color: body, lineHeight: 1.55 }}>{item}</Typography></li>
              ))}
            </Box>
          </Paper>
        ))}
      </Stack>
    </Box>
  );
}

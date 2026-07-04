import { Box, Button, Paper, Stack, Typography, alpha } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { useLanguage } from '@bin/shared';
import RoleQuickActionsPanel from '../../components/RoleQuickActionsPanel';
import TechnicianProofChecklist from '../../components/TechnicianProofChecklist';
import { binThemeTokens } from '../../theme/binGroupTheme';

export default function TechnicianSimpleDashboardPage() {
  const navigate = useNavigate();
  const { isRTL, tx } = useLanguage();

  return (
    <Box sx={{ direction: isRTL ? 'rtl' : 'ltr' }}>
      <Stack spacing={4}>
        <Box sx={{ textAlign: isRTL ? 'right' : 'left' }}>
          <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 950, letterSpacing: 3 }}>{tx('tech.simple.overline', 'TECHNICIAN SIMPLE MODE')}</Typography>
          <Typography variant="h3" sx={{ color: '#111827', fontWeight: 950, mt: 1 }}>{tx('tech.simple.title', 'Start with jobs, map, and proof')}</Typography>
          <Typography sx={{ color: '#667085', mt: 1, maxWidth: 760 }}>{tx('tech.simple.desc', 'Field workers need fewer choices: assigned jobs, live map, offline queue, support, and evidence readiness.')}</Typography>
        </Box>

        <RoleQuickActionsPanel role="technician" isRTL={isRTL} title={tx('tech.simple.primaryTitle', 'Main field actions')} subtitle={tx('tech.simple.primarySubtitle', 'The fastest path for accepting, reaching, proving, and closing jobs.')} />

        <TechnicianProofChecklist isRTL={isRTL} />

        <Paper sx={{ p: 2.5, bgcolor: alpha(binThemeTokens.gold, 0.06), border: `1px solid ${alpha(binThemeTokens.gold, 0.18)}`, borderRadius: 5 }}>
          <Stack spacing={1.2} sx={{ textAlign: isRTL ? 'right' : 'left' }}>
            <Typography sx={{ color: '#111827', fontWeight: 950 }}>{tx('tech.simple.proofRule', 'Completion rule')}</Typography>
            <Typography variant="body2" sx={{ color: '#667085' }}>{tx('tech.simple.proofRuleDesc', 'A job should include arrival proof, before photos, after photos, parts evidence, and tenant sign or refusal before closure.')}</Typography>
          </Stack>
        </Paper>

        <Button onClick={() => navigate('/technician/dashboard/full')} sx={{ alignSelf: isRTL ? 'flex-end' : 'flex-start', color: binThemeTokens.gold, fontWeight: 950 }}>{tx('tech.simple.advanced', 'Open advanced dashboard')}</Button>
      </Stack>
    </Box>
  );
}

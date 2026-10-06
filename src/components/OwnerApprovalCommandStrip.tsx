import { Box, Button, Chip, Grid, Paper, Stack, Typography, alpha } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, CheckSquare, FileWarning, ReceiptText, Wrench } from 'lucide-react';
import { useLanguage } from '@bin/shared';
import { binThemeTokens } from '../theme/binGroupTheme';

type OwnerApprovalCommandStripProps = {
  pendingCostApprovals?: number;
  /** Open maintenance tickets — must match advanced "Open Maintenance Tasks". */
  openTickets?: number;
  /** Priority subset (emergency/critical/high/urgent) of open tickets. */
  highRiskTickets?: number;
  openDisputes?: number;
  expiringDocuments?: number;
  monthlyCostVariancePct?: number | null;
  isRTL?: boolean;
};

const asCount = (value: number | undefined) => Math.max(0, Number(value || 0));

export default function OwnerApprovalCommandStrip({
  pendingCostApprovals = 0,
  openTickets = 0,
  highRiskTickets = 0,
  openDisputes = 0,
  expiringDocuments = 0,
  monthlyCostVariancePct = null,
  isRTL = false,
}: OwnerApprovalCommandStripProps) {
  const navigate = useNavigate();
  const { lang } = useLanguage();
  const ar = lang === 'ar';
  // Prefer openTickets (aligned with advanced). Fall back to highRiskTickets for older call sites.
  const openMaintenance = asCount(openTickets) > 0 ? asCount(openTickets) : asCount(highRiskTickets);
  const highRisk = asCount(highRiskTickets);
  const urgentTotal = asCount(pendingCostApprovals) + openMaintenance + asCount(openDisputes) + asCount(expiringDocuments);
  const costVarianceAlert = typeof monthlyCostVariancePct === 'number' && Math.abs(monthlyCostVariancePct) >= 15;

  const riskHelp = highRisk > 0
    ? (ar
      ? `${highRisk} عالية المخاطر من ${openMaintenance} مفتوحة — قد تؤثر في الراحة أو قيمة الأصل.`
      : `${highRisk} high-risk of ${openMaintenance} open — issues that can affect comfort or asset value.`)
    : (ar
      ? 'مشكلات صيانة مفتوحة قد تؤثر في الراحة أو قيمة الأصل.'
      : 'Open maintenance issues that can affect comfort or asset value.');

  const cards = [
    { id: 'approvals', label: ar ? 'موافقات التكلفة' : 'Cost approvals', value: asCount(pendingCostApprovals), icon: <CheckSquare size={22} />, route: '/owner/approvals', help: ar ? 'إصلاحات تنتظر قرار المالك.' : 'Repairs waiting for owner decision.' },
    { id: 'risk', label: ar ? 'تذاكر مفتوحة' : 'Open tickets', value: openMaintenance, icon: <AlertTriangle size={22} />, route: '/owner/tickets', help: riskHelp },
    { id: 'disputes', label: ar ? 'الاعتراضات' : 'Disputes', value: asCount(openDisputes), icon: <Wrench size={22} />, route: '/owner/complaint', help: ar ? 'شكاوى مفتوحة أو عناصر قيد مراجعة الخدمة.' : 'Open complaint or service review items.' },
    { id: 'documents', label: ar ? 'مستندات قاربت الانتهاء' : 'Expiring docs', value: asCount(expiringDocuments), icon: <FileWarning size={22} />, route: '/owner/documents', help: ar ? 'عقود أو ضمانات أو تأمين أو شهادات تحتاج إلى مراجعة.' : 'Contracts, warranties, insurance, or certificates needing review.' },
  ];

  const statusLabel = costVarianceAlert
    ? (ar ? `تغير التكلفة ${monthlyCostVariancePct}%` : `Cost variance ${monthlyCostVariancePct}%`)
    : urgentTotal
      ? (ar ? `${urgentTotal} إجراء معلق` : `${urgentTotal} action${urgentTotal === 1 ? '' : 's'} pending`)
      : (ar ? 'لا توجد إجراءات عاجلة للمالك' : 'No urgent owner actions');

  return (
    <Paper sx={{ p: { xs: 2.5, md: 3.5 }, bgcolor: urgentTotal ? alpha('#ef4444', 0.075) : alpha(binThemeTokens.gold, 0.045), border: `1px solid ${urgentTotal ? alpha('#ef4444', 0.24) : alpha(binThemeTokens.gold, 0.16)}`, borderRadius: 6 }}>
      <Stack spacing={2.5} sx={{ textAlign: isRTL ? 'right' : 'left' }}>
        <Stack direction={{ xs: 'column', md: isRTL ? 'row-reverse' : 'row' }} alignItems={{ xs: 'flex-start', md: 'center' }} justifyContent="space-between" spacing={2}>
          <Box>
            <Typography variant="overline" sx={{ color: binThemeTokens.goldHover || binThemeTokens.gold, fontWeight: 950, letterSpacing: 2 }}>{ar ? 'مركز قرارات المالك' : 'OWNER COMMAND STRIP'}</Typography>
            <Typography variant="h6" sx={{ color: binThemeTokens.textPrimary, fontWeight: 950 }}>{ar ? 'ما الذي يحتاج إلى موافقتي اليوم؟' : 'What needs my approval today?'}</Typography>
            <Typography variant="body2" sx={{ color: binThemeTokens.textSecondary, mt: 0.5 }}>{ar ? 'يركز المالك على القرارات والمخاطر والمستندات والتكلفة.' : 'Keeps owners focused on decisions, risk, documents, and cost.'}</Typography>
          </Box>
          <Chip icon={<ReceiptText size={16} />} label={statusLabel} sx={{ bgcolor: urgentTotal || costVarianceAlert ? alpha('#ef4444', 0.15) : alpha('#10b981', 0.15), color: urgentTotal || costVarianceAlert ? '#991b1b' : '#047857', fontWeight: 950 }} />
        </Stack>
        <Grid container spacing={2}>
          {cards.map((card) => (
            <Grid item xs={12} sm={6} md={3} key={card.id}>
              <Button fullWidth aria-label={card.label} onClick={() => navigate(card.route)} sx={{ minHeight: 116, p: 2, justifyContent: 'flex-start', textAlign: isRTL ? 'right' : 'left', color: '#fff', bgcolor: 'rgba(15,23,42,0.86)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 4, '&:hover': { bgcolor: alpha(binThemeTokens.gold, 0.18), borderColor: alpha(binThemeTokens.gold, 0.45) } }}>
                <Stack spacing={1} alignItems={isRTL ? 'flex-end' : 'flex-start'}>
                  <Box sx={{ color: card.value > 0 ? '#fca5a5' : binThemeTokens.gold }}>{card.icon}</Box>
                  <Typography variant="h5" sx={{ fontWeight: 950 }}>{card.value}</Typography>
                  <Typography sx={{ fontWeight: 950 }}>{card.label}</Typography>
                  <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.62)', lineHeight: 1.45 }}>{card.help}</Typography>
                </Stack>
              </Button>
            </Grid>
          ))}
        </Grid>
      </Stack>
    </Paper>
  );
}

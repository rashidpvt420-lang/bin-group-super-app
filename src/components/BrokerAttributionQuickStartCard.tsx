import React from 'react';
import { Box, Button, Chip, Grid, Paper, Stack, Typography, alpha } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { Check, Copy, FileCheck2, Handshake, Link2, QrCode, WalletCards } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { binThemeTokens } from '../theme/binGroupTheme';

type BrokerAttributionQuickStartCardProps = {
  referralLinkReady?: boolean;
  qrReady?: boolean;
  activeLeads?: number;
  attributedContracts?: number;
  pendingCommissionAmount?: number;
  /** The broker's real referral link. When present it is shown with a Copy button and a scannable QR. */
  referralUrl?: string;
  isRTL?: boolean;
};

export default function BrokerAttributionQuickStartCard({
  referralLinkReady = false,
  qrReady = false,
  activeLeads = 0,
  attributedContracts = 0,
  pendingCommissionAmount = 0,
  referralUrl = '',
  isRTL = false,
}: BrokerAttributionQuickStartCardProps) {
  const navigate = useNavigate();
  const [copied, setCopied] = React.useState(false);
  const [copyFailed, setCopyFailed] = React.useState(false);
  const copyTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  React.useEffect(() => () => { if (copyTimer.current) clearTimeout(copyTimer.current); }, []);
  const copyReferralLink = React.useCallback(async () => {
    if (!referralUrl) return;
    try {
      await navigator.clipboard.writeText(referralUrl);
      setCopied(true);
      setCopyFailed(false);
    } catch {
      // Clipboard can be unavailable (insecure context / denied permission); the link stays visible to copy by hand.
      setCopied(false);
      setCopyFailed(true);
    }
    if (copyTimer.current) clearTimeout(copyTimer.current);
    copyTimer.current = setTimeout(() => { setCopied(false); setCopyFailed(false); }, 2500);
  }, [referralUrl]);
  const readiness = [referralLinkReady, qrReady, attributedContracts > 0].filter(Boolean).length;
  const readinessPct = Math.round((readiness / 3) * 100);

  const actions = [
    { id: 'referral', label: 'Referral link', value: referralLinkReady ? 'Ready' : 'Set up', icon: <Link2 size={20} />, route: '/broker/referrals' },
    { id: 'qr', label: 'QR lead capture', value: qrReady ? 'Ready' : 'Generate', icon: <QrCode size={20} />, route: '/broker/leads' },
    { id: 'contracts', label: 'Attributed contracts', value: String(attributedContracts), icon: <FileCheck2 size={20} />, route: '/broker/attribution' },
    { id: 'commission', label: 'Pending commission', value: `AED ${Number(pendingCommissionAmount || 0).toLocaleString()}`, icon: <WalletCards size={20} />, route: '/broker/commissions' },
  ];

  return (
    <Paper sx={{ p: { xs: 2.5, md: 3.5 }, bgcolor: '#FDFBF7', color: '#111827', border: `1px solid ${alpha(binThemeTokens.gold, 0.16)}`, borderRadius: 6 }}>
      <Stack spacing={2.5} sx={{ textAlign: isRTL ? 'right' : 'left' }}>
        <Stack direction={{ xs: 'column', md: isRTL ? 'row-reverse' : 'row' }} justifyContent="space-between" alignItems={{ xs: 'flex-start', md: 'center' }} spacing={2}>
          <Box>
            <Typography variant="overline" sx={{ color: '#7A5C12', fontWeight: 950, letterSpacing: 2 }}>{isRTL ? 'إسناد الوسيط' : 'BROKER ATTRIBUTION'}</Typography>
            <Typography variant="h6" sx={{ color: '#111827', fontWeight: 950 }}>{isRTL ? 'أثبت من جلب المالك أو المستأجر أو العقار' : 'Prove who brought the owner, tenant, or property'}</Typography>
            <Typography variant="body2" sx={{ color: '#475467', mt: 0.5 }}>{isRTL ? 'سجّل الإسناد قبل تفعيل العقد حتى تبقى حالة العمولة واضحة.' : 'Record attribution before the contract is activated so the commission status stays clear.'}</Typography>
          </Box>
          <Chip icon={<Handshake size={16} />} label={isRTL ? `جاهزية الإسناد ${readinessPct}%` : `${readinessPct}% attribution ready`} sx={{ bgcolor: readinessPct === 100 ? '#ECFDF5' : '#FFF7ED', color: readinessPct === 100 ? '#047857' : '#92400E', border: `1px solid ${readinessPct === 100 ? '#A7F3D0' : '#FED7AA'}`, fontWeight: 950, '& .MuiChip-icon': { color: 'inherit' } }} />
        </Stack>
        <Grid container spacing={2}>
          {actions.map((action) => (
            <Grid item xs={12} sm={6} md={3} key={action.id}>
              <Button fullWidth onClick={() => navigate(action.route)} sx={{ minHeight: 110, p: 2, justifyContent: 'flex-start', textAlign: isRTL ? 'right' : 'left', color: '#111827', bgcolor: '#FFFFFF', border: '1px solid #E5E7EB', borderRadius: 4, '&:hover': { bgcolor: alpha(binThemeTokens.gold, 0.1), borderColor: alpha(binThemeTokens.gold, 0.35) } }}>
                <Stack spacing={1} alignItems={isRTL ? 'flex-end' : 'flex-start'}>
                  <Box sx={{ color: '#7A5C12' }}>{action.icon}</Box>
                  <Typography variant="caption" sx={{ color: '#475467', fontWeight: 900 }}>{action.label}</Typography>
                  <Typography sx={{ fontWeight: 950 }}>{action.value}</Typography>
                </Stack>
              </Button>
            </Grid>
          ))}
        </Grid>
        {referralUrl ? (
          <Stack
            data-testid="broker-referral-share"
            direction={{ xs: 'column', sm: isRTL ? 'row-reverse' : 'row' }}
            spacing={2}
            alignItems={{ xs: 'stretch', sm: 'center' }}
            sx={{ p: 2, bgcolor: '#FFFFFF', border: '1px solid #E5E7EB', borderRadius: 4 }}
          >
            <Box sx={{ p: 1, bgcolor: '#FFFFFF', border: '1px solid #E5E7EB', borderRadius: 2, alignSelf: { xs: 'center', sm: 'flex-start' }, lineHeight: 0 }}>
              <QRCodeSVG value={referralUrl} size={132} aria-label={isRTL ? 'رمز QR لرابط الإحالة' : 'Referral link QR code'} />
            </Box>
            <Stack spacing={1} sx={{ minWidth: 0, flex: 1 }}>
              <Typography variant="caption" sx={{ color: '#475467', fontWeight: 900 }}>{isRTL ? 'رابط الإحالة الخاص بك' : 'Your referral link'}</Typography>
              <Typography dir="ltr" sx={{ color: '#111827', fontWeight: 700, fontSize: 13, wordBreak: 'break-all', textAlign: isRTL ? 'right' : 'left' }}>{referralUrl}</Typography>
              <Stack direction={isRTL ? 'row-reverse' : 'row'} spacing={1} alignItems="center">
                <Button
                  size="small"
                  variant="outlined"
                  onClick={copyReferralLink}
                  startIcon={copied ? <Check size={16} /> : <Copy size={16} />}
                  sx={{ color: '#7A5C12', borderColor: '#7A5C12', fontWeight: 900, minHeight: 40 }}
                >
                  {copied ? (isRTL ? 'تم النسخ' : 'Copied') : (isRTL ? 'نسخ الرابط' : 'Copy link')}
                </Button>
                <Typography role="status" variant="caption" sx={{ color: copyFailed ? '#92400E' : '#475467' }}>
                  {copyFailed ? (isRTL ? 'تعذّر النسخ. انسخ الرابط يدويًا.' : 'Copy failed. Select the link and copy it by hand.') : (isRTL ? 'امسح الرمز أو شارك الرابط مع المالك.' : 'Scan the code or share the link with the owner.')}
                </Typography>
              </Stack>
            </Stack>
          </Stack>
        ) : null}
        <Typography variant="caption" sx={{ color: '#475467' }}>{isRTL ? 'العملاء النشطون حاليًا:' : 'Active leads tracked:'} {Number(activeLeads || 0).toLocaleString()}</Typography>
      </Stack>
    </Paper>
  );
}

import { Box, Button, Chip, LinearProgress, Paper, Stack, Typography, alpha } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { Briefcase, Camera, CheckCircle2, FileText, MapPin, PenLine, ReceiptText, RotateCcw } from 'lucide-react';
import { useLanguage } from '@bin/shared';
import { binThemeTokens } from '../theme/binGroupTheme';

type TechnicianProofChecklistProps = {
  gpsArrival?: boolean;
  beforePhotos?: number;
  afterPhotos?: number;
  partsLogged?: boolean;
  receiptPhoto?: boolean;
  tenantSigned?: boolean;
  tenantRefused?: boolean;
  reworkFlag?: boolean;
  isRTL?: boolean;
};

export default function TechnicianProofChecklist(props: TechnicianProofChecklistProps) {
  const { lang } = useLanguage();
  const navigate = useNavigate();
  const {
    gpsArrival = false,
    beforePhotos = 0,
    afterPhotos = 0,
    partsLogged = false,
    receiptPhoto = false,
    tenantSigned = false,
    tenantRefused = false,
    reworkFlag = false,
    isRTL = false,
  } = props;

  const ar = lang === 'ar';
  const hasLiveProofData = [
    props.gpsArrival,
    props.beforePhotos,
    props.afterPhotos,
    props.partsLogged,
    props.receiptPhoto,
    props.tenantSigned,
    props.tenantRefused,
    props.reworkFlag,
  ].some((value) => value !== undefined);

  const proofItems = [
    { id: 'gps', label: ar ? 'إثبات الوصول عبر GPS' : 'GPS arrival proof', complete: gpsArrival, icon: <MapPin size={18} /> },
    { id: 'before', label: ar ? 'صور قبل بدء العمل' : 'Before photos', complete: beforePhotos > 0, icon: <Camera size={18} /> },
    { id: 'after', label: ar ? 'صور بعد إكمال العمل' : 'After photos', complete: afterPhotos > 0, icon: <Camera size={18} /> },
    { id: 'parts', label: ar ? 'تسجيل المواد وقطع الغيار' : 'Parts used logged', complete: partsLogged, icon: <ReceiptText size={18} /> },
    { id: 'receipt', label: ar ? 'صورة الفاتورة أو الإيصال' : 'Receipt photo', complete: receiptPhoto, icon: <FileText size={18} /> },
    { id: 'tenant', label: ar ? 'توقيع المستأجر أو تسجيل الرفض' : 'Tenant signature or refusal', complete: tenantSigned || tenantRefused, icon: <PenLine size={18} /> },
  ];

  const completed = proofItems.filter((item) => item.complete).length;
  const progress = Math.round((completed / proofItems.length) * 100);

  return (
    <Paper sx={{ p: { xs: 2.5, md: 3.5 }, bgcolor: alpha(binThemeTokens.gold, 0.045), border: `1px solid ${alpha(binThemeTokens.gold, 0.16)}`, borderRadius: 6 }}>
      <Stack spacing={2.5} sx={{ textAlign: isRTL ? 'right' : 'left' }}>
        <Stack direction={{ xs: 'column', md: isRTL ? 'row-reverse' : 'row' }} justifyContent="space-between" alignItems={{ xs: 'flex-start', md: 'center' }} spacing={2}>
          <Box>
            <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 950, letterSpacing: 2 }}>{ar ? 'إثبات العمل الميداني' : 'FIELD EVIDENCE'}</Typography>
            <Typography variant="h6" sx={{ color: '#111827', fontWeight: 950 }}>{ar ? 'متطلبات إثبات إغلاق المهمة' : hasLiveProofData ? 'Technician proof checklist' : 'Required job evidence'}</Typography>
            <Typography variant="body2" sx={{ color: '#475569', mt: 0.5 }}>
              {ar ? 'لا يجوز إغلاق المهمة قبل اكتمال الإثبات أو اعتماد الاستثناء من المشرف.' : 'A job should not close until proof is complete or a supervisor accepts the exception.'}
            </Typography>
          </Box>
          <Chip
            label={hasLiveProofData ? (ar ? `${progress}% مكتمل` : `${progress}% proof complete`) : (ar ? `${proofItems.length} متطلبات إلزامية` : `${proofItems.length} required checks`)}
            sx={{ bgcolor: hasLiveProofData && progress === 100 ? alpha('#10b981', 0.15) : alpha('#f59e0b', 0.15), color: hasLiveProofData && progress === 100 ? '#047857' : '#92400E', fontWeight: 950 }}
          />
        </Stack>
        {hasLiveProofData && <LinearProgress variant="determinate" value={progress} sx={{ height: 10, borderRadius: 999, bgcolor: '#E5E7EB', '& .MuiLinearProgress-bar': { bgcolor: progress === 100 ? '#10b981' : binThemeTokens.gold } }} />}
        <Stack spacing={1.25}>
          {/* Informational rows on the white shell — not buttons. Dark navy rows read as disabled controls. */}
          {proofItems.map((item) => (
            <Stack key={item.id} data-testid={`proof-item-${item.id}`} direction={isRTL ? 'row-reverse' : 'row'} spacing={1.5} alignItems="center" sx={{ px: 1.5, py: 1.1, bgcolor: item.complete ? alpha('#10b981', 0.08) : '#F8FAFC', border: `1px solid ${item.complete ? alpha('#10b981', 0.35) : '#E5E7EB'}`, borderRadius: 2 }}>
              <Box sx={{ color: item.complete ? '#047857' : '#64748B', display: 'flex' }}>{item.complete ? <CheckCircle2 size={18} /> : item.icon}</Box>
              <Typography sx={{ color: item.complete ? '#065F46' : '#1F2937', fontWeight: 700 }}>{item.label}</Typography>
              {hasLiveProofData && (
                <Typography variant="caption" sx={{ ml: isRTL ? 0 : 'auto', mr: isRTL ? 'auto' : 0, color: item.complete ? '#047857' : '#92400E', fontWeight: 800 }}>
                  {item.complete ? (ar ? 'مكتمل' : 'Done') : (ar ? 'مطلوب' : 'Required')}
                </Typography>
              )}
            </Stack>
          ))}
        </Stack>
        {!hasLiveProofData && (
          <Stack direction={{ xs: 'column', sm: isRTL ? 'row-reverse' : 'row' }} spacing={1.5} alignItems={{ xs: 'stretch', sm: 'center' }}>
            <Typography variant="body2" sx={{ color: '#475569', flex: 1 }}>
              {ar ? 'تُسجَّل هذه الإثباتات داخل كل مهمة مُسندة.' : 'You capture this evidence inside each assigned job.'}
            </Typography>
            <Button data-testid="proof-checklist-open-jobs" variant="contained" startIcon={<Briefcase size={16} />} onClick={() => navigate('/technician/jobs')} sx={{ bgcolor: binThemeTokens.gold, color: '#111827', fontWeight: 950, borderRadius: 3, '&:hover': { bgcolor: binThemeTokens.goldHover } }}>
              {ar ? 'فتح المهام المُسندة' : 'Open assigned jobs'}
            </Button>
          </Stack>
        )}
        {reworkFlag && (
          <Stack direction={isRTL ? 'row-reverse' : 'row'} spacing={1.25} alignItems="center" sx={{ p: 1.5, bgcolor: alpha('#ef4444', 0.12), border: `1px solid ${alpha('#ef4444', 0.35)}`, borderRadius: 3 }}>
            <RotateCcw size={18} color="#B91C1C" />
            <Typography sx={{ color: '#B91C1C', fontWeight: 950 }}>{ar ? 'مخاطر إعادة العمل نشطة. يوصى بمراجعة المشرف قبل الإغلاق.' : 'Rework risk is active. Supervisor review recommended before closure.'}</Typography>
          </Stack>
        )}
      </Stack>
    </Paper>
  );
}

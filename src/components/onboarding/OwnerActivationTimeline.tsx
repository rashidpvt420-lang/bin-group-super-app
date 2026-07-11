import React from 'react';
import {
  Box,
  Stepper,
  Step,
  StepLabel,
  Typography,
  Paper,
  Stack,
  alpha,
} from '@mui/material';
import { Clock, ShieldCheck } from 'lucide-react';
import { binThemeTokens } from '../../theme/binGroupTheme';
import { useLanguage } from '../../context/LanguageContext';

export type OwnerActivationStage =
  | 'SUBMITTED'
  | 'PAYMENT_PENDING'
  | 'ADMIN_REVIEW'
  | 'GEO_VERIFICATION'
  | 'INSPECTION'
  | 'CONTRACT_ACTIVATION'
  | 'DASHBOARD_UNLOCKED';

const STAGES: { key: OwnerActivationStage; labelEn: string; labelAr: string; detailEn: string }[] = [
  {
    key: 'SUBMITTED',
    labelEn: 'Submitted',
    labelAr: 'تم الإرسال',
    detailEn: 'Your property profile, documents, and contract signature are on file.',
  },
  {
    key: 'PAYMENT_PENDING',
    labelEn: 'Payment received / pending',
    labelAr: 'الدفع مستلم / قيد الانتظار',
    detailEn: 'BIN GROUP verifies mobilization payment or bank transfer proof.',
  },
  {
    key: 'ADMIN_REVIEW',
    labelEn: 'Admin reviewing documents',
    labelAr: 'مراجعة المستندات',
    detailEn: 'Title deed, Emirates ID, trade license, and service scope are checked.',
  },
  {
    key: 'GEO_VERIFICATION',
    labelEn: 'Geo verification',
    labelAr: 'التحقق الجغرافي',
    detailEn: 'Property pin is confirmed before technician dispatch is enabled.',
  },
  {
    key: 'INSPECTION',
    labelEn: 'Property inspection',
    labelAr: 'فحص العقار',
    detailEn: 'Optional site inspection may be scheduled for large or manual-location assets.',
  },
  {
    key: 'CONTRACT_ACTIVATION',
    labelEn: 'Contract approved',
    labelAr: 'العقد معتمد',
    detailEn: 'Institutional contract is activated and PPM schedule is prepared.',
  },
  {
    key: 'DASHBOARD_UNLOCKED',
    labelEn: 'Dashboard unlocked',
    labelAr: 'لوحة التحكم مفعّلة',
    detailEn: 'Owner portal, units, tenants, tickets, and financials become available.',
  },
];

function stageIndex(stage: OwnerActivationStage) {
  return STAGES.findIndex((s) => s.key === stage);
}

type Props = {
  activeStage?: OwnerActivationStage;
  requiresGeoReview?: boolean;
  intakeId?: string;
  slaHours?: number;
};

export default function OwnerActivationTimeline({
  activeStage = 'SUBMITTED',
  requiresGeoReview = false,
  intakeId,
  slaHours = 48,
}: Props) {
  const { isRTL, lang } = useLanguage();
  const activeIndex = stageIndex(activeStage);

  return (
    <Paper
      sx={{
        p: { xs: 2.5, md: 4 },
        borderRadius: 4,
        bgcolor: 'rgba(22, 22, 24, 0.85)',
        border: `1px solid ${alpha(binThemeTokens.gold, 0.25)}`,
        textAlign: isRTL ? 'right' : 'left',
      }}
    >
      <Stack spacing={2} sx={{ mb: 3 }}>
        <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 900, letterSpacing: 2 }}>
          {lang === 'ar' ? 'ماذا يحدث بعد ذلك؟' : 'WHAT HAPPENS NEXT'}
        </Typography>
        <Typography variant="h6" sx={{ color: '#FFF', fontWeight: 950 }}>
          {lang === 'ar' ? 'مسار تفعيل المالك' : 'Owner activation timeline'}
        </Typography>
        <Stack direction="row" spacing={1} alignItems="center" sx={{ color: 'rgba(255,255,255,0.65)' }}>
          <Clock size={16} />
          <Typography variant="body2" fontWeight={700}>
            {lang === 'ar'
              ? `ستراجع مجموعة بن طلبك خلال ${slaHours} ساعة عمل.`
              : `BIN GROUP will review your submission within ${slaHours} business hours.`}
          </Typography>
        </Stack>
        {intakeId ? (
          <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.45)', fontFamily: 'monospace' }}>
            Intake: {intakeId}
          </Typography>
        ) : null}
      </Stack>

      <Stepper
        activeStep={activeIndex}
        orientation="vertical"
        sx={{
          '& .MuiStepLabel-label': { color: 'rgba(255,255,255,0.45)', fontWeight: 700 },
          '& .MuiStepLabel-label.Mui-active': { color: binThemeTokens.gold },
          '& .MuiStepLabel-label.Mui-completed': { color: '#4ADE80' },
          '& .MuiStepIcon-root': { color: 'rgba(255,255,255,0.15)' },
          '& .MuiStepIcon-root.Mui-active': { color: binThemeTokens.gold },
          '& .MuiStepIcon-root.Mui-completed': { color: '#4ADE80' },
        }}
      >
        {STAGES.map((stage, index) => (
          <Step key={stage.key} completed={index < activeIndex}>
            <StepLabel>
              <Typography fontWeight={800}>{lang === 'ar' ? stage.labelAr : stage.labelEn}</Typography>
              {index === activeIndex ? (
                <Typography variant="caption" sx={{ display: 'block', color: 'rgba(255,255,255,0.55)', mt: 0.5 }}>
                  {stage.detailEn}
                </Typography>
              ) : null}
            </StepLabel>
          </Step>
        ))}
      </Stepper>

      {requiresGeoReview ? (
        <Box
          sx={{
            mt: 3,
            p: 2,
            borderRadius: 2,
            bgcolor: 'rgba(234, 179, 8, 0.08)',
            border: '1px solid rgba(234, 179, 8, 0.35)',
          }}
        >
          <Stack direction="row" spacing={1.5} alignItems="flex-start">
            <ShieldCheck size={18} color="#EAB308" style={{ marginTop: 2, flexShrink: 0 }} />
            <Box>
              <Typography variant="subtitle2" sx={{ color: '#EAB308', fontWeight: 900 }}>
                {lang === 'ar' ? 'التحقق الجغرافي مطلوب' : 'Admin geo verification required'}
              </Typography>
              <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.7)', mt: 0.5 }}>
                {lang === 'ar'
                  ? 'تم حفظ موقعك، لكن الإرسال الفني غير مفعّل حتى تؤكد مجموعة بن دبوس الخريطة.'
                  : 'Your location is saved, but technician dispatch stays off until BIN GROUP confirms the map pin.'}
              </Typography>
            </Box>
          </Stack>
        </Box>
      ) : null}
    </Paper>
  );
}

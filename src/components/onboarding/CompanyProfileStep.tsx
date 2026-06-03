import React from 'react';
import {
    Box,
    Typography,
    Grid,
    Paper,
    TextField,
    Button,
    Stack,
    Container,
    Divider,
    Chip,
    alpha
} from '@mui/material';
import {
    Building2,
    User,
    Phone,
    Mail,
    FileText,
    ArrowRight,
    Workflow,
    Bot,
    Landmark,
    Network,
    Camera,
    Clock3,
    WalletCards,
    ClipboardCheck
} from 'lucide-react';
import { useOnboardingStore } from '../../store/onboardingStore';
import { useLanguage } from '../../context/LanguageContext';
import { binThemeTokens } from '../../theme/binGroupTheme';

const CompanyProfileStep: React.FC<{ onNext: () => void }> = ({ onNext }) => {
    const { companyProfile, updateCompanyProfile } = useOnboardingStore();
    const { t, isRTL } = useLanguage();

    const canProceed = Boolean(companyProfile.name && companyProfile.email && companyProfile.phone);
    const iconSpacing = { marginRight: isRTL ? 0 : 12, marginLeft: isRTL ? 12 : 0, color: binThemeTokens.gold };

    const copy = isRTL ? {
        eyebrow: 'ملف BIN GROUP للملاك',
        title: 'نظام تشغيل عقاري موحد، وليس قائمة صيانة فقط.',
        subtitle: 'BIN GROUP يحول إدارة المباني متعددة الوحدات من واتساب متفرق وفواتير يدوية إلى سير عمل ذكي واحد: سجل مستأجرين، دفتر إيجارات، خصم رسوم الإدارة 5% وتكاليف الصيانة قبل التحويل، وتوجيه فني تلقائي مع إثبات مصور.',
        proof: 'صمم لأصحاب الأبراج، الفلل، المجالس، والمحافظ العقارية في الإمارات.',
        formTitle: 'بيانات المالك / الشركة',
        formDesc: 'أدخل بيانات الطرف الذي سيوقع اتفاقية BIN GROUP للصيانة وإدارة العقار.',
        button: t('onboarding.onboard_btn'),
        chips: ['Tenant Registry', 'Rent Ledger Waterfall', '5% Management Fee', 'SLA Timers', 'Before/After Proof', 'Asset-Adaptive SOPs'],
        cards: [
            {
                title: 'Home OS للعقار',
                desc: 'نستبدل الرسائل المتفرقة والفواتير اليدوية بسير عمل واحد يبدأ من طلب ذكي وينتهي بتقرير قابل للتدقيق.',
                points: ['طلب واحد بدل عشرات الرسائل', 'لوحة موحدة للمالك والمستأجر والفني', 'عقود، مدفوعات، وأدلة داخل نفس النظام']
            },
            {
                title: 'Total Care Hybrid',
                desc: 'نغطي دورة التشغيل كاملة: سجل المستأجرين، دفتر الإيجارات، خصم 5% إدارة وتكاليف الصيانة، ثم صافي التحويل للمالك.',
                points: ['Tenant registry', 'Rent ledger waterfall', 'Dispatch + payout visibility']
            },
            {
                title: 'Sovereign Property Intelligence',
                desc: 'النظام يتكيف مع نوع الأصل. البرج التجاري لا يدار مثل المجلس الخاص أو الفيلا السكنية.',
                points: ['Commercial tower SOP', 'Majlis readiness protocol', 'Villa/residential lifecycle']
            },
            {
                title: 'Agentic No-Call Efficiency',
                desc: 'المنصة تعمل كزميل رقمي: تصنف الأعطال، تفرض مؤقتات SLA، وتطلب إثبات قبل/بعد بدون اتصال من المالك.',
                points: ['AI triage', 'SLA enforcement', 'Photo proof before payout']
            }
        ]
    } : {
        eyebrow: 'BIN GROUP OWNER PROFILE',
        title: 'A unified property operations OS — not a maintenance list.',
        subtitle: 'BIN GROUP turns multi-unit property management from scattered WhatsApp messages and manual invoicing into one intelligent workflow: tenant registry, rent ledger waterfall, 5% management fee and maintenance-cost deductions before payout, and automated technician dispatch with photo proof.',
        proof: 'Built for UAE tower owners, villa portfolios, Majlis assets, and institutional property operators.',
        formTitle: 'Owner / Company Identity',
        formDesc: 'Enter the contracting identity that will sign the BIN GROUP maintenance and property management agreement.',
        button: t('onboarding.onboard_btn'),
        chips: ['Tenant Registry', 'Rent Ledger Waterfall', '5% Management Fee', 'SLA Timers', 'Before/After Proof', 'Asset-Adaptive SOPs'],
        cards: [
            {
                title: 'Home OS Concept',
                desc: 'We replace fragmented chats and manual invoice trails with a single prompt-to-workflow operating layer for the entire property.',
                points: ['One intelligent intake instead of scattered calls', 'Unified owner, tenant, technician, and admin workflow', 'Contracts, payments, evidence, and approvals in one system']
            },
            {
                title: 'Total Care Hybrid Package',
                desc: 'The platform handles the full lifecycle: tenant registry, rent ledger waterfall, 5% management fee deduction, maintenance-cost deduction, and owner payout visibility.',
                points: ['Tenant registry', 'Rent ledger waterfall', 'Dispatch + payout visibility']
            },
            {
                title: 'Sovereign Property Intelligence',
                desc: 'BIN GROUP adapts operating logic to the asset. A commercial tower is managed differently from a private Majlis, villa, or residential building.',
                points: ['Commercial tower SOP', 'Majlis readiness protocol', 'Villa/residential lifecycle']
            },
            {
                title: 'Agentic No-Call Efficiency',
                desc: 'The platform acts like a digital teammate: triaging issues, enforcing SLA timers, and producing before-and-after photo proof without the owner picking up the phone.',
                points: ['AI triage', 'SLA enforcement', 'Photo proof before payout']
            }
        ]
    };

    const icons = [Workflow, WalletCards, Landmark, Bot];
    const miniProof = [
        { icon: <Network size={18} />, label: copy.chips[0] },
        { icon: <WalletCards size={18} />, label: copy.chips[1] },
        { icon: <Clock3 size={18} />, label: copy.chips[3] },
        { icon: <Camera size={18} />, label: copy.chips[4] },
        { icon: <ClipboardCheck size={18} />, label: copy.chips[5] }
    ];

    const fieldSx = {
        '& .MuiInputLabel-root': { color: 'rgba(255,255,255,0.62)' },
        '& .MuiOutlinedInput-root': {
            color: '#FFF',
            bgcolor: 'rgba(255,255,255,0.035)',
            borderRadius: 3,
            '& fieldset': { borderColor: alpha(binThemeTokens.gold, 0.16) },
            '&:hover fieldset': { borderColor: alpha(binThemeTokens.gold, 0.36) },
            '&.Mui-focused fieldset': { borderColor: binThemeTokens.gold }
        }
    };

    return (
        <Box sx={{ py: 4 }} dir={isRTL ? 'rtl' : 'ltr'}>
            <Container maxWidth="lg">
                <Box sx={{ textAlign: 'center', mb: 6 }}>
                    <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 950, letterSpacing: 4, mb: 1.5, display: 'block' }}>
                        {copy.eyebrow}
                    </Typography>
                    <Typography variant="h3" fontWeight="950" sx={{ color: '#FFF', mb: 2, letterSpacing: -1.5, lineHeight: 1.05 }}>
                        {copy.title}
                    </Typography>
                    <Typography variant="h6" sx={{ color: 'rgba(255,255,255,0.66)', maxWidth: 940, mx: 'auto', lineHeight: 1.75, fontWeight: 400 }}>
                        {copy.subtitle}
                    </Typography>
                </Box>

                <Grid container spacing={4} alignItems="stretch">
                    <Grid item xs={12} lg={7}>
                        <Paper sx={{
                            height: '100%',
                            p: { xs: 3, md: 4 },
                            borderRadius: 6,
                            bgcolor: 'rgba(22, 22, 24, 0.72)',
                            border: `1px solid ${alpha(binThemeTokens.gold, 0.22)}`,
                            boxShadow: `0 24px 80px ${alpha('#000', 0.42)}`,
                            position: 'relative',
                            overflow: 'hidden'
                        }}>
                            <Box sx={{
                                position: 'absolute',
                                inset: 0,
                                opacity: 0.06,
                                background: `radial-gradient(circle at 12% 20%, ${binThemeTokens.gold} 0%, transparent 32%), radial-gradient(circle at 92% 82%, #FFFFFF 0%, transparent 30%)`,
                                pointerEvents: 'none'
                            }} />
                            <Stack spacing={3} sx={{ position: 'relative', zIndex: 1 }}>
                                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.2, justifyContent: { xs: 'center', md: 'flex-start' } }}>
                                    {copy.chips.map((chip) => (
                                        <Chip
                                            key={chip}
                                            label={chip}
                                            size="small"
                                            sx={{
                                                color: binThemeTokens.champagne,
                                                border: `1px solid ${alpha(binThemeTokens.gold, 0.28)}`,
                                                bgcolor: alpha(binThemeTokens.gold, 0.08),
                                                fontWeight: 850
                                            }}
                                        />
                                    ))}
                                </Box>

                                <Grid container spacing={2.5}>
                                    {copy.cards.map((card, index) => {
                                        const Icon = icons[index];
                                        return (
                                            <Grid item xs={12} md={6} key={card.title}>
                                                <Box sx={{
                                                    height: '100%',
                                                    p: 3,
                                                    borderRadius: 4,
                                                    bgcolor: alpha('#FFFFFF', 0.035),
                                                    border: `1px solid ${alpha(binThemeTokens.gold, 0.14)}`,
                                                    transition: 'all 0.25s ease',
                                                    '&:hover': {
                                                        transform: 'translateY(-4px)',
                                                        borderColor: alpha(binThemeTokens.gold, 0.45),
                                                        bgcolor: alpha(binThemeTokens.gold, 0.055)
                                                    }
                                                }}>
                                                    <Box sx={{ color: binThemeTokens.gold, mb: 2 }}>
                                                        <Icon size={26} />
                                                    </Box>
                                                    <Typography variant="h6" fontWeight="950" sx={{ color: '#FFF', mb: 1 }}>
                                                        {card.title}
                                                    </Typography>
                                                    <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.62)', lineHeight: 1.65, mb: 2 }}>
                                                        {card.desc}
                                                    </Typography>
                                                    <Stack spacing={1}>
                                                        {card.points.map((point) => (
                                                            <Box key={point} sx={{ display: 'flex', gap: 1, alignItems: 'flex-start', flexDirection: isRTL ? 'row-reverse' : 'row' }}>
                                                                <Box sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: binThemeTokens.gold, mt: 1 }} />
                                                                <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.74)', fontWeight: 750, lineHeight: 1.5 }}>
                                                                    {point}
                                                                </Typography>
                                                            </Box>
                                                        ))}
                                                    </Stack>
                                                </Box>
                                            </Grid>
                                        );
                                    })}
                                </Grid>

                                <Divider sx={{ borderColor: alpha(binThemeTokens.gold, 0.12) }} />

                                <Grid container spacing={1.5}>
                                    {miniProof.map((item) => (
                                        <Grid item xs={12} sm={6} md={4} key={item.label}>
                                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.2, p: 1.5, borderRadius: 3, bgcolor: alpha('#FFFFFF', 0.025), color: 'rgba(255,255,255,0.78)', flexDirection: isRTL ? 'row-reverse' : 'row' }}>
                                                <Box sx={{ color: binThemeTokens.gold }}>{item.icon}</Box>
                                                <Typography variant="caption" fontWeight="850">{item.label}</Typography>
                                            </Box>
                                        </Grid>
                                    ))}
                                </Grid>

                                <Typography variant="body2" sx={{ color: binThemeTokens.champagne, lineHeight: 1.8, fontWeight: 700 }}>
                                    {copy.proof}
                                </Typography>
                            </Stack>
                        </Paper>
                    </Grid>

                    <Grid item xs={12} lg={5}>
                        <Paper sx={{
                            height: '100%',
                            p: { xs: 3, md: 4 },
                            borderRadius: 6,
                            bgcolor: 'rgba(22, 22, 24, 0.9)',
                            border: `1px solid ${alpha(binThemeTokens.gold, 0.2)}`
                        }}>
                            <Stack spacing={3.2}>
                                <Box>
                                    <Typography variant="h5" fontWeight="950" sx={{ color: '#FFF', mb: 1 }}>
                                        {copy.formTitle}
                                    </Typography>
                                    <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.56)', lineHeight: 1.7 }}>
                                        {copy.formDesc}
                                    </Typography>
                                </Box>

                                <TextField
                                    fullWidth
                                    label={t('onboarding.company_name')}
                                    value={companyProfile.name}
                                    onChange={(e) => updateCompanyProfile({ name: e.target.value })}
                                    InputProps={{ startAdornment: <Building2 size={20} style={iconSpacing} /> }}
                                    sx={fieldSx}
                                />
                                <TextField
                                    fullWidth
                                    label={t('onboarding.trade_license')}
                                    value={companyProfile.licenseNumber}
                                    onChange={(e) => updateCompanyProfile({ licenseNumber: e.target.value })}
                                    InputProps={{ startAdornment: <FileText size={20} style={iconSpacing} /> }}
                                    sx={fieldSx}
                                />

                                <Divider sx={{ borderColor: alpha(binThemeTokens.gold, 0.12) }} />
                                <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 950, letterSpacing: 2, textAlign: isRTL ? 'right' : 'left' }}>
                                    {t('onboarding.primary_contact')}
                                </Typography>

                                <TextField
                                    fullWidth
                                    label={t('onboarding.contact_name')}
                                    value={companyProfile.contactPerson}
                                    onChange={(e) => updateCompanyProfile({ contactPerson: e.target.value })}
                                    InputProps={{ startAdornment: <User size={20} style={iconSpacing} /> }}
                                    sx={fieldSx}
                                />
                                <Grid container spacing={2}>
                                    <Grid item xs={12} md={6}>
                                        <TextField
                                            fullWidth
                                            label={t('onboarding.contact_phone')}
                                            value={companyProfile.phone}
                                            onChange={(e) => updateCompanyProfile({ phone: e.target.value })}
                                            InputProps={{ startAdornment: <Phone size={20} style={iconSpacing} /> }}
                                            sx={fieldSx}
                                        />
                                    </Grid>
                                    <Grid item xs={12} md={6}>
                                        <TextField
                                            fullWidth
                                            label={t('onboarding.contact_email')}
                                            value={companyProfile.email}
                                            onChange={(e) => updateCompanyProfile({ email: e.target.value })}
                                            InputProps={{ startAdornment: <Mail size={20} style={iconSpacing} /> }}
                                            sx={fieldSx}
                                        />
                                    </Grid>
                                </Grid>

                                <Button
                                    variant="contained"
                                    fullWidth
                                    size="large"
                                    onClick={onNext}
                                    disabled={!canProceed}
                                    endIcon={isRTL ? <ArrowRight style={{ transform: 'rotate(180deg)' }} /> : <ArrowRight />}
                                    sx={{
                                        mt: 1,
                                        py: 2,
                                        borderRadius: 4,
                                        background: `linear-gradient(135deg, ${binThemeTokens.gold}, ${binThemeTokens.goldLight})`,
                                        color: '#000',
                                        fontWeight: 950,
                                        boxShadow: `0 18px 42px ${alpha(binThemeTokens.gold, 0.24)}`
                                    }}
                                >
                                    {copy.button}
                                </Button>
                            </Stack>
                        </Paper>
                    </Grid>
                </Grid>
            </Container>
        </Box>
    );
};

export default CompanyProfileStep;

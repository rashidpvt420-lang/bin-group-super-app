import React from 'react';
import { Box, Typography, Button, Container, Stack, Grid, alpha, Divider } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { binThemeTokens } from '../theme/binGroupTheme';
import { useLanguage } from '@bin/shared';
import { ArrowRight, Shield, Globe, Building, TrendingUp, Crown, Mail, Phone, MapPin, Info, MessageSquare, Zap } from 'lucide-react';
import { CeoContactButtons } from '../components/CeoContactButtons';

type LandingCard = {
    title: string;
    desc: string;
    icon: React.ReactNode;
};

type WorkflowStep = {
    step: string;
    title: string;
    desc: string;
};

const LandingPage: React.FC = () => {
    const navigate = useNavigate();
    const { t, isRTL } = useLanguage();

    const copy = (en: string, ar: string) => (isRTL ? ar : en);

    const scrollToSection = (id: string) => {
        const element = document.getElementById(id);
        if (element) {
            element.scrollIntoView({ behavior: 'smooth' });
        }
    };

    const roleCards: LandingCard[] = [
        {
            title: copy('Owners', 'الملاك'),
            desc: copy(
                'See contracts, payments, properties, passports, approvals, rent collection, maintenance proof, technician ETA, SLA status, and evidence reports from one owner dashboard.',
                'يرى المالك العقود والمدفوعات والعقارات وجوازات العقار والموافقات وتحصيل الإيجار وإثبات الصيانة ووصول الفني وحالة اتفاقية الخدمة والتقارير من لوحة واحدة.'
            ),
            icon: <Crown size={42} />,
        },
        {
            title: copy('Tenants', 'المستأجرون'),
            desc: copy(
                'Report issues without calling, upload photos, track the technician, receive notifications, view documents, payments, amenities, gate passes, parcels, notices, and approve or dispute completed work.',
                'يرفع المستأجر البلاغ بدون اتصال، يرفع الصور، يتابع الفني، يستلم الإشعارات، يراجع المستندات والمدفوعات والخدمات والتصاريح والطرود والتنبيهات ويوافق أو يعترض على العمل المنجز.'
            ),
            icon: <Building size={42} />,
        },
        {
            title: copy('Technicians', 'الفنيون'),
            desc: copy(
                'Receive assigned missions, accept jobs, share live field status, upload before/after proof, close work with notes, and build a performance score from real SLA and MTTR data.',
                'يستلم الفني المهام، يقبل الطلب، يشارك حالة العمل الميداني، يرفع صور قبل وبعد، يغلق المهمة بالملاحظات، وتحتسب نتيجته من بيانات زمن الاستجابة الحقيقية.'
            ),
            icon: <Zap size={42} />,
        },
        {
            title: copy('Brokers', 'الوسطاء'),
            desc: copy(
                'Bring owner leads, tenant leads, contracts, and property opportunities with attribution proof so BIN GROUP can track who brought the deal and calculate commission approval.',
                'يجلب الوسيط فرص الملاك والمستأجرين والعقود والعقارات مع إثبات النسبة حتى يعرف النظام من جلب الصفقة ويحسب موافقة العمولة.'
            ),
            icon: <TrendingUp size={42} />,
        },
    ];

    const workflowSteps: WorkflowStep[] = [
        {
            step: '01',
            title: copy('Company profile and property intake', 'ملف الشركة وإدخال بيانات العقار'),
            desc: copy(
                'Owner understands what BIN GROUP does, then submits property details, title/asset data, location, units, service needs, and contact information.',
                'يفهم المالك خدمات BIN GROUP ثم يدخل بيانات العقار والملكية والموقع والوحدات والاحتياجات وبيانات التواصل.'
            ),
        },
        {
            step: '02',
            title: copy('Smart quote and contract scope', 'تسعير ذكي ونطاق العقد'),
            desc: copy(
                'The system calculates Maintenance Only, Property Management Only, or Full Maintenance & Property Management scope with deposit/payment-plan logic.',
                'يحسب النظام نطاق الصيانة فقط أو إدارة العقار فقط أو الصيانة والإدارة مع منطق الدفعة المقدمة وخطة الدفع.'
            ),
        },
        {
            step: '03',
            title: copy('Activation after approval/payment proof', 'التفعيل بعد الموافقة وإثبات الدفع'),
            desc: copy(
                'Admin verifies the owner/property/payment proof, activates the contract, unlocks the correct dashboard, and creates audit records.',
                'يتحقق الأدمن من المالك والعقار وإثبات الدفع ثم يفعل العقد ويفتح لوحة التحكم الصحيحة ويسجل الأثر التدقيقي.'
            ),
        },
        {
            step: '04',
            title: copy('Tenant-to-technician live workflow', 'مسار المستأجر إلى الفني'),
            desc: copy(
                'Tenant submits issue → AI/admin triage classifies priority → technician receives assignment → field status, map/ETA, proof photos, notification, owner visibility, close/approve/dispute.',
                'المستأجر يرفع البلاغ → الفرز الذكي/الأدمن يحدد الأولوية → الفني يستلم المهمة → حالة ميدانية وخريطة ووقت وصول وصور إثبات وإشعار ورؤية للمالك ثم إغلاق أو موافقة أو اعتراض.'
            ),
        },
    ];

    const proofItems = [
        copy('Property Passport: title, unit, compliance, expiry, inspection, asset and handover evidence.', 'جواز العقار: الملكية والوحدة والامتثال والانتهاء والتفتيش والأصول وإثبات التسليم.'),
        copy('Notifications: tenant, owner, technician, broker, and admin events must be visible and auditable.', 'الإشعارات: أحداث المستأجر والمالك والفني والوسيط والأدمن يجب أن تكون واضحة وقابلة للتدقيق.'),
        copy('PDFs: contracts, invoices, owner statements, evidence packs, certificates, and public verification hashes.', 'ملفات PDF: العقود والفواتير وكشوفات الملاك وحزم الإثبات والشهادات وروابط التحقق العامة.'),
        copy('Maps: property coordinates, technician field status, ETA, live route context, and audit-safe GPS timestamps.', 'الخرائط: إحداثيات العقار وحالة الفني ووقت الوصول والسياق الميداني وختم GPS قابل للتدقيق.'),
        copy('AI Studio: design request intake, quote context, render state, generated concept proof, and owner/tenant access rules.', 'استوديو الذكاء الاصطناعي: طلب التصميم وسياق التسعير وحالة التوليد وإثبات المفهوم وصلاحيات المالك والمستأجر.'),
    ];

    return (
        <Box
            sx={{
                minHeight: '100vh',
                bgcolor: 'background.default',
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden',
                position: 'relative',
            }}
        >
            <Box
                sx={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    backgroundImage: (theme) =>
                        theme.palette.mode === 'dark'
                            ? `linear-gradient(${binThemeTokens.black} 0%, transparent 40%), linear-gradient(90deg, rgba(198,167,94,0.03) 1px, transparent 1px), linear-gradient(rgba(198,167,94,0.03) 1px, transparent 1px)`
                            : `linear-gradient(#F8FAFC 0%, transparent 40%), linear-gradient(90deg, rgba(198,167,94,0.05) 1px, transparent 1px), linear-gradient(rgba(198,167,94,0.05) 1px, transparent 1px)`,
                    backgroundSize: '100% 100%, 60px 60px, 60px 60px',
                    zIndex: 0,
                }}
            />

            <Box
                sx={{
                    position: 'absolute',
                    top: '30%',
                    left: '50%',
                    transform: 'translate(-50%, -50%)',
                    width: '800px',
                    height: '800px',
                    background: `radial-gradient(circle, ${binThemeTokens.gold}11 0%, transparent 70%)`,
                    filter: 'blur(80px)',
                    zIndex: 0,
                }}
            />

            <Container maxWidth="lg" sx={{ position: 'relative', zIndex: 1, pt: { xs: 10, md: 20 }, pb: 10 }}>
                <Stack spacing={4} alignItems="center" textAlign="center">
                    <Typography
                        variant="overline"
                        sx={{ color: binThemeTokens.gold, fontWeight: 950, letterSpacing: 4 }}
                    >
                        {copy('BIN GROUP — UAE No-Call Property Operations Access Layer', 'BIN GROUP — طبقة الوصول لإدارة العقارات والصيانة بدون اتصال في الإمارات')}
                    </Typography>

                    <Typography
                        variant="h1"
                        sx={{
                            fontSize: { xs: '3.1rem', md: '5.6rem' },
                            fontWeight: 950,
                            color: 'text.primary',
                            lineHeight: 1,
                            letterSpacing: -2,
                            background: (theme) =>
                                theme.palette.mode === 'dark'
                                    ? 'linear-gradient(180deg, #FFFFFF 0%, #A1A1AA 100%)'
                                    : 'linear-gradient(180deg, #0F172A 0%, #475569 100%)',
                            WebkitBackgroundClip: 'text',
                            WebkitTextFillColor: 'transparent',
                        }}
                    >
                        {copy('One Platform for Owners, Tenants, Technicians, Brokers and Admin.', 'منصة واحدة للملاك والمستأجرين والفنيين والوسطاء والأدمن.')}
                        <br />
                        <Box component="span" sx={{ color: binThemeTokens.gold, WebkitTextFillColor: binThemeTokens.gold }}>
                            {copy('Everything tracked. Nothing hidden.', 'كل شيء موثق. لا شيء مخفي.')}
                        </Box>
                    </Typography>

                    <Typography variant="h6" sx={{ color: 'text.secondary', maxWidth: 920, fontWeight: 600, lineHeight: 1.7, fontSize: '1.2rem' }}>
                        {copy(
                            'BIN GROUP provides smart maintenance and property management for UAE assets: onboarding, contracts, payments, tenant service requests, technician dispatch, GPS/map proof, before/after evidence, notifications, PDFs, property passports, and public verification.',
                            'توفر BIN GROUP إدارة ذكية للصيانة والعقارات في الإمارات: تسجيل العقارات، العقود، المدفوعات، طلبات المستأجرين، إرسال الفنيين، إثبات GPS والخريطة، صور قبل وبعد، الإشعارات، ملفات PDF، جوازات العقار، والتحقق العام.'
                        )}
                    </Typography>

                    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={3} sx={{ mt: 2 }}>
                        <Button
                            variant="contained"
                            size="large"
                            onClick={() => navigate('/onboarding')}
                            endIcon={<ArrowRight style={{ transform: isRTL ? 'scaleX(-1)' : 'none' }} />}
                            sx={{
                                background: 'linear-gradient(135deg, #C6A75E, #E6C77A)',
                                color: '#000',
                                px: 5,
                                py: 2.25,
                                fontWeight: 950,
                                borderRadius: 100,
                                fontSize: '1rem',
                                boxShadow: `0 20px 40px ${alpha(binThemeTokens.gold, 0.3)}`,
                            }}
                        >
                            {copy('Start Owner Onboarding', 'ابدأ تسجيل المالك')}
                        </Button>
                        <Button
                            variant="outlined"
                            size="large"
                            onClick={() => navigate('/gateway')}
                            sx={{
                                borderColor: (theme) => alpha(theme.palette.text.primary, 0.2),
                                color: 'text.primary',
                                px: 5,
                                py: 2.25,
                                fontWeight: 950,
                                borderRadius: 100,
                                '&:hover': { borderColor: binThemeTokens.gold, bgcolor: alpha(binThemeTokens.gold, 0.05) },
                            }}
                        >
                            {copy('Login / Access Portal', 'تسجيل الدخول / بوابة الوصول')}
                        </Button>
                    </Stack>

                    <Stack direction="row" spacing={2} sx={{ mt: 1 }} flexWrap="wrap" justifyContent="center" useFlexGap>
                        <Button startIcon={<Building size={18} />} onClick={() => scrollToSection('services')} sx={{ color: 'text.secondary', fontWeight: 800 }}>{copy('What we do', 'ماذا نقدم')}</Button>
                        <Button startIcon={<Info size={18} />} onClick={() => scrollToSection('workflow')} sx={{ color: 'text.secondary', fontWeight: 800 }}>{copy('How onboarding works', 'كيف يعمل التسجيل')}</Button>
                        <Button startIcon={<Shield size={18} />} onClick={() => scrollToSection('proof')} sx={{ color: 'text.secondary', fontWeight: 800 }}>{copy('Proof system', 'نظام الإثبات')}</Button>
                        <Button startIcon={<MessageSquare size={18} />} onClick={() => scrollToSection('contact')} sx={{ color: 'text.secondary', fontWeight: 800 }}>{copy('Contact', 'تواصل')}</Button>
                    </Stack>
                </Stack>
            </Container>

            <Box id="services" sx={{ py: 12, bgcolor: (theme) => theme.palette.mode === 'dark' ? 'rgba(0,0,0,0.3)' : 'rgba(255,255,255,0.62)', backdropFilter: 'blur(20px)', position: 'relative', zIndex: 1 }}>
                <Container maxWidth="lg">
                    <Stack spacing={2} alignItems="center" textAlign="center" sx={{ mb: 7 }}>
                        <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 950, letterSpacing: 3 }}>
                            {copy('What people get from BIN GROUP', 'ما الذي يحصل عليه المستخدمون من BIN GROUP')}
                        </Typography>
                        <Typography variant="h3" fontWeight="950" sx={{ color: 'text.primary', letterSpacing: -1 }}>
                            {copy('Clear access for every profile', 'وصول واضح لكل ملف')}
                        </Typography>
                        <Typography sx={{ color: 'text.secondary', maxWidth: 800, fontSize: '1.08rem' }}>
                            {copy(
                                'The app must explain the value before asking users to login: who can use it, what each profile sees, and what happens after a request, contract, payment, or approval.',
                                'يجب أن يشرح التطبيق القيمة قبل طلب تسجيل الدخول: من يستخدمه، ماذا يرى كل ملف، وماذا يحدث بعد الطلب أو العقد أو الدفع أو الموافقة.'
                            )}
                        </Typography>
                    </Stack>

                    <Grid container spacing={4}>
                        {roleCards.map((card) => (
                            <Grid item xs={12} md={6} key={card.title}>
                                <Box
                                    sx={{
                                        p: 4,
                                        borderRadius: 6,
                                        bgcolor: (theme) => theme.palette.mode === 'dark' ? 'rgba(198,167,94,0.03)' : 'rgba(198,167,94,0.05)',
                                        border: `1px solid ${alpha(binThemeTokens.gold, 0.12)}`,
                                        textAlign: isRTL ? 'right' : 'left',
                                        height: '100%',
                                    }}
                                >
                                    <Box sx={{ color: binThemeTokens.gold, mb: 2 }}>{card.icon}</Box>
                                    <Typography variant="h5" fontWeight="950" sx={{ color: 'text.primary', mb: 1 }}>{card.title}</Typography>
                                    <Typography variant="body1" sx={{ color: 'text.secondary', lineHeight: 1.7 }}>{card.desc}</Typography>
                                </Box>
                            </Grid>
                        ))}
                    </Grid>
                </Container>
            </Box>

            <Container id="workflow" maxWidth="lg" sx={{ py: 12, position: 'relative', zIndex: 1 }}>
                <Grid container spacing={8} alignItems="flex-start">
                    <Grid item xs={12} md={4}>
                        <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 950, letterSpacing: 3 }}>
                            {copy('How onboarding works', 'كيف يعمل التسجيل')}
                        </Typography>
                        <Typography variant="h3" fontWeight="950" sx={{ color: 'text.primary', mt: 1, mb: 3, letterSpacing: -1 }}>
                            {copy('From company profile to active contract', 'من ملف الشركة إلى عقد فعال')}
                        </Typography>
                        <Typography sx={{ color: 'text.secondary', lineHeight: 1.8 }}>
                            {copy(
                                'The workflow must be understandable for owners before login and auditable for admin after submission. Every handoff should create a clear status, notification, and audit trail.',
                                'يجب أن يكون المسار مفهوماً للمالك قبل تسجيل الدخول وقابلاً للتدقيق للأدمن بعد الإرسال. كل انتقال يجب أن ينشئ حالة واضحة وإشعاراً وسجلاً تدقيقياً.'
                            )}
                        </Typography>
                    </Grid>
                    <Grid item xs={12} md={8}>
                        <Stack spacing={3}>
                            {workflowSteps.map((item) => (
                                <Box key={item.step} sx={{ p: 3, borderRadius: 5, border: `1px solid ${alpha(binThemeTokens.gold, 0.12)}`, bgcolor: alpha(binThemeTokens.gold, 0.03), textAlign: isRTL ? 'right' : 'left' }}>
                                    <Stack direction="row" spacing={3} alignItems="flex-start">
                                        <Typography variant="h2" fontWeight="950" sx={{ color: alpha(binThemeTokens.gold, 0.32), lineHeight: 1 }}>{item.step}</Typography>
                                        <Box>
                                            <Typography variant="h5" fontWeight="950" sx={{ color: 'text.primary', mb: 1 }}>{item.title}</Typography>
                                            <Typography sx={{ color: 'text.secondary', lineHeight: 1.7 }}>{item.desc}</Typography>
                                        </Box>
                                    </Stack>
                                </Box>
                            ))}
                        </Stack>
                    </Grid>
                </Grid>
            </Container>

            <Box id="proof" sx={{ py: 12, bgcolor: (theme) => alpha(binThemeTokens.gold, theme.palette.mode === 'dark' ? 0.035 : 0.055), position: 'relative', zIndex: 1 }}>
                <Container maxWidth="lg">
                    <Grid container spacing={8} alignItems="center">
                        <Grid item xs={12} md={6}>
                            <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 950, letterSpacing: 3 }}>
                                {copy('Proof-first operations', 'عمليات مبنية على الإثبات')}
                            </Typography>
                            <Typography variant="h3" fontWeight="950" sx={{ color: 'text.primary', mt: 1, mb: 3 }}>
                                {copy('Public launch must show evidence, not promises.', 'الإطلاق العام يجب أن يعرض إثباتاً وليس وعوداً.')}
                            </Typography>
                            <Typography sx={{ color: 'text.secondary', lineHeight: 1.8 }}>
                                {copy(
                                    'Every workflow should prove who did what, when it happened, which property/unit it belongs to, which contract/payment it affects, and whether the owner, tenant, technician, broker, or admin must act next.',
                                    'كل مسار يجب أن يثبت من قام بالفعل ومتى حدث ولأي عقار أو وحدة يتبع وما هو العقد أو الدفع المتأثر ومن يجب أن يتصرف بعد ذلك: المالك أو المستأجر أو الفني أو الوسيط أو الأدمن.'
                                )}
                            </Typography>
                            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ mt: 4 }}>
                                <Button variant="contained" onClick={() => navigate('/verify')} sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950 }}>
                                    {copy('Verify invoice', 'تحقق من فاتورة')}
                                </Button>
                                <Button variant="outlined" onClick={() => navigate('/verify-cert')} sx={{ borderColor: binThemeTokens.gold, color: 'text.primary', fontWeight: 950 }}>
                                    {copy('Verify certificate', 'تحقق من شهادة')}
                                </Button>
                            </Stack>
                        </Grid>
                        <Grid item xs={12} md={6}>
                            <Box sx={{ p: 4, borderRadius: 8, bgcolor: (theme) => theme.palette.mode === 'dark' ? '#0f172a' : '#fff', border: `1px solid ${alpha(binThemeTokens.gold, 0.12)}` }}>
                                <Stack spacing={2.5}>
                                    {proofItems.map((item) => (
                                        <Stack direction="row" spacing={2} alignItems="flex-start" key={item}>
                                            <Shield size={20} color={binThemeTokens.gold} />
                                            <Typography sx={{ color: 'text.secondary', lineHeight: 1.7, textAlign: isRTL ? 'right' : 'left' }}>{item}</Typography>
                                        </Stack>
                                    ))}
                                </Stack>
                            </Box>
                        </Grid>
                    </Grid>
                </Container>
            </Box>

            <Container id="about" maxWidth="lg" sx={{ py: 12, position: 'relative', zIndex: 1 }}>
                <Grid container spacing={8} alignItems="center">
                    <Grid item xs={12} md={6}>
                        <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 950, letterSpacing: 3 }}>
                            {t('landing.mission_overline')}
                        </Typography>
                        <Typography variant="h2" fontWeight="950" sx={{ color: 'text.primary', mb: 4, letterSpacing: -1 }}>
                            {t('landing.mission_title')}
                        </Typography>
                        <Typography variant="h6" sx={{ color: 'text.secondary', lineHeight: 1.8, fontWeight: 500, mb: 5 }}>
                            {t('landing.mission_desc')}
                        </Typography>

                        <Divider sx={{ mb: 5, borderColor: alpha(binThemeTokens.gold, 0.1) }} />

                        <Typography variant="h4" fontWeight="950" sx={{ color: 'text.primary', mb: 2 }}>
                            {t('landing.why_choose_us')}
                        </Typography>
                        <Typography variant="body1" sx={{ color: 'text.secondary', lineHeight: 1.8, fontSize: '1.05rem' }}>
                            {t('landing.why_choose_us_desc')}
                        </Typography>
                    </Grid>
                    <Grid item xs={12} md={6}>
                        <Box sx={{ p: 6, borderRadius: 10, background: `linear-gradient(135deg, ${alpha(binThemeTokens.gold, 0.05)}, transparent)`, border: `1px solid ${alpha(binThemeTokens.gold, 0.1)}`, position: 'relative', overflow: 'hidden' }}>
                            <Box sx={{ position: 'absolute', top: 0, right: 0, p: 4, color: binThemeTokens.gold, opacity: 0.1 }}>
                                <Globe size={200} />
                            </Box>
                            <Stack spacing={4}>
                                <Box>
                                    <Typography variant="h3" fontWeight="950" color={binThemeTokens.gold}>5</Typography>
                                    <Typography variant="subtitle1" fontWeight="800">{copy('Connected access profiles', 'ملفات وصول مترابطة')}</Typography>
                                </Box>
                                <Box>
                                    <Typography variant="h3" fontWeight="950" color={binThemeTokens.gold}>UAE</Typography>
                                    <Typography variant="subtitle1" fontWeight="800">{copy('Built for local property operations', 'مصمم لعمليات العقارات المحلية')}</Typography>
                                </Box>
                                <Box>
                                    <Typography variant="h3" fontWeight="950" color={binThemeTokens.gold}>100%</Typography>
                                    <Typography variant="subtitle1" fontWeight="800">{copy('Audit-first workflow design', 'تصميم مسارات مبني على التدقيق')}</Typography>
                                </Box>
                            </Stack>
                        </Box>
                    </Grid>
                </Grid>
            </Container>

            <Box id="contact" sx={{ py: 16, bgcolor: (theme) => theme.palette.mode === 'dark' ? 'rgba(198,167,94,0.02)' : 'rgba(198,167,94,0.04)', position: 'relative', zIndex: 1 }}>
                <Container maxWidth="lg">
                    <Grid container spacing={8} justifyContent="center" textAlign="center">
                        <Grid item xs={12} md={8}>
                            <Typography variant="h3" fontWeight="950" sx={{ color: 'text.primary', mb: 3 }}>
                                {t('landing.contact_title')}
                            </Typography>
                            <Typography variant="h6" sx={{ color: 'text.secondary', mb: 8 }}>
                                {t('support.subtitle')}
                            </Typography>
                            <Grid container spacing={4}>
                                <Grid item xs={12} md={4}>
                                    <Stack alignItems="center" spacing={2}>
                                        <Box sx={{ p: 2, borderRadius: '50%', bgcolor: alpha(binThemeTokens.gold, 0.1), color: binThemeTokens.gold }}><Mail /></Box>
                                        <Typography variant="body1" fontWeight="800">{t('landing.email')}</Typography>
                                    </Stack>
                                </Grid>
                                <Grid item xs={12} md={4}>
                                    <Stack alignItems="center" spacing={2}>
                                        <Box sx={{ p: 2, borderRadius: '50%', bgcolor: alpha(binThemeTokens.gold, 0.1), color: binThemeTokens.gold }}><Phone /></Box>
                                        <Typography variant="body1" fontWeight="800">{t('landing.phone')}</Typography>
                                    </Stack>
                                </Grid>
                                <Grid item xs={12} md={4}>
                                    <Stack alignItems="center" spacing={2}>
                                        <Box sx={{ p: 2, borderRadius: '50%', bgcolor: alpha(binThemeTokens.gold, 0.1), color: binThemeTokens.gold }}><MapPin /></Box>
                                        <Typography variant="body1" fontWeight="800">{t('landing.address')}</Typography>
                                    </Stack>
                                </Grid>
                            </Grid>
                        </Grid>
                    </Grid>
                </Container>
            </Box>

            <Box sx={{ py: 8, borderTop: (theme) => `1px solid ${alpha(theme.palette.text.primary, 0.05)}`, textAlign: 'center', position: 'relative', zIndex: 1 }}>
                <Container maxWidth="md">
                    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={3} justifyContent="center" alignItems="center" sx={{ mb: 4 }}>
                        {[
                            { label: t('footer.home'), href: '#' },
                            { label: t('footer.privacy'), href: '/privacy-policy' },
                            { label: t('footer.terms'), href: '/terms-of-service' },
                            { label: t('footer.support'), href: '/support' },
                        ].map((link) => (
                            <Typography
                                key={link.href}
                                component="a"
                                href={link.href}
                                onClick={(e) => {
                                    if (link.href === '#') {
                                        e.preventDefault();
                                        window.scrollTo({ top: 0, behavior: 'smooth' });
                                    }
                                }}
                                sx={{
                                    color: 'text.secondary',
                                    textDecoration: 'none',
                                    fontWeight: 800,
                                    fontSize: '0.9rem',
                                    '&:hover': { color: binThemeTokens.gold },
                                }}
                            >
                                {link.label}
                            </Typography>
                        ))}
                    </Stack>
                    <Box sx={{ display: 'flex', justifyContent: 'center', mb: 4 }}>
                        <CeoContactButtons variant="minimal" />
                    </Box>
                    <Typography variant="caption" sx={{ color: 'text.secondary', letterSpacing: 2, fontWeight: 900, display: 'block', mt: 1, opacity: 0.6 }}>
                        {t('footer.copyright')}
                    </Typography>
                </Container>
            </Box>
        </Box>
    );
};

export default LandingPage;

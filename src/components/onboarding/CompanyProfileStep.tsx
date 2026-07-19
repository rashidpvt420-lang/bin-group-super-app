import React from 'react';
import {
    Box, Typography, Grid, Paper, TextField, Button, Stack, Container, Divider, Chip, Alert, alpha
} from '@mui/material';
import {
    Building2, User, Phone, Mail, FileText, ArrowRight, Workflow, Bot, Landmark,
    Network, Camera, Clock3, WalletCards, ClipboardCheck, ShieldCheck
} from 'lucide-react';
import { useOnboardingStore } from '../../store/onboardingStore';
import { useLanguage } from '../../context/LanguageContext';
import { binThemeTokens } from '../../theme/binGroupTheme';

const normalizeUaePhone = (value: string) => value.replace(/[\s()-]/g, '').replace(/^00971/, '+971').replace(/^05/, '+9715');
const validEmail = (value: string) => /^\S+@\S+\.\S+$/.test(value.trim());
const validUaePhone = (value: string) => /^\+971\d{8,9}$/.test(normalizeUaePhone(value));

const CompanyProfileStep: React.FC<{ onNext: () => void }> = ({ onNext }) => {
    const { companyProfile, updateCompanyProfile } = useOnboardingStore();
    const { t, isRTL, lang } = useLanguage();
    const copy = (en: string, ar: string) => lang === 'ar' ? ar : en;
    const phoneValid = validUaePhone(companyProfile.phone);
    const emailValid = validEmail(companyProfile.email);
    const canProceed = Boolean(
        companyProfile.name.trim().length >= 2 &&
        companyProfile.licenseNumber.trim().length >= 4 &&
        companyProfile.contactPerson.trim().length >= 2 &&
        emailValid && phoneValid
    );
    const iconSpacing = { marginRight: isRTL ? 0 : 12, marginLeft: isRTL ? 12 : 0, color: binThemeTokens.gold };

    const chips = [
        copy('Tenant Registry', 'سجل المستأجرين'),
        copy('Direct-to-Owner Rent', 'الإيجار مباشرة للمالك'),
        copy('Separate 5% Fee Invoice', 'فاتورة منفصلة لرسوم 5٪'),
        copy('SLA Timers', 'مؤقتات مستوى الخدمة'),
        copy('Before/After Proof', 'إثبات قبل وبعد'),
        copy('Asset-Adaptive SOPs', 'إجراءات تتكيف مع العقار'),
    ];
    const cards = [
        {
            title: copy('Property Operations OS', 'نظام تشغيل العقار'),
            desc: copy(
                'Replace fragmented calls, chats and invoices with one audited workflow from request to completion.',
                'استبدل المكالمات والرسائل والفواتير المتفرقة بمسار موحّد قابل للتدقيق من الطلب حتى الإنجاز.'
            ),
            points: [
                copy('One verified service intake', 'طلب خدمة موثّق واحد'),
                copy('Owner, tenant, technician and admin coordination', 'تنسيق المالك والمستأجر والفني والإدارة'),
                copy('Contracts, payments and evidence in one system', 'العقود والمدفوعات والأدلة في نظام واحد'),
            ],
        },
        {
            title: copy('Direct-to-Owner Rent Model', 'نموذج الإيجار المباشر للمالك'),
            desc: copy(
                'Rent is paid directly to the Owner’s registered account. BIN GROUP invoices management fees and approved maintenance charges separately.',
                'يُدفع الإيجار مباشرة إلى حساب المالك المسجل. تصدر BIN GROUP فواتير منفصلة لرسوم الإدارة وتكاليف الصيانة المعتمدة.'
            ),
            points: [
                copy('BIN GROUP does not hold owner rent funds', 'BIN GROUP لا تحتفظ بأموال إيجار المالك'),
                copy('5% management fee is invoiced separately', 'تُفوتر رسوم الإدارة 5٪ بشكل منفصل'),
                copy('Maintenance variations require approval', 'تتطلب أعمال الصيانة الإضافية موافقة'),
            ],
        },
        {
            title: copy('Asset-Specific Operations', 'تشغيل مخصص حسب نوع العقار'),
            desc: copy(
                'A commercial tower, villa, school, mosque and Majlis receive different operating rules and evidence requirements.',
                'يحصل البرج التجاري والفيلا والمدرسة والمسجد والمجلس على قواعد تشغيل ومتطلبات إثبات مختلفة.'
            ),
            points: [
                copy('Portfolio and institutional workflows', 'مسارات المحافظ والعقارات المؤسسية'),
                copy('Property-specific maintenance matrix', 'مصفوفة صيانة خاصة بالعقار'),
                copy('Verified location and asset passport', 'موقع موثّق وجواز للعقار'),
            ],
        },
        {
            title: copy('No-Call Automation', 'أتمتة بدون اتصالات'),
            desc: copy(
                'AI triage, SLA controls and mandatory before/after proof reduce manual follow-up without removing human approval.',
                'يقلل تصنيف الذكاء الاصطناعي وضبط مستوى الخدمة وإثبات قبل/بعد من المتابعة اليدوية مع بقاء الموافقة البشرية.'
            ),
            points: [
                copy('AI-assisted triage', 'تصنيف بمساعدة الذكاء الاصطناعي'),
                copy('SLA escalation', 'تصعيد مستوى الخدمة'),
                copy('Photo proof before completion', 'إثبات مصور قبل الإغلاق'),
            ],
        },
    ];
    const icons = [Workflow, WalletCards, Landmark, Bot];
    const miniProof = [
        { icon: <Network size={18} />, label: chips[0] },
        { icon: <WalletCards size={18} />, label: chips[1] },
        { icon: <Clock3 size={18} />, label: chips[3] },
        { icon: <Camera size={18} />, label: chips[4] },
        { icon: <ClipboardCheck size={18} />, label: chips[5] },
    ];

    const fieldSx = {
        '& .MuiInputLabel-root': { color: 'rgba(255,255,255,0.62)' },
        '& .MuiOutlinedInput-root': {
            color: '#FFF', bgcolor: 'rgba(255,255,255,0.035)', borderRadius: 3,
            '& fieldset': { borderColor: alpha(binThemeTokens.gold, 0.16) },
            '&:hover fieldset': { borderColor: alpha(binThemeTokens.gold, 0.36) },
            '&.Mui-focused fieldset': { borderColor: binThemeTokens.gold },
        },
        '& .MuiFormHelperText-root': { color: 'rgba(255,255,255,0.54)' },
    };

    return (
        <Box sx={{ py: 4 }} dir={isRTL ? 'rtl' : 'ltr'}>
            <Container maxWidth="lg">
                <Box sx={{ textAlign: 'center', mb: 6 }}>
                    <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 950, letterSpacing: isRTL ? 0 : 4, mb: 1.5, display: 'block' }}>
                        {copy('BIN GROUP OWNER ONBOARDING', 'تسجيل ملاك BIN GROUP')}
                    </Typography>
                    <Typography variant="h3" fontWeight="950" sx={{ color: '#FFF', mb: 2, letterSpacing: isRTL ? 0 : -1.5, lineHeight: 1.05 }}>
                        {copy('One verified property-operations workflow.', 'مسار موثّق وموحّد لتشغيل العقار.')}
                    </Typography>
                    <Typography variant="h6" sx={{ color: 'rgba(255,255,255,0.66)', maxWidth: 940, mx: 'auto', lineHeight: 1.75, fontWeight: 400 }}>
                        {copy(
                            'Register the legal contracting identity. Rent remains in the Owner’s registered account; BIN GROUP fees and approved maintenance charges are invoiced separately.',
                            'سجّل الهوية القانونية للطرف المتعاقد. يبقى الإيجار في حساب المالك المسجل؛ وتُفوتر رسوم BIN GROUP وتكاليف الصيانة المعتمدة بشكل منفصل.'
                        )}
                    </Typography>
                </Box>

                <Grid container spacing={4} alignItems="stretch">
                    <Grid item xs={12} lg={7}>
                        <Paper sx={{ height: '100%', p: { xs: 3, md: 4 }, borderRadius: 6, bgcolor: 'rgba(22,22,24,0.72)', border: `1px solid ${alpha(binThemeTokens.gold, 0.22)}`, boxShadow: `0 24px 80px ${alpha('#000', 0.42)}` }}>
                            <Stack spacing={3}>
                                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.2, justifyContent: { xs: 'center', md: isRTL ? 'flex-end' : 'flex-start' } }}>
                                    {chips.map((chip) => <Chip key={chip} label={chip} size="small" sx={{ color: binThemeTokens.champagne, border: `1px solid ${alpha(binThemeTokens.gold, 0.28)}`, bgcolor: alpha(binThemeTokens.gold, 0.08), fontWeight: 850 }} />)}
                                </Box>
                                <Grid container spacing={2.5}>
                                    {cards.map((card, index) => {
                                        const Icon = icons[index];
                                        return (
                                            <Grid item xs={12} md={6} key={card.title}>
                                                <Box sx={{ height: '100%', p: 3, borderRadius: 4, bgcolor: alpha('#FFFFFF', 0.035), border: `1px solid ${alpha(binThemeTokens.gold, 0.14)}` }}>
                                                    <Box sx={{ color: binThemeTokens.gold, mb: 2 }}><Icon size={26} /></Box>
                                                    <Typography variant="h6" fontWeight="950" sx={{ color: '#FFF', mb: 1 }}>{card.title}</Typography>
                                                    <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.62)', lineHeight: 1.65, mb: 2 }}>{card.desc}</Typography>
                                                    <Stack spacing={1}>{card.points.map((point) => <Box key={point} sx={{ display: 'flex', gap: 1, alignItems: 'flex-start', flexDirection: isRTL ? 'row-reverse' : 'row' }}><Box sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: binThemeTokens.gold, mt: 1 }} /><Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.74)', fontWeight: 750, lineHeight: 1.5 }}>{point}</Typography></Box>)}</Stack>
                                                </Box>
                                            </Grid>
                                        );
                                    })}
                                </Grid>
                                <Divider sx={{ borderColor: alpha(binThemeTokens.gold, 0.12) }} />
                                <Grid container spacing={1.5}>{miniProof.map((item) => <Grid item xs={12} sm={6} md={4} key={item.label}><Box sx={{ display: 'flex', alignItems: 'center', gap: 1.2, p: 1.5, borderRadius: 3, bgcolor: alpha('#FFFFFF', 0.025), color: 'rgba(255,255,255,0.78)', flexDirection: isRTL ? 'row-reverse' : 'row' }}><Box sx={{ color: binThemeTokens.gold }}>{item.icon}</Box><Typography variant="caption" fontWeight="850">{item.label}</Typography></Box></Grid>)}</Grid>
                            </Stack>
                        </Paper>
                    </Grid>

                    <Grid item xs={12} lg={5}>
                        <Paper sx={{ height: '100%', p: { xs: 3, md: 4 }, borderRadius: 6, bgcolor: 'rgba(22,22,24,0.9)', border: `1px solid ${alpha(binThemeTokens.gold, 0.2)}` }}>
                            <Stack spacing={3.2}>
                                <Box>
                                    <Typography variant="h5" fontWeight="950" sx={{ color: '#FFF', mb: 1 }}>{copy('Owner / Company Identity', 'هوية المالك / الشركة')}</Typography>
                                    <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.56)', lineHeight: 1.7 }}>{copy('Use the exact legal identity that will sign the service agreement.', 'استخدم الهوية القانونية المطابقة للطرف الذي سيوقع اتفاقية الخدمات.')}</Typography>
                                </Box>
                                <Alert severity="info" icon={<ShieldCheck size={20} />}>{copy('The legal name and identity reference will be checked against the uploaded KYC documents.', 'سيتم التحقق من الاسم القانوني ومرجع الهوية مقابل مستندات التحقق المرفوعة.')}</Alert>
                                <TextField fullWidth required label={t('onboarding.company_name')} value={companyProfile.name} onChange={(event) => updateCompanyProfile({ name: event.target.value })} InputProps={{ startAdornment: <Building2 size={20} style={iconSpacing} /> }} helperText={copy('Company legal name or individual Owner full legal name.', 'الاسم القانوني للشركة أو الاسم القانوني الكامل للمالك الفرد.')} sx={fieldSx} />
                                <TextField fullWidth required label={t('onboarding.trade_license')} value={companyProfile.licenseNumber} onChange={(event) => updateCompanyProfile({ licenseNumber: event.target.value })} InputProps={{ startAdornment: <FileText size={20} style={iconSpacing} /> }} helperText={copy('Trade licence number or Emirates ID reference for an individual Owner.', 'رقم الرخصة التجارية أو مرجع الهوية الإماراتية للمالك الفرد.')} sx={fieldSx} />
                                <Divider sx={{ borderColor: alpha(binThemeTokens.gold, 0.12) }} />
                                <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 950, letterSpacing: isRTL ? 0 : 2, textAlign: isRTL ? 'right' : 'left' }}>{t('onboarding.primary_contact')}</Typography>
                                <TextField fullWidth required label={t('onboarding.contact_name')} value={companyProfile.contactPerson} onChange={(event) => updateCompanyProfile({ contactPerson: event.target.value })} InputProps={{ startAdornment: <User size={20} style={iconSpacing} /> }} sx={fieldSx} />
                                <Grid container spacing={2}>
                                    <Grid item xs={12} md={6}><TextField fullWidth required error={Boolean(companyProfile.phone) && !phoneValid} label={t('onboarding.contact_phone')} value={companyProfile.phone} onChange={(event) => updateCompanyProfile({ phone: event.target.value })} InputProps={{ startAdornment: <Phone size={20} style={iconSpacing} /> }} helperText={copy('Use UAE format, for example +9715XXXXXXXX.', 'استخدم صيغة الإمارات، مثل +9715XXXXXXXX.')} sx={fieldSx} /></Grid>
                                    <Grid item xs={12} md={6}><TextField fullWidth required error={Boolean(companyProfile.email) && !emailValid} label={t('onboarding.contact_email')} value={companyProfile.email} onChange={(event) => updateCompanyProfile({ email: event.target.value.trim() })} InputProps={{ startAdornment: <Mail size={20} style={iconSpacing} /> }} helperText={copy('This email becomes the verified Owner account.', 'سيصبح هذا البريد حساب المالك الموثق.')} sx={fieldSx} /></Grid>
                                </Grid>
                                <Button variant="contained" fullWidth size="large" onClick={onNext} disabled={!canProceed} endIcon={isRTL ? <ArrowRight style={{ transform: 'rotate(180deg)' }} /> : <ArrowRight />} sx={{ mt: 1, py: 2, borderRadius: 4, background: `linear-gradient(135deg, ${binThemeTokens.gold}, ${binThemeTokens.goldLight})`, color: '#000', fontWeight: 950, boxShadow: `0 18px 42px ${alpha(binThemeTokens.gold, 0.24)}` }}>
                                    {copy('Continue to Account Verification', 'المتابعة إلى التحقق من الحساب')}
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

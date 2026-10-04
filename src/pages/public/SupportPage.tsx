import React from 'react';
import { Box, Button, Container, Typography, Paper, Grid, Stack } from '@mui/material';
import { Mail, Phone, MapPin, MessageCircle, MessagesSquare } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { binThemeTokens } from '../../theme/binGroupTheme';
import { useLanguage } from '@bin/shared';

const BIN_PUBLIC_CONTACT = {
    email: 'owner@bin-group.com',
    whatsapp: '+971 55 2423233',
    phone: '+971 55 7474560',
};

const digits = (value: string) => value.replace(/[^\d+]/g, '');

// Inside the technician portal (/technician/support, reached from "Contact Operations Base" on a
// job) this page used to render a black #000 block with owner-onboarding and demo CTAs. Field staff
// need readable contacts and a way to reach operations, so the portal variant is light and offers
// BIN Connect, call and WhatsApp actions. The public /support page keeps its existing design.
const SUPPORT_PORTAL_TONES = {
    ink: '#111827',
    muted: '#475467',
    gold: '#7A5C12',
    line: '#E5E7EB',
} as const;

const SupportPage: React.FC = () => {
    const { lang, isRTL } = useLanguage();
    const location = useLocation();
    const navigate = useNavigate();
    const label = (en: string, ar: string) => lang === 'ar' ? ar : en;
    const technicianPortal = location.pathname.startsWith('/technician');
    const heading = technicianPortal ? SUPPORT_PORTAL_TONES.gold : binThemeTokens.gold;
    const titleColor = technicianPortal ? SUPPORT_PORTAL_TONES.ink : 'white';
    const bodyColor = technicianPortal ? SUPPORT_PORTAL_TONES.muted : binThemeTokens.textSecondary;

    return (
        <Box data-testid={technicianPortal ? 'technician-support-page' : 'public-support-page'} sx={{ minHeight: technicianPortal ? 'auto' : '100vh', bgcolor: technicianPortal ? 'transparent' : '#000', py: technicianPortal ? 2 : 8, direction: isRTL ? 'rtl' : 'ltr' }}>
            <Container maxWidth="md">
                <Paper sx={{ p: { xs: 3, md: 6 }, bgcolor: technicianPortal ? '#FFFFFF' : 'rgba(255,255,255,0.02)', border: technicianPortal ? `1px solid ${SUPPORT_PORTAL_TONES.line}` : '1px solid rgba(198,167,94,0.1)', borderRadius: 4 }}>
                    <Typography variant="h3" fontWeight="900" sx={{ color: technicianPortal ? SUPPORT_PORTAL_TONES.ink : binThemeTokens.gold, mb: 4, textAlign: isRTL ? 'right' : 'left' }}>
                        {technicianPortal ? label('Contact BIN GROUP operations', 'تواصل مع عمليات BIN GROUP') : label('Contact BIN GROUP', 'تواصل مع BIN GROUP')}
                    </Typography>

                    <Typography variant="body1" sx={{ color: bodyColor, mb: 6, textAlign: isRTL ? 'right' : 'left' }}>
                        {technicianPortal
                            ? label('Message the operations team in BIN Connect, or call / WhatsApp the operations line for anything that blocks a job (access, safety, parts, tenant not available).', 'راسل فريق العمليات عبر BIN Connect أو اتصل / راسل خط العمليات عبر واتساب لأي أمر يعيق المهمة (الدخول، السلامة، القطع، عدم توفر المستأجر).')
                            : label('Secure communication channel for owners, tenants, brokers, technicians, and property partners. For property onboarding, submit the property first; BIN GROUP review and physical inspection come before the final quotation, contract, payment and activation.', 'قناة تواصل آمنة للملاك والمستأجرين والوسطاء والفنيين وشركاء العقارات. لتسجيل العقار، قدّم العقار أولاً؛ تأتي مراجعة BIN GROUP والفحص الميداني قبل عرض السعر النهائي والعقد والدفع والتفعيل.')}
                    </Typography>

                    <Grid container spacing={4} sx={{ flexDirection: isRTL ? 'row-reverse' : 'row' }}>
                        <Grid item xs={12} md={4}>
                            <Box sx={{ p: 3, bgcolor: technicianPortal ? '#F8F9FB' : 'rgba(255,255,255,0.01)', borderRadius: 2, textAlign: 'center' }}>
                                <Mail size={32} color={heading} style={{ marginBottom: '16px' }} />
                                <Typography variant="h6" color={titleColor} fontWeight="700">{label('Email', 'البريد الإلكتروني')}</Typography>
                                <Typography variant="body2" {...(technicianPortal ? { sx: { color: bodyColor } } : { color: 'textSecondary' })}>{BIN_PUBLIC_CONTACT.email}</Typography>
                            </Box>
                        </Grid>
                        <Grid item xs={12} md={4}>
                            <Box sx={{ p: 3, bgcolor: technicianPortal ? '#F8F9FB' : 'rgba(255,255,255,0.01)', borderRadius: 2, textAlign: 'center' }}>
                                <Phone size={32} color={heading} style={{ marginBottom: '16px' }} />
                                <Typography variant="h6" color={titleColor} fontWeight="700">{label('WhatsApp', 'واتساب')}</Typography>
                                <Typography variant="body2" {...(technicianPortal ? { sx: { color: bodyColor } } : { color: 'textSecondary' })}>{BIN_PUBLIC_CONTACT.whatsapp}</Typography>
                            </Box>
                        </Grid>
                        <Grid item xs={12} md={4}>
                            <Box sx={{ p: 3, bgcolor: technicianPortal ? '#F8F9FB' : 'rgba(255,255,255,0.01)', borderRadius: 2, textAlign: 'center' }}>
                                <MapPin size={32} color={heading} style={{ marginBottom: '16px' }} />
                                <Typography variant="h6" color={titleColor} fontWeight="700">{label('Phone', 'الهاتف')}</Typography>
                                <Typography variant="body2" {...(technicianPortal ? { sx: { color: bodyColor } } : { color: 'textSecondary' })}>{BIN_PUBLIC_CONTACT.phone}</Typography>
                            </Box>
                        </Grid>
                    </Grid>

                    {technicianPortal ? (
                        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ mt: 6, justifyContent: 'center' }}>
                            <Button data-testid="technician-support-bin-connect" onClick={() => navigate('/technician/bin-connect')} variant="contained" startIcon={<MessagesSquare size={17} />} sx={{ bgcolor: binThemeTokens.gold, color: '#111827', fontWeight: 950 }}>
                                {label('Message operations', 'راسل العمليات')}
                            </Button>
                            <Button data-testid="technician-support-call" component="a" href={`tel:${digits(BIN_PUBLIC_CONTACT.phone)}`} variant="outlined" startIcon={<Phone size={17} />} sx={{ color: SUPPORT_PORTAL_TONES.ink, borderColor: '#D0D5DD', bgcolor: '#FFFFFF', fontWeight: 950 }}>
                                {label('Call operations', 'اتصل بالعمليات')}
                            </Button>
                            <Button data-testid="technician-support-whatsapp" component="a" href={`https://wa.me/${digits(BIN_PUBLIC_CONTACT.whatsapp).replace('+', '')}`} target="_blank" rel="noopener noreferrer" variant="outlined" startIcon={<MessageCircle size={17} />} sx={{ color: SUPPORT_PORTAL_TONES.ink, borderColor: '#D0D5DD', bgcolor: '#FFFFFF', fontWeight: 950 }}>
                                {label('WhatsApp operations', 'واتساب العمليات')}
                            </Button>
                        </Stack>
                    ) : (
                        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ mt: 6, justifyContent: 'center' }}>
                            <Button component="a" href="/onboarding" variant="contained" startIcon={<MessageCircle size={17} />} sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950 }}>
                                {label('Request Support', 'اطلب الدعم')}
                            </Button>
                            <Button component="a" href="/request-demo" variant="outlined" sx={{ color: binThemeTokens.gold, borderColor: binThemeTokens.gold, fontWeight: 950 }}>
                                {label('Schedule Demo', 'احجز عرضاً توضيحياً')}
                            </Button>
                        </Stack>
                    )}
                </Paper>
            </Container>
        </Box>
    );
};

export default SupportPage;

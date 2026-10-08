import React from 'react';
import { Box, Container, Typography, Grid, Paper, Stack, alpha } from '@mui/material';
import { Shield, Lock, Server, FileText, CheckCircle2 } from 'lucide-react';
import { binThemeTokens } from '../../theme/binGroupTheme';

// Using shared Nav component for consistent public look
import { useLanguage } from '../../context/LanguageContext';

const PublicSecurityPage = () => {
    const { isRTL, lang } = useLanguage();
    
    const content = {
        en: {
            title: 'Platform Security & Architecture',
            subtitle: 'Enterprise-grade protection for UAE real estate operations.',
            cloudIdentity: {
                title: 'Cloud Identity & Authentication',
                desc: 'Strict role-based access control (RBAC) uses Firebase Authentication and server-side authorization. Administrative privileged actions require the configured MFA and authorization controls.',
            },
            appCheck: {
                title: 'Application Check Enforcement',
                desc: 'Protected Firebase callables use App Check and server-side authorization, while Firestore and Storage rules enforce role and ownership boundaries. Public/read-only surfaces remain limited to the data explicitly exposed by policy.',
            },
            auditLogs: {
                title: 'Immutable Audit Logging',
                desc: 'Protected financial, maintenance, contract and administrative operations write server-authoritative audit evidence. Hashes are attached to immutable evidence artifacts where required, and retention follows the configured data-retention class and applicable obligations.',
            },
            paymentVaults: {
                title: 'Secure Payment Vaults',
                desc: 'Current Owner activation accepts Cash or Cheque evidence only under the active payment policy. Card/Stripe and bank-transfer activation are disabled unless a separately approved provider policy is enabled and verified.',
            }
        },
        ar: {
            title: 'أمن المنصة والبنية التحتية',
            subtitle: 'حماية بمستوى المؤسسات للعمليات العقارية في الإمارات.',
            cloudIdentity: {
                title: 'الهوية السحابية والتوثيق',
                desc: 'يستخدم التحكم في الوصول المستند إلى الأدوار (RBAC) مصادقة Firebase والتحقق من الصلاحيات على الخادم. وتتطلب العمليات الإدارية الحساسة ضوابط المصادقة متعددة العوامل والصلاحيات المهيأة.',
            },
            appCheck: {
                title: 'فرض التحقق من التطبيق',
                desc: 'تستخدم وظائف Firebase المحمية App Check والتحقق من الصلاحيات على الخادم، بينما تفرض قواعد Firestore وStorage حدود الدور والملكية. تقتصر الأسطح العامة أو للقراءة فقط على البيانات المسموح بها صراحةً.',
            },
            auditLogs: {
                title: 'سجلات تدقيق غير قابلة للتغيير',
                desc: 'تُنشئ العمليات المالية وعمليات الصيانة والعقود والإدارة المحمية أدلة تدقيق معتمدة من الخادم. وتُرفق البصمات الرقمية بملفات الأدلة غير القابلة للتغيير عند الحاجة، وتخضع مدة الاحتفاظ لفئة البيانات والالتزامات المطبقة.',
            },
            paymentVaults: {
                title: 'خزائن الدفع الآمنة',
                desc: 'يقتصر تفعيل عقود المالك حاليًا على إثبات الدفع نقدًا أو بالشيك وفق سياسة الدفع النشطة. ولا تكون مدفوعات البطاقات أو Stripe أو التحويل البنكي متاحة إلا بعد اعتماد سياسة مزود منفصلة والتحقق منها.',
            }
        }
    };

    const t = lang === 'ar' ? content.ar : content.en;

    const sections = [
        { key: 'cloudIdentity', icon: <Lock size={32} color={binThemeTokens.gold} />, data: t.cloudIdentity },
        { key: 'appCheck', icon: <Server size={32} color={binThemeTokens.gold} />, data: t.appCheck },
        { key: 'auditLogs', icon: <FileText size={32} color={binThemeTokens.gold} />, data: t.auditLogs },
        { key: 'paymentVaults', icon: <Shield size={32} color={binThemeTokens.gold} />, data: t.paymentVaults }
    ];

    return (
        <Box sx={{ minHeight: '100vh', bgcolor: '#F8F9FB', direction: isRTL ? 'rtl' : 'ltr', pb: 10 }}>
            {/* Header */}
            <Box sx={{ bgcolor: '#020617', py: 8, color: '#fff', textAlign: 'center' }}>
                <Container maxWidth="md">
                    <Shield size={48} color={binThemeTokens.gold} style={{ marginBottom: 16 }} />
                    <Typography variant="h3" fontWeight={950} sx={{ mb: 2 }}>{t.title}</Typography>
                    <Typography variant="h6" sx={{ color: 'rgba(255,255,255,0.7)', fontWeight: 700 }}>
                        {t.subtitle}
                    </Typography>
                </Container>
            </Box>

            {/* Content */}
            <Container maxWidth="lg" sx={{ mt: -4 }}>
                <Grid container spacing={4}>
                    {sections.map((section) => (
                        <Grid item xs={12} md={6} key={section.key}>
                            <Paper sx={{ p: 4, height: '100%', borderRadius: 4, boxShadow: '0 12px 32px rgba(0,0,0,0.05)', border: '1px solid #E5E7EB' }}>
                                <Box sx={{ display: 'flex', alignItems: 'center', mb: 3 }}>
                                    <Box sx={{ p: 2, bgcolor: alpha(binThemeTokens.gold, 0.1), borderRadius: 3, mr: isRTL ? 0 : 2, ml: isRTL ? 2 : 0 }}>
                                        {section.icon}
                                    </Box>
                                    <Typography variant="h5" fontWeight={900} sx={{ color: '#111827' }}>
                                        {section.data.title}
                                    </Typography>
                                </Box>
                                <Typography variant="body1" sx={{ color: '#4B5563', lineHeight: 1.8, fontWeight: 700 }}>
                                    {section.data.desc}
                                </Typography>
                            </Paper>
                        </Grid>
                    ))}
                </Grid>

                <Paper sx={{ mt: 8, p: 4, borderRadius: 4, bgcolor: '#020617', color: '#fff', textAlign: 'center' }}>
                    <CheckCircle2 size={40} color={binThemeTokens.gold} style={{ marginBottom: 16 }} />
                    <Typography variant="h5" fontWeight={950} sx={{ mb: 2 }}>
                        {lang === 'ar' ? 'جاهزية الإطلاق الآمن' : 'Secure Launch Readiness'}
                    </Typography>
                    <Typography variant="body1" sx={{ color: 'rgba(255,255,255,0.7)', maxWidth: 600, mx: 'auto', fontWeight: 700 }}>
                        {lang === 'ar' 
                            ? 'تخضع منصة مجموعة بن للمراقبة النشطة بواسطة جدار الحماية وتتبع أنظمة الإنذار المبكر للكشف عن التهديدات.' 
                            : 'The BIN GROUP platform is actively monitored by firewall and tracks early-warning systems for threat detection.'}
                    </Typography>
                </Paper>
            </Container>
        </Box>
    );
};

export default PublicSecurityPage;

import React, { createContext, useContext, useState, ReactNode, useEffect } from "react";
import { Box } from "@mui/material";

type Language = 'en' | 'ar';

interface LanguageContextType {
    lang: Language;
    setLang: (lang: Language) => void;
    t: (key: string, variables?: Record<string, any>) => string;
    tx: (key: string, fallback: string, variables?: Record<string, any>) => string;
    isRTL: boolean;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

const translations: Record<Language, Record<string, string>> = {
    en: {
        'admin.active_tenants': 'ACTIVE TENANTS',
        'admin.active_tickets': 'ACTIVE TICKETS',
        'admin.amount': 'AMOUNT',
        'admin.contract_ref': 'CONTRACT REF',
        'admin.dashboard': 'ADMIN DASHBOARD',
        'admin.system_health': 'SYSTEM HEALTH',
        'admin.total_revenue': 'TOTAL REVENUE',
        'analysis.efficiency': 'OPERATIONAL EFFICIENCY',
        'common.currency': 'AED',
        'common.currency_aed': 'AED',
        'dash.command_subtitle': 'Institutional Grade Auditing & National Zone Interface',
        'dash.declined': 'DECLINED',
        'dash.kpi.net_roi': 'NET ROI',
        'dash.proposed': 'PROPOSED',
        'dash.proposed_roi': 'PROPOSED ROI',
        'dash.realized_roi': 'REALIZED ROI',
        'dash.risk_mitigation': 'RISK MITIGATION',
        'dash.sanctioned': 'SANCTIONED',
        'dash.sovereign_ai': 'SOVEREIGN AI',
        'fin.burn': 'BURN',
        'fin.income': 'INCOME',
        'fin.logs_title': 'SYSTEMIC LEDGER LOGS',
        'fin.log.date': 'DATE',
        'fin.log.status': 'STATUS',
        'fin.total_deductions': 'TOTAL DEDUCTIONS',
        'landing.cta': 'Onboard Your Asset →',
        'landing.subtitle': 'BIN GROUP is the UAE\'s premier institutional asset management platform.',
        'landing.title': 'The Operating System for UAE Real Estate.',
        'landing.transparency_title': 'GROWTH & RISK TRANSPARENCY',
        'nav.admin': 'BIN-Groups Admin',
        'nav.administry': 'ADMINISTRY',
        'nav.audit': 'Institutional Audit',
        'nav.brokers': 'Brokers',
        'nav.dashboard': 'Dashboard',
        'nav.financial': 'Financials',
        'nav.financials': 'Treasury',
        'nav.live_map': 'Live Map',
        'nav.logout': 'Logout',
        'nav.onboarding': 'Onboarding',
        'nav.operations': 'OPERATIONS',
        'nav.owner_portal_link': 'Owner Portal ↗',
        'nav.reports': 'Reports',
        'nav.settings': 'Privacy Policy',
        'nav.sos_feed': 'SOS Feed',
        'nav.sovereign_core': 'SOVEREIGN CORE',
        'nav.support': 'Support',
        'nav.tech': 'Technician',
        'nav.technicians': 'TECHNICIAN CORPS',
        'nav.tenants': 'Tenants',
        'nav.tickets': 'Mission Logs',
        'onboarding.payment.proceed_btn': 'ENTER DASHBOARD',
        'onboarding.property_details': 'PROPERTIES',
        'onboarding.title': 'Institutional Onboarding',
        'status.settled': 'SETTLED',
        'status.estimated': 'ESTIMATED',
        'status.awaiting_owner_approval': 'AWAITING OWNER APPROVAL',
        'status.approved': 'APPROVED',
        'status.rejected': 'REJECTED',
        'status.revised_quote_sent': 'REVISED QUOTE SENT',
        'status.overdue_approval': 'OVERDUE APPROVAL',
        'support.phone': 'Hotline',
        'tech.active_tickets': 'ASSIGNED SPECIALISTS',
        'tech.ai_proposal': 'AI PROTOCOL PROPOSALS'
    },
    ar: {
        'admin.active_tenants': 'المستأجرون النشطون',
        'admin.active_tickets': 'التذاكر النشطة',
        'admin.amount': 'المبلغ',
        'admin.contract_ref': 'مرجع العقد',
        'admin.dashboard': 'لوحة تحكم المسؤول',
        'admin.system_health': 'صحة النظام',
        'admin.total_revenue': 'إجمالي الإيرادات',
        'analysis.efficiency': 'الكفاءة التشغيلية',
        'common.currency': 'درهم',
        'common.currency_aed': 'درهم',
        'dash.command_subtitle': 'التدقيق المؤسسي وواجهة المنطقة الوطنية',
        'dash.declined': 'مرفوض',
        'dash.kpi.net_roi': 'صافي العائد',
        'dash.proposed': 'مقترح',
        'dash.proposed_roi': 'العائد المقترح',
        'dash.realized_roi': 'العائد المحقق',
        'dash.risk_mitigation': 'تخفيف المخاطر',
        'dash.sanctioned': 'موافق عليه',
        'dash.sovereign_ai': 'الذكاء الاصطناعي السيادي',
        'fin.burn': 'المصروفات',
        'fin.income': 'الدخل',
        'fin.logs_title': 'سجلات الدفتر النظامي',
        'fin.log.date': 'التاريخ',
        'fin.log.status': 'الحالة',
        'fin.total_deductions': 'إجمالي الاستقطاعات',
        'landing.cta': 'سجل أصولك الآن ←',
        'landing.subtitle': 'مجموعة بن هي المنصة المؤسسية الرائدة في الإمارات لإدارة الأصول.',
        'landing.title': 'نظام التشغيل للعقارات في الإمارات.',
        'landing.transparency_title': 'شفافية النمو والمخاطر',
        'nav.admin': 'إدارة مجموعة بن',
        'nav.administry': 'الإدارة',
        'nav.audit': 'التدقيق المؤسسي',
        'nav.brokers': 'الوسطاء',
        'nav.dashboard': 'لوحة القيادة',
        'nav.financial': 'المالية',
        'nav.financials': 'الخزينة',
        'nav.live_map': 'الخريطة المباشرة',
        'nav.logout': 'تسجيل الخروج',
        'nav.onboarding': 'التسجيل',
        'nav.operations': 'العمليات',
        'nav.owner_portal_link': 'بوابة الملاك ↗',
        'nav.reports': 'التقارير',
        'nav.settings': 'سياسة الخصوصية',
        'nav.sos_feed': 'تغذية الاستغاثة',
        'nav.sovereign_core': 'النواة السيادية',
        'nav.support': 'الدعم',
        'nav.tech': 'فني',
        'nav.technicians': 'فيلق الفنيين',
        'nav.tenants': 'المستأجرون',
        'nav.tickets': 'سجلات المهام',
        'onboarding.payment.proceed_btn': 'الدخول للوحة القيادة',
        'onboarding.property_details': 'العقارات',
        'onboarding.title': 'التسجيل المؤسسي',
        'status.settled': 'تمت التسوية',
        'status.estimated': 'تم التقدير',
        'status.awaiting_owner_approval': 'بانتظار موافقة المالك',
        'status.approved': 'تمت الموافقة',
        'status.rejected': 'مرفوض',
        'status.revised_quote_sent': 'تم إرسال تسعيرة معدلة',
        'status.overdue_approval': 'موافقة متأخرة',
        'support.phone': 'الخط الساخن',
        'tech.active_tickets': 'الأخصائيون المعينون',
        'tech.ai_proposal': 'مقترحات بروتوكول الذكاء الاصطناعي'
    }
};

export const LanguageProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [lang, setLang] = useState<Language>(() => {
        const saved = localStorage.getItem('app_lang');
        if (saved === 'en' || saved === 'ar') return saved as Language;
        return 'en';
    });

    useEffect(() => {
        localStorage.setItem('app_lang', lang);
        document.dir = lang === 'ar' ? 'rtl' : 'ltr';
        document.documentElement.lang = lang;
    }, [lang]);

    const t = (key: string, variables?: Record<string, any>) => {
        let text = translations[lang]?.[key] || translations['en']?.[key] || key;
        if (variables) {
            Object.entries(variables).forEach(([k, v]) => {
                text = text.replace(`{${k}}`, String(v));
            });
        }
        return text;
    };

    const tx = (key: string, fallback: string, variables?: Record<string, any>) => {
        const text = translations[lang]?.[key] || translations['en']?.[key];
        if (!text) return fallback;
        
        let result = text;
        if (variables) {
            Object.entries(variables).forEach(([k, v]) => {
                result = result.replace(`{${k}}`, String(v));
            });
        }
        return result;
    };

    const isRTL = lang === 'ar';

    return (
        <LanguageContext.Provider value={{ lang, setLang, t, tx, isRTL }}>
            <Box 
                id="bin-app-root"
                dir={isRTL ? 'rtl' : 'ltr'}
                sx={{ 
                    direction: isRTL ? 'rtl' : 'ltr', 
                    minHeight: '100vh',
                    fontFamily: "'Cairo', 'Inter', sans-serif",
                    backgroundColor: '#020617',
                    color: '#fff'
                }}
            >
                {children}
            </Box>
        </LanguageContext.Provider>
    );
};

export const useLanguage = () => {
    const context = useContext(LanguageContext);
    if (!context) throw new Error('useLanguage must be used within LanguageProvider');
    return context;
};

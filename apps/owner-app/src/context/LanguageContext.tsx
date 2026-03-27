// apps/owner-app/src/context/LanguageContext.tsx
import React, { createContext, useContext, useState, ReactNode, useEffect } from "react";
import { Box } from "@mui/material";

type Language = 'en' | 'ar';

interface LanguageContextType {
    lang: Language;
    setLang: (lang: Language) => void;
    t: (key: string) => string;
    isRTL: boolean;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

const translations: Record<Language, Record<string, string>> = {
    en: {
        'nav.dashboard': 'Dashboard',
        'nav.onboarding': 'Onboarding',
        'nav.financial': 'Financials',
        'nav.tech': 'Technician',
        'nav.admin': 'Sovereign Admin',
        'landing.title': 'The Operating System for UAE Real Estate.',
        'landing.subtitle': 'Automated yield optimization, institutional facility management, and real-time asset intelligence—consolidated into one terminal.',
        'landing.cta': 'Onboard Your Asset →',
        'onboarding.title': 'Institutional Onboarding',
        'onboarding.bulk_intake': 'Bulk Property Intake (1–500)',
        'onboarding.property_details': 'Property Details',
        'onboarding.analysis': 'Asset Analysis',
        'onboarding.quote': 'Sovereign Quote',
        'onboarding.payment': 'Activation',
        'field.emirate': 'Emirate',
        'field.area': 'Area / Cluster',
        'field.type': 'Property Type',
        'field.subtype': 'Sub-Type',
        'field.usetype': 'Usage Type',
        'field.floors': 'Floors',
        'field.units': 'Units',
        'field.sqft': 'Square Footage',
        'field.age': 'Building Age',
        'field.lifts': 'Lifts',
        'field.pool': 'Pool',
        'field.tank': 'Water Tank',
        'field.sira': 'SIRA / CCTV',
        'field.fire': 'Fire Systems',
        'field.dist_cooling': 'District Cooling',
        'field.majlis': 'Majlis Support',
        'field.heritage': 'Heritage Sensitivity',
        'field.grade': 'Asset Grade',
        'field.status': 'Current Status',
        'majlis.sovereign': 'Sovereign Majlis',
        'majlis.government': 'Government Majlis',
        'majlis.royal': 'Royal Majlis',
        'majlis.private': 'Private Majlis',
        'property.rental': 'Rental Asset',
        'property.personal': 'Personal Use',
        'property.mixed': 'Mixed-Use / Hybrid',
        'summary.total_props': 'Total Properties',
        'summary.total_acv': 'Total Contract Value',
        'summary.tier': 'Recommended Tier',
        'toggle.language': 'العربية (AR)',
        'btn.next': 'Next',
        'btn.back': 'Back',
        'btn.add_prop': 'Add Property (+)',
        'btn.bulk_csv': 'Upload CSV',
        'status.tender_ready': 'TENDER READY',
        'status.sovereign': 'SOVEREIGN GRADE',
    },
    ar: {
        'nav.dashboard': 'لوحة التحكم',
        'nav.onboarding': 'التهيئة',
        'nav.financial': 'المالية',
        'nav.tech': 'فني',
        'nav.admin': 'إدارة سيادية',
        'landing.title': 'نظام التشغيل للعقارات في الإمارات.',
        'landing.subtitle': 'تحسين العائد التلقائي، وإدارة المرافق المؤسسية، واستخبارات الأصول في الوقت الفعلي - موحدة في محطة واحدة.',
        'landing.cta': 'ابدأ تهيئة أصولك ←',
        'onboarding.title': 'تهيئة المؤسسات',
        'onboarding.bulk_intake': 'إدخال العقارات بالجملة (1-500)',
        'onboarding.property_details': 'تفاصيل العقار',
        'onboarding.analysis': 'تحليل الأصول',
        'onboarding.quote': 'عرض سعر سيادي',
        'onboarding.payment': 'التفعيل',
        'field.emirate': 'الإمارة',
        'field.area': 'المنطقة / التجمع',
        'field.type': 'نوع العقار',
        'field.subtype': 'النوع الفرعي',
        'field.usetype': 'نوع الاستخدام',
        'field.floors': 'الطوابق',
        'field.units': 'الوحدات',
        'field.sqft': 'المساحة بالقدم المربع',
        'field.age': 'عمر البناء',
        'field.lifts': 'المصاعد',
        'field.pool': 'مسبح',
        'field.tank': 'خزان مياه',
        'field.sira': 'سيرا / كاميرات المراقبة',
        'field.fire': 'أنظمة الحريق',
        'field.dist_cooling': 'تبريد المناطق',
        'field.majlis': 'دعم المجلس',
        'field.heritage': 'حساسية التراث',
        'field.grade': 'درجة الأصول',
        'field.status': 'الوضع الحالي',
        'majlis.sovereign': 'مجلس سيادي',
        'majlis.government': 'مجلس حكومي',
        'majlis.royal': 'مجلس ملكي',
        'majlis.private': 'مجلس خاص',
        'property.rental': 'أصل إيجاري',
        'property.personal': 'استخدام شخصي',
        'property.mixed': 'استخدام مختلط / هجين',
        'summary.total_props': 'إجمالي العقارات',
        'summary.total_acv': 'إجمالي قيمة العقد',
        'summary.tier': 'الفئة الموصى بها',
        'toggle.language': 'English (EN)',
        'btn.next': 'التالي',
        'btn.back': 'رجوع',
        'btn.add_prop': 'إضافة عقار (+)',
        'btn.bulk_csv': 'تحميل CSV',
        'status.tender_ready': 'جاهز للمناقصة',
        'status.sovereign': 'درجة سيادية',
    }
};

export function LanguageProvider({ children }: { children: ReactNode }) {
    const [lang, setLangState] = useState<Language>(() => {
        return (localStorage.getItem('app_lang') as Language) || 'en';
    });

    const setLang = (newLang: Language) => {
        setLangState(newLang);
        localStorage.setItem('app_lang', newLang);
        document.dir = newLang === 'ar' ? 'rtl' : 'ltr';
    };

    useEffect(() => {
        document.dir = lang === 'ar' ? 'rtl' : 'ltr';
    }, [lang]);

    const t = (key: string) => translations[lang][key] || key;
    const isRTL = lang === 'ar';

    return (
        <LanguageContext.Provider value={{ lang, setLang, t, isRTL }}>
            <Box sx={{ 
                direction: isRTL ? 'rtl' : 'ltr', 
                minHeight: '100vh',
                fontFamily: "'Cairo', 'Inter', sans-serif"
            }}>
                {children as any}
            </Box>
        </LanguageContext.Provider>
    );
}

export function useLanguage() {
    const context = useContext(LanguageContext);
    if (context === undefined) {
        throw new Error("useLanguage must be used within a LanguageProvider");
    }
    return context;
}

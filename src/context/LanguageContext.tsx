import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

type Language = "en" | "ar";

interface LanguageContextType {
  lang: Language;
  language: Language;
  setLang: (lang: Language) => void;
  toggleLanguage: () => void;
  t: (key: string, variables?: Record<string, any>) => string;
  tx: (key: string, fallback: string, variables?: Record<string, any>) => string;
  isRTL: boolean;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

const translations: Record<Language, Record<string, string>> = {
  en: {
    "onboarding.company": "Company",
    "onboarding.asset": "Asset",
    "onboarding.location": "Location",
    "onboarding.systems": "Systems",
    "onboarding.service_plan": "Service Plan",
    "onboarding.addons": "Add-ons",
    "onboarding.documents": "Documents",
    "onboarding.verification": "Verification",
    "onboarding.review": "Review",
    "onboarding.payment": "Payment",
    "onboarding.back": "Back",
    "onboarding.continue": "Continue",

    "onboarding.acc_creation": "Create Owner Account",
    "onboarding.acc_creation_desc": "Create your secure owner login to continue the contract and payment process.",
    "onboarding.acc_creation_warning": "Your account will remain locked until contract/payment verification and admin approval are completed.",
    "onboarding.create_btn": "Create Account",
    "onboarding.full_name": "Full name",
    "onboarding.mobile": "Mobile",
    "onboarding.email": "Email",
    "onboarding.password": "Password",
    "onboarding.confirm_password": "Confirm password",
    "onboarding.success_title": "Account Created",
    "onboarding.success_locked": "Your owner profile was created and is pending admin approval.",

    "onboarding.error.all_fields": "Please complete all account fields before continuing.",
    "onboarding.error.invalid_email": "Enter a valid email address.",
    "onboarding.error.weak_password": "Password must be at least 8 characters.",
    "onboarding.error.password_mismatch": "Passwords do not match.",
    "onboarding.error.role_conflict": "This email is already registered under a different role. Please use another email or contact support.",
    "onboarding.error.google_only": "This email uses Google sign-in. Please log in with Google or use another email.",
    "onboarding.error.email_exists": "This email already exists. Please sign in or use another email.",
    "onboarding.error.generic": "Account creation failed. Please check the details and try again.",

    "login.signin": "Sign in",
    "login.get_started": "Get Started",
    "gateway.login": "Gateway Login",

    "nav.dashboard": "Dashboard",
    "nav.back": "Back",
    "nav.scroll_top": "Scroll to top",
    "nav.scroll_bottom": "Scroll to bottom",
    "nav.logout": "Logout",
    "nav.login": "Login",

    "common.auth_sync": "Authenticating BIN-Groups Identity...",
    "common.identity_fault": "Identity fault",
    "common.role_error_prefix": "Role authorization error:",
    "common.reload_sys": "Reload system",

    "dash.hello": "Hello",
    "dash.new_request": "New request",
    "dash.residency_details": "Residency details",
    "dash.verifying_location": "Verifying location",
    "dash.sovereign_zone": "Sovereign zone",
    "dash.sovereign_asset": "Sovereign asset",
  },

  ar: {
    "onboarding.company": "الشركة",
    "onboarding.asset": "الأصل",
    "onboarding.location": "الموقع",
    "onboarding.systems": "الأنظمة",
    "onboarding.service_plan": "خطة الخدمة",
    "onboarding.addons": "الخدمات الإضافية",
    "onboarding.documents": "المستندات",
    "onboarding.verification": "التحقق",
    "onboarding.review": "المراجعة",
    "onboarding.payment": "الدفع",
    "onboarding.back": "رجوع",
    "onboarding.continue": "متابعة",

    "onboarding.acc_creation": "إنشاء حساب المالك",
    "onboarding.acc_creation_desc": "أنشئ تسجيل دخول آمن للمالك لمتابعة العقد والدفع.",
    "onboarding.acc_creation_warning": "سيبقى الحساب مقفلاً حتى يتم التحقق من العقد والدفع واعتماد الإدارة.",
    "onboarding.create_btn": "إنشاء الحساب",
    "onboarding.full_name": "الاسم الكامل",
    "onboarding.mobile": "رقم الهاتف",
    "onboarding.email": "البريد الإلكتروني",
    "onboarding.password": "كلمة المرور",
    "onboarding.confirm_password": "تأكيد كلمة المرور",
    "onboarding.success_title": "تم إنشاء الحساب",
    "onboarding.success_locked": "تم إنشاء ملف المالك وهو بانتظار اعتماد الإدارة.",

    "onboarding.error.all_fields": "يرجى إكمال جميع بيانات الحساب قبل المتابعة.",
    "onboarding.error.invalid_email": "يرجى إدخال بريد إلكتروني صحيح.",
    "onboarding.error.weak_password": "يجب أن تكون كلمة المرور 8 أحرف على الأقل.",
    "onboarding.error.password_mismatch": "كلمتا المرور غير متطابقتين.",
    "onboarding.error.role_conflict": "هذا البريد مسجل بدور مختلف. استخدم بريداً آخر أو تواصل مع الدعم.",
    "onboarding.error.google_only": "هذا البريد يستخدم تسجيل الدخول عبر Google. سجل الدخول عبر Google أو استخدم بريداً آخر.",
    "onboarding.error.email_exists": "هذا البريد مسجل بالفعل. سجل الدخول أو استخدم بريداً آخر.",
    "onboarding.error.generic": "فشل إنشاء الحساب. تحقق من البيانات وحاول مرة أخرى.",

    "login.signin": "تسجيل الدخول",
    "login.get_started": "ابدأ الآن",
    "gateway.login": "تسجيل الدخول",

    "nav.dashboard": "لوحة التحكم",
    "nav.back": "رجوع",
    "nav.scroll_top": "للأعلى",
    "nav.scroll_bottom": "للأسفل",
    "nav.logout": "تسجيل الخروج",
    "nav.login": "تسجيل الدخول",

    "common.auth_sync": "جارٍ التحقق من هوية BIN-Groups...",
    "common.identity_fault": "خطأ في الهوية",
    "common.role_error_prefix": "خطأ في صلاحية الدور:",
    "common.reload_sys": "إعادة تحميل النظام",

    "dash.hello": "مرحباً",
    "dash.new_request": "طلب جديد",
    "dash.residency_details": "تفاصيل السكن",
    "dash.verifying_location": "جارٍ التحقق من الموقع",
    "dash.sovereign_zone": "المنطقة السيادية",
    "dash.sovereign_asset": "الأصل السيادي",
  },
};

function applyVariables(value: string, variables?: Record<string, any>) {
  if (!variables) return value;
  return Object.entries(variables).reduce(
    (text, [key, item]) => text.replaceAll(`{${key}}`, String(item)),
    value
  );
}

function humanizeKey(key: string) {
  const last = key.split(".").pop() || key;
  return last
    .replace(/_/g, " ")
    .replace(/-/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Language>(() => {
    const stored = localStorage.getItem("bin_language");
    return stored === "ar" ? "ar" : "en";
  });

  const setLang = (nextLang: Language) => {
    setLangState(nextLang);
    localStorage.setItem("bin_language", nextLang);
  };

  const toggleLanguage = () => setLang(lang === "en" ? "ar" : "en");

  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === "ar" ? "rtl" : "ltr";
  }, [lang]);

  const value = useMemo<LanguageContextType>(() => {
    const t = (key: string, variables?: Record<string, any>) => {
      const direct = translations[lang]?.[key] || translations.en[key];
      return applyVariables(direct || humanizeKey(key), variables);
    };

    const tx = (key: string, fallback: string, variables?: Record<string, any>) => {
      const direct = translations[lang]?.[key] || translations.en[key] || fallback;
      return applyVariables(direct, variables);
    };

    return {
      lang,
      language: lang,
      setLang,
      toggleLanguage,
      t,
      tx,
      isRTL: lang === "ar",
    };
  }, [lang]);

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  const ctx = useContext(LanguageContext);
  if (!ctx) {
    throw new Error("useLanguage must be used inside LanguageProvider");
  }
  return ctx;
}

export default LanguageContext;

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
    "common.currency": "AED",
    "btn.next": "Continue",
    "btn.back": "Back",
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

    "onboarding.company": "Company",
    "onboarding.asset": "Asset",
    "onboarding.location": "Location",
    "onboarding.systems": "Systems + Add-ons",
    "onboarding.service_plan": "Service Plan",
    "onboarding.addons": "Add-ons",
    "onboarding.documents": "Documents",
    "onboarding.verification": "Account",
    "onboarding.review": "Review",
    "onboarding.payment": "Payment",
    "onboarding.back": "Back",
    "onboarding.continue": "Continue",
    "onboarding.initialize_analysis": "Save Systems & Add-ons",
    "onboarding.units": "Units",
    "onboarding.floors": "Floors",
    "onboarding.sqft": "Sq Ft",
    "onboarding.age": "Age",

    "onboarding.company_profile": "Company Profile",
    "onboarding.company_desc": "Register the owner/company identity that will sign the BIN GROUP maintenance and property management agreement.",
    "onboarding.company_name": "Company / Owner name",
    "onboarding.trade_license": "Trade license / Emirates ID reference",
    "onboarding.primary_contact": "Primary Contact",
    "onboarding.contact_name": "Contact name",
    "onboarding.contact_phone": "Contact phone",
    "onboarding.contact_email": "Contact email",
    "onboarding.onboard_btn": "Continue to Asset Profile",
    "onboarding.company_mission_title": "BIN GROUP Mission",
    "onboarding.company_mission_desc": "Deliver zero-friction property care across the UAE through verified technicians, transparent quotes, digital contracts, live service evidence and owner peace of mind.",
    "onboarding.company_vision_title": "Owner Promise",
    "onboarding.company_vision_desc": "Every property receives a clear passport, maintenance matrix, SLA plan and approval trail before public service activation.",
    "onboarding.company_compliance_title": "UAE Operating Standard",
    "onboarding.company_compliance_desc": "Built for UAE owners, tenants, technicians and brokers with bilingual workflows, evidence capture and admin approval control.",

    "onboarding.asset_profile": "Asset Profile",
    "onboarding.asset_desc": "Classify the property so the quote engine can calculate the correct UAE maintenance and management scope.",
    "onboarding.asset_type": "Asset type",
    "onboarding.retry_scan": "Retry scan",
    "onboarding.scanning": "Scanning...",
    "onboarding.scanned": "Scanned",
    "onboarding.scan_btn": "Scan title deed",
    "onboarding.grade.standard": "Standard",
    "onboarding.grade.premium": "Premium",
    "onboarding.grade.luxury": "Luxury",
    "onboarding.grade.sovereign": "Sovereign",

    "onboarding.type.villa": "Villa",
    "onboarding.type.apartment": "Apartment",
    "onboarding.type.res_building": "Residential Building",
    "onboarding.type.com_building": "Commercial Building",
    "onboarding.type.office": "Office",
    "onboarding.type.retail": "Retail Center",
    "onboarding.type.mall": "Mall",
    "onboarding.type.hotel": "Hotel",
    "onboarding.type.hospital": "Hospital",
    "onboarding.type.clinic": "Clinic",
    "onboarding.type.school": "School",
    "onboarding.type.warehouse": "Warehouse",
    "onboarding.type.labour_camp": "Labour Camp",
    "onboarding.type.gov_prop": "Government Property",
    "onboarding.type.gov_majlis": "Government Majlis",
    "onboarding.type.priv_majlis": "Private Majlis",
    "onboarding.type.mixed_tower": "Mixed-Use Tower",
    "onboarding.type.skyscraper": "Skyscraper",
    "onboarding.type.stadium": "Stadium",
    "onboarding.type.sports_complex": "Sports Complex",
    "onboarding.type.event_venue": "Event Venue",
    "onboarding.type.resort": "Resort",
    "onboarding.type.industrial": "Industrial Site",
    "onboarding.type.staff_acc": "Staff Accommodation",
    "onboarding.type.farm": "Farm / Estate",

    "onboarding.systems_audit": "Systems & Add-ons Audit",
    "onboarding.systems_matrix": "Systems Matrix",
    "onboarding.systems_desc": "Select every critical building system. These choices control SLA scope, add-ons, dispatch readiness and quote accuracy.",
    "onboarding.sys.core": "Core MEP Systems",
    "onboarding.sys.safety": "Life Safety & Compliance",
    "onboarding.sys.amenities": "Amenities & Special Assets",
    "onboarding.sys.hvac": "HVAC / AC systems",
    "onboarding.sys.districtCooling": "District cooling",
    "onboarding.sys.tank": "Water tank",
    "onboarding.sys.gen": "Generator / backup power",
    "onboarding.sys.lifts": "Lifts / elevators",
    "onboarding.sys.fireAlarm": "Fire alarm system",
    "onboarding.sys.firePump": "Fire pump system",
    "onboarding.sys.sira": "SIRA / CCTV system",
    "onboarding.sys.bmu": "BMU / façade access",
    "onboarding.sys.wasteMan": "Waste management room",
    "onboarding.sys.pool": "Swimming pool",
    "onboarding.sys.gasSystem": "Gas / LPG system",
    "onboarding.sys.greaseTrap": "Grease trap",
    "onboarding.sys.majlisGarden": "Majlis garden / landscape",
    "onboarding.sys.solarIntegration": "Solar integration",
    "onboarding.sys.evReadiness": "EV charging readiness",

    "onboarding.addons_title": "Operational Add-ons",
    "onboarding.addons_subtitle": "Select Additional Service Layers",
    "onboarding.addons_desc": "Add manpower, compliance, hygiene, standby and specialist services directly to the same systems page before commercial confirmation.",
    "onboarding.total_annual": "Total annual add-ons",
    "onboarding.selected_addons": "Selected add-ons",
    "onboarding.sovereign_stack": "Service Stack",
    "onboarding.mandatory": "Required",
    "onboarding.reason": "Reason",
    "onboarding.annual": "Annual",
    "onboarding.back_to_models": "Back to Systems",

    "onboarding.commercial_title": "Commercial Service Plan",
    "onboarding.commercial_desc": "Select the contract model, SLA level and payment cycle. The quote updates immediately from your asset profile, systems and selected add-ons.",
    "onboarding.plan_select": "Contract model",
    "onboarding.plan.amc": "Facilities Maintenance Only",
    "onboarding.plan.amc_desc": "Preventive maintenance, emergency response, technician dispatch, SLA tracking and completion proof.",
    "onboarding.plan.pm": "Property Management Only",
    "onboarding.plan.pm_desc": "Tenant coordination, rent/admin follow-up, owner reporting and complaint management without maintenance scope.",
    "onboarding.plan.ifm": "Maintenance + Property Management",
    "onboarding.plan.ifm_desc": "Full property care: FM operations, PM coordination, owner reporting, ticket workflow and portfolio control.",
    "onboarding.plan.majlis": "Majlis Maintenance Protocol",
    "onboarding.plan.majlis_desc": "Specialized Majlis maintenance with VIP standby, guest-readiness checks and rapid technical response.",
    "onboarding.sla_title": "SLA & Response Level",
    "onboarding.sla.standard": "Basic Maintenance",
    "onboarding.sla.standard_desc": "Routine preventive care, standard response windows and essential service documentation.",
    "onboarding.sla.premium": "Premium Maintenance",
    "onboarding.sla.premium_desc": "Priority response, stronger reporting, scheduled inspections and escalation support.",
    "onboarding.sla.elite": "Elite / Standby Maintenance",
    "onboarding.sla.elite_desc": "Fastest response, event standby readiness, enhanced monitoring and dedicated operational support.",
    "onboarding.sla.majlis_basic": "Majlis Basic Maintenance",
    "onboarding.sla.majlis_basic_desc": "Core maintenance for government/private Majlis, MEP checks, AC continuity and basic guest-readiness support.",
    "onboarding.sla.majlis_premium": "Majlis Premium Maintenance",
    "onboarding.sla.majlis_premium_desc": "Enhanced priority with VIP support, routine deep checks, landscape readiness and faster response windows.",
    "onboarding.sla.majlis_elite": "Majlis Elite / Standby Maintenance",
    "onboarding.sla.majlis_elite_desc": "Event standby technician, 24/7 dedicated response readiness, pre-event inspection and executive escalation path.",
    "onboarding.payment_title": "Payment Plan",
    "onboarding.payment.annual": "Annual",
    "onboarding.payment.annual_desc": "Best value: one annual settlement with full-year contract activation and one mobilization invoice.",
    "onboarding.payment.quarterly": "Quarterly",
    "onboarding.payment.quarterly_desc": "Four scheduled payments for owners who prefer cash-flow control while keeping the annual SLA active.",
    "onboarding.payment.monthly": "Monthly",
    "onboarding.payment.monthly_desc": "Monthly billing for operational flexibility; contract remains subject to payment verification and admin approval.",
    "onboarding.quote_est": "Quote Estimate",
    "onboarding.vat_excl": "VAT excluded",
    "onboarding.mobilization": "Mobilization",
    "onboarding.confirm_btn": "Confirm Plan",
    "onboarding.revise_btn": "Revise previous step",

    "onboarding.documents_title": "Document Verification",
    "onboarding.docs_subtitle": "Upload ownership and identity documents so admin can verify the owner account before contract activation.",
    "onboarding.docs_staged": "Documents are staged only for verification. Your account remains locked until admin approval is complete.",
    "onboarding.docs_required_count": "Required documents",
    "onboarding.scanner_title": "Title Deed Scanner",
    "onboarding.scanner_desc": "Upload the title deed first. The scanner extracts property type, area and ownership signals where available.",
    "onboarding.scanner_analyzing": "Analyzing...",
    "onboarding.scanner_retry": "Retry scan",
    "onboarding.scanner_analyze_btn": "Analyze title deed",
    "onboarding.scanner_match": "scanner match",
    "onboarding.scanner_extracted": "Extracted data",
    "onboarding.docs_awaiting": "Awaiting upload",
    "onboarding.docs_ready": "Ready",
    "onboarding.docs_max_size": "PDF/JPG/PNG · max 10MB",
    "onboarding.docs_change": "Change file",
    "onboarding.docs_select": "Select file",
    "onboarding.docs_continue": "Continue to Account",
    "onboarding.doc.title_deed": "Title Deed / Ownership Proof",
    "onboarding.doc.emirates_id": "Emirates ID",
    "onboarding.doc.passport": "Passport",
    "onboarding.zone": "Zone / Area",

    "onboarding.acc_creation": "Create Owner Account",
    "onboarding.acc_creation_desc": "Create your secure owner login to continue the contract and payment process.",
    "onboarding.acc_creation_warning": "Your account will remain locked until contract/payment verification and admin approval are completed.",
    "onboarding.create_btn": "Create Account",
    "onboarding.continue_review_btn": "Continue to Review",
    "onboarding.full_name": "Full name",
    "onboarding.mobile": "Mobile",
    "onboarding.email": "Email",
    "onboarding.password": "Password",
    "onboarding.confirm_password": "Confirm password",
    "onboarding.success_title": "Account Ready",
    "onboarding.success_locked": "Your owner profile is ready for review and admin approval.",
    "onboarding.error.all_fields": "Please complete all account fields before continuing.",
    "onboarding.error.invalid_email": "Enter a valid email address.",
    "onboarding.error.weak_password": "Password must be at least 8 characters.",
    "onboarding.error.password_mismatch": "Passwords do not match.",
    "onboarding.error.role_conflict": "This email is already registered under a different role. Please use another email or contact support.",
    "onboarding.error.google_only": "This email uses Google sign-in. Please log in with Google or use another email.",
    "onboarding.error.email_exists": "This email already exists. If this is your account, enter the correct password or sign in from Gateway Login.",
    "onboarding.error.generic": "Account creation failed. Please check the details and try again.",
  },

  ar: {
    "common.currency": "درهم",
    "btn.next": "متابعة",
    "btn.back": "رجوع",
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

    "onboarding.company": "الشركة",
    "onboarding.asset": "الأصل",
    "onboarding.location": "الموقع",
    "onboarding.systems": "الأنظمة والإضافات",
    "onboarding.service_plan": "خطة الخدمة",
    "onboarding.addons": "الإضافات",
    "onboarding.documents": "المستندات",
    "onboarding.verification": "الحساب",
    "onboarding.review": "المراجعة",
    "onboarding.payment": "الدفع",
    "onboarding.back": "رجوع",
    "onboarding.continue": "متابعة",
    "onboarding.initialize_analysis": "حفظ الأنظمة والإضافات",
    "onboarding.units": "الوحدات",
    "onboarding.floors": "الطوابق",
    "onboarding.sqft": "المساحة بالقدم المربع",
    "onboarding.age": "عمر العقار",

    "onboarding.company_profile": "ملف الشركة",
    "onboarding.company_desc": "سجّل هوية المالك أو الشركة التي ستوقّع اتفاقية الصيانة وإدارة العقار مع BIN GROUP.",
    "onboarding.company_name": "اسم الشركة / المالك",
    "onboarding.trade_license": "الرخصة التجارية / مرجع الهوية الإماراتية",
    "onboarding.primary_contact": "جهة الاتصال الرئيسية",
    "onboarding.contact_name": "اسم جهة الاتصال",
    "onboarding.contact_phone": "رقم الهاتف",
    "onboarding.contact_email": "البريد الإلكتروني",
    "onboarding.onboard_btn": "متابعة إلى ملف العقار",
    "onboarding.company_mission_title": "مهمة BIN GROUP",
    "onboarding.company_mission_desc": "تقديم رعاية عقارية سهلة وموثقة في دولة الإمارات عبر فنيين معتمدين، عروض واضحة، عقود رقمية، إثبات تنفيذ مباشر وراحة بال للمالك.",
    "onboarding.company_vision_title": "وعدنا للمالك",
    "onboarding.company_vision_desc": "كل عقار يحصل على جواز عقاري واضح، مصفوفة أنظمة، خطة SLA ومسار موافقات قبل تفعيل الخدمة العامة.",
    "onboarding.company_compliance_title": "معيار التشغيل الإماراتي",
    "onboarding.company_compliance_desc": "مصمم للمالكين والمستأجرين والفنيين والوسطاء في الإمارات مع سير عمل ثنائي اللغة وإثباتات واعتماد إداري.",

    "onboarding.asset_profile": "ملف العقار",
    "onboarding.asset_desc": "صنّف العقار حتى يحسب محرك الأسعار نطاق الصيانة والإدارة المناسب في الإمارات.",
    "onboarding.asset_type": "نوع الأصل",
    "onboarding.retry_scan": "إعادة المسح",
    "onboarding.scanning": "جارٍ المسح...",
    "onboarding.scanned": "تم المسح",
    "onboarding.scan_btn": "مسح سند الملكية",
    "onboarding.grade.standard": "قياسي",
    "onboarding.grade.premium": "مميز",
    "onboarding.grade.luxury": "فاخر",
    "onboarding.grade.sovereign": "سيادي",

    "onboarding.type.villa": "فيلا",
    "onboarding.type.apartment": "شقة",
    "onboarding.type.res_building": "بناية سكنية",
    "onboarding.type.com_building": "بناية تجارية",
    "onboarding.type.office": "مكتب",
    "onboarding.type.retail": "مركز تجاري",
    "onboarding.type.mall": "مول",
    "onboarding.type.hotel": "فندق",
    "onboarding.type.hospital": "مستشفى",
    "onboarding.type.clinic": "عيادة",
    "onboarding.type.school": "مدرسة",
    "onboarding.type.warehouse": "مستودع",
    "onboarding.type.labour_camp": "سكن عمال",
    "onboarding.type.gov_prop": "عقار حكومي",
    "onboarding.type.gov_majlis": "مجلس حكومي",
    "onboarding.type.priv_majlis": "مجلس خاص",
    "onboarding.type.mixed_tower": "برج متعدد الاستخدامات",
    "onboarding.type.skyscraper": "ناطحة سحاب",
    "onboarding.type.stadium": "ملعب",
    "onboarding.type.sports_complex": "مجمع رياضي",
    "onboarding.type.event_venue": "قاعة فعاليات",
    "onboarding.type.resort": "منتجع",
    "onboarding.type.industrial": "موقع صناعي",
    "onboarding.type.staff_acc": "سكن موظفين",
    "onboarding.type.farm": "مزرعة / عزبة",

    "onboarding.systems_audit": "تدقيق الأنظمة والإضافات",
    "onboarding.systems_matrix": "مصفوفة الأنظمة",
    "onboarding.systems_desc": "حدد كل نظام حرج في المبنى. هذه الاختيارات تتحكم في نطاق SLA والإضافات وجاهزية التوزيع ودقة السعر.",
    "onboarding.sys.core": "أنظمة MEP الأساسية",
    "onboarding.sys.safety": "السلامة والامتثال",
    "onboarding.sys.amenities": "المرافق والأصول الخاصة",
    "onboarding.sys.hvac": "أنظمة التكييف",
    "onboarding.sys.districtCooling": "تبريد المناطق",
    "onboarding.sys.tank": "خزان المياه",
    "onboarding.sys.gen": "مولد / طاقة احتياطية",
    "onboarding.sys.lifts": "مصاعد",
    "onboarding.sys.fireAlarm": "نظام إنذار الحريق",
    "onboarding.sys.firePump": "نظام مضخة الحريق",
    "onboarding.sys.sira": "نظام SIRA / كاميرات",
    "onboarding.sys.bmu": "BMU / دخول الواجهة",
    "onboarding.sys.wasteMan": "غرفة إدارة النفايات",
    "onboarding.sys.pool": "مسبح",
    "onboarding.sys.gasSystem": "نظام الغاز / LPG",
    "onboarding.sys.greaseTrap": "مصيدة الشحوم",
    "onboarding.sys.majlisGarden": "حديقة المجلس / اللاندسكيب",
    "onboarding.sys.solarIntegration": "تكامل الطاقة الشمسية",
    "onboarding.sys.evReadiness": "جاهزية شحن السيارات الكهربائية",

    "onboarding.addons_title": "الإضافات التشغيلية",
    "onboarding.addons_subtitle": "اختر طبقات خدمة إضافية",
    "onboarding.addons_desc": "أضف العمالة والامتثال والنظافة والاستعداد والخدمات المتخصصة في نفس صفحة الأنظمة قبل تأكيد العرض التجاري.",
    "onboarding.total_annual": "إجمالي الإضافات السنوي",
    "onboarding.selected_addons": "الإضافات المختارة",
    "onboarding.sovereign_stack": "مجموعة الخدمات",
    "onboarding.mandatory": "إلزامي",
    "onboarding.reason": "السبب",
    "onboarding.annual": "سنوي",
    "onboarding.back_to_models": "رجوع إلى الأنظمة",

    "onboarding.commercial_title": "خطة الخدمة التجارية",
    "onboarding.commercial_desc": "اختر نموذج العقد ومستوى SLA ودورة الدفع. يتم تحديث السعر مباشرة بناءً على ملف العقار والأنظمة والإضافات.",
    "onboarding.plan_select": "نموذج العقد",
    "onboarding.plan.amc": "الصيانة فقط",
    "onboarding.plan.amc_desc": "صيانة وقائية، استجابة طارئة، توزيع الفنيين، متابعة SLA وإثبات إنجاز.",
    "onboarding.plan.pm": "إدارة العقار فقط",
    "onboarding.plan.pm_desc": "تنسيق المستأجرين، متابعة الإيجار والإدارة، تقارير المالك وإدارة الشكاوى بدون نطاق صيانة.",
    "onboarding.plan.ifm": "الصيانة + إدارة العقار",
    "onboarding.plan.ifm_desc": "رعاية كاملة للعقار: تشغيل FM، تنسيق PM، تقارير المالك، سير طلبات الصيانة والتحكم بالمحفظة.",
    "onboarding.plan.majlis": "بروتوكول صيانة المجلس",
    "onboarding.plan.majlis_desc": "صيانة متخصصة للمجلس مع استعداد VIP، فحوصات جاهزية الضيوف واستجابة تقنية سريعة.",
    "onboarding.sla_title": "مستوى SLA والاستجابة",
    "onboarding.sla.standard": "صيانة أساسية",
    "onboarding.sla.standard_desc": "رعاية وقائية روتينية، زمن استجابة قياسي وتوثيق خدمة أساسي.",
    "onboarding.sla.premium": "صيانة مميزة",
    "onboarding.sla.premium_desc": "استجابة ذات أولوية، تقارير أقوى، فحوصات مجدولة ودعم تصعيد.",
    "onboarding.sla.elite": "صيانة نخبة / استعداد",
    "onboarding.sla.elite_desc": "أسرع استجابة، استعداد للفعاليات، مراقبة محسنة ودعم تشغيلي مخصص.",
    "onboarding.sla.majlis_basic": "صيانة المجلس الأساسية",
    "onboarding.sla.majlis_basic_desc": "صيانة أساسية للمجالس الحكومية/الخاصة، فحوصات MEP، استمرارية التكييف ودعم جاهزية الضيوف.",
    "onboarding.sla.majlis_premium": "صيانة المجلس المميزة",
    "onboarding.sla.majlis_premium_desc": "أولوية محسنة مع دعم VIP، فحوصات عميقة دورية، جاهزية الحديقة وزمن استجابة أسرع.",
    "onboarding.sla.majlis_elite": "صيانة المجلس النخبة / الاستعداد",
    "onboarding.sla.majlis_elite_desc": "فني جاهز للفعاليات، استعداد استجابة 24/7، فحص قبل الفعالية ومسار تصعيد تنفيذي.",
    "onboarding.payment_title": "خطة الدفع",
    "onboarding.payment.annual": "سنوي",
    "onboarding.payment.annual_desc": "أفضل قيمة: تسوية سنوية واحدة مع تفعيل عقد كامل السنة وفاتورة تعبئة واحدة.",
    "onboarding.payment.quarterly": "ربع سنوي",
    "onboarding.payment.quarterly_desc": "أربع دفعات مجدولة للمالكين الذين يفضلون التحكم بالتدفق النقدي مع بقاء SLA السنوي فعالاً.",
    "onboarding.payment.monthly": "شهري",
    "onboarding.payment.monthly_desc": "فوترة شهرية للمرونة التشغيلية؛ يبقى العقد خاضعاً للتحقق من الدفع واعتماد الإدارة.",
    "onboarding.quote_est": "تقدير السعر",
    "onboarding.vat_excl": "غير شامل الضريبة",
    "onboarding.mobilization": "التعبئة",
    "onboarding.confirm_btn": "تأكيد الخطة",
    "onboarding.revise_btn": "تعديل الخطوة السابقة",

    "onboarding.documents_title": "التحقق من المستندات",
    "onboarding.docs_subtitle": "ارفع مستندات الملكية والهوية حتى يتحقق المسؤول من حساب المالك قبل تفعيل العقد.",
    "onboarding.docs_staged": "المستندات مرفوعة للتحقق فقط. يبقى الحساب مقفلاً حتى اكتمال اعتماد الإدارة.",
    "onboarding.docs_required_count": "المستندات المطلوبة",
    "onboarding.scanner_title": "ماسح سند الملكية",
    "onboarding.scanner_desc": "ارفع سند الملكية أولاً. يستخرج الماسح نوع العقار والمنطقة وإشارات الملكية عند توفرها.",
    "onboarding.scanner_analyzing": "جارٍ التحليل...",
    "onboarding.scanner_retry": "إعادة المسح",
    "onboarding.scanner_analyze_btn": "تحليل سند الملكية",
    "onboarding.scanner_match": "مطابقة الماسح",
    "onboarding.scanner_extracted": "البيانات المستخرجة",
    "onboarding.docs_awaiting": "بانتظار الرفع",
    "onboarding.docs_ready": "جاهز",
    "onboarding.docs_max_size": "PDF/JPG/PNG · حد أقصى 10MB",
    "onboarding.docs_change": "تغيير الملف",
    "onboarding.docs_select": "اختيار ملف",
    "onboarding.docs_continue": "متابعة إلى الحساب",
    "onboarding.doc.title_deed": "سند الملكية / إثبات الملكية",
    "onboarding.doc.emirates_id": "الهوية الإماراتية",
    "onboarding.doc.passport": "جواز السفر",
    "onboarding.zone": "المنطقة",

    "onboarding.acc_creation": "إنشاء حساب المالك",
    "onboarding.acc_creation_desc": "أنشئ تسجيل دخول آمن للمالك لمتابعة العقد والدفع.",
    "onboarding.acc_creation_warning": "سيبقى الحساب مقفلاً حتى يتم التحقق من العقد والدفع واعتماد الإدارة.",
    "onboarding.create_btn": "إنشاء الحساب",
    "onboarding.continue_review_btn": "متابعة إلى المراجعة",
    "onboarding.full_name": "الاسم الكامل",
    "onboarding.mobile": "رقم الهاتف",
    "onboarding.email": "البريد الإلكتروني",
    "onboarding.password": "كلمة المرور",
    "onboarding.confirm_password": "تأكيد كلمة المرور",
    "onboarding.success_title": "الحساب جاهز",
    "onboarding.success_locked": "ملف المالك جاهز للمراجعة واعتماد الإدارة.",
    "onboarding.error.all_fields": "يرجى إكمال جميع بيانات الحساب قبل المتابعة.",
    "onboarding.error.invalid_email": "يرجى إدخال بريد إلكتروني صحيح.",
    "onboarding.error.weak_password": "يجب أن تكون كلمة المرور 8 أحرف على الأقل.",
    "onboarding.error.password_mismatch": "كلمتا المرور غير متطابقتين.",
    "onboarding.error.role_conflict": "هذا البريد مسجل بدور مختلف. استخدم بريداً آخر أو تواصل مع الدعم.",
    "onboarding.error.google_only": "هذا البريد يستخدم تسجيل الدخول عبر Google. سجل الدخول عبر Google أو استخدم بريداً آخر.",
    "onboarding.error.email_exists": "هذا البريد مسجل بالفعل. إذا كان حسابك، أدخل كلمة المرور الصحيحة أو سجل الدخول من البوابة.",
    "onboarding.error.generic": "فشل إنشاء الحساب. تحقق من البيانات وحاول مرة أخرى.",
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
    if (typeof window === "undefined") return "en";
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
    document.body.dir = lang === "ar" ? "rtl" : "ltr";
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

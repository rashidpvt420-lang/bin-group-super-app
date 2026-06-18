import React, { useMemo } from 'react';
import { Box, Button, Chip, Container, Grid, Paper, Stack, Typography, alpha } from '@mui/material';
import {
  AlertTriangle,
  Award,
  Banknote,
  Briefcase,
  Building2,
  CheckCircle2,
  Clock,
  FileText,
  Globe,
  HandCoins,
  HeartHandshake,
  Home,
  KeyRound,
  LogIn,
  Mail,
  MapPin,
  MessageSquare,
  Phone,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  UserCheck,
  ClipboardCheck,
  Users,
  Wrench,
  Zap,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { binThemeTokens } from '../../theme/binGroupTheme';
import { useLanguage } from '../../context/LanguageContext';
import BrandWatermark from '../../components/BrandWatermark';

const CONTACT = { whatsapp: '+971 55 2423233', phone: '+971 55 7474560', email: 'ceo@bin-groups.com' };
const ink = '#111827';
const muted = '#667085';
const line = '#E8E3D7';
const platinum = '#F8F9FB';
const gold = binThemeTokens.gold;
const goldLight = binThemeTokens.goldLight;
const radius = { section: 3, card: 2.25, button: 2 };

const SERVICE_AREAS = ['Al Ain', 'Abu Dhabi', 'Dubai', 'Sharjah', 'Ajman', 'Ras Al Khaimah', 'Fujairah', 'Umm Al Quwain'];

const SERVICES = [
  { icon: <Wrench size={22} />, en: 'Annual Maintenance Contracts', ar: 'عقود الصيانة السنوية', descEn: 'Custom contracts for villas, apartments, towers, hotels, offices, and large portfolios with SLA coverage.', descAr: 'عقود مخصصة للفلل، الشقق، الأبراج، الفنادق، المكاتب، والمحافظ الكبيرة مع تغطية SLA.' },
  { icon: <Building2 size={22} />, en: 'Property Management', ar: 'إدارة العقارات', descEn: 'Owner and tenant coordination, lease context, vendor supervision, condition records, and portfolio visibility.', descAr: 'تنسيق بين المالك والمستأجر، سياق الإيجار، الإشراف على الموردين، سجلات الحالة، ورؤية المحفظة.' },
  { icon: <Users size={22} />, en: 'Total Care Hybrid', ar: 'التعاقد الشامل', descEn: 'Full property-care combining maintenance contracts, tenant service, technician execution, and digital property history.', descAr: 'رعاية عقارية شاملة تجمع عقود الصيانة، خدمة المستأجر، تنفيذ الفني، وتاريخ العقار الرقمي.' },
  { icon: <Zap size={22} />, en: 'Technician Dispatch', ar: 'إرسال الفنيين', descEn: 'GPS-routed field execution with job cards, SLA expectations, before-and-after proof, and job closure workflows.', descAr: 'تنفيذ ميداني عبر GPS مع بطاقات العمل، توقعات SLA، إثبات قبل وبعد، وسير إغلاق المهام.' },
  { icon: <ShieldCheck size={22} />, en: 'Workforce Self-Service', ar: 'الخدمة الذاتية للموظفين', descEn: 'Paperless multilingual staff self-service: leave, overtime, payslip support, HR letters, document renewals.', descAr: 'خدمة ذاتية للموظفين متعددة اللغات بدون ورق: إجازة، أوفر تايم، دعم كشف الراتب، خطابات الموارد البشرية.' },
  { icon: <Sparkles size={22} />, en: 'AI Property Intelligence', ar: 'ذكاء العقارات بالذكاء الاصطناعي', descEn: 'AI-assisted quote logic, property classification, design previews, predictive maintenance, and portfolio decisions.', descAr: 'منطق عروض الأسعار بمساعدة الذكاء الاصطناعي، تصنيف العقارات، معاينات التصميم، الصيانة التنبؤية.' },
  { icon: <Briefcase size={22} />, en: 'Digital Compliance Passport', ar: 'جواز الامتثال الرقمي', descEn: 'Visa, ID, passport, medical card, trade certifications, PPE, and dispatch-readiness tracked in one dossier.', descAr: 'التأشيرة، الهوية، جواز السفر، البطاقة الصحية، الشهادات المهنية، ومعدات الوقاية في ملف واحد.' },
  { icon: <Award size={22} />, en: 'Owner Trust & Proof', ar: 'ثقة المالك والإثبات', descEn: 'Every action builds trust: quote path, contract record, 15% mobilization, GPS evidence, photo proof, and reports.', descAr: 'كل إجراء يبني الثقة: مسار عرض الأسعار، سجل العقد، 15% تعبئة، أدلة GPS، صور إثبات، وتقارير.' },
];

const PROBLEMS = [
  { icon: <AlertTriangle size={22} />, en: 'Owners Are Stretched Thin', ar: 'الملاك مشغولون جدًا', descEn: 'Owners juggling multiple properties have no single place to see contracts, costs, or repair status until something breaks.', descAr: 'الملاك الذين يديرون عقارات متعددة لا يملكون مكانًا واحدًا لمعرفة العقود أو التكاليف أو حالة الإصلاحات — حتى تحدث مشكلة.' },
  { icon: <Clock size={22} />, en: 'Tenants Wait Too Long', ar: 'المستأجرون ينتظرون طويلاً', descEn: 'A leaking tap or broken AC reported by phone or message often gets lost, delayed, or forgotten.', descAr: 'تسرب صنبور أو عطل تكييف يُبلَّغ عنه بمكالمة أو رسالة غالبًا يضيع أو يتأخر أو يُنسى.' },
  { icon: <Wrench size={22} />, en: 'Technicians Work Without Structure', ar: 'الفنيون يعملون دون تنظيم', descEn: 'Field teams without job cards, routes, or proof requirements waste time and leave no record of what was actually done.', descAr: 'الفرق الميدانية بدون بطاقات عمل أو مسارات أو إثبات تنفيذ تُهدر الوقت ولا تترك سجلاً لما تم تنفيذه فعليًا.' },
  { icon: <FileText size={22} />, en: 'No Paper Trail, No Protection', ar: 'لا سجل، لا حماية', descEn: 'Verbal agreements and paper receipts disappear exactly when an owner, tenant, or technician needs proof.', descAr: 'الاتفاقات الشفهية والإيصالات الورقية تختفي تمامًا عندما يحتاج المالك أو المستأجر أو الفني إلى إثبات.' },
  { icon: <Users size={22} />, en: 'HR Runs On WhatsApp And Paper', ar: 'الموارد البشرية تُدار عبر واتساب والورق', descEn: 'Leave requests, payslip questions, and HR letters handled informally lead to disputes, compliance gaps, and unhappy staff.', descAr: 'طلبات الإجازة واستفسارات الراتب وخطابات الموارد البشرية التي تُدار بشكل غير رسمي تؤدي إلى نزاعات وثغرات في الامتثال وموظفين غير راضين.' },
];

const OWNER_NEEDS = [
  { needEn: "Know what's happening without calling anyone", needAr: 'معرفة ما يحدث دون الاتصال بأي شخص', solutionEn: 'A live dashboard for every property, contract, and job status.', solutionAr: 'لوحة تحكم مباشرة لكل عقار وعقد وحالة عمل.' },
  { needEn: 'Avoid surprise bills', needAr: 'تجنّب الفواتير المفاجئة', solutionEn: 'Fixed-scope contracts, 15% mobilization, and a transparent payment plan agreed upfront.', solutionAr: 'عقود بنطاق محدد، تعبئة 15%، وخطة دفع شفافة مُتفق عليها مسبقًا.' },
  { needEn: 'Approve before money is spent', needAr: 'الموافقة قبل إنفاق المال', solutionEn: 'An owner approval gate on high-cost work and quotes before any work proceeds.', solutionAr: 'بوابة موافقة المالك على الأعمال والعروض ذات التكلفة العالية قبل بدء أي تنفيذ.' },
  { needEn: 'Proof the work was actually done', needAr: 'إثبات أن العمل تم فعليًا', solutionEn: 'Before-and-after photos, GPS-stamped job records, and a digital sign-off on every visit.', solutionAr: 'صور قبل وبعد، سجلات عمل بموقع GPS، وتوقيع رقمي على كل زيارة.' },
  { needEn: "Protect the property's value", needAr: 'حماية قيمة العقار', solutionEn: 'Scheduled preventive maintenance and a digital property passport tracking every intervention.', solutionAr: 'صيانة وقائية مجدولة وجواز عقار رقمي يتتبع كل تدخل.' },
  { needEn: "Confidence in who's on site", needAr: 'الثقة بمن يدخل العقار', solutionEn: 'Verified technicians with tracked compliance documents and dispatch records.', solutionAr: 'فنيون موثقون بسجلات امتثال متابَعة وسجلات إرسال.' },
];

const TENANT_NEEDS = [
  { needEn: 'Report an issue without chasing anyone', needAr: 'الإبلاغ عن مشكلة دون متابعة أي شخص', solutionEn: 'Submit a request in seconds with photos, category, and priority — no phone tag.', solutionAr: 'تقديم طلب في ثوانٍ مع الصور والفئة والأولوية — بدون انتظار على الهاتف.' },
  { needEn: "Know what's happening", needAr: 'معرفة ما يحدث', solutionEn: 'Live status updates from submitted, to assigned, to completed.', solutionAr: 'تحديثات حالة مباشرة من الإرسال إلى التكليف إلى الإكمال.' },
  { needEn: 'Be understood in their own language', needAr: 'أن يتم فهمهم بلغتهم', solutionEn: 'A full bilingual English/Arabic experience, with technicians briefed in clear terms.', solutionAr: 'تجربة ثنائية اللغة عربي/إنجليزي بالكامل، مع توجيه واضح للفنيين.' },
  { needEn: 'Trust the person at the door', needAr: 'الثقة بالشخص عند الباب', solutionEn: 'Technicians arrive with a verified job card tied to their request.', solutionAr: 'يصل الفنيون ببطاقة عمل موثقة مرتبطة بطلبهم.' },
  { needEn: 'Fast response on urgent issues', needAr: 'استجابة سريعة للحالات العاجلة', solutionEn: 'Priority flagging routes urgent safety and utility issues first.', solutionAr: 'تصنيف الأولوية يُسرّع توجيه حالات السلامة والمرافق العاجلة أولاً.' },
  { needEn: 'Confirm the job was done right', needAr: 'تأكيد أن العمل تم بشكل صحيح', solutionEn: 'A tenant confirmation step closes the loop before a job is marked complete.', solutionAr: 'خطوة تأكيد المستأجر تُغلق الطلب قبل تصنيفه مكتملًا.' },
];

const ROI_POINTS = [
  { icon: <TrendingUp size={22} />, en: 'Protects Property Value', ar: 'حماية قيمة العقار', descEn: 'Scheduled preventive maintenance catches small problems before they become expensive structural or system failures.', descAr: 'الصيانة الوقائية المجدولة تكشف المشاكل الصغيرة قبل أن تتحول إلى أعطال إنشائية أو نظامية مكلفة.' },
  { icon: <HandCoins size={22} />, en: 'Predictable, Transparent Costs', ar: 'تكاليف واضحة وقابلة للتوقع', descEn: 'Fixed contract scope, a clear 15% mobilization step, and visible payment-plan status remove budget surprises.', descAr: 'نطاق عقد ثابت، خطوة تعبئة 15% واضحة، وحالة خطة دفع مرئية تُلغي مفاجآت الموازنة.' },
  { icon: <Clock size={22} />, en: 'Faster Resolution, Fewer Complaints', ar: 'حل أسرع، شكاوى أقل', descEn: 'Structured dispatch and SLA tracking turn maintenance requests around faster — fewer tenant disputes and lower turnover risk.', descAr: 'الإرسال المنظم وتتبع SLA يُسرّعان معالجة طلبات الصيانة، أي نزاعات أقل مع المستأجرين ومخاطر دوران أقل.' },
  { icon: <ShieldCheck size={22} />, en: 'Lower Legal And Compliance Risk', ar: 'مخاطر قانونية وامتثال أقل', descEn: "Every quote, approval, contract, and job has a timestamped digital record — exactly what's needed if a dispute or audit happens.", descAr: 'كل عرض سعر وموافقة وعقد ومهمة له سجل رقمي موثّق بالتاريخ والوقت — وهو ما تحتاجه تمامًا عند نزاع أو تدقيق.' },
];

const HR_POINTS = [
  { icon: <UserCheck size={22} />, en: 'Paperless Staff Self-Service', ar: 'خدمة ذاتية للموظفين بدون ورق', descEn: 'Leave, sick leave, overtime, payslip questions, and HR letters are requested and tracked digitally — no lost paperwork, no informal HR over chat.', descAr: 'تُطلب وتُتابع الإجازات، الإجازات المرضية، الأوفر تايم، استفسارات الراتب، وخطابات الموارد البشرية رقميًا — بدون أوراق ضائعة أو موارد بشرية غير رسمية عبر واتساب.' },
  { icon: <ClipboardCheck size={22} />, en: 'Digital Compliance Passport', ar: 'جواز الامتثال الرقمي', descEn: 'Visa, Emirates ID, passport, medical card, training, and PPE records are tracked per technician, so only properly documented staff are dispatched.', descAr: 'تُتابع سجلات التأشيرة والهوية الإماراتية وجواز السفر والبطاقة الصحية والتدريب ومعدات الحماية لكل فني، حتى لا يُرسَل إلا الموظف الموثّق بالكامل.' },
  { icon: <Banknote size={22} />, en: 'Payroll Transparency', ar: 'شفافية الرواتب', descEn: 'Staff can see basic salary context, allowances, overtime, and payment status, while HR/Admin keeps full approval control.', descAr: 'يمكن للموظفين رؤية سياق الراتب الأساسي والبدلات والأوفر تايم وحالة الدفع، مع بقاء صلاحية الاعتماد الكاملة لدى الموارد البشرية/الإدارة.' },
  { icon: <HeartHandshake size={22} />, en: 'UAE Labour Compliance Awareness', ar: 'وعي بالامتثال لقانون العمل الإماراتي', descEn: 'Workforce records are structured around UAE practice — end-of-service, GPSSA, Emiratisation context, and heat-stress safety windows for outdoor field work.', descAr: 'سجلات القوى العاملة مهيكلة وفق الممارسات الإماراتية: مكافأة نهاية الخدمة، التأمينات (GPSSA)، سياق التوطين، ونوافذ السلامة من خطر الإجهاد الحراري للعمل الميداني.' },
];

function getCopy(lang: 'en' | 'ar') {
  const ar = lang === 'ar';
  return {
    ar,
    brand: ar ? 'مجموعة بن' : 'BIN GROUP',
    navHome: ar ? 'الرئيسية' : 'Home',
    navStart: ar ? 'ابدأ تفاصيل العقار' : 'Start Property Details',
    navLogin: ar ? 'دخول البوابة' : 'Portal Login',

    credBadge: ar ? 'شركة مرخصة في الإمارات' : 'Licensed UAE Company',
    credLegal: ar ? 'All Kind Building Projects Contracting LLC S.P.C' : 'All Kind Building Projects Contracting LLC S.P.C',
    credEst: ar ? 'تأسست 2010 · العين' : 'Est. 2010 · Al Ain',

    heroChip: ar ? 'ملف الشركة' : 'COMPANY PROFILE',
    heroTitle: ar ? 'BIN GROUP' : 'BIN GROUP',
    heroTagline: ar
      ? 'الصيانة الموثوقة وإدارة العقارات في الإمارات — جذور من مدينة العين منذ 2010.'
      : 'Trusted property maintenance and management across the UAE — rooted in Al Ain since 2010.',
    heroLicense: ar
      ? 'All Kind Building Projects Contracting LLC S.P.C · مرخصة في أبوظبي، الإمارات · رخصة التجارة: متاحة عند الطلب'
      : 'All Kind Building Projects Contracting LLC S.P.C · Licensed in Abu Dhabi, UAE · Trade Licence: Available on request',

    stats: ar
      ? [['2010', 'سنة التأسيس'], ['+500', 'عقار مُدار'], ['8', 'إمارات'], ['15+', 'سنة خبرة']]
      : [['2010', 'Founded'], ['+500', 'Properties'], ['8', 'Emirates'], ['15+', 'Years']],

    aboutChip: ar ? 'من نحن' : 'WHO WE ARE',
    aboutTitle: ar ? 'عن مجموعة BIN GROUP' : 'About BIN GROUP',
    aboutText: ar
      ? 'تأسست مجموعة BIN GROUP عام 2010 في مدينة العين، إمارة أبوظبي، بهدف واحد واضح: تقديم خدمات صيانة وإدارة عقارات موثوقة وموثقة لأصحاب العقارات في دولة الإمارات. بدأنا بمشاريع صيانة محلية صغيرة وتطورنا إلى منظومة تشغيل متكاملة تضم الملاك، المستأجرين، الفنيين، والوسطاء في منصة رقمية واحدة متكاملة.'
      : 'BIN GROUP was founded in 2010 in Al Ain, Abu Dhabi Emirate, with one clear goal: deliver reliable, documented property maintenance and management services to UAE property owners. We started with small local maintenance projects and grew into a full operating system connecting owners, tenants, technicians, and brokers in one integrated digital platform.',

    missionTitle: ar ? 'مهمتنا' : 'Our Mission',
    mission: ar
      ? 'تقديم خدمات صيانة وإدارة عقارات موثوقة تحمي ممتلكات العملاء، تُقلّل الضغط التشغيلي، وتُحسّن العناية اليومية بالعقارات من خلال التواصل الواضح، ومعايير الخدمة المهنية، والسجلات الرقمية، والتنفيذ الميداني المُساءل.'
      : 'To deliver dependable maintenance and property management services that protect client properties, reduce operational stress, and improve daily property care through clear communication, professional service standards, digital records, and accountable field execution.',
    visionTitle: ar ? 'رؤيتنا' : 'Our Vision',
    vision: ar
      ? 'أن نصبح شركة رعاية عقارية موثوقة في الإمارات انطلاقًا من مدينة العين، معروفة بالصيانة الموثوقة، إدارة العقارات الشفافة، العمليات الرقمية الذكية، وسير عمل الموظفين بدون ورق، والعلاقات طويلة الأمد مع العملاء.'
      : 'To become a trusted UAE property-care company starting from Al Ain, known for reliable maintenance, transparent property management, smart digital operations, paperless staff workflows, and long-term client relationships.',
    promiseTitle: ar ? 'وعدنا' : 'Our Promise',
    promise: ar
      ? 'رعاية عقارية موثوقة من العين: عروض أسعار واضحة، عقود موثقة، 15% تعبئة، رؤية خطة الدفع، طلبات المستأجر، إرسال الفني، إثبات قبل وبعد، تقارير المالك، وخدمة ذاتية للموظفين.'
      : 'Trusted property care from Al Ain: clear quotes, documented contracts, 15% mobilization, payment-plan visibility, tenant requests, technician dispatch, before-and-after evidence, owner reports, and staff self-service.',

    problemsChip: ar ? 'المشكلة' : 'THE PROBLEM',
    problemsTitle: ar ? 'ما الذي نحلّه' : 'What We Solve',
    problemsSubtitle: ar
      ? 'رعاية العقارات في الإمارات غالبًا تعني مكالمات متفرقة، إيصالات ورقية، وعدم وضوح في من يفعل ماذا. هذه هي المشاكل الحقيقية التي بُنيت BIN GROUP لحلها.'
      : 'Property care in the UAE too often means scattered calls, paper receipts, and no clarity on who is doing what. These are the real problems BIN GROUP was built to solve.',

    servicesChip: ar ? 'ما نقدمه' : 'WHAT WE OFFER',
    servicesTitle: ar ? 'خدماتنا' : 'Our Services',

    needsChip: ar ? 'من نخدم' : 'WHO WE SERVE',
    needsTitle: ar ? 'ما يحتاجه الملاك والمستأجرون' : 'What Owners & Tenants Need',
    needsSubtitle: ar
      ? 'كل ميزة في BIN GROUP مبنية على حاجة حقيقية لمالك أو مستأجر، لا على تقنية لمجرد وجودها.'
      : 'Every BIN GROUP feature is built around a real owner or tenant need — not technology for its own sake.',
    needsOwnerLabel: ar ? 'احتياجات المالك' : 'Owner Needs',
    needsTenantLabel: ar ? 'احتياجات المستأجر' : 'Tenant Needs',
    needsNeedLabel: ar ? 'الحاجة' : 'The Need',
    needsSolutionLabel: ar ? 'كيف نلبّيها' : 'How We Meet It',

    roiChip: ar ? 'القيمة والعائد' : 'VALUE & ROI',
    roiTitle: ar ? 'لماذا هذا عائد استثمار، لا تكلفة فقط' : 'Why This Is a Return, Not Just a Cost',
    roiSubtitle: ar
      ? 'BIN GROUP ليست مجرد مزود صيانة، بل طريقة لحماية قيمة العقار، تقليل المخاطر، وضبط التكاليف على المدى الطويل.'
      : "BIN GROUP isn't just a maintenance vendor — it's a way to protect property value, reduce risk, and control costs over the long run.",

    hrChip: ar ? 'القوى العاملة' : 'WORKFORCE',
    hrTitle: ar ? 'موارد بشرية مبنية لفِرق العقارات والميدان' : 'HR Built for Field & Property Teams',
    hrSubtitle: ar
      ? 'الفنيون والموظفون الموثّقون جيدًا والمدعومون بشكل صحيح يقدمون خدمة أفضل للملاك والمستأجرين. هكذا نُدير قوتنا العاملة.'
      : 'Well-documented, properly supported technicians and staff deliver better service to owners and tenants. This is how we run our workforce.',

    coverageChip: ar ? 'نطاق الخدمة' : 'COVERAGE',
    coverageTitle: ar ? 'مناطق الخدمة' : 'Service Areas',
    coverageSubtitle: ar
      ? 'BIN GROUP تُقدم خدماتها عبر جميع إمارات الدولة، مع تركيز أساسي على العين وأبوظبي.'
      : 'BIN GROUP operates across all UAE emirates, with a primary focus on Al Ain and Abu Dhabi.',

    trustChip: ar ? 'لماذا نحن' : 'WHY BIN GROUP',
    trustTitle: ar ? 'كيف نبني الثقة' : 'How We Build Trust',
    trust: ar
      ? [
          'بيانات الشركة والرخصة معروضة بوضوح',
          'نطاق خدمة محدد بدون وعود مبالغ فيها',
          'إثبات قبل وبعد لكل عمل منجز',
          'تواصل مباشر عبر الهاتف والواتساب والبريد',
          'دعم ثنائي اللغة مع واجهة عربية كاملة',
          'سجلات رقمية لكل عقار وكل تدخل',
        ]
      : [
          'Clear company and licence information displayed',
          'Defined service scope with no exaggerated promises',
          'Before-and-after proof on every job completed',
          'Direct phone, WhatsApp, and email contact',
          'Full bilingual English/Arabic support with RTL layout',
          'Digital records for every property and every intervention',
        ],

    contactChip: ar ? 'تواصل معنا' : 'GET IN TOUCH',
    contactTitle: ar ? 'تواصل مع الإدارة' : 'Contact Us',
    contactSubtitle: ar
      ? 'تواصل مباشرة مع فريق BIN GROUP لعرض الأسعار، عقود الصيانة، أو أي استفسار.'
      : 'Reach the BIN GROUP team directly for quotes, maintenance contracts, or any enquiry.',
    location: ar ? 'العين، الإمارات العربية المتحدة' : 'Al Ain, United Arab Emirates',
    ctaStart: ar ? 'ابدأ عقدك الآن' : 'Start Your Contract',
    ctaWhatsapp: ar ? 'تواصل عبر واتساب' : 'WhatsApp BIN GROUP',
    ctaEmail: ar ? 'راسلنا عبر البريد' : 'Email Us',
  };
}

function StatCard({ value, label }: { value: string; label: string }) {
  return (
    <Box sx={{ textAlign: 'center', px: 2 }}>
      <Typography sx={{ color: gold, fontWeight: 950, fontSize: { xs: '1.9rem', md: '2.4rem' }, lineHeight: 1.1, textShadow: `0 0 24px ${alpha(gold, 0.5)}` }}>{value}</Typography>
      <Typography sx={{ color: 'rgba(255,255,255,0.55)', fontSize: '0.72rem', fontWeight: 800, letterSpacing: 1.5, mt: 0.3 }}>{label.toUpperCase()}</Typography>
    </Box>
  );
}

function NavButton({ children, onClick, contained = false, icon }: { children: React.ReactNode; onClick: () => void; contained?: boolean; icon?: React.ReactNode }) {
  return (
    <Button onClick={onClick} startIcon={icon} sx={{ minHeight: 44, px: 2.2, borderRadius: radius.button, fontWeight: 950, fontSize: '0.82rem', color: contained ? '#111827' : gold, border: contained ? 'none' : `1px solid ${alpha(gold, 0.35)}`, background: contained ? `linear-gradient(135deg, ${goldLight}, ${gold})` : '#FFFFFF', boxShadow: contained ? `0 12px 28px ${alpha(gold, 0.22)}` : 'none' }}>
      {children}
    </Button>
  );
}

export default function CompanyProfilePage() {
  const navigate = useNavigate();
  const { lang, setLang, isRTL } = useLanguage();
  const copy = useMemo(() => getCopy(lang), [lang]);
  const whatsappDigits = CONTACT.whatsapp.replace(/[^0-9]/g, '');
  const dir = isRTL ? 'rtl' : 'ltr';
  const textAlign = isRTL ? 'right' : 'left';

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: '#fff', color: ink, direction: dir, position: 'relative', overflowX: 'hidden' }}>
      <BrandWatermark opacity={0.06} />
      <Box sx={{ position: 'relative', zIndex: 1 }}>

        {/* Credentials band */}
        <Box sx={{ bgcolor: '#111827', py: 0.8, borderBottom: `1px solid ${alpha(gold, 0.2)}` }}>
          <Container maxWidth="lg">
            <Stack direction="row" spacing={1.5} justifyContent="center" alignItems="center" flexWrap="wrap" sx={{ gap: 1 }}>
              <Box sx={{ width: 7, height: 7, borderRadius: '50%', bgcolor: '#22C55E', boxShadow: '0 0 6px #22C55E', flexShrink: 0 }} />
              <Typography sx={{ color: 'rgba(255,255,255,.78)', fontSize: '0.72rem', fontWeight: 800 }}>{copy.credLegal}</Typography>
              <Typography sx={{ color: alpha(gold, 0.4), fontSize: '0.7rem', display: { xs: 'none', sm: 'block' } }}>·</Typography>
              <Typography sx={{ color: 'rgba(255,255,255,.5)', fontSize: '0.72rem', fontWeight: 700, display: { xs: 'none', sm: 'block' } }}>Licensed in Abu Dhabi, UAE</Typography>
              <Typography sx={{ color: alpha(gold, 0.4), fontSize: '0.7rem', display: { xs: 'none', md: 'block' } }}>·</Typography>
              <Typography sx={{ color: alpha(gold, 0.75), fontSize: '0.72rem', fontWeight: 800, display: { xs: 'none', md: 'block' } }}>{copy.credEst}</Typography>
            </Stack>
          </Container>
        </Box>

        {/* Sticky nav */}
        <Box sx={{ position: 'sticky', top: 0, zIndex: 20, bgcolor: 'rgba(255,255,255,.94)', backdropFilter: 'blur(18px)', borderBottom: `1px solid ${line}` }}>
          <Container maxWidth="lg" sx={{ py: 1.2, display: 'flex', alignItems: 'center', gap: 1.2, flexWrap: 'wrap' }}>
            <Button onClick={() => navigate('/')} sx={{ p: 0, minWidth: 0, color: ink, mr: 'auto' }}>
              <Stack direction="row" spacing={1.2} alignItems="center">
                <Box component="img" src="/logo.png" sx={{ width: 42, height: 42, borderRadius: 1.1, boxShadow: '0 10px 22px rgba(17,24,39,.10)' }} />
                <Typography fontWeight={950}>{copy.brand}</Typography>
              </Stack>
            </Button>
            <NavButton onClick={() => navigate('/')} icon={<Home size={17} />}>{copy.navHome}</NavButton>
            <NavButton onClick={() => navigate('/onboarding')} contained>{copy.navStart}</NavButton>
            <NavButton onClick={() => navigate('/login')} icon={<LogIn size={17} />}>{copy.navLogin}</NavButton>
            <NavButton onClick={() => setLang(lang === 'en' ? 'ar' : 'en')} icon={<Globe size={17} />}>{lang === 'ar' ? 'EN' : 'AR'}</NavButton>
          </Container>
        </Box>

        {/* ── HERO ── */}
        <Box sx={{ background: 'linear-gradient(160deg, #0B0B0C 0%, #1a1a2e 55%, #111827 100%)', borderBottom: `1px solid ${alpha(gold, 0.22)}`, position: 'relative', overflow: 'hidden' }}>
          {/* Grid overlay */}
          <Box sx={{ position: 'absolute', inset: 0, backgroundImage: `linear-gradient(${alpha(gold, 0.03)} 1px, transparent 1px), linear-gradient(90deg, ${alpha(gold, 0.03)} 1px, transparent 1px)`, backgroundSize: '48px 48px', pointerEvents: 'none' }} />
          {/* Radial glow */}
          <Box sx={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: 600, height: 600, background: `radial-gradient(circle, ${alpha(gold, 0.12)} 0%, transparent 65%)`, borderRadius: '50%', pointerEvents: 'none' }} />
          <Container maxWidth="lg" sx={{ py: { xs: 8, md: 13 }, position: 'relative', zIndex: 2 }}>
            <Stack spacing={4} alignItems="center" sx={{ textAlign: 'center' }}>
              <Chip label={copy.heroChip} sx={{ bgcolor: alpha(gold, 0.13), color: gold, fontWeight: 950, border: `1px solid ${alpha(gold, 0.3)}`, letterSpacing: 2 }} />

              {/* Logo */}
              <Box sx={{ position: 'relative', display: 'inline-block' }}>
                <Box sx={{ position: 'absolute', inset: -14, borderRadius: '36px', background: `radial-gradient(circle, ${alpha(gold, 0.28)} 0%, transparent 68%)`, pointerEvents: 'none' }} />
                <Box component="img" src="/logo.png" alt="BIN GROUP" sx={{ width: { xs: 140, md: 180 }, height: { xs: 140, md: 180 }, borderRadius: '26px', display: 'block', border: `2.5px solid ${alpha(gold, 0.65)}`, boxShadow: `0 0 0 6px ${alpha(gold, 0.1)}, 0 24px 72px ${alpha(gold, 0.42)}, 0 0 120px ${alpha(gold, 0.15)}`, position: 'relative', zIndex: 1 }} />
              </Box>

              <Box>
                <Typography sx={{ color: gold, fontWeight: 950, letterSpacing: 7, fontSize: { xs: '2rem', md: '2.8rem' }, textTransform: 'uppercase', textShadow: `0 0 40px ${alpha(gold, 0.6)}`, mb: 0.5 }}>{copy.heroTitle}</Typography>
                <Typography sx={{ color: 'rgba(255,255,255,.45)', fontWeight: 700, fontSize: '0.78rem', letterSpacing: 3 }}>PROPERTY MAINTENANCE · MANAGEMENT · UAE</Typography>
              </Box>

              <Typography variant="h5" sx={{ color: 'rgba(255,255,255,.78)', fontWeight: 750, maxWidth: 680, lineHeight: 1.75 }}>{copy.heroTagline}</Typography>

              {/* Credential pills */}
              <Stack direction="row" spacing={1.5} flexWrap="wrap" justifyContent="center" sx={{ gap: 1.2 }}>
                {['EST. 2010', 'AL AIN · UAE', 'LICENSED LLC', 'ABU DHABI'].map(b => (
                  <Box key={b} sx={{ px: 2, py: 0.5, bgcolor: 'rgba(0,0,0,.55)', border: `1px solid ${alpha(gold, 0.32)}`, borderRadius: 2, backdropFilter: 'blur(12px)' }}>
                    <Typography sx={{ color: gold, fontWeight: 950, fontSize: '0.65rem', letterSpacing: 2 }}>{b}</Typography>
                  </Box>
                ))}
              </Stack>

              {/* Stats row */}
              <Stack direction="row" spacing={{ xs: 2, md: 5 }} justifyContent="center" alignItems="center" sx={{ pt: 1, pb: 1, px: 4, borderTop: `1px solid ${alpha(gold, 0.18)}`, borderBottom: `1px solid ${alpha(gold, 0.18)}`, width: '100%', maxWidth: 560 }}>
                {copy.stats.map(([v, l]) => <StatCard key={v} value={v} label={l} />)}
              </Stack>

              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} justifyContent="center">
                <Button variant="contained" onClick={() => navigate('/onboarding')} sx={{ bgcolor: gold, color: '#111827', fontWeight: 950, px: 4, py: 1.5, borderRadius: radius.button, boxShadow: `0 12px 32px ${alpha(gold, 0.4)}` }}>{copy.ctaStart}</Button>
                <Button variant="outlined" startIcon={<MessageSquare size={18} />} onClick={() => window.open(`https://wa.me/${whatsappDigits}`, '_blank')} sx={{ borderColor: alpha(gold, 0.45), color: gold, fontWeight: 950, px: 4, py: 1.5, borderRadius: radius.button }}>{copy.ctaWhatsapp}</Button>
              </Stack>

              {/* Legal line */}
              <Typography variant="caption" sx={{ color: 'rgba(255,255,255,.3)', fontWeight: 700, maxWidth: 620, lineHeight: 1.8 }}>{copy.heroLicense}</Typography>
            </Stack>
          </Container>
        </Box>

        {/* ── ABOUT ── */}
        <Box sx={{ py: 10, bgcolor: '#111827', borderBottom: `1px solid ${alpha(gold, 0.18)}` }}>
          <Container maxWidth="lg">
            <Box sx={{ textAlign: 'center', mb: 6 }}>
              <Chip label={copy.aboutChip} sx={{ mb: 2, bgcolor: alpha(gold, 0.12), color: gold, fontWeight: 950, border: `1px solid ${alpha(gold, 0.25)}` }} />
              <Typography variant="h2" fontWeight={950} sx={{ color: '#FFF', mb: 2 }}>{copy.aboutTitle}</Typography>
              <Typography variant="h6" sx={{ color: 'rgba(255,255,255,.65)', fontWeight: 700, maxWidth: 780, mx: 'auto', lineHeight: 1.9 }}>{copy.aboutText}</Typography>
            </Box>

            <Grid container spacing={3}>
              {[
                { icon: <Building2 size={22} />, title: copy.missionTitle, body: copy.mission },
                { icon: <Sparkles size={22} />, title: copy.visionTitle, body: copy.vision },
                { icon: <Award size={22} />, title: copy.promiseTitle, body: copy.promise },
              ].map(({ icon, title, body }) => (
                <Grid item xs={12} md={4} key={title}>
                  <Paper sx={{ p: 4, height: '100%', borderRadius: 4, bgcolor: 'rgba(255,255,255,.04)', border: `1px solid ${alpha(gold, 0.18)}` }}>
                    <Stack spacing={2}>
                      <Box sx={{ p: 1.2, bgcolor: alpha(gold, 0.12), borderRadius: 2, display: 'inline-flex', color: gold }}>{icon}</Box>
                      <Typography variant="h6" fontWeight={950} sx={{ color: gold }}>{title}</Typography>
                      <Typography sx={{ color: 'rgba(255,255,255,.72)', fontWeight: 700, lineHeight: 1.9, textAlign }}>{body}</Typography>
                    </Stack>
                  </Paper>
                </Grid>
              ))}
            </Grid>
          </Container>
        </Box>

        {/* ── PROBLEMS WE SOLVE ── */}
        <Box sx={{ py: 10, bgcolor: platinum, borderBottom: `1px solid ${line}` }}>
          <Container maxWidth="lg">
            <Box sx={{ textAlign: 'center', mb: 7 }}>
              <Chip label={copy.problemsChip} sx={{ mb: 2, bgcolor: alpha(gold, 0.1), color: '#6F5522', fontWeight: 950, border: `1px solid ${alpha(gold, 0.22)}` }} />
              <Typography variant="h2" fontWeight={950} sx={{ color: ink, mb: 2 }}>{copy.problemsTitle}</Typography>
              <Typography variant="h6" sx={{ color: muted, fontWeight: 700, maxWidth: 760, mx: 'auto', lineHeight: 1.9 }}>{copy.problemsSubtitle}</Typography>
            </Box>
            <Grid container spacing={3}>
              {PROBLEMS.map(({ icon, en, ar, descEn, descAr }) => (
                <Grid item xs={12} sm={6} md={4} key={en}>
                  <Paper sx={{ p: 3.5, height: '100%', borderRadius: radius.card, border: `1px solid ${line}`, bgcolor: '#fff', transition: 'box-shadow .2s', '&:hover': { boxShadow: `0 16px 40px ${alpha('#DC2626', 0.1)}`, borderColor: alpha('#DC2626', 0.3) } }}>
                    <Stack spacing={1.5} alignItems={isRTL ? 'flex-end' : 'flex-start'}>
                      <Box sx={{ p: 1.2, bgcolor: alpha('#DC2626', 0.08), borderRadius: 2, color: '#B91C1C', display: 'inline-flex' }}>{icon}</Box>
                      <Typography fontWeight={950} sx={{ color: ink, textAlign }}>{copy.ar ? ar : en}</Typography>
                      <Typography variant="body2" sx={{ color: muted, lineHeight: 1.75, textAlign }}>{copy.ar ? descAr : descEn}</Typography>
                    </Stack>
                  </Paper>
                </Grid>
              ))}
            </Grid>
          </Container>
        </Box>

        {/* ── SERVICES ── */}
        <Box sx={{ py: 10, bgcolor: platinum, borderBottom: `1px solid ${line}` }}>
          <Container maxWidth="lg">
            <Box sx={{ textAlign: 'center', mb: 7 }}>
              <Chip label={copy.servicesChip} sx={{ mb: 2, bgcolor: alpha(gold, 0.1), color: '#6F5522', fontWeight: 950, border: `1px solid ${alpha(gold, 0.22)}` }} />
              <Typography variant="h2" fontWeight={950} sx={{ color: ink }}>{copy.servicesTitle}</Typography>
            </Box>
            <Grid container spacing={3}>
              {SERVICES.map(({ icon, en, ar, descEn, descAr }) => (
                <Grid item xs={12} sm={6} md={3} key={en}>
                  <Paper sx={{ p: 3.5, height: '100%', borderRadius: radius.card, border: `1px solid ${line}`, bgcolor: '#fff', transition: 'box-shadow .2s', '&:hover': { boxShadow: `0 16px 40px ${alpha(gold, 0.12)}`, borderColor: alpha(gold, 0.35) } }}>
                    <Stack spacing={1.5} alignItems={isRTL ? 'flex-end' : 'flex-start'}>
                      <Box sx={{ p: 1.2, bgcolor: alpha(gold, 0.1), borderRadius: 2, color: '#6F5522', display: 'inline-flex' }}>{icon}</Box>
                      <Typography fontWeight={950} sx={{ color: ink, textAlign }}>{copy.ar ? ar : en}</Typography>
                      <Typography variant="body2" sx={{ color: muted, lineHeight: 1.75, textAlign }}>{copy.ar ? descAr : descEn}</Typography>
                    </Stack>
                  </Paper>
                </Grid>
              ))}
            </Grid>
          </Container>
        </Box>

        {/* ── OWNER & TENANT NEEDS ── */}
        <Box sx={{ py: 10, bgcolor: '#111827', borderBottom: `1px solid ${alpha(gold, 0.18)}` }}>
          <Container maxWidth="lg">
            <Box sx={{ textAlign: 'center', mb: 7 }}>
              <Chip label={copy.needsChip} sx={{ mb: 2, bgcolor: alpha(gold, 0.12), color: gold, fontWeight: 950, border: `1px solid ${alpha(gold, 0.25)}` }} />
              <Typography variant="h2" fontWeight={950} sx={{ color: '#FFF', mb: 2 }}>{copy.needsTitle}</Typography>
              <Typography variant="h6" sx={{ color: 'rgba(255,255,255,.65)', fontWeight: 700, maxWidth: 760, mx: 'auto', lineHeight: 1.9 }}>{copy.needsSubtitle}</Typography>
            </Box>
            <Grid container spacing={4}>
              {[
                { label: copy.needsOwnerLabel, icon: <KeyRound size={20} />, items: OWNER_NEEDS },
                { label: copy.needsTenantLabel, icon: <Home size={20} />, items: TENANT_NEEDS },
              ].map(({ label, icon, items }) => (
                <Grid item xs={12} md={6} key={label}>
                  <Paper sx={{ p: { xs: 2.5, md: 3.5 }, height: '100%', borderRadius: 4, bgcolor: 'rgba(255,255,255,.04)', border: `1px solid ${alpha(gold, 0.18)}` }}>
                    <Stack direction={isRTL ? 'row-reverse' : 'row'} spacing={1.5} alignItems="center" sx={{ mb: 3 }}>
                      <Box sx={{ p: 1, bgcolor: alpha(gold, 0.14), borderRadius: 2, color: gold, display: 'inline-flex' }}>{icon}</Box>
                      <Typography variant="h6" fontWeight={950} sx={{ color: gold }}>{label}</Typography>
                    </Stack>
                    <Stack spacing={2.5} divider={<Box sx={{ borderBottom: `1px solid ${alpha(gold, 0.12)}` }} />}>
                      {items.map((item: { needEn: string; needAr: string; solutionEn: string; solutionAr: string }) => (
                        <Box key={item.needEn}>
                          <Typography sx={{ color: '#FFF', fontWeight: 850, fontSize: '0.92rem', textAlign, mb: 0.5 }}>
                            {copy.ar ? item.needAr : item.needEn}
                          </Typography>
                          <Stack direction={isRTL ? 'row-reverse' : 'row'} spacing={1} alignItems="flex-start">
                            <CheckCircle2 size={15} color={gold} style={{ flexShrink: 0, marginTop: 3 }} />
                            <Typography variant="body2" sx={{ color: 'rgba(255,255,255,.65)', lineHeight: 1.7, textAlign }}>
                              {copy.ar ? item.solutionAr : item.solutionEn}
                            </Typography>
                          </Stack>
                        </Box>
                      ))}
                    </Stack>
                  </Paper>
                </Grid>
              ))}
            </Grid>
          </Container>
        </Box>

        {/* ── ROI / VALUE ── */}
        <Box sx={{ py: 10, bgcolor: platinum, borderBottom: `1px solid ${line}` }}>
          <Container maxWidth="lg">
            <Box sx={{ textAlign: 'center', mb: 7 }}>
              <Chip label={copy.roiChip} sx={{ mb: 2, bgcolor: alpha('#10B981', 0.1), color: '#0F766E', fontWeight: 950, border: `1px solid ${alpha('#10B981', 0.25)}` }} />
              <Typography variant="h2" fontWeight={950} sx={{ color: ink, mb: 2 }}>{copy.roiTitle}</Typography>
              <Typography variant="h6" sx={{ color: muted, fontWeight: 700, maxWidth: 760, mx: 'auto', lineHeight: 1.9 }}>{copy.roiSubtitle}</Typography>
            </Box>
            <Grid container spacing={3}>
              {ROI_POINTS.map(({ icon, en, ar, descEn, descAr }) => (
                <Grid item xs={12} sm={6} md={3} key={en}>
                  <Paper sx={{ p: 3.5, height: '100%', borderRadius: radius.card, border: `1px solid ${line}`, bgcolor: '#fff', transition: 'box-shadow .2s', '&:hover': { boxShadow: `0 16px 40px ${alpha('#10B981', 0.14)}`, borderColor: alpha('#10B981', 0.35) } }}>
                    <Stack spacing={1.5} alignItems={isRTL ? 'flex-end' : 'flex-start'}>
                      <Box sx={{ p: 1.2, bgcolor: alpha('#10B981', 0.1), borderRadius: 2, color: '#0F766E', display: 'inline-flex' }}>{icon}</Box>
                      <Typography fontWeight={950} sx={{ color: ink, textAlign }}>{copy.ar ? ar : en}</Typography>
                      <Typography variant="body2" sx={{ color: muted, lineHeight: 1.75, textAlign }}>{copy.ar ? descAr : descEn}</Typography>
                    </Stack>
                  </Paper>
                </Grid>
              ))}
            </Grid>
          </Container>
        </Box>

        {/* ── HR / WORKFORCE ── */}
        <Box sx={{ py: 10, bgcolor: '#111827', borderBottom: `1px solid ${alpha(gold, 0.18)}` }}>
          <Container maxWidth="lg">
            <Box sx={{ textAlign: 'center', mb: 7 }}>
              <Chip label={copy.hrChip} sx={{ mb: 2, bgcolor: alpha(gold, 0.12), color: gold, fontWeight: 950, border: `1px solid ${alpha(gold, 0.25)}` }} />
              <Typography variant="h2" fontWeight={950} sx={{ color: '#FFF', mb: 2 }}>{copy.hrTitle}</Typography>
              <Typography variant="h6" sx={{ color: 'rgba(255,255,255,.65)', fontWeight: 700, maxWidth: 760, mx: 'auto', lineHeight: 1.9 }}>{copy.hrSubtitle}</Typography>
            </Box>
            <Grid container spacing={3}>
              {HR_POINTS.map(({ icon, en, ar, descEn, descAr }) => (
                <Grid item xs={12} sm={6} md={3} key={en}>
                  <Paper sx={{ p: 3.5, height: '100%', borderRadius: radius.card, bgcolor: 'rgba(255,255,255,.04)', border: `1px solid ${alpha(gold, 0.18)}` }}>
                    <Stack spacing={1.5} alignItems={isRTL ? 'flex-end' : 'flex-start'}>
                      <Box sx={{ p: 1.2, bgcolor: alpha(gold, 0.12), borderRadius: 2, color: gold, display: 'inline-flex' }}>{icon}</Box>
                      <Typography fontWeight={950} sx={{ color: '#FFF', textAlign }}>{copy.ar ? ar : en}</Typography>
                      <Typography variant="body2" sx={{ color: 'rgba(255,255,255,.65)', lineHeight: 1.75, textAlign }}>{copy.ar ? descAr : descEn}</Typography>
                    </Stack>
                  </Paper>
                </Grid>
              ))}
            </Grid>
          </Container>
        </Box>

        {/* ── SERVICE AREAS ── */}
        <Box sx={{ py: 9, bgcolor: '#111827', borderBottom: `1px solid ${alpha(gold, 0.18)}` }}>
          <Container maxWidth="lg">
            <Box sx={{ textAlign: 'center', mb: 5 }}>
              <Chip label={copy.coverageChip} sx={{ mb: 2, bgcolor: alpha(gold, 0.12), color: gold, fontWeight: 950, border: `1px solid ${alpha(gold, 0.25)}` }} />
              <Typography variant="h2" fontWeight={950} sx={{ color: '#FFF', mb: 1.5 }}>{copy.coverageTitle}</Typography>
              <Typography variant="h6" sx={{ color: 'rgba(255,255,255,.6)', fontWeight: 700, maxWidth: 600, mx: 'auto' }}>{copy.coverageSubtitle}</Typography>
            </Box>
            <Stack direction="row" flexWrap="wrap" justifyContent="center" sx={{ gap: 1.5 }}>
              {SERVICE_AREAS.map((area) => (
                <Box key={area} sx={{ px: 3, py: 1.2, bgcolor: 'rgba(255,255,255,.05)', border: `1.5px solid ${alpha(gold, 0.28)}`, borderRadius: 2.5, backdropFilter: 'blur(8px)', transition: 'all .2s', '&:hover': { bgcolor: alpha(gold, 0.1), borderColor: alpha(gold, 0.55) } }}>
                  <Stack direction="row" spacing={1} alignItems="center">
                    <MapPin size={14} color={gold} />
                    <Typography sx={{ color: '#FFF', fontWeight: 850, fontSize: '0.9rem' }}>{area}</Typography>
                  </Stack>
                </Box>
              ))}
            </Stack>
          </Container>
        </Box>

        {/* ── TRUST ── */}
        <Box sx={{ py: 9, bgcolor: platinum, borderBottom: `1px solid ${line}` }}>
          <Container maxWidth="lg">
            <Box sx={{ textAlign: 'center', mb: 5 }}>
              <Chip label={copy.trustChip} sx={{ mb: 2, bgcolor: alpha(gold, 0.1), color: '#6F5522', fontWeight: 950, border: `1px solid ${alpha(gold, 0.22)}` }} />
              <Typography variant="h2" fontWeight={950} sx={{ color: ink }}>{copy.trustTitle}</Typography>
            </Box>
            <Grid container spacing={2} justifyContent="center">
              {copy.trust.map((item) => (
                <Grid item xs={12} sm={6} md={4} key={item}>
                  <Stack direction={isRTL ? 'row-reverse' : 'row'} spacing={1.5} alignItems="center" sx={{ p: 2.5, borderRadius: radius.card, border: `1px solid ${line}`, bgcolor: '#fff', boxShadow: '0 4px 16px rgba(17,24,39,.05)' }}>
                    <CheckCircle2 size={20} color={gold} style={{ flexShrink: 0 }} />
                    <Typography sx={{ color: '#374151', fontWeight: 800, textAlign }}>{item}</Typography>
                  </Stack>
                </Grid>
              ))}
            </Grid>
          </Container>
        </Box>

        {/* ── CONTACT ── */}
        <Box sx={{ py: 10, background: 'linear-gradient(160deg, #0B0B0C 0%, #1a1a2e 55%, #111827 100%)', position: 'relative', overflow: 'hidden' }}>
          <Box sx={{ position: 'absolute', inset: 0, backgroundImage: `linear-gradient(${alpha(gold, 0.025)} 1px, transparent 1px), linear-gradient(90deg, ${alpha(gold, 0.025)} 1px, transparent 1px)`, backgroundSize: '48px 48px', pointerEvents: 'none' }} />
          <Container maxWidth="md" sx={{ position: 'relative', zIndex: 2 }}>
            <Box sx={{ textAlign: 'center', mb: 6 }}>
              <Chip label={copy.contactChip} sx={{ mb: 2, bgcolor: alpha(gold, 0.12), color: gold, fontWeight: 950, border: `1px solid ${alpha(gold, 0.28)}`, letterSpacing: 2 }} />
              {/* Logo */}
              <Box sx={{ mb: 3, display: 'flex', justifyContent: 'center' }}>
                <Box sx={{ position: 'relative', display: 'inline-block' }}>
                  <Box sx={{ position: 'absolute', inset: -10, borderRadius: '24px', background: `radial-gradient(circle, ${alpha(gold, 0.22)} 0%, transparent 70%)` }} />
                  <Box component="img" src="/logo.png" alt="BIN GROUP" sx={{ width: 80, height: 80, borderRadius: '16px', display: 'block', border: `2px solid ${alpha(gold, 0.6)}`, boxShadow: `0 0 0 4px ${alpha(gold, 0.1)}, 0 16px 48px ${alpha(gold, 0.38)}`, position: 'relative', zIndex: 1 }} />
                </Box>
              </Box>
              <Typography variant="h2" fontWeight={950} sx={{ color: gold, mb: 1 }}>{copy.contactTitle}</Typography>
              <Typography variant="h6" sx={{ color: 'rgba(255,255,255,.62)', fontWeight: 700, maxWidth: 520, mx: 'auto', lineHeight: 1.8 }}>{copy.contactSubtitle}</Typography>
            </Box>

            {/* Contact cards */}
            <Grid container spacing={2.5} sx={{ mb: 5 }}>
              {[
                { icon: <Phone size={22} />, label: copy.ar ? 'الهاتف' : 'Phone', value: CONTACT.phone, href: `tel:${CONTACT.phone}` },
                { icon: <MessageSquare size={22} />, label: 'WhatsApp', value: CONTACT.whatsapp, href: `https://wa.me/${whatsappDigits}` },
                { icon: <Mail size={22} />, label: copy.ar ? 'البريد الإلكتروني' : 'Email', value: CONTACT.email, href: `mailto:${CONTACT.email}` },
                { icon: <MapPin size={22} />, label: copy.ar ? 'الموقع' : 'Location', value: copy.location, href: undefined },
              ].map(({ icon, label, value, href }) => (
                <Grid item xs={12} sm={6} key={label}>
                  <Paper
                    component={href ? 'a' : 'div'}
                    {...(href ? { href, target: href.startsWith('http') ? '_blank' : undefined, rel: 'noopener noreferrer' } : {})}
                    sx={{ p: 3, height: '100%', borderRadius: 3, bgcolor: 'rgba(255,255,255,.05)', border: `1px solid ${alpha(gold, 0.22)}`, display: 'block', textDecoration: 'none', transition: 'all .2s', '&:hover': href ? { bgcolor: alpha(gold, 0.1), borderColor: alpha(gold, 0.45), transform: 'translateY(-2px)' } : {} }}
                  >
                    <Stack direction={isRTL ? 'row-reverse' : 'row'} spacing={2} alignItems="center">
                      <Box sx={{ p: 1.2, bgcolor: alpha(gold, 0.12), borderRadius: 2, color: gold, flexShrink: 0 }}>{icon}</Box>
                      <Box>
                        <Typography variant="caption" sx={{ color: alpha(gold, 0.7), fontWeight: 900, letterSpacing: 1.5, display: 'block' }}>{label.toUpperCase()}</Typography>
                        <Typography sx={{ color: '#FFF', fontWeight: 850, fontSize: '0.95rem', textAlign }}>{value}</Typography>
                      </Box>
                    </Stack>
                  </Paper>
                </Grid>
              ))}
            </Grid>

            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} justifyContent="center">
              <Button variant="contained" size="large" startIcon={<MessageSquare size={18} />} onClick={() => window.open(`https://wa.me/${whatsappDigits}`, '_blank')} sx={{ bgcolor: gold, color: '#111827', fontWeight: 950, px: 4, py: 1.6, borderRadius: radius.button, boxShadow: `0 12px 32px ${alpha(gold, 0.4)}` }}>{copy.ctaWhatsapp}</Button>
              <Button variant="outlined" size="large" startIcon={<Mail size={18} />} onClick={() => window.open(`mailto:${CONTACT.email}`, '_blank')} sx={{ borderColor: alpha(gold, 0.45), color: gold, fontWeight: 950, px: 4, py: 1.6, borderRadius: radius.button }}>{copy.ctaEmail}</Button>
              <Button variant="outlined" size="large" onClick={() => navigate('/onboarding')} sx={{ borderColor: 'rgba(255,255,255,.18)', color: 'rgba(255,255,255,.78)', fontWeight: 950, px: 4, py: 1.6, borderRadius: radius.button }}>{copy.ctaStart}</Button>
            </Stack>
          </Container>
        </Box>

      </Box>
    </Box>
  );
}

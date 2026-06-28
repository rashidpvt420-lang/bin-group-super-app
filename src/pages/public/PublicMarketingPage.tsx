import React from 'react';
import { Box, Button, Chip, Container, Grid, Paper, Stack, Typography, alpha } from '@mui/material';
import { Bot, Building2, Camera, FileText, Globe, LogIn, MessageCircle, ShieldCheck, WalletCards, Workflow } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import { binThemeTokens } from '../../theme/binGroupTheme';
import BrandWatermark from '../../components/BrandWatermark';

type PublicMarketingPageKey =
  | 'home'
  | 'owners'
  | 'tenants'
  | 'technicians'
  | 'brokers'
  | 'property-management'
  | 'maintenance'
  | 'majlis-care'
  | 'stadiums'
  | 'hotels'
  | 'malls'
  | 'hospitals'
  | 'government-properties'
  | 'security'
  | 'contact';

type PublicMarketingPageProps = { page?: PublicMarketingPageKey };

type CopyShape = typeof copy.en;

const WHATSAPP_URL = 'https://wa.me/971552423233';
const ONBOARDING_URL = '/onboarding';
const QUOTE_URL = '/onboarding?intent=quote';
const LOGIN_URL = '/login';

const ink = '#111827';
const muted = '#5B6270';
const canvas = '#FFFFFF';
const platinum = '#F7F7F4';
const line = '#E8E3D7';
const gold = binThemeTokens.gold;
const goldLight = binThemeTokens.goldLight;
const radius = { outer: 3, card: 2.25, button: 2 };



const copy = {
  en: {
    brand: 'BIN GROUP',
    chip: 'UAE PROPERTY CARE HOME OS',
    title: 'One Operating System for Property Care, Management, and Proof.',
    desc: 'BIN GROUP gives serious UAE property owners a unified Home OS: property details, instant quote, contract selection, 15% mobilization, tenant registry, rent ledger waterfall, 5% management fee logic, technician dispatch, SLA timers, before-and-after proof, owner reports, and permanent property passport history.',
    primary: 'Start Property Details',
    primaryHref: ONBOARDING_URL,
    showQuote: true,
    quote: 'Get Instant Quote',
    login: 'Portal Login',
    whatsapp: 'WhatsApp BIN GROUP',
    flow: 'Owner journey: details → quote → contract → service tracking → verified payout record',
    proofTitle: 'A complete agentic PropTech ecosystem',
    proofDesc: 'BIN GROUP replaces scattered WhatsApp messages, manual invoices, missing evidence, delayed coordination, and unclear owner reporting with one audited workflow across owners, tenants, technicians, brokers, finance, and admin.',
    command: [
      ['Home OS Intake', 'One intelligent prompt instead of scattered calls', 'START'],
      ['Instant Quote', 'Maintenance, management, or hybrid contract scope', 'QUOTE'],
      ['Total Care Hybrid', 'Tenant registry, rent ledger waterfall, 5% fee logic', 'CARE'],
      ['No-Call Operations', 'AI triage, SLA timers, photo proof, owner reports', 'LIVE'],
    ],
    cards: [
      ['Home OS Concept', 'Replace scattered calls, chats, and invoices with one prompt-to-workflow operating layer.'],
      ['Total Care Hybrid', 'Handle tenant registry, rent ledger waterfall, management fee logic, maintenance deductions, and owner payout visibility.'],
      ['Sovereign Property Intelligence', 'Adapt the SOP by asset type: tower, villa, Majlis, residential building, commercial asset, or portfolio.'],
      ['Agentic No-Call Efficiency', 'Classify issues, enforce SLA timers, dispatch technicians, and require before-and-after proof automatically.'],
    ],
    pricingTitle: 'Contracts & financial logic',
    pricing: [['Maintenance', 'Custom Quote'], ['Management', '5% model'], ['Mobilization', '15% upfront'], ['Payment Plans', 'Monthly / Quarterly / Annual']],
    coverageTitle: 'Asset-adaptive operations for UAE property types',
    coverage: ['Villas', 'Apartments', 'Buildings', 'Commercial Towers', 'Hotels', 'Schools', 'Clinics', 'Hospitals', 'Offices', 'Malls', 'Private Majlis', 'Government Majlis', 'Warehouses', 'Staff Accommodation', 'Retail', 'Industrial', 'Mixed-use Assets'],
    inquiryTitle: 'Start the correct contract path',
    inquiryDesc: 'Send the property profile and BIN GROUP prepares the right maintenance, property management, or Total Care Hybrid package for your asset.',
  },
  ar: {
    brand: 'مجموعة بن',
    chip: 'نظام تشغيل العناية بالعقار في الإمارات',
    title: 'نظام تشغيل واحد للعناية بالعقار وإدارته وإثبات الخدمة.',
    desc: 'مجموعة بن تمنح ملاك العقارات في الإمارات نظام Home OS موحد: تفاصيل العقار، عرض سعر فوري، اختيار العقد، دفعة تفعيل 15٪، سجل المستأجرين، دفتر الإيجارات، منطق رسوم الإدارة 5٪، إرسال الفنيين، مؤقتات SLA، إثبات قبل وبعد، تقارير المالك، وسجل جواز العقار الدائم.',
    primary: 'ابدأ تفاصيل العقار',
    primaryHref: ONBOARDING_URL,
    showQuote: true,
    quote: 'احصل على عرض سعر فوري',
    login: 'دخول البوابة',
    whatsapp: 'تواصل عبر واتساب',
    flow: 'رحلة المالك: تفاصيل ← عرض سعر ← عقد ← تتبع الخدمة ← سجل دفع موثق',
    proofTitle: 'منظومة PropTech ذكية ومتكاملة',
    proofDesc: 'مجموعة بن تستبدل رسائل واتساب المتفرقة والفواتير اليدوية وغياب الإثباتات وتأخر التنسيق بتدفق عمل موثق يجمع المالك والمستأجر والفني والوسيط والمالية والإدارة.',
    command: [
      ['إدخال Home OS', 'طلب ذكي واحد بدل الاتصالات المتفرقة', 'ابدأ'],
      ['عرض سعر فوري', 'صيانة أو إدارة أو نطاق هجين', 'سعر'],
      ['Total Care Hybrid', 'سجل المستأجرين ودفتر الإيجارات ومنطق 5٪', 'رعاية'],
      ['تشغيل بدون اتصالات', 'تصنيف ذكي، SLA، إثبات صور، تقارير المالك', 'مباشر'],
    ],
    cards: [
      ['Home OS للعقار', 'استبدال الاتصالات والرسائل والفواتير المتفرقة بطبقة تشغيل موحدة.'],
      ['Total Care Hybrid', 'إدارة سجل المستأجرين ودفتر الإيجارات ورسوم الإدارة وخصومات الصيانة ووضوح التحويل للمالك.'],
      ['Sovereign Property Intelligence', 'تكييف التشغيل حسب نوع الأصل: برج، فيلا، مجلس، مبنى سكني، أصل تجاري، أو محفظة.'],
      ['كفاءة No-Call الذكية', 'تصنيف الأعطال، فرض SLA، إرسال الفنيين، وطلب إثبات قبل وبعد تلقائياً.'],
    ],
    pricingTitle: 'العقود والمنطق المالي',
    pricing: [['الصيانة', 'عرض مخصص'], ['الإدارة', 'نموذج 5٪'], ['التفعيل', '15٪ مقدماً'], ['الدفع', 'شهري / ربع سنوي / سنوي']],
    coverageTitle: 'تشغيل يتكيف مع نوع العقار في الإمارات',
    coverage: ['فلل', 'شقق', 'مبانٍ', 'أبراج تجارية', 'فنادق', 'مدارس', 'عيادات', 'مستشفيات', 'مكاتب', 'مراكز تجارية', 'مجالس خاصة', 'مجالس حكومية', 'مستودعات', 'سكن موظفين', 'محلات', 'منشآت صناعية'],
    inquiryTitle: 'ابدأ مسار العقد الصحيح',
    inquiryDesc: 'أرسل ملف العقار لتجهز مجموعة بن مسار الصيانة أو إدارة العقار أو باقة Total Care Hybrid المناسبة للأصل.',
  },
};

type PageOverride = Partial<CopyShape>;

const pageOverrides: Partial<Record<PublicMarketingPageKey, { en: PageOverride; ar: PageOverride }>> = {
  owners: {
    en: {
      chip: 'FOR PROPERTY OWNERS',
      title: 'Add your property once. See every cost, technician, and proof photo from your phone.',
      desc: 'BIN GROUP gives UAE property owners one login for contracts, technician dispatch, before/after maintenance proof, rent collection, and payout history — instead of waiting on a manager to call you back.',
    },
    ar: {
      chip: 'لملاك العقارات',
      title: 'أضف عقارك مرة واحدة. شاهد كل تكلفة وفني وصورة إثبات من جوالك.',
      desc: 'تمنحك مجموعة بن دخولاً واحداً للعقود وإرسال الفنيين وإثبات الصيانة قبل وبعد وتحصيل الإيجار وسجل التحويلات — بدلاً من انتظار مدير يتصل بك ليخبرك بالمستجدات.',
    },
  },
  tenants: {
    en: {
      chip: 'FOR TENANTS',
      title: 'Report it once, watch the technician get dispatched, then approve the work yourself.',
      desc: 'Submit a maintenance request with a photo, track the technician in real time, and see the same before/after proof before you approve or dispute the job. Pay rent by bank transfer or card, and read every notice, contract, and document from your own tenant portal — in English or Arabic.',
      primary: 'Sign In to Tenant Portal',
      primaryHref: LOGIN_URL,
      showQuote: false,
      command: [
        ['Report an Issue', 'Photo + category, no phone call needed', 'REPORT'],
        ['Track the Job', 'Live technician status until it is closed', 'TRACK'],
        ['Approve or Dispute', 'Only after you see the before/after proof', 'REVIEW'],
        ['Pay Rent', 'Bank transfer or card, invoice always visible', 'PAY'],
      ],
      proofTitle: 'Everything you need as a tenant, in one portal',
      proofDesc: 'BIN GROUP replaces landlord phone tag and lost WhatsApp threads with a tracked maintenance ticket, a visible rent ledger, and a document vault you can open any time — in English and Arabic.',
      cards: [
        ['Maintenance, Tracked', 'Every request becomes a ticket with a technician, an SLA timer, and photo proof — not a missed call.'],
        ['Pay Rent Your Way', 'Pay online by card or by bank transfer, and see your invoice and payment history at any time.'],
        ['Documents On Demand', 'Your lease, notices, and move-in/move-out inspection records stay in one place.'],
        ['Bilingual By Default', 'Every tenant screen — tickets, payments, notices, chat — works fully in English and Arabic.'],
      ],
      pricingTitle: 'How your requests and rent are handled',
      pricing: [['Maintenance', 'Photo proof required'], ['Response', 'SLA-timed dispatch'], ['Rent', 'Bank transfer or card'], ['Disputes', 'Tenant review before close']],
      inquiryTitle: 'Already a tenant?',
      inquiryDesc: 'Sign in to your tenant portal to report an issue, pay rent, or check a notice. Not registered yet? Ask your property owner for an invite link.',
    },
    ar: {
      chip: 'للمستأجرين',
      title: 'بلّغ مرة واحدة، تابع إرسال الفني، ثم وافق على العمل بنفسك.',
      desc: 'أرسل طلب الصيانة بصورة، تابع الفني لحظياً، وشاهد نفس صور الإثبات قبل أن توافق على العمل أو تعترض عليه. ادفع الإيجار بالتحويل البنكي أو البطاقة، واطّلع على كل إشعار وعقد ومستند من بوابة المستأجر — بالعربية أو الإنجليزية.',
      primary: 'دخول بوابة المستأجر',
      primaryHref: LOGIN_URL,
      showQuote: false,
      command: [
        ['بلّغ عن مشكلة', 'صورة وتصنيف فوري، بدون مكالمة', 'بلاغ'],
        ['تابع العمل', 'حالة الفني لحظياً حتى الإغلاق', 'تتبع'],
        ['وافق أو اعترض', 'فقط بعد رؤية صور الإثبات', 'مراجعة'],
        ['ادفع الإيجار', 'تحويل بنكي أو بطاقة، والفاتورة دائماً واضحة', 'دفع'],
      ],
      proofTitle: 'كل ما تحتاجه كمستأجر، في بوابة واحدة',
      proofDesc: 'تستبدل مجموعة بن انتظار رد المالك ورسائل واتساب الضائعة بتذكرة صيانة متتبعة، ودفتر إيجار واضح، وخزانة مستندات تفتحها في أي وقت — بالعربية والإنجليزية.',
      cards: [
        ['صيانة متتبعة بالكامل', 'كل طلب يصبح تذكرة مع فني ومؤقت SLA وصور إثبات — وليس مكالمة ضائعة.'],
        ['ادفع الإيجار بالطريقة المناسبة لك', 'ادفع عبر البطاقة أو التحويل البنكي، وشاهد فاتورتك وسجل الدفع في أي وقت.'],
        ['مستنداتك عند الطلب', 'عقد الإيجار والإشعارات وسجلات فحص الاستلام والتسليم تبقى في مكان واحد.'],
        ['ثنائية اللغة دائماً', 'كل شاشة للمستأجر — التذاكر والدفع والإشعارات والمحادثة — تعمل بالعربية والإنجليزية بالكامل.'],
      ],
      pricingTitle: 'كيف تُدار طلباتك وإيجارك',
      pricing: [['الصيانة', 'صور إثبات مطلوبة'], ['الاستجابة', 'إرسال بمؤقت SLA'], ['الإيجار', 'تحويل بنكي أو بطاقة'], ['الاعتراضات', 'مراجعة المستأجر قبل الإغلاق']],
      inquiryTitle: 'هل أنت مستأجر بالفعل؟',
      inquiryDesc: 'سجّل الدخول إلى بوابة المستأجر لتبلغ عن مشكلة أو تدفع الإيجار أو تطّلع على إشعار. لم تسجّل بعد؟ اطلب رابط الدعوة من مالك العقار.',
    },
  },
  technicians: {
    en: {
      chip: 'FOR FIELD TECHNICIANS',
      title: 'Accept the job, get there, prove the work — and get paid for jobs that are actually closed.',
      desc: 'See assigned jobs with GPS context, accept and update status from your phone, upload before/after proof on every visit, and close the ticket correctly the first time. Your EOSB, heat-stress rest windows, and job history are tracked automatically — not buried in a spreadsheet.',
      primary: 'Sign In to Technician App',
      primaryHref: LOGIN_URL,
      showQuote: false,
      command: [
        ['Accept the Job', 'GPS context and ticket details up front', 'ACCEPT'],
        ['Go On Site', 'Live location shared while the job is open', 'TRACK'],
        ['Upload Proof', 'Before/after photos required to close', 'PROOF'],
        ['Close Correctly', 'SLA timer stops only when proof is in', 'CLOSE'],
      ],
      proofTitle: 'Built for the technician doing the actual work',
      proofDesc: 'BIN GROUP replaces the paper job sheet and the "did you finish it?" phone call with a job feed, GPS-aware dispatch, and a permanent photo record of what you actually did.',
      cards: [
        ['Real Job Feed', 'See every assigned job, its priority, and its location — no dispatcher phone call needed.'],
        ['Photo Proof, Not Guesswork', 'Before/after photos are required to close a ticket, protecting your work from disputes.'],
        ['UAE Labor Compliance, Tracked', 'EOSB gratuity and heat-stress midday work-ban rules are calculated automatically, not left to memory.'],
        ['Offline-Aware', 'Job actions queue when your connection drops, so a weak signal on site does not lose your update.'],
      ],
      pricingTitle: 'How your jobs and compliance are tracked',
      pricing: [['Dispatch', 'GPS-aware job assignment'], ['Proof', 'Before/after photos required'], ['EOSB', 'Calculated automatically'], ['Heat-Stress', 'Midday ban enforced']],
      inquiryTitle: 'Already on the team?',
      inquiryDesc: 'Sign in to your technician app to see today’s jobs. Want to join the BIN GROUP technician network? Contact us on WhatsApp to start your application.',
    },
    ar: {
      chip: 'للفنيين الميدانيين',
      title: 'اقبل العمل، اذهب للموقع، أثبت ما قمت به — واحصل على أجر العمل المغلق فعلياً.',
      desc: 'شاهد المهام المسندة لك مع سياق GPS، اقبلها وحدّث حالتها من جوالك، ارفع صور قبل/بعد في كل زيارة، وأغلق التذكرة بشكل صحيح من أول مرة. مستحقات نهاية الخدمة وفترات الراحة من حرارة الظهيرة وسجل أعمالك تُحسب تلقائياً — ليست في دفتر منفصل.',
      primary: 'دخول تطبيق الفني',
      primaryHref: LOGIN_URL,
      showQuote: false,
      command: [
        ['اقبل المهمة', 'سياق GPS وتفاصيل التذكرة مباشرة', 'قبول'],
        ['اذهب للموقع', 'مشاركة الموقع لحظياً أثناء العمل', 'تتبع'],
        ['ارفع الإثبات', 'صور قبل/بعد مطلوبة للإغلاق', 'إثبات'],
        ['أغلق بشكل صحيح', 'مؤقت SLA يتوقف فقط بعد الإثبات', 'إغلاق'],
      ],
      proofTitle: 'مبني للفني الذي ينفّذ العمل فعلياً',
      proofDesc: 'تستبدل مجموعة بن ورقة العمل ومكالمة "هل انتهيت؟" بمهام واضحة وإرسال يعتمد على GPS وسجل صور دائم لما قمت به فعلاً.',
      cards: [
        ['مهام حقيقية أمامك', 'شاهد كل مهمة مسندة وأولويتها وموقعها — بدون مكالمة من المنسق.'],
        ['إثبات بالصور لا تخمين', 'صور قبل/بعد مطلوبة لإغلاق التذكرة، لحماية عملك من أي اعتراض.'],
        ['التزام قانوني إماراتي محسوب تلقائياً', 'مستحقات نهاية الخدمة وحظر العمل وقت الظهيرة الحار يُحسبان تلقائياً، وليس بالذاكرة.'],
        ['يعمل حتى بدون اتصال', 'تُحفظ إجراءاتك عند ضعف الشبكة في الموقع بدلاً من ضياع التحديث.'],
      ],
      pricingTitle: 'كيف تُتابع مهامك وامتثالك',
      pricing: [['الإرسال', 'إسناد مهام بسياق GPS'], ['الإثبات', 'صور قبل/بعد مطلوبة'], ['نهاية الخدمة', 'تُحسب تلقائياً'], ['حرارة الظهيرة', 'حظر العمل مُطبّق']],
      inquiryTitle: 'هل أنت بالفعل من الفريق؟',
      inquiryDesc: 'سجّل الدخول إلى تطبيق الفني لمشاهدة مهام اليوم. تريد الانضمام لشبكة فنيي مجموعة بن؟ تواصل معنا عبر واتساب لبدء طلبك.',
    },
  },
  brokers: {
    en: {
      chip: 'FOR REAL ESTATE BROKERS',
      title: 'Submit the lead, keep the attribution, get paid once the deal is verified.',
      desc: 'Capture a property-owner lead yourself or send an owner your referral link — either way, your broker ID stays attached to the deal end-to-end. Commission is calculated automatically once the contract is verified and your RERA status is approved, not negotiated after the fact.',
      primary: 'Sign In to Broker Portal',
      primaryHref: LOGIN_URL,
      showQuote: false,
      command: [
        ['Submit a Lead', 'Manual entry or CSV bulk import', 'LEAD'],
        ['Stay Attributed', 'Your broker ID stays on the deal', 'TRACK'],
        ['RERA Verified', 'Admin-reviewed license status', 'VERIFY'],
        ['Get Paid', 'Commission released after contract activation', 'PAYOUT'],
      ],
      proofTitle: 'A commission pipeline you can actually verify',
      proofDesc: 'BIN GROUP replaces the "trust me, I sent that lead" problem with one attribution trail from the lead you submit to the commission you are paid — visible to you the whole way.',
      cards: [
        ['One Attribution Trail', 'Every lead you submit is stamped with your broker ID, from intake through contract activation.'],
        ['RERA-Gated Commission', 'Commission is calculated automatically once your RERA license is verified and the contract is active.'],
        ['CSV Bulk Import', 'Submit one lead or import a batch — both feed the same tracked pipeline.'],
        ['Documents in One Vault', 'Your license, ID, and supporting documents stay uploaded and organized, not emailed back and forth.'],
      ],
      pricingTitle: 'How your commission is calculated',
      pricing: [['Commission', '10% on verified deals'], ['RERA Gate', 'Verified license required'], ['Attribution', 'Tracked lead to contract'], ['Payout', 'Released after activation']],
      inquiryTitle: 'Already a registered broker?',
      inquiryDesc: 'Sign in to your broker portal to submit a lead or check your commission status. Not registered yet? Start your application with your RERA details.',
    },
    ar: {
      chip: 'للوسطاء العقاريين',
      title: 'أرسل الفرصة، حافظ على نسبتها لك، واحصل على عمولتك بعد تأكيد الصفقة.',
      desc: 'سجّل فرصة من مالك عقار بنفسك أو أرسل له رابط الإحالة الخاص بك — في الحالتين يبقى رقم الوسيط مرتبطاً بالصفقة من البداية للنهاية. تُحسب العمولة تلقائياً بعد تأكيد العقد واعتماد حالة رخصة ريرا، وليست عرضة للتفاوض بعد الصفقة.',
      primary: 'دخول بوابة الوسيط',
      primaryHref: LOGIN_URL,
      showQuote: false,
      command: [
        ['أرسل فرصة', 'إدخال يدوي أو استيراد CSV', 'فرصة'],
        ['حافظ على نسبتك', 'رقم الوسيط يبقى مرتبطاً بالصفقة', 'تتبع'],
        ['اعتماد ريرا', 'مراجعة إدارية لحالة الرخصة', 'تحقق'],
        ['احصل على عمولتك', 'تُصرف بعد تفعيل العقد', 'عمولة'],
      ],
      proofTitle: 'مسار عمولة يمكنك تتبعه فعلياً',
      proofDesc: 'تستبدل مجموعة بن مشكلة "ثق بي، أرسلت هذه الفرصة" بمسار تتبع واحد من الفرصة التي ترسلها إلى العمولة التي تُصرف لك — مرئي لك طوال الوقت.',
      cards: [
        ['مسار تتبع واحد', 'كل فرصة ترسلها تُختم برقم الوسيط الخاص بك، من الإدخال حتى تفعيل العقد.'],
        ['عمولة مرتبطة باعتماد ريرا', 'تُحسب العمولة تلقائياً بعد اعتماد رخصتك وتفعيل العقد.'],
        ['استيراد CSV بالجملة', 'أرسل فرصة واحدة أو استورد مجموعة دفعة واحدة — كلاهما يغذي نفس المسار المتتبع.'],
        ['مستنداتك في خزانة واحدة', 'رخصتك وهويتك ومستنداتك الداعمة تبقى مرفوعة ومنظمة، بدون تراسل بريدي متكرر.'],
      ],
      pricingTitle: 'كيف تُحسب عمولتك',
      pricing: [['العمولة', '10٪ على الصفقات المؤكدة'], ['اعتماد ريرا', 'رخصة موثقة مطلوبة'], ['التتبع', 'من الفرصة إلى العقد'], ['الصرف', 'بعد تفعيل العقد']],
      inquiryTitle: 'هل أنت وسيط مسجّل بالفعل؟',
      inquiryDesc: 'سجّل الدخول إلى بوابة الوسيط لإرسال فرصة أو متابعة حالة عمولتك. لم تسجّل بعد؟ ابدأ طلبك برخصة ريرا الخاصة بك.',
    },
  },
};

function OnboardingFlows({ lang, highlightRole }: { lang: 'en' | 'ar'; highlightRole?: PublicMarketingPageKey }) {
  const ar = lang === 'ar';
  const roles = [
    {
      key: 'owners',
      title: ar ? 'مالك العقار' : 'Property Owner',
      color: '#B8932F',
      steps: ar ? [
        'تسجيل الحساب',
        'تقديم ملف الشركة',
        'موافقة المسؤول',
        'توقيع العقد الرقمي',
        'تنشيط لوحة التحكم',
        'إضافة الوحدات والعقارات',
        'دعوة المستأجرين'
      ] : [
        'Sign Up',
        'Submit Company Profile',
        'Admin Approval',
        'Sign Contract',
        'Activate Dashboard',
        'Add Properties & Units',
        'Invite Tenants'
      ]
    },
    {
      key: 'tenants',
      title: ar ? 'المستأجر' : 'Tenant',
      color: '#10b981',
      steps: ar ? [
        'استلاف رابط الدعوة',
        'تسجيل الحساب',
        'ربط الوحدة السكنية',
        'توقيع عقد الإيجار',
        'دخول بوابة المستأجر'
      ] : [
        'Receive Invite Link',
        'Register Account',
        'Link Residential Unit',
        'Sign Lease Agreement',
        'Access Tenant Portal'
      ]
    },
    {
      key: 'technicians',
      title: ar ? 'الفني' : 'Technician',
      color: '#3b82f6',
      steps: ar ? [
        'تقديم طلب الانضمام',
        'رفع الأوراق والمستندات',
        'مراجعة واعتماد المسؤول',
        'تنشيط الحالة للعمل',
        'استلام وقبول المهام'
      ] : [
        'Apply to Join',
        'Submit KYC Documents',
        'Admin Verification',
        'Activate Availability',
        'Accept Field Jobs'
      ]
    },
    {
      key: 'brokers',
      title: ar ? 'الوسيط العقاري' : 'Real Estate Broker',
      color: '#8b5cf6',
      steps: ar ? [
        'التسجيل في المنصة',
        'تقديم رخصة ريرا (RERA)',
        'اعتماد وتنشيط الحساب',
        'دخول بوابة الشركاء',
        'تقديم الإحالات والعمولات'
      ] : [
        'Register Account',
        'Submit RERA Certificate',
        'Admin Authentication',
        'Access Broker Portal',
        'Submit Client Referrals'
      ]
    }
  ];

  const orderedRoles = highlightRole && roles.some((r) => r.key === highlightRole)
    ? [...roles.filter((r) => r.key === highlightRole), ...roles.filter((r) => r.key !== highlightRole)]
    : roles;

  return (
    <SectionPaper>
      <Box sx={{ mb: 4, textAlign: 'center' }}>
        <Typography variant="overline" sx={{ color: gold, fontWeight: 950, letterSpacing: 3, display: 'block' }}>
          {ar ? 'خطوات الانضمام والتشغيل' : 'ONBOARDING WORKFLOWS'}
        </Typography>
        <Typography variant="h3" fontWeight={950} sx={{ color: ink, mt: 1, letterSpacing: '-0.04em' }}>
          {ar ? 'كيف تعمل بوابة بيـن جروب؟' : 'How the Platform Works'}
        </Typography>
        <Typography variant="body1" sx={{ color: muted, mt: 1.5, maxWidth: 800, mx: 'auto', fontWeight: 700 }}>
          {ar
            ? 'رحلات مستخدم متكاملة ومؤتمتة بالكامل تضمن السرعة والدقة والشفافية لكل دور في المنظومة.'
            : 'Fully automated onboarding journeys tailored for every participant in the BIN GROUP ecosystem.'}
        </Typography>
      </Box>

      <Grid container spacing={3.5}>
        {orderedRoles.map((role) => (
          <Grid item xs={12} md={6} lg={3} key={role.key}>
            <Paper sx={{ p: 3, height: '100%', borderRadius: radius.card, border: `1px solid ${line}`, bgcolor: platinum, display: 'flex', flexDirection: 'column' }}>
              <Typography variant="h6" fontWeight="950" sx={{ color: role.color, mb: 3.5, display: 'flex', alignItems: 'center', gap: 1 }}>
                <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: role.color }} /> {role.title}
              </Typography>
              
              <Stack spacing={2} sx={{ flex: 1, position: 'relative' }}>
                {role.steps.map((step, sIdx) => (
                  <Stack key={sIdx} direction="row" spacing={2} alignItems="center">
                    <Box sx={{
                      width: 26, height: 26, borderRadius: '50%',
                      bgcolor: alpha(role.color, 0.12),
                      color: role.color,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontWeight: 950, fontSize: '0.75rem', flexShrink: 0
                    }}>
                      {sIdx + 1}
                    </Box>
                    <Typography variant="body2" sx={{ color: ink, fontWeight: 800, fontSize: '0.85rem' }}>
                      {step}
                    </Typography>
                  </Stack>
                ))}
              </Stack>
            </Paper>
          </Grid>
        ))}
      </Grid>
    </SectionPaper>
  );
}

export default function PublicMarketingPage({ page = 'home' }: PublicMarketingPageProps) {
  const { lang, isRTL } = useLanguage();
  const activeLang = lang === 'ar' ? 'ar' : 'en';
  const base = copy[activeLang];
  const override = pageOverrides[page]?.[activeLang];
  const c: CopyShape = override ? { ...base, ...override } : base;

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: canvas, direction: isRTL ? 'rtl' : 'ltr', position: 'relative', overflowX: 'hidden' }}>
      <BrandWatermark opacity={0.07} />
      <Box sx={{ position: 'relative', zIndex: 1 }}>
        <Nav c={c} />
        <Hero c={c} />
        <Container maxWidth="xl" sx={{ pb: 8 }}>
          <Trust />
          <Proof c={c} />
          <OnboardingFlows lang={lang} highlightRole={page} />
          <Pricing c={c} />
          <Coverage c={c} />
          <Inquiry c={c} />
        </Container>
      </Box>
    </Box>
  );
}

function ActionButton({ children, href, icon, contained = false, onClick }: { children: React.ReactNode; href?: string; icon?: React.ReactNode; contained?: boolean; onClick?: () => void }) {
  return (
    <Button
      component={href ? "a" : "button"}
      href={href}
      onClick={onClick}
      startIcon={icon}
      sx={{
        minHeight: 48,
        px: 2.5,
        py: 1.2,
        borderRadius: radius.button,
        fontWeight: 950,
        textDecoration: 'none',
        color: contained ? '#111' : gold,
        border: contained ? 'none' : `1px solid ${alpha(gold, 0.42)}`,
        background: contained ? `linear-gradient(135deg, ${goldLight}, ${gold})` : '#fff',
        boxShadow: contained ? `0 12px 28px ${alpha(gold, 0.22)}` : `0 8px 20px ${alpha('#000', 0.045)}`,
        '&:hover': { background: contained ? `linear-gradient(135deg, ${gold}, ${goldLight})` : alpha(gold, 0.08), transform: 'translateY(-1px)' },
      }}
    >
      {children}
    </Button>
  );
}

function Nav({ c }: { c: CopyShape }) {
  const { lang, setLang } = useLanguage();
  return (
    <Box sx={{ position: 'sticky', top: 0, zIndex: 20, bgcolor: 'rgba(255,255,255,.94)', backdropFilter: 'blur(20px)', borderBottom: `1px solid ${line}` }}>
      <Container maxWidth="xl" sx={{ py: 1.15, display: 'flex', alignItems: 'center', gap: 1.2, flexWrap: 'wrap' }}>
        <Button component="a" href="/" sx={{ p: 0, minWidth: 0, color: ink, mr: 'auto' }}>
          <Stack direction="row" spacing={1.2} alignItems="center">
            <Box component="img" src="/logo.png" sx={{ width: 44, height: 44, borderRadius: 1.2, boxShadow: `0 10px 22px ${alpha('#000', 0.10)}`, bgcolor: '#fff' }} />
            <Typography fontWeight={950} sx={{ color: ink }}>{c.brand}</Typography>
          </Stack>
        </Button>
        <Stack direction="row" spacing={1} alignItems="center" sx={{ flexWrap: 'wrap', gap: 1 }}>          <ActionButton href={ONBOARDING_URL} contained>{c.primary}</ActionButton>
          <ActionButton href={LOGIN_URL} icon={<LogIn size={17} />}>{c.login}</ActionButton>
          <ActionButton onClick={() => setLang(lang === 'en' ? 'ar' : 'en')} icon={<Globe size={17} />}>
            {lang === 'ar' ? 'EN' : 'AR'}
          </ActionButton>
        </Stack>
      </Container>
    </Box>
  );
}

function SectionPaper({ children, tone = 'white', sx = {} }: { children: React.ReactNode; tone?: 'white' | 'platinum' | 'gold'; sx?: object }) {
  const isGold = tone === 'gold';
  return (
    <Paper
      sx={{
        p: { xs: 2.4, md: 4 },
        borderRadius: radius.outer,
        bgcolor: isGold ? `linear-gradient(135deg, ${gold}, ${goldLight})` : tone === 'platinum' ? platinum : '#fff',
        border: `1px solid ${isGold ? alpha(gold, 0.32) : line}`,
        mb: 4,
        boxShadow: isGold ? `0 22px 54px ${alpha(gold, 0.18)}` : `0 14px 36px ${alpha('#000', 0.045)}`,
        ...sx,
      }}
    >
      {children}
    </Paper>
  );
}

function Hero({ c }: { c: CopyShape }) {
  return (
    <Box sx={{ position: 'relative', overflow: 'hidden', borderBottom: `1px solid ${line}` }}>
      <Box sx={{ position: 'absolute', inset: 0, background: `linear-gradient(135deg, ${platinum} 0%, #FFFFFF 54%, ${alpha(gold, 0.08)} 100%)` }} />
      <Container maxWidth="xl" sx={{ position: 'relative', zIndex: 1, py: { xs: 5, md: 10 } }}>
        <Grid container spacing={4} alignItems="center">
          <Grid item xs={12} md={7}>
            <Chip label={c.chip} sx={{ mb: 3, borderRadius: 1.25, bgcolor: alpha(gold, .12), color: '#5E4A1F', fontWeight: 950, border: `1px solid ${alpha(gold, 0.20)}` }} />
            <Typography variant="h1" sx={{ fontSize: { xs: 38, md: 72 }, lineHeight: 1.02, fontWeight: 950, mb: 3, color: ink, letterSpacing: '-0.055em' }}>{c.title}</Typography>
            <Typography variant="h6" sx={{ color: muted, lineHeight: 1.62, fontWeight: 750, maxWidth: 920 }}>{c.desc}</Typography>
            <Stack direction="row" spacing={1.5} sx={{ mt: 4, flexWrap: 'wrap', gap: 1.5 }}>
              <ActionButton href={c.primaryHref} contained>{c.primary}</ActionButton>
              {c.showQuote && <ActionButton href={QUOTE_URL}>{c.quote}</ActionButton>}
              <ActionButton href={WHATSAPP_URL} icon={<MessageCircle size={17} />}>{c.whatsapp}</ActionButton>
            </Stack>
            <Typography variant="caption" sx={{ mt: 3, display: 'block', color: muted, fontWeight: 900 }}>{c.flow}</Typography>
          </Grid>
          <Grid item xs={12} md={5}>
            <Paper sx={{ p: 2, borderRadius: radius.outer, bgcolor: 'rgba(255,255,255,0.88)', border: `1px solid ${line}`, boxShadow: `0 22px 54px ${alpha('#000', 0.09)}` }}>
              <Stack spacing={1.25}>
                {c.command.map((row) => (
                  <Paper key={row[0]} sx={{ p: 2, borderRadius: radius.card, bgcolor: '#fff', border: `1px solid ${line}`, boxShadow: `0 8px 20px ${alpha('#000', 0.035)}` }}>
                    <Stack direction="row" spacing={2} justifyContent="space-between" alignItems="center">
                      <Box sx={{ minWidth: 0 }}>
                        <Typography fontWeight={950} sx={{ color: ink }}>{row[0]}</Typography>
                        <Typography variant="caption" sx={{ color: muted, fontWeight: 750 }}>{row[1]}</Typography>
                      </Box>
                      <Chip label={row[2]} sx={{ borderRadius: 1.2, bgcolor: alpha(gold, .13), color: '#6F5522', fontWeight: 950 }} />
                    </Stack>
                  </Paper>
                ))}
              </Stack>
            </Paper>
          </Grid>
        </Grid>
      </Container>
    </Box>
  );
}

function Trust() {
  const items = [
    ['15%', 'Mobilization gate before activation'],
    ['5%', 'Management fee waterfall logic'],
    ['SLA', 'Timers, proof, escalation'],
    ['UAE', 'Asset-adaptive PropTech operations'],
  ];
  return (
    <Grid container spacing={2.2} sx={{ mt: -3, mb: 4, position: 'relative', zIndex: 2 }}>
      {items.map((item) => (
        <Grid item xs={12} sm={6} md={3} key={item[0]}>
          <Paper sx={{ p: 2.4, borderRadius: radius.card, bgcolor: '#fff', border: `1px solid ${line}`, boxShadow: `0 12px 28px ${alpha('#000', 0.055)}` }}>
            <Typography variant="h4" fontWeight={950} sx={{ color: gold }}>{item[0]}</Typography>
            <Typography variant="caption" sx={{ color: muted, fontWeight: 900 }}>{item[1]}</Typography>
          </Paper>
        </Grid>
      ))}
    </Grid>
  );
}

function Proof({ c }: { c: CopyShape }) {
  const icons = [<Workflow key="workflow" />, <WalletCards key="wallet" />, <Building2 key="building" />, <Bot key="bot" />];
  return (
    <SectionPaper>
      <Grid container spacing={3.5} alignItems="stretch">
        <Grid item xs={12} md={5}>
          <Chip label="THE PITCH" sx={{ borderRadius: 1.25, bgcolor: alpha(gold, .12), color: '#6F5522', fontWeight: 950, mb: 2 }} />
          <Typography variant="h3" fontWeight={950} sx={{ color: ink, letterSpacing: '-0.04em', mb: 2 }}>{c.proofTitle}</Typography>
          <Typography sx={{ color: muted, lineHeight: 1.8, fontWeight: 700 }}>{c.proofDesc}</Typography>
        </Grid>
        <Grid item xs={12} md={7}>
          <Grid container spacing={2}>
            {c.cards.map((card, idx) => (
              <Grid item xs={12} sm={6} key={card[0]}>
                <Paper sx={{ p: 2.4, minHeight: 160, height: '100%', borderRadius: radius.card, bgcolor: platinum, border: `1px solid ${line}` }}>
                  <Box sx={{ color: gold, mb: 1.25 }}>{icons[idx]}</Box>
                  <Typography fontWeight={950} sx={{ color: ink, mb: 1 }}>{card[0]}</Typography>
                  <Typography variant="body2" sx={{ color: muted, lineHeight: 1.65, fontWeight: 700 }}>{card[1]}</Typography>
                </Paper>
              </Grid>
            ))}
          </Grid>
        </Grid>
      </Grid>
    </SectionPaper>
  );
}

function Pricing({ c }: { c: CopyShape }) {
  return (
    <SectionPaper tone="platinum">
      <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 3 }}>
        <FileText color={gold} />
        <Typography variant="h4" fontWeight={950} sx={{ color: ink }}>{c.pricingTitle}</Typography>
      </Stack>
      <Grid container spacing={2}>
        {c.pricing.map((price) => (
          <Grid item xs={12} sm={6} md={3} key={price[0]}>
            <Paper sx={{ p: 2.4, borderRadius: radius.card, bgcolor: '#fff', border: `1px solid ${line}`, height: '100%' }}>
              <Typography fontWeight={950} sx={{ color: ink }}>{price[0]}</Typography>
              <Typography variant="h5" fontWeight={950} sx={{ color: gold }}>{price[1]}</Typography>
            </Paper>
          </Grid>
        ))}
      </Grid>
    </SectionPaper>
  );
}

function Coverage({ c }: { c: CopyShape }) {
  return (
    <SectionPaper>
      <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 3 }}>
        <ShieldCheck color={gold} />
        <Typography variant="h4" fontWeight={950} sx={{ color: ink }}>{c.coverageTitle}</Typography>
      </Stack>
      <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', gap: 1 }}>
        {c.coverage.map((asset) => (
          <Chip key={asset} label={asset} sx={{ borderRadius: 1.2, bgcolor: alpha(gold, .08), color: '#59451D', border: `1px solid ${alpha(gold, .16)}`, fontWeight: 850 }} />
        ))}
      </Stack>
    </SectionPaper>
  );
}

function Inquiry({ c }: { c: CopyShape }) {
  return (
    <SectionPaper tone="gold" sx={{ mb: 0 }}>
      <Grid container spacing={3} alignItems="center">
        <Grid item xs={12} md={8}>
          <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 2 }}>
            <Camera color="#111" />
            <Typography variant="h3" fontWeight={950} sx={{ color: '#111', letterSpacing: '-0.04em' }}>{c.inquiryTitle}</Typography>
          </Stack>
          <Typography sx={{ color: alpha('#111', .72), lineHeight: 1.75, fontWeight: 800 }}>{c.inquiryDesc}</Typography>
        </Grid>
        <Grid item xs={12} md={4}>
          <Stack spacing={1.3}>
            <ActionButton href={c.primaryHref}>{c.primary}</ActionButton>
            <ActionButton href={WHATSAPP_URL} icon={<MessageCircle size={17} />}>{c.whatsapp}</ActionButton>
          </Stack>
        </Grid>
      </Grid>
    </SectionPaper>
  );
}


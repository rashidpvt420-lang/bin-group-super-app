import React from 'react';
import { Box, Button, Chip, Container, Grid, Paper, Stack, Typography, alpha } from '@mui/material';
import { Camera, FileText, Globe, LogIn, MessageCircle, ShieldCheck } from 'lucide-react';
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
const COMPANY_PROFILE_ANCHOR = '#company-profile';

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
    companyProfileCta: 'Company Profile',
    quote: 'Get Instant Quote',
    login: 'Portal Login',
    whatsapp: 'WhatsApp BIN GROUP',
    flow: 'Owner journey: details → quote → contract → service tracking → verified payout record',
    companyTitle: 'BIN GROUP company profile, all in one operating system',
    companyDesc: 'BIN GROUP is a UAE property-care and operations company built for owners, tenants, technicians, brokers, admin teams, and HR. One profile holds the company identity, property onboarding, contract path, maintenance dispatch, tenant support, technician proof, broker attribution, workforce control, financial approvals, reports, and permanent property history.',
    companyFacts: [
      ['Legal company', 'BIN GROUP / All Kind Building Projects Contracting LLC S.P.C'],
      ['Base', 'Al Ain, Abu Dhabi, United Arab Emirates'],
      ['Coverage', 'UAE property care across villas, apartments, buildings, towers, staff accommodation, retail, hospitality, healthcare, offices, malls, majlis, warehouses, and mixed-use assets'],
      ['Access', 'Owner, tenant, technician, broker, admin, finance, operations, and HR workflows in one system'],
      ['Contact', '+971 55 2423233 WhatsApp · +971 55 7474560 phone · ceo@bin-groups.com'],
      ['Operating promise', 'No scattered calls: every request becomes a verified workflow with documents, approvals, photos, SLA, and history'],
    ],
    offerSummaryTitle: 'Everything BIN GROUP offers',
    offerSummary: [
      ['Property onboarding', 'Capture owner identity, company details, asset type, emirate, area, units, rooms, systems, condition, photos, location context, and documents.'],
      ['Contract and quote path', 'Prepare the correct maintenance, management, or Total Care Hybrid scope with mobilization, payment plan, and admin verification.'],
      ['Maintenance operations', 'Turn tenant and owner requests into assigned tickets with priority, SLA timers, technician dispatch, before/after proof, and closure records.'],
      ['Property management', 'Run tenant registry, rent ledger waterfall, 5% management-fee logic, maintenance deductions, owner payout visibility, documents, and reports.'],
      ['Tenant service desk', 'Give tenants a simple place for issues, emergencies, documents, lease information, move-in/move-out evidence, approvals, and updates.'],
      ['Technician field control', 'Control job acceptance, arrival, GPS context, photo proof, completion notes, parts/material requests, offline queue, and quality review.'],
      ['Broker growth workflow', 'Register leads, prove attribution, move prospects into owner or tenant onboarding, track commission status, and request payout after verification.'],
      ['Admin command center', 'Review KYC, approve contracts, verify payment proof, watch SLA health, inspect data quality, manage staff roles, and protect audit records.'],
      ['HR and workforce operations', 'Track staff onboarding, identity files, skills, certifications, duty availability, attendance context, assets, PPE, job history, and payroll-ready records.'],
      ['Property passport', 'Keep every contract, unit, tenant, inspection, ticket, invoice, payment proof, document, report, and handover record tied to the property forever.'],
    ],
    companyServices: [
      ['Maintenance operations', 'Ticket intake, technician dispatch, SLA tracking, before/after proof, and closure records.'],
      ['Property management', 'Owner reports, tenant registry, rent ledger logic, payment visibility, approvals, and documents.'],
      ['Contract operations', 'Property profile, quote, contract scope, 15% mobilization, payment verification, and admin approval.'],
      ['Broker and partner growth', 'Lead registration, attribution proof, commission tracking, and payout request workflow.'],
    ],
    companyProof: ['Licensed UAE company', 'English and Arabic portals', 'Photo and GPS proof', 'Admin approval gates', 'Owner cost visibility', 'Property passport history'],
    profilesTitle: 'Why every profile chooses BIN GROUP',
    profilesDesc: 'The value is different for every user, but the data stays connected. Owners see control, tenants see support, technicians see clear jobs, brokers see verified attribution, admin sees risk, and HR sees the workforce.',
    profileReasons: [
      ['Owner', 'Owners choose BIN GROUP because they can start with property details, select the right contract, approve costs with proof, see rent and maintenance logic, and keep a permanent record for the asset.'],
      ['Tenant', 'Tenants choose it because they can report issues without chasing calls, see status updates, attach photos, access documents, confirm service proof, and receive a safer unit-linking path.'],
      ['Technician', 'Technicians choose it because jobs are clear: location context, priority, instructions, before/after proof, parts requests, completion notes, and fair history for completed work.'],
      ['Broker', 'Brokers choose it because leads, referrals, owner introductions, tenant opportunities, documents, commission status, and payout requests are tracked instead of being lost in messages.'],
      ['Admin and finance', 'Admin chooses it because KYC, contract approvals, payment proof, SLA breaches, staff permissions, data health, audit logs, and finance reviews are controlled from one command center.'],
      ['HR and staff', 'HR chooses it because every worker, technician, supervisor, and support user can have identity records, certifications, roles, attendance context, assets, performance evidence, and payroll-ready records.'],
    ],
    uaeProblemsTitle: 'What BIN GROUP solves across UAE property operations',
    uaeProblemsDesc: 'UAE property work often breaks because communication, proof, contracts, payments, staff, and maintenance are separated. BIN GROUP joins them into one operating record.',
    uaeProblems: [
      ['Scattered WhatsApp and calls', 'Requests become structured tickets, not forgotten voice notes or unread messages.'],
      ['No clear service proof', 'Every job can require before/after photos, notes, timestamps, and location context.'],
      ['Owner cost confusion', 'Maintenance approvals, deductions, management fee logic, and payout visibility stay visible.'],
      ['Tenant frustration', 'Tenants get a clear service path, emergency help, documents, status, and safe unit linking.'],
      ['Technician uncertainty', 'Field teams see assigned work, arrival requirements, proof requirements, and closure steps.'],
      ['Broker attribution disputes', 'Lead source, referral proof, deal status, commission logic, and payout request records are preserved.'],
      ['Document and compliance gaps', 'Trade license, Emirates ID, ownership proof, KYC files, contracts, certificates, and expiry records stay organized.'],
      ['Handover disputes', 'Move-in, move-out, inspection photos, meter readings, damages, keys, and unit condition history stay attached to the property.'],
      ['Slow escalation', 'SLA timers, admin review, urgent flags, and operational dashboards expose delays before they become bigger problems.'],
      ['Multi-emirate complexity', 'One structure can support properties across UAE emirates, asset types, and operating teams.'],
    ],
    hrTitle: 'HR, staff, and field-force command',
    hrDesc: 'BIN GROUP is not only a customer portal. It also gives the company a practical HR and workforce layer so property service quality can be controlled from hiring to job completion.',
    hrItems: [
      ['Staff onboarding', 'Collect employee, technician, supervisor, support, finance, and admin identity data with role assignment.'],
      ['KYC and documents', 'Track Emirates ID, passport, visa, trade license, insurance, certificates, expiry dates, and approvals.'],
      ['Skills and allocation', 'Match technicians to plumbing, electrical, AC, civil, cleaning, inspection, handover, emergency, or supervisor work.'],
      ['Attendance context', 'Connect duty availability, dispatch activity, site visits, completion history, and exception review.'],
      ['Assets and materials', 'Track company tools, PPE, spare parts requests, material approvals, and job-level consumption evidence.'],
      ['Payroll-ready proof', 'Use completed jobs, approved commissions, attendance context, deductions, allowances, and approvals as a payroll evidence base.'],
    ],
    propertyPathTitle: 'How an owner starts a property contract',
    propertyPathDesc: 'The owner does not need to understand the whole app first. They start with property details, choose the service scope, submit documents and payment proof, then BIN GROUP verifies and activates the contract.',
    propertyDetails: [
      ['Owner identity', 'Name, mobile, email, company or individual owner profile, and payout IBAN later for owner settlements.'],
      ['Property details', 'Property name, emirate, area, address, asset type, floors, units, rooms, systems, current condition, GPS/location context, and photos.'],
      ['Service scope', 'Maintenance only, property management only, or Total Care Hybrid with rent ledger, tenant registry, maintenance, reports, and approvals.'],
      ['Documents', 'Title deed or ownership proof, Emirates ID or company trade license, passport where needed, and property photos/documents.'],
    ],
    contractSteps: [
      ['1', 'Enter property details', 'The onboarding wizard captures the asset profile and prepares the property passport.'],
      ['2', 'Get quote and contract scope', 'The system estimates the correct maintenance, management, or hybrid path.'],
      ['3', 'Submit documents and payment proof', '15% mobilization or selected payment plan stays pending until admin verification.'],
      ['4', 'BIN GROUP admin approval', 'Admin verifies owner, property, payment, and contract data before dashboard unlock.'],
      ['5', 'Contract activation', 'Owner dashboard opens with property, units, tenants, tickets, documents, reports, and proof history.'],
    ],
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
    heroTenant: 'TENANT',
    heroLandlord: 'LANDLORD',
    heroRealEstate: 'REAL ESTATE',
    heroTenantDesc: 'Report issues, access documents, and manage your home.',
    heroLandlordDesc: 'Onboard properties, track rent, and view reports.',
    heroRealEstateDesc: 'Register leads and track your commissions.',
    navSecurity: 'Security'
  },
  ar: {
    brand: 'مجموعة بن',
    chip: 'نظام تشغيل العناية بالعقار في الإمارات',
    title: 'نظام تشغيل واحد للعناية بالعقار وإدارته وإثبات الخدمة.',
    desc: 'مجموعة بن تمنح ملاك العقارات في الإمارات نظام Home OS موحد: تفاصيل العقار، عرض سعر فوري، اختيار العقد، دفعة تفعيل 15٪، سجل المستأجرين، دفتر الإيجارات، منطق رسوم الإدارة 5٪، إرسال الفنيين، مؤقتات SLA، إثبات قبل وبعد، تقارير المالك، وسجل جواز العقار الدائم.',
    primary: 'ابدأ تفاصيل العقار',
    companyProfileCta: 'ملف الشركة',
    quote: 'احصل على عرض سعر فوري',
    login: 'دخول البوابة',
    whatsapp: 'تواصل عبر واتساب',
    flow: 'رحلة المالك: تفاصيل ← عرض سعر ← عقد ← تتبع الخدمة ← سجل دفع موثق',
    companyTitle: 'ملف BIN GROUP الكامل في نظام تشغيل واحد',
    companyDesc: 'BIN GROUP هي شركة إماراتية للعناية بالعقارات وتشغيلها، مصممة للملاك والمستأجرين والفنيين والوسطاء وفرق الإدارة والموارد البشرية. ملف واحد يجمع هوية الشركة، تسجيل العقار، مسار العقد، إرسال الصيانة، دعم المستأجر، إثبات الفني، إسناد الوسيط، تشغيل الموظفين، الموافقات المالية، التقارير، وتاريخ العقار الدائم.',
    companyFacts: [
      ['الشركة القانونية', 'BIN GROUP / All Kind Building Projects Contracting LLC S.P.C'],
      ['المقر', 'العين، أبوظبي، الإمارات العربية المتحدة'],
      ['التغطية', 'رعاية عقارات الإمارات للفلل والشقق والمباني والأبراج وسكن الموظفين والتجزئة والضيافة والرعاية الصحية والمكاتب والمولات والمجالس والمستودعات والأصول المختلطة'],
      ['الوصول', 'مسارات المالك والمستأجر والفني والوسيط والإدارة والمالية والتشغيل والموارد البشرية في نظام واحد'],
      ['التواصل', '+971 55 2423233 واتساب · +971 55 7474560 هاتف · ceo@bin-groups.com'],
      ['وعد التشغيل', 'لا اتصالات متفرقة: كل طلب يتحول إلى مسار موثق بالمستندات والموافقات والصور وSLA والتاريخ'],
    ],
    offerSummaryTitle: 'كل ما تقدمه BIN GROUP',
    offerSummary: [
      ['تسجيل العقار', 'حفظ هوية المالك وبيانات الشركة ونوع الأصل والإمارة والمنطقة والوحدات والغرف والأنظمة والحالة والصور وسياق الموقع والمستندات.'],
      ['مسار العقد والعرض', 'تجهيز نطاق الصيانة أو الإدارة أو Total Care Hybrid مع دفعة التفعيل وخطة الدفع وتحقق الإدارة.'],
      ['تشغيل الصيانة', 'تحويل طلبات المستأجر والمالك إلى تذاكر مسندة مع الأولوية وSLA وإرسال الفني وإثبات قبل/بعد وسجل الإغلاق.'],
      ['إدارة العقار', 'تشغيل سجل المستأجرين ودفتر الإيجارات ومنطق رسوم الإدارة 5٪ وخصومات الصيانة ووضوح تحويلات المالك والمستندات والتقارير.'],
      ['مكتب خدمة المستأجر', 'منح المستأجر مكاناً واضحاً للأعطال والطوارئ والمستندات ومعلومات الإيجار وإثبات التسليم والموافقات والتحديثات.'],
      ['تحكم الفني الميداني', 'ضبط قبول العمل والوصول وسياق GPS وصور الإثبات وملاحظات الإغلاق وطلبات المواد وقائمة العمل دون اتصال ومراجعة الجودة.'],
      ['مسار نمو الوسطاء', 'تسجيل الفرص وإثبات الإسناد وتحويل العملاء إلى تسجيل المالك أو المستأجر وتتبع العمولة وطلب الصرف بعد التحقق.'],
      ['مركز تحكم الإدارة', 'مراجعة KYC واعتماد العقود والتحقق من إثبات الدفع ومراقبة SLA وصحة البيانات وصلاحيات الموظفين وحماية سجل التدقيق.'],
      ['الموارد البشرية والتشغيل', 'تتبع تسجيل الموظفين والهوية والمهارات والشهادات وحالة الدوام والحضور والأصول وPPE وتاريخ العمل وسجلات جاهزة للرواتب.'],
      ['جواز العقار', 'ربط كل عقد ووحدة ومستأجر وفحص وتذكرة وفاتورة وإثبات دفع ومستند وتقرير وتسليم بتاريخ العقار الدائم.'],
    ],
    companyServices: [
      ['تشغيل الصيانة', 'استقبال التذاكر، إرسال الفني، تتبع SLA، إثبات قبل/بعد، وسجل إغلاق واضح.'],
      ['إدارة العقار', 'تقارير المالك، سجل المستأجرين، منطق دفتر الإيجارات، وضوح المدفوعات، الموافقات، والمستندات.'],
      ['تشغيل العقود', 'ملف العقار، عرض السعر، نطاق العقد، دفعة 15٪، تحقق الدفع، واعتماد الإدارة.'],
      ['نمو الوسطاء والشركاء', 'تسجيل الفرص، إثبات مصدر الصفقة، تتبع العمولة، وطلب الصرف.'],
    ],
    companyProof: ['شركة مرخصة في الإمارات', 'بوابات عربية وإنجليزية', 'إثبات صور وGPS', 'بوابات اعتماد الإدارة', 'وضوح تكلفة المالك', 'سجل جواز العقار'],
    profilesTitle: 'لماذا يختار كل ملف BIN GROUP',
    profilesDesc: 'القيمة تختلف لكل مستخدم، لكن البيانات تبقى متصلة. المالك يرى التحكم، المستأجر يرى الدعم، الفني يرى العمل الواضح، الوسيط يرى الإسناد الموثق، الإدارة ترى المخاطر، والموارد البشرية ترى قوة العمل.',
    profileReasons: [
      ['المالك', 'يختار المالك BIN GROUP لأنه يبدأ بتفاصيل العقار، يختار العقد الصحيح، يعتمد التكاليف بالإثبات، يرى الإيجار والصيانة، ويحفظ تاريخاً دائماً للأصل.'],
      ['المستأجر', 'يختارها المستأجر لأنه يرفع الطلب دون مطاردة المكالمات، يرى التحديثات، يرفق الصور، يصل إلى المستندات، يؤكد إثبات الخدمة، ويربط الوحدة بطريقة أكثر أماناً.'],
      ['الفني', 'يختارها الفني لأن العمل واضح: سياق الموقع، الأولوية، التعليمات، إثبات قبل/بعد، طلبات المواد، ملاحظات الإغلاق، وتاريخ عادل للأعمال المنجزة.'],
      ['الوسيط', 'يختارها الوسيط لأن الفرص والإحالات والتعارف مع الملاك أو المستأجرين والمستندات وحالة العمولة وطلبات الصرف لا تضيع في الرسائل.'],
      ['الإدارة والمالية', 'تختارها الإدارة لأن KYC واعتماد العقود وإثبات الدفع ومخالفات SLA وصلاحيات الموظفين وصحة البيانات وسجلات التدقيق تحت السيطرة.'],
      ['الموارد البشرية والموظفون', 'تختارها الموارد البشرية لأن كل عامل وفني ومشرف وموظف دعم يمكن أن يكون له سجل هوية وشهادات وأدوار وحضور وأصول وإثبات أداء وسجل جاهز للرواتب.'],
    ],
    uaeProblemsTitle: 'ماذا تحل BIN GROUP في تشغيل عقارات الإمارات',
    uaeProblemsDesc: 'تتعطل أعمال العقار في الإمارات غالباً لأن التواصل والإثبات والعقود والمدفوعات والموظفين والصيانة منفصلة. BIN GROUP تجمعها في سجل تشغيل واحد.',
    uaeProblems: [
      ['رسائل واتساب ومكالمات متفرقة', 'تتحول الطلبات إلى تذاكر منظمة، لا ملاحظات صوتية منسية أو رسائل غير مقروءة.'],
      ['غياب إثبات الخدمة', 'يمكن لكل عمل أن يتطلب صور قبل/بعد وملاحظات ووقت وسياق موقع.'],
      ['ارتباك تكلفة المالك', 'الموافقات والخصومات ورسوم الإدارة ووضوح التحويل للمالك تبقى ظاهرة.'],
      ['إحباط المستأجر', 'يحصل المستأجر على مسار خدمة واضح وطوارئ ومستندات وحالة وربط وحدة آمن.'],
      ['عدم وضوح عمل الفني', 'ترى الفرق الميدانية العمل المسند ومتطلبات الوصول والإثبات وخطوات الإغلاق.'],
      ['خلافات إسناد الوسيط', 'يتم حفظ مصدر الفرصة وإثبات الإحالة وحالة الصفقة ومنطق العمولة وطلب الصرف.'],
      ['ثغرات المستندات والامتثال', 'الرخصة التجارية والهوية الإماراتية وإثبات الملكية وملفات KYC والعقود والشهادات وتواريخ الانتهاء تبقى منظمة.'],
      ['خلافات التسليم', 'صور الدخول والخروج والفحوصات وقراءات العدادات والأضرار والمفاتيح وحالة الوحدة تبقى مربوطة بالعقار.'],
      ['بطء التصعيد', 'تكشف مؤقتات SLA ومراجعة الإدارة وعلامات الطوارئ ولوحات التشغيل التأخير قبل أن يكبر.'],
      ['تعقيد العمل عبر الإمارات', 'هيكل واحد يدعم العقارات عبر إمارات الدولة وأنواع الأصول وفرق التشغيل.'],
    ],
    hrTitle: 'مركز قيادة الموارد البشرية والفرق الميدانية',
    hrDesc: 'BIN GROUP ليست بوابة عملاء فقط. تمنح الشركة طبقة عملية للموارد البشرية والقوى العاملة حتى يمكن ضبط جودة خدمة العقار من التوظيف حتى إغلاق العمل.',
    hrItems: [
      ['تسجيل الموظفين', 'جمع بيانات الموظف والفني والمشرف والدعم والمالية والإدارة مع تعيين الدور.'],
      ['KYC والمستندات', 'تتبع الهوية الإماراتية والجواز والإقامة والرخصة والتأمين والشهادات وتواريخ الانتهاء والاعتمادات.'],
      ['المهارات والتوزيع', 'مطابقة الفنيين مع السباكة والكهرباء والتكييف والمدني والتنظيف والفحص والتسليم والطوارئ والإشراف.'],
      ['سياق الحضور', 'ربط الجاهزية للدوام ونشاط الإرسال وزيارات المواقع وتاريخ الإنجاز ومراجعة الاستثناءات.'],
      ['الأصول والمواد', 'تتبع أدوات الشركة وPPE وطلبات قطع الغيار واعتمادات المواد وإثبات الاستهلاك على مستوى العمل.'],
      ['إثبات جاهز للرواتب', 'استخدام الأعمال المكتملة والعمولات المعتمدة وسياق الحضور والخصومات والبدلات والموافقات كأساس إثبات للرواتب.'],
    ],
    propertyPathTitle: 'كيف يبدأ المالك عقد العقار',
    propertyPathDesc: 'لا يحتاج المالك إلى فهم التطبيق بالكامل أولاً. يبدأ بتفاصيل العقار، يختار نطاق الخدمة، يرفع المستندات وإثبات الدفع، ثم تتحقق BIN GROUP وتفعّل العقد.',
    propertyDetails: [
      ['هوية المالك', 'الاسم، الهاتف، البريد، ملف شركة أو مالك فرد، وIBAN لاحقاً لتحويلات المالك.'],
      ['تفاصيل العقار', 'اسم العقار، الإمارة، المنطقة، العنوان، نوع الأصل، الطوابق، الوحدات، الغرف، الأنظمة، الحالة الحالية، الموقع، والصور.'],
      ['نطاق الخدمة', 'صيانة فقط، إدارة عقار فقط، أو Total Care Hybrid مع سجل الإيجار والمستأجرين والصيانة والتقارير والموافقات.'],
      ['المستندات', 'سند الملكية أو إثبات الملكية، الهوية الإماراتية أو الرخصة التجارية، جواز السفر عند الحاجة، وصور/مستندات العقار.'],
    ],
    contractSteps: [
      ['1', 'إدخال تفاصيل العقار', 'يقوم معالج التسجيل بحفظ ملف الأصل وتجهيز جواز العقار.'],
      ['2', 'عرض السعر ونطاق العقد', 'يقدّر النظام مسار الصيانة أو الإدارة أو الباقة الهجينة المناسبة.'],
      ['3', 'رفع المستندات وإثبات الدفع', 'دفعة التفعيل 15٪ أو خطة الدفع تبقى معلقة حتى تحقق الإدارة.'],
      ['4', 'اعتماد إدارة BIN GROUP', 'تتحقق الإدارة من المالك والعقار والدفع والعقد قبل فتح لوحة التحكم.'],
      ['5', 'تفعيل العقد', 'تفتح لوحة المالك وفيها العقار والوحدات والمستأجرون والتذاكر والمستندات والتقارير وسجل الإثبات.'],
    ],
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
    heroTenant: 'مستأجر',
    heroLandlord: 'مالك عقار',
    heroRealEstate: 'وسيط عقاري',
    heroTenantDesc: 'أبلغ عن الأعطال، استعرض المستندات، وأدِر منزلك.',
    heroLandlordDesc: 'سجّل عقاراتك، تتبع الإيجارات، وشاهد التقارير.',
    heroRealEstateDesc: 'سجل العملاء وتتبع عمولاتك.',
    navSecurity: 'الأمان والثقة'
  },
};

export default function PublicMarketingPage({ page = 'home' }: PublicMarketingPageProps) {
  const { lang, isRTL } = useLanguage();
  const c = lang === 'ar' ? copy.ar : copy.en;

  React.useEffect(() => {
    if (window.location.hash !== COMPANY_PROFILE_ANCHOR) return;
    window.setTimeout(() => {
      document.getElementById('company-profile')?.scrollIntoView({ block: 'start' });
    }, 0);
  }, []);

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: canvas, direction: isRTL ? 'rtl' : 'ltr', position: 'relative', overflowX: 'hidden' }}>
      <BrandWatermark opacity={0.07} />
      <Box sx={{ position: 'relative', zIndex: 1 }}>
        <Nav c={c} />
        <Hero c={c} />
        <Container maxWidth="xl" sx={{ pb: 8 }}>
          <Trust />
          <CompanyProfileBlock c={c} />
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
        <Stack direction="row" spacing={1} alignItems="center" sx={{ flexWrap: 'wrap', gap: 1 }}>          
          <ActionButton href="/security" icon={<ShieldCheck size={17} />}>{c.navSecurity}</ActionButton>
          <ActionButton href={LOGIN_URL} icon={<LogIn size={17} />}>{c.login}</ActionButton>
          <ActionButton onClick={() => setLang(lang === 'en' ? 'ar' : 'en')} icon={<Globe size={17} />}>
            {lang === 'ar' ? 'EN' : 'AR'}
          </ActionButton>
        </Stack>
      </Container>
    </Box>
  );
}

function SectionPaper({ children, tone = 'white', sx = {}, id }: { children: React.ReactNode; tone?: 'white' | 'platinum' | 'gold'; sx?: object; id?: string }) {
  const isGold = tone === 'gold';
  return (
    <Paper
      id={id}
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

function CompanyProfileBlock({ c }: { c: CopyShape }) {
  return (
    <SectionPaper sx={{ scrollMarginTop: 96, overflow: 'hidden' }} id="company-profile">
      <Stack spacing={4.5}>
        <Grid container spacing={3.5} alignItems="stretch">
          <Grid item xs={12} lg={5}>
            <Chip label="BIN GROUP MAIN COMPANY PROFILE" sx={{ borderRadius: 1.25, bgcolor: alpha(gold, .12), color: '#6F5522', fontWeight: 950, mb: 2 }} />
            <Typography variant="h3" fontWeight={950} sx={{ color: ink, letterSpacing: 0, mb: 2 }}>{c.companyTitle}</Typography>
            <Typography sx={{ color: muted, lineHeight: 1.8, fontWeight: 700 }}>{c.companyDesc}</Typography>
            <Stack direction="row" spacing={1.5} sx={{ mt: 3, flexWrap: 'wrap', gap: 1.5 }}>
              <ActionButton href={ONBOARDING_URL} contained>{c.primary}</ActionButton>
              <ActionButton href={QUOTE_URL}>{c.quote}</ActionButton>
              <ActionButton href={WHATSAPP_URL} icon={<MessageCircle size={17} />}>{c.whatsapp}</ActionButton>
            </Stack>
          </Grid>
          <Grid item xs={12} lg={7}>
            <Grid container spacing={2}>
              {c.companyFacts.map(([label, value]) => (
                <Grid item xs={12} sm={6} key={label}>
                  <Box sx={{ p: 2.4, height: '100%', borderRadius: radius.card, bgcolor: platinum, border: `1px solid ${line}` }}>
                    <Typography variant="caption" sx={{ color: gold, fontWeight: 950, textTransform: 'uppercase', letterSpacing: 1.2 }}>{label}</Typography>
                    <Typography sx={{ color: ink, fontWeight: 850, mt: .75, lineHeight: 1.55 }}>{value}</Typography>
                  </Box>
                </Grid>
              ))}
            </Grid>
          </Grid>
        </Grid>

        <Box>
          <Typography variant="h4" fontWeight={950} sx={{ color: ink, mb: 2 }}>{c.offerSummaryTitle}</Typography>
          <Grid container spacing={2}>
            {c.offerSummary.map(([title, body]) => (
              <Grid item xs={12} md={6} lg={4} key={title}>
                <Box sx={{ p: 2.4, height: '100%', borderRadius: radius.card, bgcolor: '#fff', border: `1px solid ${line}` }}>
                  <Typography fontWeight={950} sx={{ color: ink, mb: 1 }}>{title}</Typography>
                  <Typography variant="body2" sx={{ color: muted, lineHeight: 1.7, fontWeight: 700 }}>{body}</Typography>
                </Box>
              </Grid>
            ))}
          </Grid>
        </Box>

        <Box>
          <Typography variant="h4" fontWeight={950} sx={{ color: ink, mb: 1 }}>{c.profilesTitle}</Typography>
          <Typography sx={{ color: muted, lineHeight: 1.75, fontWeight: 700, mb: 2.5, maxWidth: 980 }}>{c.profilesDesc}</Typography>
          <Grid container spacing={2}>
            {c.profileReasons.map(([role, body]) => (
              <Grid item xs={12} md={6} lg={4} key={role}>
                <Box sx={{ p: 2.4, height: '100%', borderRadius: radius.card, bgcolor: platinum, border: `1px solid ${line}` }}>
                  <Typography variant="caption" sx={{ color: gold, fontWeight: 950, textTransform: 'uppercase', letterSpacing: 1.1 }}>{role}</Typography>
                  <Typography variant="body2" sx={{ color: ink, lineHeight: 1.7, fontWeight: 750, mt: .9 }}>{body}</Typography>
                </Box>
              </Grid>
            ))}
          </Grid>
        </Box>

        <Box>
          <Typography variant="h4" fontWeight={950} sx={{ color: ink, mb: 1 }}>{c.uaeProblemsTitle}</Typography>
          <Typography sx={{ color: muted, lineHeight: 1.75, fontWeight: 700, mb: 2.5, maxWidth: 980 }}>{c.uaeProblemsDesc}</Typography>
          <Grid container spacing={2}>
            {c.uaeProblems.map(([title, body]) => (
              <Grid item xs={12} md={6} lg={4} key={title}>
                <Box sx={{ p: 2.4, height: '100%', borderRadius: radius.card, bgcolor: '#fff', border: `1px solid ${line}` }}>
                  <Typography fontWeight={950} sx={{ color: ink, mb: .75 }}>{title}</Typography>
                  <Typography variant="body2" sx={{ color: muted, lineHeight: 1.65, fontWeight: 700 }}>{body}</Typography>
                </Box>
              </Grid>
            ))}
          </Grid>
        </Box>

        <Box sx={{ p: { xs: 2.2, md: 3 }, borderRadius: radius.outer, bgcolor: '#111827', border: `1px solid ${alpha(gold, .25)}` }}>
          <Grid container spacing={3} alignItems="stretch">
            <Grid item xs={12} lg={4}>
              <Chip label="HR" sx={{ borderRadius: 1.25, bgcolor: alpha(gold, .15), color: gold, fontWeight: 950, mb: 2 }} />
              <Typography variant="h4" fontWeight={950} sx={{ color: '#fff', mb: 1 }}>{c.hrTitle}</Typography>
              <Typography sx={{ color: alpha('#fff', .72), lineHeight: 1.75, fontWeight: 700 }}>{c.hrDesc}</Typography>
            </Grid>
            <Grid item xs={12} lg={8}>
              <Grid container spacing={2}>
                {c.hrItems.map(([title, body]) => (
                  <Grid item xs={12} md={6} key={title}>
                    <Box sx={{ p: 2.2, height: '100%', borderRadius: radius.card, bgcolor: alpha('#fff', .06), border: `1px solid ${alpha(gold, .22)}` }}>
                      <Typography fontWeight={950} sx={{ color: gold, mb: .75 }}>{title}</Typography>
                      <Typography variant="body2" sx={{ color: alpha('#fff', .78), lineHeight: 1.65, fontWeight: 700 }}>{body}</Typography>
                    </Box>
                  </Grid>
                ))}
              </Grid>
            </Grid>
          </Grid>
        </Box>

        <Box sx={{ p: { xs: 2.2, md: 3 }, borderRadius: radius.outer, bgcolor: platinum, border: `1px solid ${line}` }}>
          <Grid container spacing={3.5}>
            <Grid item xs={12} lg={4}>
              <Chip label="OWNER CONTRACT PATH" sx={{ borderRadius: 1.25, bgcolor: alpha(gold, .12), color: '#6F5522', fontWeight: 950, mb: 2 }} />
              <Typography variant="h4" fontWeight={950} sx={{ color: ink, mb: 2 }}>{c.propertyPathTitle}</Typography>
              <Typography sx={{ color: muted, lineHeight: 1.8, fontWeight: 700 }}>{c.propertyPathDesc}</Typography>
            </Grid>
            <Grid item xs={12} lg={8}>
              <Grid container spacing={2} sx={{ mb: 3 }}>
                {c.propertyDetails.map(([title, body]) => (
                  <Grid item xs={12} md={6} key={title}>
                    <Box sx={{ p: 2.4, height: '100%', borderRadius: radius.card, bgcolor: '#fff', border: `1px solid ${line}` }}>
                      <Typography fontWeight={950} sx={{ color: ink, mb: 1 }}>{title}</Typography>
                      <Typography variant="body2" sx={{ color: muted, lineHeight: 1.65, fontWeight: 700 }}>{body}</Typography>
                    </Box>
                  </Grid>
                ))}
              </Grid>
              <Stack spacing={1.4}>
                {c.contractSteps.map(([number, title, body]) => (
                  <Box key={number} sx={{ p: 2, borderRadius: radius.card, bgcolor: '#fff', border: `1px solid ${line}` }}>
                    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems={{ xs: 'flex-start', sm: 'center' }}>
                      <Box sx={{ width: 34, height: 34, borderRadius: '50%', bgcolor: alpha(gold, .14), color: gold, display: 'grid', placeItems: 'center', fontWeight: 950, flexShrink: 0 }}>{number}</Box>
                      <Box>
                        <Typography fontWeight={950} sx={{ color: ink }}>{title}</Typography>
                        <Typography variant="body2" sx={{ color: muted, fontWeight: 700, lineHeight: 1.55 }}>{body}</Typography>
                      </Box>
                    </Stack>
                  </Box>
                ))}
              </Stack>
            </Grid>
          </Grid>
        </Box>

        <Grid container spacing={2}>
          <Grid item xs={12} lg={6}>
            <Box sx={{ p: 2.6, height: '100%', borderRadius: radius.outer, bgcolor: '#fff', border: `1px solid ${line}` }}>
              <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 2 }}>
                <FileText color={gold} />
                <Typography variant="h4" fontWeight={950} sx={{ color: ink }}>{c.pricingTitle}</Typography>
              </Stack>
              <Grid container spacing={1.5}>
                {c.pricing.map((price) => (
                  <Grid item xs={12} sm={6} key={price[0]}>
                    <Box sx={{ p: 2, borderRadius: radius.card, bgcolor: platinum, border: `1px solid ${line}`, height: '100%' }}>
                      <Typography fontWeight={950} sx={{ color: ink }}>{price[0]}</Typography>
                      <Typography variant="h5" fontWeight={950} sx={{ color: gold }}>{price[1]}</Typography>
                    </Box>
                  </Grid>
                ))}
              </Grid>
            </Box>
          </Grid>
          <Grid item xs={12} lg={6}>
            <Box sx={{ p: 2.6, height: '100%', borderRadius: radius.outer, bgcolor: '#fff', border: `1px solid ${line}` }}>
              <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 2 }}>
                <ShieldCheck color={gold} />
                <Typography variant="h4" fontWeight={950} sx={{ color: ink }}>{c.coverageTitle}</Typography>
              </Stack>
              <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', gap: 1 }}>
                {c.coverage.map((asset) => (
                  <Chip key={asset} label={asset} sx={{ borderRadius: 1.2, bgcolor: alpha(gold, .08), color: '#59451D', border: `1px solid ${alpha(gold, .16)}`, fontWeight: 850 }} />
                ))}
              </Stack>
            </Box>
          </Grid>
        </Grid>

        <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 1 }}>
          {c.companyProof.map((item) => (
            <Chip key={item} label={item} sx={{ borderRadius: 1.2, bgcolor: alpha(gold, .08), color: '#59451D', border: `1px solid ${alpha(gold, .16)}`, fontWeight: 850 }} />
          ))}
        </Stack>
      </Stack>
    </SectionPaper>
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
            <Typography variant="h1" sx={{ fontSize: { xs: 38, md: 72 }, lineHeight: 1.02, fontWeight: 950, mb: 3, color: ink, letterSpacing: 0 }}>{c.title}</Typography>
            <Typography variant="h6" sx={{ color: muted, lineHeight: 1.62, fontWeight: 750, maxWidth: 920 }}>{c.desc}</Typography>
            <Stack direction="row" spacing={1.5} sx={{ mt: 4, flexWrap: 'wrap', gap: 1.5 }}>
              <ActionButton href={ONBOARDING_URL} contained>{c.primary}</ActionButton>
              <ActionButton href={QUOTE_URL}>{c.quote}</ActionButton>
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

function Inquiry({ c }: { c: CopyShape }) {
  return (
    <SectionPaper tone="gold" sx={{ mb: 0 }}>
      <Grid container spacing={3} alignItems="center">
        <Grid item xs={12} md={8}>
          <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 2 }}>
            <Camera color="#111" />
            <Typography variant="h3" fontWeight={950} sx={{ color: '#111', letterSpacing: 0 }}>{c.inquiryTitle}</Typography>
          </Stack>
          <Typography sx={{ color: alpha('#111', .72), lineHeight: 1.75, fontWeight: 800 }}>{c.inquiryDesc}</Typography>
        </Grid>
        <Grid item xs={12} md={4}>
          <Stack spacing={1.3}>
            <ActionButton href={ONBOARDING_URL}>{c.primary}</ActionButton>
            <ActionButton href={WHATSAPP_URL} icon={<MessageCircle size={17} />}>{c.whatsapp}</ActionButton>
          </Stack>
        </Grid>
      </Grid>
    </SectionPaper>
  );
}


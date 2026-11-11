// Technician-only language layer (Rashid, 4 Nov 2026). The global app i18n supports en/ar only;
// field technicians also need Hindi, Urdu, Malayalam, Tagalog and Bengali. This layer is scoped to
// technician screens so the rest of the app (owner/tenant/admin copy, legal text) is unchanged.
// Server-stored data (notes, statuses) stays in English; only on-screen labels are translated.
import { useCallback, useEffect, useState } from 'react';

export type TechLang = 'en' | 'ar' | 'hi' | 'ur' | 'ml' | 'tl' | 'bn';

export const TECH_LANGUAGES: ReadonlyArray<{ code: TechLang; nativeName: string; englishName: string; dir: 'ltr' | 'rtl'; locale: string }> = [
  { code: 'en', nativeName: 'English', englishName: 'English', dir: 'ltr', locale: 'en-AE' },
  { code: 'ar', nativeName: 'العربية', englishName: 'Arabic', dir: 'rtl', locale: 'ar-AE' },
  { code: 'hi', nativeName: 'हिन्दी', englishName: 'Hindi', dir: 'ltr', locale: 'hi-IN' },
  { code: 'ur', nativeName: 'اردو', englishName: 'Urdu', dir: 'rtl', locale: 'ur-PK' },
  { code: 'ml', nativeName: 'മലയാളം', englishName: 'Malayalam', dir: 'ltr', locale: 'ml-IN' },
  { code: 'tl', nativeName: 'Tagalog', englishName: 'Tagalog', dir: 'ltr', locale: 'fil-PH' },
  { code: 'bn', nativeName: 'বাংলা', englishName: 'Bengali', dir: 'ltr', locale: 'bn-BD' },
];

type Row = Record<TechLang, string>;

/** Keys used on the technician home and job screens. Every key must have all 7 languages (tested). */
export const TECH_STRINGS: Record<string, Row> = {
  'tech.lang.choose': { en: 'Language', ar: 'اللغة', hi: 'भाषा', ur: 'زبان', ml: 'ഭാഷ', tl: 'Wika', bn: 'ভাষা' },
  'tech.home.morning': { en: 'Good morning', ar: 'صباح الخير', hi: 'सुप्रभात', ur: 'صبح بخیر', ml: 'സുപ്രഭാതം', tl: 'Magandang umaga', bn: 'সুপ্রভাত' },
  'tech.home.afternoon': { en: 'Hello', ar: 'مرحباً', hi: 'नमस्ते', ur: 'السلام علیکم', ml: 'നമസ്കാരം', tl: 'Kumusta', bn: 'নমস্কার' },
  'tech.home.title': { en: 'Your jobs', ar: 'مهامك', hi: 'आपके काम', ur: 'آپ کے کام', ml: 'നിങ്ങളുടെ ജോലികൾ', tl: 'Iyong mga trabaho', bn: 'আপনার কাজ' },
  'tech.home.nextJob': { en: 'Your next job', ar: 'مهمتك التالية', hi: 'आपका अगला काम', ur: 'آپ کا اگلا کام', ml: 'അടുത്ത ജോലി', tl: 'Susunod na trabaho', bn: 'আপনার পরের কাজ' },
  'tech.home.new': { en: 'New', ar: 'جديدة', hi: 'नया', ur: 'نیا', ml: 'പുതിയത്', tl: 'Bago', bn: 'নতুন' },
  'tech.home.working': { en: 'Working', ar: 'قيد العمل', hi: 'काम चल रहा है', ur: 'کام جاری ہے', ml: 'ജോലി നടക്കുന്നു', tl: 'Ginagawa', bn: 'কাজ চলছে' },
  'tech.home.arrived': { en: 'Arrived', ar: 'وصلت', hi: 'पहुँच गए', ur: 'پہنچ گئے', ml: 'എത്തി', tl: 'Dumating na', bn: 'পৌঁছেছেন' },
  'tech.home.onWay': { en: 'On the way', ar: 'في الطريق', hi: 'रास्ते में', ur: 'راستے میں', ml: 'വഴിയിൽ', tl: 'Papunta na', bn: 'পথে আছেন' },
  'tech.home.accepted': { en: 'Accepted', ar: 'مقبولة', hi: 'स्वीकार किया', ur: 'قبول کیا', ml: 'സ്വീകരിച്ചു', tl: 'Tinanggap', bn: 'গ্রহণ করা হয়েছে' },
  'tech.home.navigate': { en: 'Navigate', ar: 'الاتجاهات', hi: 'रास्ता देखें', ur: 'راستہ دیکھیں', ml: 'വഴി കാണുക', tl: 'Direksyon', bn: 'পথ দেখুন' },
  'tech.home.accept': { en: 'Accept job', ar: 'قبول المهمة', hi: 'काम स्वीकार करें', ur: 'کام قبول کریں', ml: 'ജോലി സ്വീകരിക്കുക', tl: 'Tanggapin', bn: 'কাজ গ্রহণ করুন' },
  'tech.home.start': { en: 'Start job', ar: 'ابدأ المهمة', hi: 'काम शुरू करें', ur: 'کام شروع کریں', ml: 'ജോലി തുടങ്ങുക', tl: 'Simulan', bn: 'কাজ শুরু করুন' },
  'tech.home.noAddress': { en: 'Address not added yet — call the resident.', ar: 'لا يوجد عنوان بعد — اتصل بالساكن.', hi: 'पता नहीं है — निवासी को फ़ोन करें।', ur: 'پتہ نہیں ہے — رہائشی کو فون کریں۔', ml: 'വിലാസം ഇല്ല — താമസക്കാരനെ വിളിക്കുക.', tl: 'Wala pang address — tawagan ang residente.', bn: 'ঠিকানা নেই — বাসিন্দাকে ফোন করুন।' },
  'tech.home.stepsHint': { en: 'Photos and signature are asked for step by step inside the job.', ar: 'ستُطلب الصور والتوقيع خطوة بخطوة داخل المهمة.', hi: 'फ़ोटो और हस्ताक्षर काम के अंदर एक-एक करके माँगे जाएँगे।', ur: 'تصاویر اور دستخط کام کے اندر ایک ایک کر کے مانگے جائیں گے۔', ml: 'ഫോട്ടോയും ഒപ്പും ജോലിക്കുള്ളിൽ ഘട്ടം ഘട്ടമായി ചോദിക്കും.', tl: 'Hihingin ang litrato at pirma nang paisa-isa sa loob ng trabaho.', bn: 'ছবি ও স্বাক্ষর কাজের ভেতরে ধাপে ধাপে চাওয়া হবে।' },
  'tech.home.loadError': { en: 'Jobs could not load. Check your connection.', ar: 'تعذر تحميل المهام. تحقق من الاتصال.', hi: 'काम लोड नहीं हुए। इंटरनेट जाँचें।', ur: 'کام لوڈ نہیں ہوئے۔ انٹرنیٹ چیک کریں۔', ml: 'ജോലികൾ ലോഡ് ആയില്ല. ഇന്റർനെറ്റ് പരിശോധിക്കുക.', tl: 'Hindi ma-load ang trabaho. Suriin ang koneksyon.', bn: 'কাজ লোড হয়নি। ইন্টারনেট দেখুন।' },
  'tech.home.emptyTitle': { en: 'No jobs right now', ar: 'لا توجد مهام الآن', hi: 'अभी कोई काम नहीं', ur: 'ابھی کوئی کام نہیں', ml: 'ഇപ്പോൾ ജോലി ഇല്ല', tl: 'Walang trabaho ngayon', bn: 'এখন কোনো কাজ নেই' },
  'tech.home.emptyDetail': { en: "Stay on duty and we'll send you the next one.", ar: 'ابقَ متاحاً وسنرسل لك المهمة التالية.', hi: 'ड्यूटी पर रहें, अगला काम हम भेजेंगे।', ur: 'ڈیوٹی پر رہیں، اگلا کام ہم بھیجیں گے۔', ml: 'ഡ്യൂട്ടിയിൽ തുടരുക, അടുത്ത ജോലി അയയ്ക്കാം.', tl: 'Manatiling on duty, ipapadala namin ang susunod.', bn: 'ডিউটিতে থাকুন, পরের কাজ পাঠানো হবে।' },
  'tech.home.today': { en: 'Your jobs', ar: 'مهامك', hi: 'आपके काम', ur: 'آپ کے کام', ml: 'നിങ്ങളുടെ ജോലികൾ', tl: 'Iyong mga trabaho', bn: 'আপনার কাজ' },
  'tech.home.seeAll': { en: 'See all jobs', ar: 'كل المهام', hi: 'सभी काम देखें', ur: 'تمام کام دیکھیں', ml: 'എല്ലാ ജോലികളും', tl: 'Lahat ng trabaho', bn: 'সব কাজ দেখুন' },
  'tech.home.doneToday': { en: 'Done today', ar: 'أُنجزت اليوم', hi: 'आज पूरे हुए', ur: 'آج مکمل', ml: 'ഇന്ന് തീർന്നത്', tl: 'Tapos ngayon', bn: 'আজ সম্পন্ন' },
  'tech.home.history': { en: 'Job history', ar: 'سجل المهام', hi: 'काम का इतिहास', ur: 'کام کی تاریخ', ml: 'ജോലി ചരിത്രം', tl: 'Kasaysayan', bn: 'কাজের ইতিহাস' },
  'tech.home.open': { en: 'Open', ar: 'فتح', hi: 'खोलें', ur: 'کھولیں', ml: 'തുറക്കുക', tl: 'Buksan', bn: 'খুলুন' },
  'tech.home.earningsSoon': { en: 'Weekly earnings will show here', ar: 'ستظهر أرباحك الأسبوعية هنا', hi: 'साप्ताहिक कमाई यहाँ दिखेगी', ur: 'ہفتہ وار کمائی یہاں نظر آئے گی', ml: 'ആഴ്ചയിലെ വരുമാനം ഇവിടെ കാണാം', tl: 'Dito lalabas ang lingguhang kita', bn: 'সাপ্তাহিক আয় এখানে দেখাবে' },
  'tech.home.earningsSoonDetail': { en: 'Your payroll records are in Profile → HR.', ar: 'سجلات الرواتب في الملف الشخصي ← الموارد البشرية.', hi: 'वेतन रिकॉर्ड प्रोफ़ाइल → HR में हैं।', ur: 'تنخواہ کا ریکارڈ پروفائل ← HR میں ہے۔', ml: 'ശമ്പള രേഖകൾ പ്രൊഫൈൽ → HR ൽ.', tl: 'Nasa Profile → HR ang payroll mo.', bn: 'বেতনের রেকর্ড প্রোফাইল → HR-এ।' },
  'tech.job.quickNotes': { en: 'Tap what you did', ar: 'اضغط على ما قمت به', hi: 'जो किया उस पर टैप करें', ur: 'جو کیا اس پر ٹیپ کریں', ml: 'ചെയ്തത് തൊടുക', tl: 'I-tap ang ginawa mo', bn: 'যা করেছেন তাতে চাপুন' },
  'tech.job.q.fixed': { en: 'Fixed the fault', ar: 'تم إصلاح العطل', hi: 'खराबी ठीक की', ur: 'خرابی ٹھیک کی', ml: 'തകരാർ പരിഹരിച്ചു', tl: 'Naayos ang sira', bn: 'ত্রুটি ঠিক করেছি' },
  'tech.job.q.replaced': { en: 'Replaced a part', ar: 'تم استبدال قطعة', hi: 'पुर्जा बदला', ur: 'پرزہ بدلا', ml: 'ഭാഗം മാറ്റി', tl: 'Pinalitan ang piyesa', bn: 'যন্ত্রাংশ বদলেছি' },
  'tech.job.q.cleaned': { en: 'Cleaned and tested', ar: 'تم التنظيف والاختبار', hi: 'साफ़ करके जाँचा', ur: 'صاف کر کے چیک کیا', ml: 'വൃത്തിയാക്കി പരിശോധിച്ചു', tl: 'Nilinis at sinubukan', bn: 'পরিষ্কার করে পরীক্ষা করেছি' },
  'tech.job.q.followup': { en: 'Needs a follow-up visit', ar: 'يحتاج زيارة متابعة', hi: 'फिर से आना होगा', ur: 'دوبارہ آنا ہوگا', ml: 'വീണ്ടും വരണം', tl: 'Kailangan ng follow-up', bn: 'আবার আসতে হবে' },
  'tech.job.noParts': { en: 'No parts used', ar: 'لم تُستخدم قطع', hi: 'कोई पुर्जा नहीं लगा', ur: 'کوئی پرزہ استعمال نہیں ہوا', ml: 'ഭാഗങ്ങൾ ഉപയോഗിച്ചില്ല', tl: 'Walang piyesang ginamit', bn: 'কোনো যন্ত্রাংশ লাগেনি' },
  'tech.job.speak': { en: 'Speak your note', ar: 'قل ملاحظتك بصوتك', hi: 'बोलकर नोट लिखें', ur: 'بول کر نوٹ لکھیں', ml: 'സംസാരിച്ച് കുറിപ്പ്', tl: 'Sabihin ang tala', bn: 'বলে নোট লিখুন' },
  'tech.job.listening': { en: 'Listening… tap to stop', ar: 'جارٍ الاستماع… اضغط للإيقاف', hi: 'सुन रहे हैं… रोकने के लिए टैप करें', ur: 'سن رہے ہیں… روکنے کے لیے ٹیپ کریں', ml: 'കേൾക്കുന്നു… നിർത്താൻ തൊടുക', tl: 'Nakikinig… i-tap para tumigil', bn: 'শুনছি… থামাতে চাপুন' },
  'tech.job.voiceUnavailable': { en: 'Voice typing is not available on this phone. Tap the buttons instead.', ar: 'الكتابة الصوتية غير متاحة على هذا الهاتف. استخدم الأزرار.', hi: 'इस फ़ोन पर बोलकर लिखना उपलब्ध नहीं। बटन दबाएँ।', ur: 'اس فون پر بول کر لکھنا دستیاب نہیں۔ بٹن دبائیں۔', ml: 'ഈ ഫോണിൽ വോയ്സ് ടൈപ്പിംഗ് ഇല്ല. ബട്ടണുകൾ ഉപയോഗിക്കുക.', tl: 'Walang voice typing sa phone na ito. Gamitin ang mga button.', bn: 'এই ফোনে ভয়েস টাইপিং নেই। বোতাম ব্যবহার করুন।' },
  'tech.home.designJobs': { en: 'Design jobs', ar: 'أعمال التصميم', hi: 'डिज़ाइन काम', ur: 'ڈیزائن کے کام', ml: 'ഡിസൈൻ ജോലികൾ', tl: 'Mga design job', bn: 'ডিজাইন কাজ' },
  'tech.home.designJobsTitle': { en: 'Locked room designs', ar: 'تصاميم الغرف المقفلة', hi: 'लॉक किए कमरे के डिज़ाइन', ur: 'مقفل کمرے کے ڈیزائن', ml: 'ലോക്ക് ചെയ്ത മുറി ഡിസൈനുകൾ', tl: 'Mga naka-lock na disenyo ng kwarto', bn: 'লক করা রুম ডিজাইন' },
  'tech.home.designJobsDetail': { en: 'Open the picture and layout brief for a design the tenant locked.', ar: 'افتح الصورة وموجز التنفيذ للتصميم الذي قفله المستأجر.', hi: 'किरायेदार द्वारा लॉक किया गया चित्र और लेआउट खोलें।', ur: 'کرایہ دار کے مقفل کردہ تصویر اور لے آؤٹ کو کھولیں۔', ml: 'ടെനന്റ് ലോക്ക് ചെയ്ത ഡിസൈനിന്റെ ചിത്രവും ലേഔട്ടും തുറക്കുക.', tl: 'Buksan ang larawan at layout brief ng disenyong ni-lock ng tenant.', bn: 'ভাড়াটিয়া লক করা ডিজাইনের ছবি ও লেআউট খুলুন।' },
  'tech.history.propertyFallback': { en: 'Property', ar: 'العقار', hi: 'संपत्ति', ur: 'پراپرٹی', ml: 'പ്രോപ്പർട്ടി', tl: 'Property', bn: 'সম্পত্তি' },
};


let techDirLocks = 0;

function appDocumentDir(): 'ltr' | 'rtl' {
  try {
    if (typeof window !== 'undefined' && window.localStorage.getItem('bin_language') === 'ar') return 'rtl';
  } catch { /* ignore */ }
  return 'ltr';
}

function applyTechnicianDocumentDir(dir: 'ltr' | 'rtl') {
  if (typeof document === 'undefined') return;
  document.documentElement.dir = dir;
  document.body.dir = dir;
  document.documentElement.setAttribute('dir', dir);
  document.body.setAttribute('dir', dir);
}

const STORAGE_KEY = 'bin_tech_language';
const LANGUAGE_EVENT = 'bin-tech-language-change';

export function isTechLang(value: unknown): value is TechLang {
  return TECH_LANGUAGES.some((l) => l.code === value);
}

export function techT(lang: TechLang, key: string, fallbackEn: string): string {
  const row = TECH_STRINGS[key];
  return (row && (row[lang] || row.en)) || fallbackEn;
}

export function techDir(lang: TechLang): 'ltr' | 'rtl' {
  return TECH_LANGUAGES.find((l) => l.code === lang)?.dir || 'ltr';
}

export function techLocale(lang: TechLang): string {
  return TECH_LANGUAGES.find((l) => l.code === lang)?.locale || 'en-AE';
}

/** appLang is the global en/ar choice; it is the default until the technician picks one here. */
export function useTechnicianLanguage(appLang: string) {
  const [lang, setLangState] = useState<TechLang>(() => {
    try {
      const stored = typeof window !== 'undefined' ? window.localStorage.getItem(STORAGE_KEY) : null;
      if (isTechLang(stored)) return stored;
    } catch { /* storage blocked: fall through */ }
    return appLang === 'ar' ? 'ar' : 'en';
  });
  useEffect(() => {
    try { if (!window.localStorage.getItem(STORAGE_KEY)) setLangState(appLang === 'ar' ? 'ar' : 'en'); } catch { /* ignore */ }
  }, [appLang]);
  // Keep every mounted technician screen/component in sync when the language is changed in one place.
  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const onChange = (e: Event) => { const next = (e as CustomEvent).detail; if (isTechLang(next)) setLangState(next); };
    window.addEventListener(LANGUAGE_EVENT, onChange);
    return () => window.removeEventListener(LANGUAGE_EVENT, onChange);
  }, []);
  const setLang = useCallback((next: TechLang) => {
    setLangState(next);
    try { window.localStorage.setItem(STORAGE_KEY, next); } catch { /* ignore */ }
    try { window.dispatchEvent(new CustomEvent(LANGUAGE_EVENT, { detail: next })); } catch { /* ignore */ }
  }, []);
  useEffect(() => {
    if (typeof document === 'undefined') return undefined;
    applyTechnicianDocumentDir(techDir(lang));
    techDirLocks += 1;
    return () => {
      techDirLocks -= 1;
      if (techDirLocks <= 0) {
        techDirLocks = 0;
        applyTechnicianDocumentDir(appDocumentDir());
      }
    };
  }, [lang]);
  const tt = useCallback((key: string, fallbackEn: string) => techT(lang, key, fallbackEn), [lang]);
  return { lang, setLang, tt, isRTL: techDir(lang) === 'rtl', locale: techLocale(lang) };
}

// HR screen copy for technicians in all 7 technician languages (fix H, Rashid 4 Nov 2026).
// Keyed by the English text so <HrBi en ar /> can drop in where <Bi en ar /> was. Any English text
// without a row falls back to the old en/ar behaviour (Arabic for ar, English otherwise).
import type { TechLang } from './technicianLanguages';

type Row = Record<TechLang, string>;

export const HR_STRINGS: Record<string, Row> = {
  'Language': { en: 'Language', ar: 'اللغة', hi: 'भाषा', ur: 'زبان', ml: 'ഭാഷ', tl: 'Wika', bn: 'ভাষা' },
  'AI-Driven Multilingual Blue-Collar Workforce ESS': { en: 'My HR', ar: 'الخدمة الذاتية للموظفين متعددة اللغات', hi: 'मेरा HR', ur: 'میرا HR', ml: 'എന്റെ HR', tl: 'Aking HR', bn: 'আমার HR' },
  'My Hours': { en: 'My Hours', ar: 'ساعات عملي', hi: 'मेरे घंटे', ur: 'میرے گھنٹے', ml: 'എന്റെ സമയം', tl: 'Aking Oras', bn: 'আমার কাজের সময়' },
  'My overtime claims and proof': { en: 'My overtime claims and proof', ar: 'طلبات العمل الإضافي والإثبات', hi: 'मेरे ओवरटाइम दावे और सबूत', ur: 'میرے اوور ٹائم دعوے اور ثبوت', ml: 'എന്റെ ഓവർടൈം അപേക്ഷകളും തെളിവും', tl: 'Aking overtime claim at patunay', bn: 'আমার ওভারটাইম দাবি ও প্রমাণ' },
  'My roster (GST): ': { en: 'My roster (GST): ', ar: 'جدول نوباتي: ', hi: 'मेरी ड्यूटी (GST): ', ur: 'میری ڈیوٹی (GST): ', ml: 'എന്റെ ഡ്യൂട്ടി (GST): ', tl: 'Aking iskedyul (GST): ', bn: 'আমার ডিউটি (GST): ' },
  'Not set by HR yet': { en: 'Not set by HR yet', ar: 'لم يحدده قسم الموارد البشرية بعد', hi: 'HR ने अभी तय नहीं किया', ur: 'HR نے ابھی طے نہیں کیا', ml: 'HR ഇതുവരെ നിശ്ചയിച്ചിട്ടില്ല', tl: 'Hindi pa itinakda ng HR', bn: 'HR এখনও ঠিক করেনি' },
  'Leave Request': { en: 'Leave Request', ar: 'طلب إجازة', hi: 'छुट्टी का आवेदन', ur: 'چھٹی کی درخواست', ml: 'അവധി അപേക്ഷ', tl: 'Hiling na Leave', bn: 'ছুটির আবেদন' },
  'Leave type': { en: 'Leave type', ar: 'نوع الإجازة', hi: 'छुट्टी का प्रकार', ur: 'چھٹی کی قسم', ml: 'അവധി തരം', tl: 'Uri ng leave', bn: 'ছুটির ধরন' },
  'Start date': { en: 'Start date', ar: 'تاريخ البدء', hi: 'शुरू की तारीख', ur: 'شروع کی تاریخ', ml: 'തുടങ്ങുന്ന തീയതി', tl: 'Petsa ng simula', bn: 'শুরুর তারিখ' },
  'End date': { en: 'End date', ar: 'تاريخ الانتهاء', hi: 'खत्म की तारीख', ur: 'ختم کی تاریخ', ml: 'അവസാന തീയതി', tl: 'Petsa ng pagtatapos', bn: 'শেষের তারিখ' },
  'days': { en: 'days', ar: 'أيام', hi: 'दिन', ur: 'دن', ml: 'ദിവസം', tl: 'araw', bn: 'দিন' },
  'Worked': { en: 'Worked', ar: 'ساعات العمل', hi: 'काम किया', ur: 'کام کیا', ml: 'ജോലി ചെയ്തത്', tl: 'Nagtrabaho', bn: 'কাজ করেছেন' },
  'Clocked overtime': { en: 'Clocked overtime', ar: 'العمل الإضافي المسجّل', hi: 'दर्ज ओवरटाइम', ur: 'درج اوور ٹائم', ml: 'രേഖപ്പെടുത്തിയ ഓവർടൈം', tl: 'Naitalang overtime', bn: 'রেকর্ড করা ওভারটাইম' },
  'Approved overtime': { en: 'Approved overtime', ar: 'العمل الإضافي المعتمد', hi: 'मंज़ूर ओवरटाइम', ur: 'منظور شدہ اوور ٹائم', ml: 'അംഗീകരിച്ച ഓവർടൈം', tl: 'Aprubadong overtime', bn: 'অনুমোদিত ওভারটাইম' },
  'No shifts this month.': { en: 'No shifts this month.', ar: 'لا توجد نوبات هذا الشهر.', hi: 'इस महीने कोई शिफ्ट नहीं।', ur: 'اس مہینے کوئی شفٹ نہیں۔', ml: 'ഈ മാസം ഷിഫ്റ്റ് ഇല്ല.', tl: 'Walang shift ngayong buwan.', bn: 'এই মাসে কোনো শিফট নেই।' },
  'No overtime claims this month.': { en: 'No overtime claims this month.', ar: 'لا توجد طلبات عمل إضافي هذا الشهر.', hi: 'इस महीने कोई ओवरटाइम दावा नहीं।', ur: 'اس مہینے کوئی اوور ٹائم دعویٰ نہیں۔', ml: 'ഈ മാസം ഓവർടൈം അപേക്ഷ ഇല്ല.', tl: 'Walang overtime claim ngayong buwan.', bn: 'এই মাসে কোনো ওভারটাইম দাবি নেই।' },
  'MISSED CLOCK-OUT': { en: 'MISSED CLOCK-OUT', ar: 'لم يُسجَّل الخروج', hi: 'क्लॉक-आउट छूट गया', ur: 'کلاک آؤٹ رہ گیا', ml: 'ക്ലോക്ക്-ഔട്ട് ചെയ്തില്ല', tl: 'HINDI NAKA-CLOCK-OUT', bn: 'ক্লক-আউট করা হয়নি' },
  'REST DAY': { en: 'REST DAY', ar: 'يوم راحة', hi: 'आराम का दिन', ur: 'آرام کا دن', ml: 'വിശ്രമ ദിവസം', tl: 'ARAW NG PAHINGA', bn: 'বিশ্রামের দিন' },
  'Claimed': { en: 'Claimed', ar: 'المطلوب', hi: 'दावा', ur: 'دعویٰ', ml: 'അപേക്ഷിച്ചത്', tl: 'Hiniling', bn: 'দাবি' },
  'Approved': { en: 'Approved', ar: 'المعتمد', hi: 'मंज़ूर', ur: 'منظور', ml: 'അംഗീകരിച്ചത്', tl: 'Aprubado', bn: 'অনুমোদিত' },
  'Estimated End-of-Service Gratuity': { en: 'Estimated End-of-Service Gratuity', ar: 'مكافأة نهاية الخدمة التقديرية', hi: 'अनुमानित सेवा-समाप्ति ग्रेच्युटी', ur: 'متوقع اختتامِ ملازمت گریجویٹی', ml: 'കണക്കാക്കിയ സേവനാന്ത ഗ്രാറ്റുവിറ്റി', tl: 'Tantiyang End-of-Service Gratuity', bn: 'আনুমানিক চাকরি-শেষ গ্র্যাচুইটি' },
  'Based on': { en: 'Based on', ar: 'بناءً على', hi: 'आधार', ur: 'بنیاد', ml: 'അടിസ്ഥാനം', tl: 'Batay sa', bn: 'ভিত্তি' },
  'years of service to date.': { en: 'years of service to date.', ar: 'سنوات خدمة حتى الآن.', hi: 'साल की सेवा अब तक।', ur: 'سال کی ملازمت اب تک۔', ml: 'വർഷത്തെ സേവനം ഇതുവരെ.', tl: 'taon ng serbisyo hanggang ngayon.', bn: 'বছর চাকরি এখন পর্যন্ত।' },
  'Your basic salary and/or joining date are not on file yet. Ask HR to update your profile to see an estimate here.': { en: 'Your basic salary and/or joining date are not on file yet. Ask HR to update your profile to see an estimate here.', ar: 'راتبك الأساسي أو تاريخ التحاقك غير مسجل بعد. اطلب من الموارد البشرية تحديث ملفك لرؤية التقدير هنا.', hi: 'आपका मूल वेतन या जॉइनिंग तारीख अभी दर्ज नहीं है। अनुमान देखने के लिए HR से प्रोफ़ाइल अपडेट करवाएँ।', ur: 'آپ کی بنیادی تنخواہ یا شمولیت کی تاریخ ابھی درج نہیں۔ اندازہ دیکھنے کے لیے HR سے پروفائل اپڈیٹ کروائیں۔', ml: 'നിങ്ങളുടെ അടിസ്ഥാന ശമ്പളമോ ചേർന്ന തീയതിയോ രേഖപ്പെടുത്തിയിട്ടില്ല. കണക്ക് കാണാൻ HR നോട് പ്രൊഫൈൽ പുതുക്കാൻ പറയുക.', tl: 'Wala pa sa record ang basic salary o petsa ng pagpasok mo. Hilingin sa HR na i-update ang profile mo.', bn: 'আপনার মূল বেতন বা যোগদানের তারিখ এখনও নথিতে নেই। হিসাব দেখতে HR-কে প্রোফাইল আপডেট করতে বলুন।' },
  'HR Letters': { en: 'HR Letters', ar: 'خطابات الموارد البشرية', hi: 'HR पत्र', ur: 'HR خطوط', ml: 'HR കത്തുകൾ', tl: 'Mga HR Letter', bn: 'HR চিঠি' },
  'No HR letters yet.': { en: 'No HR letters yet.', ar: 'لا توجد خطابات بعد.', hi: 'अभी कोई HR पत्र नहीं।', ur: 'ابھی کوئی HR خط نہیں۔', ml: 'ഇതുവരെ HR കത്തുകൾ ഇല്ല.', tl: 'Wala pang HR letter.', bn: 'এখনও কোনো HR চিঠি নেই।' },
  'No HR cases yet.': { en: 'No HR cases yet.', ar: 'لا توجد طلبات بعد.', hi: 'अभी कोई HR मामला नहीं।', ur: 'ابھی کوئی HR معاملہ نہیں۔', ml: 'ഇതുവരെ HR അപേക്ഷകൾ ഇല്ല.', tl: 'Wala pang HR case.', bn: 'এখনও কোনো HR কেস নেই।' },
  'AI HR Request Registry': { en: 'My HR requests', ar: 'سجل طلبات الموارد البشرية', hi: 'मेरे HR अनुरोध', ur: 'میری HR درخواستیں', ml: 'എന്റെ HR അപേക്ഷകൾ', tl: 'Aking mga HR request', bn: 'আমার HR অনুরোধ' },
  'Staff Document Upload Vault': { en: 'Staff Document Upload Vault', ar: 'خزنة مستندات الموظف', hi: 'दस्तावेज़ अपलोड करें', ur: 'دستاویزات اپلوڈ کریں', ml: 'രേഖകൾ അപ്‌ലോഡ് ചെയ്യുക', tl: 'Mag-upload ng dokumento', bn: 'নথি আপলোড করুন' },
  'Wellbeing Check-In': { en: 'Wellbeing Check-In', ar: 'متابعة الحالة الصحية', hi: 'सेहत की जाँच', ur: 'صحت کی جانچ', ml: 'ക്ഷേമ പരിശോധന', tl: 'Kumusta ka?', bn: 'সুস্থতা যাচাই' },
  'Heat Stress Season': { en: 'Heat Stress Season', ar: 'موسم الإجهاد الحراري', hi: 'गर्मी का मौसम — सावधान', ur: 'گرمی کا موسم — احتیاط', ml: 'ചൂട് കാലം — ശ്രദ്ധിക്കുക', tl: 'Panahon ng matinding init', bn: 'গরমের মৌসুম — সাবধান' },
  'Quick Training Tests': { en: 'Quick Training Tests', ar: 'اختبارات تدريب سريعة', hi: 'छोटे प्रशिक्षण टेस्ट', ur: 'مختصر تربیتی ٹیسٹ', ml: 'ചെറിയ പരിശീലന ടെസ്റ്റുകൾ', tl: 'Mabilis na training test', bn: 'ছোট প্রশিক্ষণ পরীক্ষা' },
  'IF I RESIGN': { en: 'IF I RESIGN', ar: 'إذا استقلت', hi: 'अगर मैं इस्तीफ़ा दूँ', ur: 'اگر میں استعفیٰ دوں', ml: 'ഞാൻ രാജിവെച്ചാൽ', tl: 'KUNG MAG-RESIGN AKO', bn: 'যদি আমি পদত্যাগ করি' },
  'CONTRACT END / EMPLOYER-INITIATED': { en: 'CONTRACT END / EMPLOYER-INITIATED', ar: 'انتهاء العقد / بقرار صاحب العمل', hi: 'अनुबंध समाप्त / कंपनी द्वारा', ur: 'معاہدہ ختم / کمپنی کی طرف سے', ml: 'കരാർ അവസാനം / കമ്പനി തീരുമാനം', tl: 'TAPOS NA KONTRATA / DESISYON NG EMPLOYER', bn: 'চুক্তি শেষ / কোম্পানির সিদ্ধান্তে' },
  'Document Type': { en: 'Document Type', ar: 'نوع المستند', hi: 'दस्तावेज़ का प्रकार', ur: 'دستاویز کی قسم', ml: 'രേഖയുടെ തരം', tl: 'Uri ng dokumento', bn: 'নথির ধরন' },
};

export function hrText(lang: TechLang, en: string, ar: string): string {
  const row = HR_STRINGS[en];
  if (row && row[lang]) return row[lang];
  return lang === 'ar' ? ar : en;
}

export type BlueCollarEssLanguage = 'en' | 'ar' | 'hi' | 'ur' | 'ml' | 'tl' | 'bn' | 'ne' | 'mixed';

export type BlueCollarEssIntent = {
  requestType:
    | 'annual_leave'
    | 'emergency_leave'
    | 'sick_leave'
    | 'unpaid_leave'
    | 'overtime'
    | 'payslip'
    | 'salary_query'
    | 'salary_certificate'
    | 'noc_letter'
    | 'experience_letter'
    | 'contract_copy'
    | 'document_update'
    | 'tools_ppe'
    | 'vehicle_issue'
    | 'accommodation'
    | 'safety_incident'
    | 'manager_issue'
    | 'staff_wellbeing'
    | 'hr_support';
  category:
    | 'leave'
    | 'payroll'
    | 'letters'
    | 'documents'
    | 'assets'
    | 'transport'
    | 'accommodation'
    | 'safety'
    | 'confidential'
    | 'wellbeing'
    | 'general_hr';
  priority: 'normal' | 'high' | 'urgent';
  language: BlueCollarEssLanguage;
  confidence: number;
  matchedKeywords: string[];
  requiresHumanReview: boolean;
  answer: string;
  recommendedNextAction: string;
};

type IntentTrainingRow = {
  requestType: BlueCollarEssIntent['requestType'];
  category: BlueCollarEssIntent['category'];
  priority: BlueCollarEssIntent['priority'];
  answer: string;
  recommendedNextAction: string;
  keywords: string[];
};

const normalize = (text: string) => String(text || '')
  .toLowerCase()
  .normalize('NFKC')
  .replace(/[؟?.,!؛;:()[\]{}]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const detectLanguage = (text: string): BlueCollarEssLanguage => {
  const value = String(text || '');
  const hits: BlueCollarEssLanguage[] = [];
  if (/[\u0600-\u06FF]/.test(value)) hits.push('ar');
  if (/[\u0900-\u097F]/.test(value)) hits.push('hi');
  if (/[\u0D00-\u0D7F]/.test(value)) hits.push('ml');
  if (/[\u0980-\u09FF]/.test(value)) hits.push('bn');
  if (/[\u0900-\u097F]/.test(value) && /(छुट्टी|बिरामी|तलब|ओभरटाइम|पासपोर्ट|कोठा|दुर्घटना)/.test(value)) hits.push('ne');
  if (/(po|ako|kailangan|sahod|overtime|leave|dokumento|tirahan|aksidente|supervisor)/i.test(value)) hits.push('tl');
  if (/(chutti|bimar|tankhwa|salary|overtime|passport|iqama|kamra|room|camp|ustad|supervisor|madad|payslip)/i.test(value)) hits.push('ur');
  const unique = Array.from(new Set(hits));
  if (unique.length > 1) return 'mixed';
  return unique[0] || 'en';
};

const urgentSafetyWords = [
  'accident', 'injury', 'injured', 'bleeding', 'fire', 'electric shock', 'gas leak', 'unsafe', 'danger', 'emergency', 'heat stroke', 'fall down',
  'حادث', 'إصابة', 'خطر', 'حريق', 'كهرباء', 'طوارئ', 'إسعاف',
  'दुर्घटना', 'चोट', 'खतरा', 'आग', 'करंट', 'आपातकाल',
  'حادثہ', 'چوٹ', 'خطرہ', 'آگ', 'کرنٹ', 'ایمرجنسی',
  'അപകടം', 'പരിക്ക്', 'അപായം', 'തീ', 'കരന്റ്',
  'aksidente', 'nasugatan', 'delikado', 'sunog', 'kuryente',
  'দুর্ঘটনা', 'আঘাত', 'বিপদ', 'আগুন',
  'दुर्घटना', 'चोट', 'खतरा',
];

const managerRiskWords = [
  'threat', 'retaliation', 'harassment', 'abuse', 'pressure', 'unfair', 'complaint against supervisor', 'manager problem', 'supervisor problem',
  'تهديد', 'انتقام', 'تحرش', 'ضغط', 'ظلم', 'مشكلة مع المشرف',
  'धमकी', 'दबाव', 'अन्याय', 'सुपरवाइजर', 'मैनेजर',
  'دھمکی', 'دباؤ', 'ناانصافی', 'سپروائزر', 'منیجر',
  'ഭീഷണി', 'സൂപ്പർവൈസർ', 'മാനേജർ',
  'pananakot', 'pressure', 'hindi patas', 'supervisor', 'manager',
];

const trainingRows: IntentTrainingRow[] = [
  {
    requestType: 'safety_incident', category: 'safety', priority: 'urgent',
    answer: 'Urgent safety incident created. HR and Operations must review this immediately.',
    recommendedNextAction: 'Ask the worker to move to a safe location, notify supervisor/HR, and attach photo or medical proof if available.',
    keywords: urgentSafetyWords,
  },
  {
    requestType: 'manager_issue', category: 'confidential', priority: 'urgent',
    answer: 'Private HR complaint created. This case requires confidential human review.',
    recommendedNextAction: 'Route to HR manager only. Do not expose the complaint to the direct supervisor.',
    keywords: managerRiskWords,
  },
  {
    requestType: 'sick_leave', category: 'leave', priority: 'high',
    answer: 'Sick leave or medical support case created.',
    recommendedNextAction: 'Request medical certificate or hospital note when available.',
    keywords: ['sick', 'ill', 'fever', 'doctor', 'hospital', 'medical', 'clinic', 'medicine', 'مريض', 'مرض', 'مستشفى', 'طبيب', 'عيادة', 'बीमार', 'बुखार', 'डॉक्टर', 'अस्पताल', 'طبیعت', 'بیمار', 'بخار', 'ڈاکٹر', 'ہسپتال', 'സുഖമില്ല', 'പനി', 'ഡോക്ടർ', 'ആശുപത്രി', 'may sakit', 'lagnat', 'doktor', 'ospital', 'অসুস্থ', 'জ্বর', 'ডাক্তার', 'হাসপাতাল', 'बिरामी', 'ज्वरो'],
  },
  {
    requestType: 'emergency_leave', category: 'leave', priority: 'high',
    answer: 'Emergency leave request created for HR review.',
    recommendedNextAction: 'Ask for travel/emergency reason and expected return date.',
    keywords: ['emergency leave', 'family emergency', 'death', 'mother hospital', 'father hospital', 'urgent leave', 'إجازة طارئة', 'حالة عائلية', 'وفاة', 'أمي في المستشفى', 'आपातकालीन छुट्टी', 'घर जाना है', 'मां अस्पताल', 'ایمرجنسی چھٹی', 'گھر جانا', 'امی ہسپتال', 'അടിയന്തര അവധി', 'വീട്ടിൽ പോകണം', 'emergency leave po', 'uwi probinsya', 'পরিবার জরুরি', 'घर जानु'],
  },
  {
    requestType: 'annual_leave', category: 'leave', priority: 'normal',
    answer: 'Annual leave request created.',
    recommendedNextAction: 'Check leave balance and supervisor coverage before approval.',
    keywords: ['annual leave', 'vacation', 'holiday', 'leave balance', 'chutti', 'छुट्टी', 'छुट्टी चाहिए', 'إجازة سنوية', 'إجازة', 'چھٹی', 'سالانہ چھٹی', 'അവധി', 'leave po', 'bakasyon', 'ছুটি', 'बिदा'],
  },
  {
    requestType: 'unpaid_leave', category: 'leave', priority: 'normal',
    answer: 'Unpaid leave request created.',
    recommendedNextAction: 'HR must confirm salary impact before approval.',
    keywords: ['unpaid leave', 'leave without pay', 'خصم راتب', 'إجازة بدون راتب', 'बिना वेतन छुट्टी', 'بغیر تنخواہ چھٹی', 'ശമ്പളമില്ലാത്ത അവധി', 'walang bayad leave'],
  },
  {
    requestType: 'overtime', category: 'payroll', priority: 'high',
    answer: 'Overtime or rest-day work review case created.',
    recommendedNextAction: 'Ask for date, shift, site, and hours worked.',
    keywords: ['overtime', 'extra hour', 'extra duty', 'late duty', 'rest day work', 'worked late', 'friday work', 'public holiday work', 'أوفر تايم', 'ساعات إضافية', 'عملت زيادة', 'ओवरटाइम', 'अतिरिक्त घंटे', 'اوور ٹائم', 'اضافی گھنٹے', 'ഓവർടൈം', 'extra oras', 'sobrang oras', 'ওভারটাইম', 'अतिरिक्त समय'],
  },
  {
    requestType: 'payslip', category: 'payroll', priority: 'normal',
    answer: 'Payslip request created.',
    recommendedNextAction: 'Finance should attach or publish the requested payslip.',
    keywords: ['payslip', 'salary slip', 'wage slip', 'pay slip', 'قسيمة راتب', 'كشف راتب', 'सैलरी स्लिप', 'तनख्वाह पर्ची', 'پے سلپ', 'تنخواہ سلپ', 'ശമ്പള സ്ലിപ്പ്', 'payslip po', 'salary slip po', 'বেতন স্লিপ'],
  },
  {
    requestType: 'salary_query', category: 'payroll', priority: 'high',
    answer: 'Salary or deduction review case created.',
    recommendedNextAction: 'Finance must review WPS status, deductions, allowances, and payment date.',
    keywords: ['salary', 'wages', 'payment missing', 'deduction', 'allowance', 'wps', 'late salary', 'salary not received', 'راتب', 'خصم', 'تأخير الراتب', 'أجر', 'वेतन', 'तनख्वाह', 'कटौती', 'सैलरी नहीं मिली', 'تنخواہ', 'کٹوتی', 'سیلری نہیں ملی', 'ശമ്പളം', 'കുറവ്', 'sahod', 'kulang sahod', 'deduction', 'বেতন', 'কাটতি', 'तलब'],
  },
  {
    requestType: 'salary_certificate', category: 'letters', priority: 'normal',
    answer: 'Salary certificate request created.',
    recommendedNextAction: 'HR should generate an official salary certificate if the profile is complete.',
    keywords: ['salary certificate', 'bank letter', 'راتب شهادة', 'شهادة راتب', 'वेतन प्रमाण पत्र', 'سیلری سرٹیفیکیٹ', 'salary certificate po'],
  },
  {
    requestType: 'noc_letter', category: 'letters', priority: 'normal',
    answer: 'NOC letter request created.',
    recommendedNextAction: 'HR should confirm purpose, recipient, and approval authority.',
    keywords: ['noc', 'no objection', 'driving license letter', 'bank noc', 'عدم ممانعة', 'एनओसी', 'کوئی اعتراض نہیں', 'noc po'],
  },
  {
    requestType: 'experience_letter', category: 'letters', priority: 'normal',
    answer: 'Experience letter request created.',
    recommendedNextAction: 'HR should verify joining date, role, and employment status.',
    keywords: ['experience letter', 'service letter', 'employment letter', 'شهادة خبرة', 'अनुभव पत्र', 'تجربہ خط', 'experience letter po'],
  },
  {
    requestType: 'contract_copy', category: 'documents', priority: 'normal',
    answer: 'Contract copy request created.',
    recommendedNextAction: 'HR should attach the approved employment contract copy.',
    keywords: ['contract copy', 'labour contract', 'employment contract', 'عقد العمل', 'نسخة العقد', 'कॉन्ट्रैक्ट कॉपी', 'معاہدہ کاپی', 'contract po'],
  },
  {
    requestType: 'document_update', category: 'documents', priority: 'normal',
    answer: 'Document update case created.',
    recommendedNextAction: 'Ask worker to upload or present updated visa, Emirates ID, passport, labour card, or medical document.',
    keywords: ['visa', 'emirates id', 'eid', 'passport', 'labour card', 'labor card', 'medical card', 'document update', 'جواز', 'فيزا', 'هوية', 'بطاقة العمل', 'पासपोर्ट', 'वीजा', 'एमिरेट्स आईडी', 'لیبر کارڈ', 'پاسپورٹ', 'ویزہ', 'പാസ്പോർട്ട്', 'വിസ', 'dokumento', 'passport po', 'ভিসা', 'পাসপোর্ট', 'श्रम कार्ड'],
  },
  {
    requestType: 'tools_ppe', category: 'assets', priority: 'normal',
    answer: 'Tools, PPE, or uniform request created.',
    recommendedNextAction: 'Operations should confirm issue, replacement, or return status.',
    keywords: ['tools', 'tool kit', 'helmet', 'gloves', 'safety shoes', 'uniform', 'ppe', 'ladder', 'drill', 'معدات', 'خوذة', 'قفازات', 'زي', 'हेलमेट', 'दस्ताने', 'औजार', 'یونیفارم', 'ہیلمٹ', 'اوزار', 'ടൂൾ', 'ഹെൽമറ്റ്', 'guwantes', 'helmet', 'uniform po', 'সরঞ্জাম', 'হেলমেট'],
  },
  {
    requestType: 'vehicle_issue', category: 'transport', priority: 'normal',
    answer: 'Vehicle or transport issue created.',
    recommendedNextAction: 'Dispatch should review vehicle, fuel, route, or transport allocation.',
    keywords: ['vehicle', 'van', 'car', 'fuel', 'transport', 'pickup', 'driver', 'سيارة', 'وقود', 'نقل', 'वाहन', 'गाड़ी', 'फ्यूल', 'گاڑی', 'فیول', 'വാഹനം', 'fuel', 'sasakyan', 'transport po', 'গাড়ি', 'যাতায়াত'],
  },
  {
    requestType: 'accommodation', category: 'accommodation', priority: 'high',
    answer: 'Accommodation or camp issue created.',
    recommendedNextAction: 'HR/Admin should inspect room, AC, water, bed, hygiene, or camp condition.',
    keywords: ['accommodation', 'camp', 'room', 'bed', 'water', 'toilet', 'bathroom', 'a/c', 'ac not working', 'مخيم', 'سكن', 'غرفة', 'ماء', 'حمام', 'مكيف', 'कमरा', 'पानी', 'बाथरूम', 'कैंप', 'کمرہ', 'پانی', 'باتھ روم', 'کیمپ', 'റൂം', 'വെള്ളം', 'camp room', 'kwarto', 'tubig', 'banyo', 'ক্যাম্প', 'রুম', 'পানি'],
  },
  {
    requestType: 'staff_wellbeing', category: 'wellbeing', priority: 'high',
    answer: 'Staff wellbeing support case created.',
    recommendedNextAction: 'HR should contact the worker privately and check stress, fatigue, health, or urgent support needs.',
    keywords: ['stress', 'tired', 'depressed', 'mental', 'not okay', 'very tired', 'no sleep', 'ضغط نفسي', 'تعبان', 'مرهق', 'तनाव', 'थका', 'नींद नहीं', 'پریشان', 'تھکا ہوا', 'സമ്മർദ്ദം', 'ക്ഷീണം', 'pagod', 'stress', 'মানসিক চাপ', 'थकित'],
  },
];

export const BLUE_COLLAR_ESS_SUPPORTED_LANGUAGES = [
  'English',
  'Arabic',
  'Hindi',
  'Urdu',
  'Malayalam',
  'Tagalog',
  'Bengali',
  'Nepali',
  'Mixed / code-switching',
] as const;

export const BLUE_COLLAR_ESS_TRAINING_VERSION = 'BIN-PEOPLE-AI-ESS-V1.0';

export function classifyBlueCollarEssIntent(message: string): BlueCollarEssIntent {
  const normalized = normalize(message);
  const language = detectLanguage(message);
  const scored = trainingRows.map((row) => {
    const matchedKeywords = row.keywords.filter((keyword) => normalized.includes(normalize(keyword)));
    const exactPhraseBoost = matchedKeywords.some((keyword) => normalize(keyword).includes(' ')) ? 1 : 0;
    const urgentBoost = row.priority === 'urgent' && matchedKeywords.length > 0 ? 2 : 0;
    return {
      row,
      matchedKeywords,
      score: matchedKeywords.length + exactPhraseBoost + urgentBoost,
    };
  }).sort((a, b) => b.score - a.score);

  const winner = scored[0];
  if (!winner || winner.score <= 0) {
    return {
      requestType: 'hr_support',
      category: 'general_hr',
      priority: 'normal',
      language,
      confidence: 0.35,
      matchedKeywords: [],
      requiresHumanReview: true,
      answer: 'General HR support case created. HR will review and route it to the correct department.',
      recommendedNextAction: 'Ask one clarifying question if needed, then route to HR review.',
    };
  }

  const urgentOverride = urgentSafetyWords.some((keyword) => normalized.includes(normalize(keyword))) || managerRiskWords.some((keyword) => normalized.includes(normalize(keyword)));
  const confidence = Math.min(0.98, 0.48 + winner.score * 0.12);

  return {
    requestType: winner.row.requestType,
    category: winner.row.category,
    priority: urgentOverride ? 'urgent' : winner.row.priority,
    language,
    confidence,
    matchedKeywords: winner.matchedKeywords.slice(0, 8),
    requiresHumanReview: winner.row.priority !== 'normal' || winner.row.category === 'confidential' || confidence < 0.72,
    answer: winner.row.answer,
    recommendedNextAction: winner.row.recommendedNextAction,
  };
}

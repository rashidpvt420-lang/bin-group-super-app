export type HrIntent = {
  requestType:
    | "annual_leave"
    | "emergency_leave"
    | "sick_leave"
    | "unpaid_leave"
    | "overtime"
    | "payslip"
    | "salary_query"
    | "salary_certificate"
    | "noc_letter"
    | "experience_letter"
    | "contract_copy"
    | "document_update"
    | "tools_ppe"
    | "vehicle_issue"
    | "accommodation"
    | "safety_incident"
    | "manager_issue"
    | "staff_wellbeing"
    | "hr_support";
  category:
    | "leave"
    | "payroll"
    | "letters"
    | "documents"
    | "assets"
    | "transport"
    | "accommodation"
    | "safety"
    | "confidential"
    | "wellbeing"
    | "general_hr";
  priority: "normal" | "high" | "urgent";
  language: "en" | "ar" | "hi" | "ur" | "ml" | "tl" | "bn" | "ne" | "mixed";
  confidence: number;
  matchedKeywords: string[];
  requiresHumanReview: boolean;
  answer: string;
  recommendedNextAction: string;
  privacyTier: "standard" | "restricted" | "hr_manager_only";
};

export const HR_INTENT_TRAINING_VERSION = "BIN-PEOPLE-AI-ESS-V1.2-SERVER";

const normalize = (text: string) => String(text || "")
  .toLowerCase()
  .normalize("NFKC")
  .replace(/[؟?.,!؛;:()[\]{}]/g, " ")
  .replace(/\s+/g, " ")
  .trim();

const languageFor = (text: string): HrIntent["language"] => {
  const value = String(text || "");
  const hits: HrIntent["language"][] = [];
  if (/[\u0600-\u06FF]/.test(value)) hits.push("ar");
  if (/[\u0D00-\u0D7F]/.test(value)) hits.push("ml");
  if (/[\u0980-\u09FF]/.test(value)) hits.push("bn");
  if (/[\u0900-\u097F]/.test(value)) hits.push("hi");
  if (/(chutti|bimar|bimaar|tankhwa|tanqwa|kamra|madad|ustad|mujhe|mujhay|ghar jana)/i.test(value)) hits.push("ur");
  if (/(\bpo\b|\bako\b|kailangan|sahod|dokumento|tirahan|aksidente|nasugatan|delikado|kwarto|tubig|banyo|pagod)/i.test(value)) hits.push("tl");
  const unique = Array.from(new Set(hits));
  if (unique.length > 1) return "mixed";
  return unique[0] || "en";
};

const safetyWords = [
  "accident", "injury", "injured", "bleeding", "fire", "electric shock", "gas leak", "unsafe", "danger", "emergency", "heat stroke", "fall down",
  "حادث", "إصابة", "خطر", "حريق", "كهرباء", "طوارئ", "إسعاف",
  "दुर्घटना", "चोट", "खतरा", "आग", "करंट", "حادثہ", "چوٹ", "خطرہ", "آگ", "کرنٹ",
  "അപകടം", "പരിക്ക്", "അപായം", "aksidente", "nasugatan", "delikado", "দুর্ঘটনা", "আঘাত",
];

const managerRiskWords = [
  "threat", "retaliation", "harassment", "abuse", "pressure", "unfair", "complaint against supervisor", "manager problem", "supervisor problem",
  "تهديد", "انتقام", "تحرش", "ضغط", "ظلم", "مشكلة مع المشرف",
  "धमकी", "दबाव", "अन्याय", "सुपरवाइजर", "मैनेजर", "دھمکی", "دباؤ", "ناانصافی", "سپروائزر", "منیجر",
  "ഭീഷണി", "സൂപ്പർവൈസർ", "മാനേജർ", "pananakot", "hindi patas",
];

const wellbeingRiskWords = [
  "stress", "stressed", "depressed", "mental", "not okay", "suicide", "self harm", "very tired", "no sleep", "angry", "urgent wellbeing",
  "ضغط نفسي", "تعبان", "مرهق", "तनाव", "थका", "नींद नहीं", "پریشان", "تھکا ہوا", "സമ്മർദ്ദം", "ക്ഷീണം", "pagod",
];

type Row = Omit<HrIntent, "language" | "confidence" | "matchedKeywords" | "requiresHumanReview" | "privacyTier"> & { keywords: string[] };

const rows: Row[] = [
  { requestType: "safety_incident", category: "safety", priority: "urgent", answer: "Urgent safety incident created. HR and Operations must review this immediately.", recommendedNextAction: "Move the worker to a safe location and notify HR or Operations immediately.", keywords: safetyWords },
  { requestType: "manager_issue", category: "confidential", priority: "urgent", answer: "Private HR complaint created. This case requires confidential human review.", recommendedNextAction: "Route to HR manager only. Do not expose the complaint to the direct supervisor.", keywords: managerRiskWords },
  { requestType: "staff_wellbeing", category: "wellbeing", priority: "high", answer: "Staff wellbeing support case created.", recommendedNextAction: "HR should contact the worker privately and check immediate support needs.", keywords: wellbeingRiskWords },
  { requestType: "sick_leave", category: "leave", priority: "high", answer: "Sick leave or medical support case created.", recommendedNextAction: "Request medical certificate or hospital note when available.", keywords: ["sick", "ill", "fever", "doctor", "hospital", "medical", "clinic", "مريض", "مرض", "مستشفى", "बीमार", "बुखार", "بیمار", "بخار", "സുഖമില്ല", "പനി", "may sakit", "lagnat"] },
  { requestType: "emergency_leave", category: "leave", priority: "high", answer: "Emergency leave request created for HR review.", recommendedNextAction: "Ask for emergency reason and expected return date.", keywords: ["emergency leave", "family emergency", "death", "urgent leave", "إجازة طارئة", "حالة عائلية", "وفاة", "घर जाना", "ایمرجنسی چھٹی", "uwi probinsya"] },
  { requestType: "annual_leave", category: "leave", priority: "normal", answer: "Annual leave request created.", recommendedNextAction: "Check leave balance and supervisor coverage before approval.", keywords: ["annual leave", "vacation", "holiday", "leave balance", "chutti", "छुट्टी", "إجازة", "چھٹی", "അവധി", "bakasyon", "ছুটি"] },
  { requestType: "unpaid_leave", category: "leave", priority: "normal", answer: "Unpaid leave request created.", recommendedNextAction: "HR must confirm salary impact before approval.", keywords: ["unpaid leave", "leave without pay", "إجازة بدون راتب", "बिना वेतन", "بغیر تنخواہ", "walang bayad"] },
  { requestType: "overtime", category: "payroll", priority: "high", answer: "Overtime or rest-day work review case created.", recommendedNextAction: "Ask for date, shift, site, and hours worked.", keywords: ["overtime", "extra hour", "extra duty", "rest day work", "friday work", "أوفر تايم", "ساعات إضافية", "ओवरटाइम", "اوور ٹائم", "ഓവർടൈം", "extra oras", "ওভারটাইম"] },
  { requestType: "payslip", category: "payroll", priority: "normal", answer: "Payslip request created.", recommendedNextAction: "Finance should attach or publish the requested payslip.", keywords: ["payslip", "salary slip", "wage slip", "قسيمة راتب", "كشف راتب", "सैलरी स्लिप", "پے سلپ", "salary slip po"] },
  { requestType: "salary_query", category: "payroll", priority: "high", answer: "Salary or deduction review case created.", recommendedNextAction: "Finance must review WPS status, deductions, allowances, and payment date.", keywords: ["salary", "wages", "payment missing", "deduction", "allowance", "wps", "late salary", "راتب", "خصم", "वेतन", "تنخواہ", "ശമ്പളം", "sahod", "বেতন"] },
  { requestType: "document_update", category: "documents", priority: "normal", answer: "Document update case created.", recommendedNextAction: "Ask worker to upload or present updated visa, Emirates ID, passport, labour card, or medical document.", keywords: ["visa", "emirates id", "eid", "passport", "labour card", "medical card", "جواز", "فيزا", "هوية", "पासपोर्ट", "پاسپورٹ", "വിസ", "dokumento"] },
  { requestType: "tools_ppe", category: "assets", priority: "normal", answer: "Tools, PPE, or uniform request created.", recommendedNextAction: "Operations should confirm issue, replacement, or return status.", keywords: ["tools", "helmet", "gloves", "safety shoes", "uniform", "ppe", "معدات", "خوذة", "हेलमेट", "یونیفارم", "guwantes"] },
  { requestType: "vehicle_issue", category: "transport", priority: "normal", answer: "Vehicle or transport issue created.", recommendedNextAction: "Dispatch should review vehicle, fuel, route, or transport allocation.", keywords: ["vehicle", "van", "fuel", "transport", "pickup", "driver", "سيارة", "وقود", "वाहन", "گاڑی", "sasakyan"] },
  { requestType: "accommodation", category: "accommodation", priority: "high", answer: "Accommodation or camp issue created.", recommendedNextAction: "HR/Admin should inspect room, AC, water, bed, hygiene, or camp condition.", keywords: ["accommodation", "camp", "room", "bed", "water", "toilet", "bathroom", "ac not working", "مخيم", "سكن", "कमरा", "کمرہ", "kwarto", "banyo"] },
];

export function classifyHrIntent(message: string): HrIntent {
  const normalized = normalize(message).slice(0, 2000);
  const language = languageFor(message);
  const scored = rows.map((row) => {
    const matchedKeywords = row.keywords.filter((keyword) => normalized.includes(normalize(keyword)));
    const exactPhraseBoost = matchedKeywords.some((keyword) => normalize(keyword).includes(" ")) ? 1 : 0;
    const urgentBoost = row.priority === "urgent" && matchedKeywords.length > 0 ? 2 : 0;
    return { row, matchedKeywords, score: matchedKeywords.length + exactPhraseBoost + urgentBoost };
  }).sort((a, b) => b.score - a.score);

  const winner = scored[0];
  if (!winner || winner.score <= 0) {
    return {
      requestType: "hr_support",
      category: "confidential",
      priority: "high",
      language,
      confidence: 0.35,
      matchedKeywords: [],
      requiresHumanReview: true,
      answer: "Private HR support case created. HR will review and route it to the correct department.",
      recommendedNextAction: "Route to HR manager review because the request could not be classified confidently.",
      privacyTier: "hr_manager_only",
    };
  }

  const managerRisk = managerRiskWords.some((keyword) => normalized.includes(normalize(keyword)));
  const safetyRisk = safetyWords.some((keyword) => normalized.includes(normalize(keyword)));
  const wellbeingRisk = wellbeingRiskWords.some((keyword) => normalized.includes(normalize(keyword)));
  const confidence = Math.min(0.98, 0.56 + winner.score * 0.14);
  const category = managerRisk ? "confidential" : winner.row.category;
  const requestType = managerRisk ? "manager_issue" : winner.row.requestType;
  const priority = managerRisk || safetyRisk ? "urgent" : winner.row.priority;
  const privacyTier = managerRisk || confidence < 0.55
    ? "hr_manager_only"
    : safetyRisk || wellbeingRisk || priority === "high"
      ? "restricted"
      : "standard";

  return {
    requestType,
    category,
    priority,
    language,
    confidence,
    matchedKeywords: winner.matchedKeywords.slice(0, 8),
    requiresHumanReview: priority !== "normal" || category === "confidential" || confidence < 0.72,
    answer: managerRisk ? rows[1].answer : winner.row.answer,
    recommendedNextAction: managerRisk ? rows[1].recommendedNextAction : winner.row.recommendedNextAction,
    privacyTier,
  };
}

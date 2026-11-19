/**
 * Employee ID card + employment contract DRAFT policy (pure, no Firebase imports so tests can load it).
 *
 * Rules (Rashid, 18 Nov 2026):
 *  - Every company staff member with an Admin-panel role that can add or change data is eligible.
 *  - Only HR (hr_admin / hr_manager) and the Founder (CEO / Super Admin) generate, with a verified MFA session.
 *  - Contracts are DRAFTS pending legal review and MOHRE registration. Nothing here registers a contract
 *    with any authority, and no system or AI step approves or signs it. Signing stays with people.
 *  - Salary and terms come only from the HR record. Missing data stays blank for HR to complete.
 *  - Company identity comes only from existing repo config (licence CN-5914744, Abu Dhabi). The legal entity
 *    name is founder-supplied and still flagged for confirmation. The VAT TRN is still under process.
 */
import {
  BIN_GROUP_LEGAL_ENTITY_NAME,
  BIN_GROUP_TRADE_LICENCE_EMIRATE,
  BIN_GROUP_TRADE_NAME,
} from "./ownerInitialContractPolicy";

/** Full-admin roles (Founder / CEO, Super Admin, Admin) from the Admin-panel staff access policy. */
export const EMPLOYEE_CREDENTIAL_FULL_ADMIN_ROLES = ["ceo", "super_admin", "admin"] as const;

/**
 * Admin-panel staff roles that can add or change data (apps/admin-panel/src/security/staffAccessPolicy.ts:
 * FULL_ADMIN_ROLES + STAFF_PORTAL_ROLES + PAINTING_FINANCE_ROLES + PAYROLL_ADMIN_ROLES).
 * Technicians use the mobile technician portal, not the Admin panel, so they are not in this list.
 */
export const EMPLOYEE_CREDENTIAL_ELIGIBLE_ROLES = [
  ...EMPLOYEE_CREDENTIAL_FULL_ADMIN_ROLES,
  "manager",
  "operations_admin",
  "operations_manager",
  "dispatcher",
  "finance_admin",
  "finance_staff",
  "finance_manager",
  "finance_controller",
  "payroll_admin",
  "hr_admin",
  "hr_manager",
  "hr_staff",
  "support_admin",
  "account_manager",
  "admin_assistant",
] as const;

/** HR manager tier + Founder. Generic Admin, Finance, Ops and HR Staff cannot generate. */
export const EMPLOYEE_CREDENTIAL_GENERATOR_ROLES = ["hr_admin", "hr_manager", "ceo", "super_admin"] as const;

export const EMPLOYEE_ROLE_LABELS: Record<string, { en: string; ar: string }> = {
  ceo: { en: "Founder & CEO", ar: "المؤسس والرئيس التنفيذي" },
  super_admin: { en: "Super Admin", ar: "مسؤول أعلى" },
  admin: { en: "Administrator", ar: "مسؤول النظام" },
  manager: { en: "Manager", ar: "مدير" },
  operations_admin: { en: "Operations Admin", ar: "مسؤول العمليات" },
  operations_manager: { en: "Operations Manager", ar: "مدير العمليات" },
  dispatcher: { en: "Dispatcher", ar: "منسق الإرسال" },
  finance_admin: { en: "Finance Admin", ar: "مسؤول المالية" },
  finance_staff: { en: "Finance Staff", ar: "موظف مالية" },
  finance_manager: { en: "Finance Manager", ar: "مدير المالية" },
  finance_controller: { en: "Finance Controller", ar: "المراقب المالي" },
  payroll_admin: { en: "Payroll Admin", ar: "مسؤول الرواتب" },
  hr_admin: { en: "HR Admin", ar: "مسؤول الموارد البشرية" },
  hr_manager: { en: "HR Manager", ar: "مدير الموارد البشرية" },
  hr_staff: { en: "HR Staff", ar: "موظف الموارد البشرية" },
  support_admin: { en: "Support Admin", ar: "مسؤول الدعم" },
  account_manager: { en: "Account Manager", ar: "مدير حسابات العملاء" },
  admin_assistant: { en: "Admin Assistant", ar: "مساعد إداري" },
};

export const EMPLOYEE_COMPANY_IDENTITY = Object.freeze({
  legalEntityName: BIN_GROUP_LEGAL_ENTITY_NAME,
  /** Founder-supplied formula (12 Nov 2026), still flagged for Rashid to confirm. Keep the flag. */
  legalEntityNameStatus: "FOUNDER_SUPPLIED_PENDING_CONFIRMATION" as const,
  legalEntityNameNoteEn: "Legal entity name pending confirmation",
  legalEntityNameNoteAr: "الاسم القانوني للمنشأة بانتظار التأكيد",
  tradeName: BIN_GROUP_TRADE_NAME,
  tradeLicenceNumber: "CN-5914744",
  tradeLicenceEmirate: BIN_GROUP_TRADE_LICENCE_EMIRATE,
  tradeLicenceEmirateAr: "أبوظبي",
  /** No TRN has been issued. Never print a TRN number. */
  vatTrnStatus: "UNDER_PROCESS" as const,
  vatTrnDisplayEn: "VAT TRN: under process",
  vatTrnDisplayAr: "رقم التسجيل الضريبي: قيد الإجراء",
});

export const EMPLOYEE_DOCUMENT_TYPES = ["EMPLOYEE_ID_CARD", "EMPLOYMENT_CONTRACT_DRAFT"] as const;
export type EmployeeDocumentType = typeof EMPLOYEE_DOCUMENT_TYPES[number];

export const EMPLOYMENT_CONTRACT_DRAFT_STATUS = "DRAFT_PENDING_LEGAL_REVIEW_AND_MOHRE_REGISTRATION" as const;
export const EMPLOYMENT_CONTRACT_SIGNATURE_STATUS = "NOT_SIGNED_HUMAN_SIGNATURE_REQUIRED" as const;
export const EMPLOYMENT_CONTRACT_MOHRE_STATUS = "NOT_REGISTERED" as const;
/**
 * Storage layout. Everything sits under the private HR record so the generic Admin catch-all rules
 * (which already exclude private_hr_profiles / privateHrDocuments) never expose it:
 *  - Firestore private_hr_profiles/{uid}/employee_documents/{documentId}  (one per generated PDF)
 *  - Firestore private_hr_profiles/{uid}/employee_credentials/current      (current card + contract summary)
 *  - Firestore private_hr_profiles/_employee_card_index/cards/{cardId}     (server-only QR lookup)
 *  - Storage   privateHrDocuments/{uid}/employee-documents/{documentId}.pdf
 */
export const PRIVATE_HR_PROFILES_COLLECTION = "private_hr_profiles";
export const EMPLOYEE_DOCUMENTS_SUBCOLLECTION = "employee_documents";
export const EMPLOYEE_CREDENTIALS_SUBCOLLECTION = "employee_credentials";
export const EMPLOYEE_CREDENTIALS_SUMMARY_ID = "current";
export const EMPLOYEE_CARD_INDEX_PARENT_ID = "_employee_card_index";
export const EMPLOYEE_CARD_INDEX_SUBCOLLECTION = "cards";
export function employeeDocumentsStoragePrefix(uid: string): string {
  return `privateHrDocuments/${uid}/employee-documents/`;
}
export const EMPLOYEE_CARD_VALIDITY_MONTHS = 12;
export const EMPLOYEE_CARD_VERIFY_BASE_URL = "https://admin.bin-groups.com/hr?verifyCard=";
export const EMPLOYEE_CARD_ID_PATTERN = /^card_[a-f0-9]{32}$/;
export const EMPLOYEE_DOCUMENT_ID_PATTERN = /^(empcard|empctr)_[a-f0-9]{32}$/;
export const EMPLOYEE_BULK_GENERATION_LIMIT = 20;

export const CONTRACT_DRAFT_BANNER_EN =
  "DRAFT - pending legal review and MOHRE registration. Not registered with MOHRE. Not signed. Not valid as an employment contract until reviewed, registered where required, and signed by both parties.";
export const CONTRACT_DRAFT_BANNER_AR =
  "مسودة - بانتظار المراجعة القانونية والتسجيل لدى وزارة الموارد البشرية والتوطين. غير مسجلة لدى الوزارة وغير موقعة. لا تُعد عقد عمل نافذاً إلا بعد مراجعتها وتسجيلها حيث يلزم وتوقيعها من الطرفين.";
export const CONTRACT_ARABIC_PREVAILS_EN =
  "This contract is written in Arabic and English. If the two texts differ, the Arabic text prevails.";
export const CONTRACT_ARABIC_PREVAILS_AR =
  "حُرر هذا العقد باللغتين العربية والإنجليزية، وفي حال وجود أي اختلاف بين النصين يُعتمد النص العربي.";
export const CONTRACT_HUMAN_SIGNING_EN =
  "This draft was generated from HR records. No system or AI step approves or signs it. Approval and signing are done only by the employee and an authorised signatory of the employer.";
export const CONTRACT_HUMAN_SIGNING_AR =
  "أُعدت هذه المسودة من سجلات الموارد البشرية. لا يعتمدها أو يوقعها أي نظام أو ذكاء اصطناعي، ويقتصر الاعتماد والتوقيع على الموظف والمفوض بالتوقيع عن صاحب العمل.";
export const BLANK_FIELD_EN = "________ (HR to complete before signing)";
export const BLANK_FIELD_AR = "________ تستكمله الموارد البشرية قبل التوقيع";

const text = (value: unknown) => String(value ?? "").trim();

export function normalizeRole(value: unknown): string {
  return text(value).toLowerCase();
}

export function tokenRole(token: Record<string, unknown> | null | undefined): string {
  const claims = token || {};
  return normalizeRole(claims.role || claims.userRole || claims.primaryRole);
}

export function isFounderToken(token: Record<string, unknown> | null | undefined): boolean {
  const claims = token || {};
  const role = tokenRole(claims);
  return claims.ceo === true || claims.super_admin === true || claims.superAdmin === true || role === "ceo" || role === "super_admin";
}

/** Server and UI share this: HR manager tier or Founder, never suspended. MFA is checked separately. */
export function canGenerateEmployeeCredentials(token: Record<string, unknown> | null | undefined): boolean {
  const claims = token || {};
  if (claims.suspended === true) return false;
  const role = tokenRole(claims);
  return isFounderToken(claims) || (EMPLOYEE_CREDENTIAL_GENERATOR_ROLES as readonly string[]).includes(role);
}

export function isEligibleEmployeeRole(role: unknown): boolean {
  return (EMPLOYEE_CREDENTIAL_ELIGIBLE_ROLES as readonly string[]).includes(normalizeRole(role));
}

export function roleLabel(role: unknown): { en: string; ar: string } {
  const key = normalizeRole(role);
  return EMPLOYEE_ROLE_LABELS[key] || { en: key ? key.replace(/_/g, " ") : "Staff", ar: "موظف" };
}

/** YYYY-MM-DD in Asia/Dubai. */
export function dubaiDateKey(date: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Dubai", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  const get = (type: string) => parts.find((part) => part.type === type)?.value || "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export function isDateKey(value: unknown): boolean {
  const raw = text(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return false;
  const parsed = new Date(`${raw}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === raw;
}

function addMonthsToDateKey(dateKey: string, months: number): string {
  const [year, month, day] = dateKey.split("-").map(Number);
  const target = new Date(Date.UTC(year, month - 1 + months, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(day, lastDay));
  // Valid through the day before the anniversary.
  target.setUTCDate(target.getUTCDate() - 1);
  return target.toISOString().slice(0, 10);
}

/**
 * Card expiry: the earlier of (issue + EMPLOYEE_CARD_VALIDITY_MONTHS) and a recorded contract end date.
 * A contract end date already in the past is ignored here; the card still cannot outlive the standard validity.
 */
export function employeeCardExpiry(issueDateKey: string, contractEndDate?: unknown): string {
  const standard = addMonthsToDateKey(issueDateKey, EMPLOYEE_CARD_VALIDITY_MONTHS);
  const end = text(contractEndDate).slice(0, 10);
  if (isDateKey(end) && end >= issueDateKey && end < standard) return end;
  return standard;
}

export function employeeCardVerifyUrl(cardId: string): string {
  if (!EMPLOYEE_CARD_ID_PATTERN.test(cardId)) throw new Error("Invalid card id.");
  // The QR carries only the random card id. No name, email, phone, Emirates ID or salary.
  return `${EMPLOYEE_CARD_VERIFY_BASE_URL}${cardId}`;
}

export type EmployeeIdentity = {
  uid: string;
  displayName: string;
  displayNameAr: string;
  role: string;
  staffId: string;
  staffNumber?: string;
  department: string;
  jobTitle: string;
  joiningDate: string;
  contractEndDate: string;
  employmentType: string;
  workingHours: string;
  shiftName: string;
  offDay: string;
  workLocation: string;
  nationality: string;
  salaryPackage: Record<string, unknown> | null;
};

export function employeeIdentityFrom(uid: string, user: Record<string, any>, hr: Record<string, any>, privateHr: Record<string, any>): EmployeeIdentity {
  const role = normalizeRole(user.role || user.userRole || user.primaryRole);
  const staffNumber = text(user.staffNumber || user.staffNumberStr);
  return {
    uid,
    displayName: text(user.displayName || user.fullName || hr.displayName || user.name),
    displayNameAr: text(hr.displayNameAr || user.displayNameAr || hr.arabicName || user.arabicName),
    role,
    staffId: text(staffNumber || privateHr.employeeId || user.staffId || user.employeeId || hr.employeeId),
    staffNumber,
    department: text(hr.department || user.department),
    jobTitle: text(hr.jobTitle || user.jobTitle || user.position),
    joiningDate: text(hr.joiningDate || privateHr.joiningDate),
    contractEndDate: text(privateHr.contractEndDate || hr.contractEndDate),
    employmentType: text(hr.employmentType || privateHr.employmentType),
    workingHours: text(hr.workingHours),
    shiftName: text(hr.shiftName),
    offDay: text(hr.offDay),
    workLocation: text(hr.workLocation || user.workLocation),
    nationality: text(privateHr.nationality || hr.nationality),
    salaryPackage: privateHr.salaryPackage && typeof privateHr.salaryPackage === "object" ? privateHr.salaryPackage : null,
  };
}

function positiveAmount(value: unknown): number | null {
  const amount = Number(value);
  return Number.isFinite(amount) && amount > 0 ? Math.round(amount * 100) / 100 : null;
}

export function formatAed(amount: number): string {
  return `AED ${amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export type ContractField = { key: string; labelEn: string; labelAr: string; value: string | null };

/**
 * Contract fields come only from the HR record. A missing or zero value is returned as null and printed
 * as a blank for HR to complete. Probation, notice and annual leave are not stored in HR records, so they
 * are always blank: this module never invents terms.
 */
export function employmentContractFields(identity: EmployeeIdentity): ContractField[] {
  const salary = identity.salaryPackage || {};
  const role = roleLabel(identity.role);
  const amount = (key: string) => {
    const value = positiveAmount((salary as Record<string, unknown>)[key]);
    return value === null ? null : formatAed(value);
  };
  const payDay = Number((salary as Record<string, unknown>).salaryPaymentDay);
  return [
    { key: "employeeName", labelEn: "Employee name", labelAr: "اسم الموظف", value: identity.displayName || null },
    { key: "employeeNameAr", labelEn: "Employee name (Arabic)", labelAr: "اسم الموظف بالعربية", value: identity.displayNameAr || null },
    { key: "staffId", labelEn: "Staff ID", labelAr: "الرقم الوظيفي", value: identity.staffId || null },
    { key: "nationality", labelEn: "Nationality", labelAr: "الجنسية", value: identity.nationality || null },
    { key: "emiratesId", labelEn: "Emirates ID number", labelAr: "رقم الهوية الإماراتية", value: null },
    { key: "jobTitle", labelEn: "Job title", labelAr: "المسمى الوظيفي", value: identity.jobTitle || role.en },
    { key: "department", labelEn: "Department", labelAr: "القسم", value: identity.department || null },
    { key: "workLocation", labelEn: "Work location", labelAr: "مكان العمل", value: identity.workLocation || null },
    { key: "joiningDate", labelEn: "Start date", labelAr: "تاريخ بدء العمل", value: identity.joiningDate || null },
    { key: "employmentType", labelEn: "Employment type", labelAr: "نوع التوظيف", value: identity.employmentType ? identity.employmentType.replace(/_/g, " ") : null },
    { key: "contractEndDate", labelEn: "Contract end date", labelAr: "تاريخ انتهاء العقد", value: identity.contractEndDate || null },
    { key: "workingHours", labelEn: "Working hours", labelAr: "ساعات العمل", value: identity.workingHours || null },
    { key: "shiftName", labelEn: "Shift", labelAr: "الوردية", value: identity.shiftName || null },
    { key: "offDay", labelEn: "Weekly rest day", labelAr: "يوم الراحة الأسبوعية", value: identity.offDay || null },
    { key: "basicSalary", labelEn: "Basic monthly salary", labelAr: "الراتب الأساسي الشهري", value: amount("basicSalary") },
    { key: "housingAllowance", labelEn: "Housing allowance (monthly)", labelAr: "بدل السكن - شهرياً", value: amount("housingAllowance") },
    { key: "transportAllowance", labelEn: "Transport allowance (monthly)", labelAr: "بدل المواصلات - شهرياً", value: amount("transportAllowance") },
    { key: "foodAllowance", labelEn: "Food allowance (monthly)", labelAr: "بدل الطعام - شهرياً", value: amount("foodAllowance") },
    { key: "otherAllowance", labelEn: "Other allowance (monthly)", labelAr: "بدلات أخرى - شهرياً", value: amount("otherAllowance") },
    { key: "salaryPaymentDay", labelEn: "Salary payment day", labelAr: "يوم صرف الراتب", value: Number.isInteger(payDay) && payDay >= 1 && payDay <= 31 ? String(payDay) : null },
    { key: "probationPeriod", labelEn: "Probation period", labelAr: "فترة التجربة", value: null },
    { key: "noticePeriod", labelEn: "Notice period", labelAr: "فترة الإشعار", value: null },
    { key: "annualLeave", labelEn: "Annual leave entitlement", labelAr: "استحقاق الإجازة السنوية", value: null },
  ];
}

export function missingContractFieldKeys(fields: ContractField[]): string[] {
  return fields.filter((field) => !field.value).map((field) => field.key);
}

export type ContractClause = { titleEn: string; titleAr: string; bodyEn: string; bodyAr: string };

export function employmentContractClauses(): ContractClause[] {
  return [
    {
      titleEn: "1. Status of this document",
      titleAr: "1. حالة هذا المستند",
      bodyEn: `${CONTRACT_DRAFT_BANNER_EN} ${CONTRACT_HUMAN_SIGNING_EN}`,
      bodyAr: `${CONTRACT_DRAFT_BANNER_AR} ${CONTRACT_HUMAN_SIGNING_AR}`,
    },
    {
      titleEn: "2. Position and duties",
      titleAr: "2. الوظيفة والمهام",
      bodyEn: "The employee is engaged in the position and department stated in the schedule above and performs the duties of that role as directed by the employer, in line with the role's system access permissions.",
      bodyAr: "يُعيَّن الموظف في الوظيفة والقسم المبينين في الجدول أعلاه، ويؤدي مهام تلك الوظيفة وفق توجيهات صاحب العمل وبما يتوافق مع صلاحيات الدخول إلى النظام المرتبطة بها.",
    },
    {
      titleEn: "3. Remuneration",
      titleAr: "3. الأجر",
      bodyEn: "Salary and allowances are only those stated in the schedule above as recorded by HR. Any blank amount must be agreed and completed in writing before signing. Salary is paid in AED.",
      bodyAr: "يقتصر الراتب والبدلات على ما هو مبين في الجدول أعلاه كما سجلته الموارد البشرية. ويجب الاتفاق على أي مبلغ فارغ واستكماله كتابةً قبل التوقيع. ويُدفع الراتب بالدرهم الإماراتي.",
    },
    {
      titleEn: "4. Working hours, rest day, probation, notice and leave",
      titleAr: "4. ساعات العمل ويوم الراحة وفترة التجربة والإشعار والإجازات",
      bodyEn: "Working hours, shift and weekly rest day are as recorded in the schedule. Probation, notice period and annual leave are left blank in this draft and must be completed under applicable UAE labour law before signing.",
      bodyAr: "تكون ساعات العمل والوردية ويوم الراحة الأسبوعية وفق ما هو مسجل في الجدول. وتُترك فترة التجربة وفترة الإشعار والإجازة السنوية فارغة في هذه المسودة، ويجب استكمالها وفق قانون العمل المعمول به في دولة الإمارات قبل التوقيع.",
    },
    {
      titleEn: "5. Confidentiality and system access",
      titleAr: "5. السرية والدخول إلى النظام",
      bodyEn: "The employee keeps company, client and staff data confidential, uses only the access granted to their role, keeps multi-factor authentication enabled, and never shares passwords, verification codes or credentials.",
      bodyAr: "يلتزم الموظف بالحفاظ على سرية بيانات الشركة والعملاء والموظفين، ولا يستخدم إلا الصلاحيات الممنوحة لوظيفته، ويُبقي التحقق متعدد العوامل مفعلاً، ولا يشارك كلمات المرور أو رموز التحقق أو بيانات الدخول.",
    },
    {
      titleEn: "6. Governing law",
      titleAr: "6. القانون الواجب التطبيق",
      bodyEn: "This contract is subject to the labour laws applicable in the United Arab Emirates. Specific legal citations are for counsel to confirm during legal review.",
      bodyAr: "يخضع هذا العقد لقوانين العمل المعمول بها في دولة الإمارات العربية المتحدة. وتُترك الاستشهادات القانونية المحددة للتأكيد من المستشار القانوني أثناء المراجعة القانونية.",
    },
    {
      titleEn: "7. Language",
      titleAr: "7. اللغة",
      bodyEn: CONTRACT_ARABIC_PREVAILS_EN,
      bodyAr: CONTRACT_ARABIC_PREVAILS_AR,
    },
  ];
}

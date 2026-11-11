/**
 * Pure WhatsApp phase-1 policy: event set, locale mapping, quiet hours, honesty
 * checks, and suggested Meta template bodies. No secrets, no network, no Admin SDK.
 * WhatsApp is not described as live; sends happen only after Admin registers an
 * approved template name from Meta Business Manager.
 */
export const JOB_TEMPLATE_EVENTS = [
  "TICKET_SUBMITTED",
  "TECH_ASSIGNED",
  "TECH_ARRIVED",
  "JOB_COMPLETED",
  "OWNER_APPROVAL_NEEDED",
] as const;

export const PHASE1_TEMPLATE_EVENTS = [
  ...JOB_TEMPLATE_EVENTS,
  "RENT_DUE_REMINDER",
] as const;

export type JobTemplateEvent = (typeof JOB_TEMPLATE_EVENTS)[number];
export type Phase1TemplateEvent = (typeof PHASE1_TEMPLATE_EVENTS)[number];

/** Internal ticket-write events mapped onto the phase-1 template ids. */
export const TICKET_WRITE_EVENTS = ["TICKET_SUBMITTED", "TECH_ASSIGNED", "TECH_ARRIVED", "JOB_COMPLETED"] as const;
export type TicketWriteEvent = (typeof TICKET_WRITE_EVENTS)[number];

export const DEFAULT_WHATSAPP_LANGUAGE_CODES: Record<"ar" | "en", string> = {
  ar: "ar",
  en: "en_US",
};

export const OUTBOUND_DAILY_LIMIT = 8;
export const INBOUND_DAILY_LIMIT = 20;
export const INBOUND_HOURLY_LIMIT = 6;
export const QUIET_HOUR_START = 22;
export const QUIET_HOUR_END = 7;
export const DUBAI_TIME_ZONE = "Asia/Dubai";

const LANGUAGE_CODE = /^[a-z]{2}(?:_[A-Z]{2})?$/;
const TEMPLATE_NAME = /^[a-z][a-z0-9_]{0,511}$/;
const EVENT_SET = new Set<string>(PHASE1_TEMPLATE_EVENTS);

export function isPhase1TemplateEvent(value: unknown): value is Phase1TemplateEvent {
  return typeof value === "string" && EVENT_SET.has(value);
}

export function optInLanguageKey(value: unknown): "ar" | "en" {
  return value === "ar" ? "ar" : "en";
}

export function sanitizeLanguageCodes(input: unknown): Record<"ar" | "en", string> {
  const raw = input && typeof input === "object" && !Array.isArray(input) ? input as Record<string, unknown> : {};
  const ar = typeof raw.ar === "string" && LANGUAGE_CODE.test(raw.ar) ? raw.ar : DEFAULT_WHATSAPP_LANGUAGE_CODES.ar;
  const en = typeof raw.en === "string" && LANGUAGE_CODE.test(raw.en) ? raw.en : DEFAULT_WHATSAPP_LANGUAGE_CODES.en;
  return { ar, en };
}

export function resolveWhatsAppLanguageCode(
  optLanguage: unknown,
  template?: { languageCodes?: unknown },
): string {
  const key = optInLanguageKey(optLanguage);
  const codes = sanitizeLanguageCodes(template?.languageCodes);
  return codes[key];
}

export function dubaiCalendarDay(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: DUBAI_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

export function dubaiHour(now = new Date()): number {
  return Number(new Intl.DateTimeFormat("en-GB", { timeZone: DUBAI_TIME_ZONE, hour: "2-digit", hourCycle: "h23" }).format(now));
}

export function dubaiHourKey(now = new Date()): string {
  const day = dubaiCalendarDay(now);
  const hour = String(dubaiHour(now)).padStart(2, "0");
  return `${day}T${hour}`;
}

export function isQuietHoursDubai(now = new Date()): boolean {
  const hour = dubaiHour(now);
  return hour >= QUIET_HOUR_START || hour < QUIET_HOUR_END;
}

export function isEmergencyTicket(ticket: Record<string, unknown> | undefined): boolean {
  const raw = String(ticket?.urgency || ticket?.priority || ticket?.severity || "").trim().toLowerCase();
  return raw === "emergency" || raw === "sos" || raw === "critical";
}

export function shouldSkipQuietHours(ticket: Record<string, unknown> | undefined, now = new Date()): boolean {
  return isQuietHoursDubai(now) && !isEmergencyTicket(ticket);
}

export function wouldExceedLimit(count: number, limit: number): boolean {
  return count >= limit;
}

export function rateLimitDocId(kind: "out" | "in" | "inburst", subject: string, window: string): string {
  const safe = String(subject || "unknown").replace(/[^A-Za-z0-9_+-]/g, "_").slice(0, 80);
  return `${kind}_${safe}_${window}`.slice(0, 200);
}

export function isSafeTemplateName(value: unknown): value is string {
  return typeof value === "string" && TEMPLATE_NAME.test(value);
}

/**
 * Suggested Meta template bodies and placeholder params for Rashid to submit
 * in Business Manager. Fixed text carries payment policy and the "open the app"
 * instruction so a variable cannot introduce a pay link or an ETA.
 */
export const PHASE1_TEMPLATE_SPECS: Record<Phase1TemplateEvent, {
  suggestedName: string;
  params: { index: number; name: string; example: string }[];
  bodyEn: string;
  bodyAr: string;
}> = {
  TICKET_SUBMITTED: {
    suggestedName: "bin_ticket_submitted",
    params: [
      { index: 1, name: "ticket_ref", example: "AB12CD34" },
      { index: 2, name: "category", example: "AC" },
    ],
    bodyEn: "BIN GROUP: we received your request {{1}} ({{2}}). The app is the official record. Open the BIN GROUP app to follow progress.",
    bodyAr: "مجموعة بن: استلمنا طلبك {{1}} ({{2}}). التطبيق هو السجل الرسمي. افتح تطبيق مجموعة بن لمتابعة التقدم.",
  },
  TECH_ASSIGNED: {
    suggestedName: "bin_tech_assigned",
    params: [
      { index: 1, name: "ticket_ref", example: "AB12CD34" },
      { index: 2, name: "category", example: "AC" },
    ],
    bodyEn: "BIN GROUP: a technician has been assigned to request {{1}} ({{2}}). You will get an update when they set off. Open the app for the official status.",
    bodyAr: "مجموعة بن: تم تعيين فني للطلب {{1}} ({{2}}). سيصلك تحديث عند انطلاقه. افتح التطبيق للاطلاع على الحالة الرسمية.",
  },
  TECH_ARRIVED: {
    suggestedName: "bin_tech_arrived",
    params: [
      { index: 1, name: "ticket_ref", example: "AB12CD34" },
      { index: 2, name: "category", example: "AC" },
    ],
    bodyEn: "BIN GROUP: the technician has arrived for request {{1}} ({{2}}). Open the app for the official status.",
    bodyAr: "مجموعة بن: وصل الفني لطلب {{1}} ({{2}}). افتح التطبيق للاطلاع على الحالة الرسمية.",
  },
  JOB_COMPLETED: {
    suggestedName: "bin_job_completed",
    params: [
      { index: 1, name: "ticket_ref", example: "AB12CD34" },
      { index: 2, name: "category", example: "AC" },
    ],
    bodyEn: "BIN GROUP: request {{1}} ({{2}}) is marked completed. Review the work in the app. Nothing is approved until you decide in the app.",
    bodyAr: "مجموعة بن: تم تعليم الطلب {{1}} ({{2}}) كمكتمل. راجع العمل في التطبيق. لا يُعتمد شيء حتى تقرر في التطبيق.",
  },
  OWNER_APPROVAL_NEEDED: {
    suggestedName: "bin_owner_approval_needed",
    params: [
      { index: 1, name: "request_ref", example: "AB12CD34" },
      { index: 2, name: "category", example: "Painting" },
    ],
    bodyEn: "BIN GROUP: request {{1}} ({{2}}) needs your decision. Open the app to review. Nothing is approved until you decide.",
    bodyAr: "مجموعة بن: الطلب {{1}} ({{2}}) يحتاج إلى قرارك. افتح التطبيق للمراجعة. لا يُعتمد شيء حتى تقرر.",
  },
  RENT_DUE_REMINDER: {
    suggestedName: "bin_rent_due_reminder",
    params: [
      { index: 1, name: "amount", example: "AED 5,000.00" },
      { index: 2, name: "due_date", example: "2026-12-01" },
    ],
    bodyEn: "BIN GROUP: rent of {{1}} is due on {{2}}. Pay by cash or cheque only and upload the receipt in the app. The app is the official record. Do not send payments or card details over WhatsApp.",
    bodyAr: "مجموعة بن: إيجار بمبلغ {{1}} مستحق بتاريخ {{2}}. ادفع نقدًا أو بشيك فقط وارفع الإيصال في التطبيق. التطبيق هو السجل الرسمي. لا ترسل مدفوعات أو بيانات بطاقة عبر واتساب.",
  },
};

/** Phrases that must never appear in template bodies or assignment copy. */
export const HONESTY_FORBIDDEN = [
  "will be on the way soon",
  "on the way soon",
  "5 mins away",
  "5 min away",
  "five minutes away",
  "click here to pay",
  "pay now",
  "pay-now",
  "payment link",
  "pay link",
  "stripe",
  "bank transfer",
  "card payment",
  "within 2 hours",
  "within 24 hours",
  "in 2 hours",
  "in 24 hours",
];

export function honestyViolations(text: string): string[] {
  const lower = String(text || "").toLowerCase();
  return HONESTY_FORBIDDEN.filter((phrase) => lower.includes(phrase));
}

export function assertTemplateCopyHonest(text: string, label: string): void {
  const hits = honestyViolations(text);
  if (hits.length) {
    throw new Error(`${label} contains forbidden promise or payment wording: ${hits.join(", ")}`);
  }
}

export function inboundAckMessage(category: string, intakeId: string): string {
  const safeCategory = String(category || "maintenance").trim().slice(0, 80) || "maintenance";
  const ref = String(intakeId || "").trim().slice(0, 80);
  const en = `BIN GROUP received your ${safeCategory} request${ref ? ` (reference ${ref})` : ""}. Our team will review it and may open a maintenance ticket. The app is the official record.`;
  const ar = `استلمت مجموعة بن طلبك بشأن ${safeCategory}${ref ? ` (المرجع ${ref})` : ""}. سيراجعه الفريق وقد يفتح تذكرة صيانة. التطبيق هو السجل الرسمي.`;
  return `${en}\n\n${ar}`;
}

export function ticketEvents(before: Record<string, unknown> | undefined, after: Record<string, unknown> | undefined): TicketWriteEvent[] {
  if (!after) return [];
  if (!before) return ["TICKET_SUBMITTED"];
  const out: TicketWriteEvent[] = [];
  const tech = (d: Record<string, unknown>) => String(d.assignedTechnicianId || d.technicianId || "").trim();
  if (!tech(before) && tech(after)) out.push("TECH_ASSIGNED");
  const b = String(before.status || "").trim().toUpperCase();
  const a = String(after.status || "").trim().toUpperCase();
  if (a !== b && a === "ARRIVED") out.push("TECH_ARRIVED");
  if (a !== b && (a === "COMPLETED" || a === "COMPLETE")) out.push("JOB_COMPLETED");
  return out;
}

export function recipientsFor(event: Phase1TemplateEvent | string, t: Record<string, unknown>): string[] {
  const text = (v: unknown) => String(v ?? "").trim();
  const tenant = text(t.tenantId || t.requesterId || t.createdBy || t.tenantUid);
  const owner = text(t.ownerId || t.ownerUid);
  const list = event === "OWNER_APPROVAL_NEEDED" || event === "RENT_DUE_REMINDER" ? [event === "RENT_DUE_REMINDER" ? tenant : owner] : [tenant, owner];
  return [...new Set(list.filter(Boolean))];
}

export function paramsForEvent(event: Phase1TemplateEvent | string, refId: string, t: Record<string, unknown>): string[] {
  const category = String(t.category || t.trade || "").trim().slice(0, 60) || "-";
  const ref = String(refId || "").replace(/[^A-Za-z0-9]/g, "").slice(0, 8).toUpperCase() || "REQUEST";
  if (event === "RENT_DUE_REMINDER") {
    const amount = Number(t.amount);
    const aed = Number.isFinite(amount)
      ? `AED ${amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
      : String(t.amount || "AED").slice(0, 40);
    const dueDate = String(t.dueDate || "").trim().slice(0, 10) || "-";
    return [aed, dueDate];
  }
  return [ref, category];
}

export function phase1JobTemplatesReady(templates: Record<string, { approved?: unknown; templateName?: unknown }>): boolean {
  return JOB_TEMPLATE_EVENTS.every((event) => {
    const tpl = templates[event];
    return Boolean(tpl && tpl.approved === true && isSafeTemplateName(tpl.templateName));
  });
}

export const ASSIGNMENT_COPY_EN = "A technician has been assigned to this request. You will get an update when they set off.";
export const ASSIGNMENT_COPY_AR = "تم تعيين فني لهذا الطلب. سيصلك تحديث عند انطلاقه.";

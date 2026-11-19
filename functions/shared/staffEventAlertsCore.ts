// Central staff / leadership alert planner (pure: no firebase-admin imports, so it is unit-testable).
//
// Rashid (19 Nov 2026): every Owner, Tenant or Broker request must reach staff, and the Founder
// (Super Admin) and Admin accounts must hear about everything that happens in the app, with a push
// that arrives when the app is closed and shows when it is open.
//
// One registry decides, per Firestore collection, which events alert staff and which staff roles may
// see them. Leadership (super_admin, admin, ceo) is added to every alert. Domain roles only get the
// alerts of their own domain (finance, HR, operations, broker, support), so role scoping is kept.
//
// Privacy: alert copy is built ONLY from a short reference, a cleaned property / unit label and
// cleaned status enums. Free text (chat messages, descriptions, notes), amounts, bank details,
// identity numbers, OTPs and tokens are never copied into a notification.
// Notifications never approve anything: the copy only asks staff to open and review.

export const LEADERSHIP_ROLES = ["super_admin", "admin", "ceo"] as const;

export type AlertDomain = "operations" | "finance" | "hr" | "broker" | "support" | "property" | "contracts" | "design" | "security";

export const DOMAIN_ROLES: Record<AlertDomain, readonly string[]> = {
  operations: ["operations_admin", "operations_manager", "manager", "dispatcher"],
  property: ["operations_admin", "operations_manager", "manager", "account_manager"],
  contracts: ["operations_admin", "manager", "account_manager"],
  finance: ["finance_admin", "finance_staff"],
  hr: ["hr_admin", "hr_manager"],
  broker: ["account_manager", "operations_admin"],
  support: ["support_admin", "operations_admin"],
  design: ["operations_admin", "manager", "account_manager"],
  // Role / access / grant changes: leadership only.
  security: [],
};

export type AlertSpec = {
  domain: AlertDomain;
  labelEn: string;
  labelAr: string;
  link: string;
  /** Alert when a document is created. */
  onCreate: boolean;
  /** Alert when the status-like field changes (cancellations, approvals, overdue, escalations...). */
  onStatusChange: boolean;
  /** Created by an Owner, Tenant or Broker: also e-mail a recipient that has no push registration. */
  request?: boolean;
  /** Status values whose transition is already announced to admins elsewhere (avoid duplicates). */
  skipStatuses?: readonly string[];
  /** Fields watched instead of the default status fields. */
  statusFields?: readonly string[];
  /** Only alert when the before or after document has one of these roles (users collection). */
  onlyRoles?: readonly string[];
};

const DASH = "/admin/dashboard";
const TICKETS = "/admin/tickets";
const PAYMENTS = "/admin/payment-collections";

// Ticket create / assignment / completion are already sent to every admin role by
// ticketStakeholderNotifications.ts, so the registry skips those to avoid duplicate alerts.
const TICKET_ALREADY_ANNOUNCED = ["ASSIGNED", "ACCEPTED", "COMPLETED", "COMPLETED_PENDING_APPROVAL", "COMPLETED_PENDING_TENANT_APPROVAL"];

const STAFF_ROLES_FOR_ACCESS_ALERTS = [
  "technician", "admin", "super_admin", "ceo", "manager", "operations_admin", "operations_manager", "finance_admin",
  "finance_staff", "hr_admin", "hr_manager", "hr_staff", "support_admin", "account_manager", "dispatcher",
];

export const ALERT_REGISTRY: Record<string, AlertSpec> = {
  // ── Maintenance / operations ──────────────────────────────────────────
  maintenanceTickets: { domain: "operations", labelEn: "Maintenance ticket", labelAr: "طلب صيانة", link: TICKETS, onCreate: false, onStatusChange: true, skipStatuses: TICKET_ALREADY_ANNOUNCED },
  tickets: { domain: "operations", labelEn: "Ticket", labelAr: "طلب", link: TICKETS, onCreate: true, onStatusChange: true, request: true, skipStatuses: TICKET_ALREADY_ANNOUNCED },
  maintenanceRequests: { domain: "operations", labelEn: "Maintenance request", labelAr: "طلب صيانة", link: TICKETS, onCreate: true, onStatusChange: true, request: true },
  inspections: { domain: "operations", labelEn: "Inspection request", labelAr: "طلب فحص", link: DASH, onCreate: true, onStatusChange: true, request: true },
  move_out_requests: { domain: "operations", labelEn: "Move-out request", labelAr: "طلب إخلاء", link: DASH, onCreate: true, onStatusChange: true, request: true },
  tenant_services_requests: { domain: "operations", labelEn: "Tenant service request", labelAr: "طلب خدمة مستأجر", link: DASH, onCreate: true, onStatusChange: true, request: true },
  visitorParkingRequests: { domain: "operations", labelEn: "Visitor parking request", labelAr: "طلب موقف زائر", link: DASH, onCreate: true, onStatusChange: true, request: true },
  amenityBookings: { domain: "operations", labelEn: "Amenity booking", labelAr: "حجز مرفق", link: DASH, onCreate: true, onStatusChange: true, request: true },
  scheduled_services: { domain: "operations", labelEn: "Scheduled service", labelAr: "خدمة مجدولة", link: DASH, onCreate: true, onStatusChange: true, request: true },
  ticket_reopen_events: { domain: "operations", labelEn: "Ticket reopened", labelAr: "إعادة فتح طلب", link: TICKETS, onCreate: true, onStatusChange: false, request: true },
  warranty_reviews: { domain: "operations", labelEn: "Warranty review", labelAr: "مراجعة ضمان", link: TICKETS, onCreate: true, onStatusChange: true },
  emergency_spend_reviews: { domain: "operations", labelEn: "Emergency spend review", labelAr: "مراجعة إنفاق طارئ", link: DASH, onCreate: true, onStatusChange: true },
  owner_approval_requests: { domain: "operations", labelEn: "Owner approval request", labelAr: "طلب موافقة المالك", link: DASH, onCreate: true, onStatusChange: true },
  vendor_quotes: { domain: "operations", labelEn: "Vendor quote", labelAr: "عرض سعر مورد", link: DASH, onCreate: true, onStatusChange: true },

  // ── Property / owner onboarding ───────────────────────────────────────
  properties: { domain: "property", labelEn: "Property", labelAr: "عقار", link: DASH, onCreate: true, onStatusChange: true, request: true },
  intake_submissions: { domain: "property", labelEn: "Owner submission", labelAr: "طلب مالك", link: DASH, onCreate: true, onStatusChange: true, request: true },
  owner_registration_requests: { domain: "property", labelEn: "Owner registration", labelAr: "تسجيل مالك", link: DASH, onCreate: true, onStatusChange: true, request: true },
  pending_owners: { domain: "property", labelEn: "Pending owner", labelAr: "مالك قيد المراجعة", link: DASH, onCreate: true, onStatusChange: true, request: true },
  owner_correction_requests: { domain: "property", labelEn: "Owner correction request", labelAr: "طلب تصحيح مالك", link: DASH, onCreate: true, onStatusChange: true, request: true },
  documents: { domain: "property", labelEn: "Document upload", labelAr: "رفع مستند", link: DASH, onCreate: true, onStatusChange: true, request: true },
  tenant_unit_link_requests: { domain: "property", labelEn: "Tenant unit link request", labelAr: "طلب ربط وحدة مستأجر", link: DASH, onCreate: true, onStatusChange: true, request: true },
  tenant_correction_requests: { domain: "property", labelEn: "Tenant correction request", labelAr: "طلب تصحيح مستأجر", link: DASH, onCreate: true, onStatusChange: true, request: true },
  pending_tenants: { domain: "property", labelEn: "Pending tenant", labelAr: "مستأجر قيد المراجعة", link: DASH, onCreate: true, onStatusChange: true, request: true },
  tenant_invitations: { domain: "property", labelEn: "Tenant invitation", labelAr: "دعوة مستأجر", link: DASH, onCreate: true, onStatusChange: true, request: true },

  // ── Contracts / leases ────────────────────────────────────────────────
  contracts: { domain: "contracts", labelEn: "Contract", labelAr: "عقد", link: DASH, onCreate: true, onStatusChange: true, request: true },
  leases: { domain: "contracts", labelEn: "Lease", labelAr: "عقد إيجار", link: DASH, onCreate: true, onStatusChange: true },
  lease_renewals: { domain: "contracts", labelEn: "Lease renewal", labelAr: "تجديد عقد إيجار", link: DASH, onCreate: true, onStatusChange: true },

  // ── Money (alerts only; approvals stay with Finance in the app) ───────
  paymentConfirmations: { domain: "finance", labelEn: "Payment confirmation", labelAr: "تأكيد دفع", link: PAYMENTS, onCreate: true, onStatusChange: true, request: true },
  payment_transactions: { domain: "finance", labelEn: "Payment / receipt", labelAr: "دفعة / إيصال", link: PAYMENTS, onCreate: true, onStatusChange: true, request: true },
  payment_collection_records: { domain: "finance", labelEn: "Cash / cheque collection", labelAr: "تحصيل نقدي / شيك", link: PAYMENTS, onCreate: true, onStatusChange: true },
  rent_installments: { domain: "finance", labelEn: "Rent instalment", labelAr: "قسط إيجار", link: PAYMENTS, onCreate: false, onStatusChange: true },
  pdc_cheques: { domain: "finance", labelEn: "Post-dated cheque", labelAr: "شيك مؤجل", link: PAYMENTS, onCreate: false, onStatusChange: true },
  invoices: { domain: "finance", labelEn: "Invoice", labelAr: "فاتورة", link: PAYMENTS, onCreate: true, onStatusChange: true },
  // Bank detail adds / edits are announced through payout_change_alerts (masked, no IBAN in the copy).
  ownerBankAccounts: { domain: "finance", labelEn: "Owner payout account", labelAr: "حساب صرف المالك", link: DASH, onCreate: false, onStatusChange: true },
  payout_change_alerts: { domain: "finance", labelEn: "Payout details change", labelAr: "تغيير بيانات الصرف", link: DASH, onCreate: true, onStatusChange: true, request: true },
  finance_fraud_alerts: { domain: "finance", labelEn: "Finance risk alert", labelAr: "تنبيه مخاطر مالية", link: DASH, onCreate: true, onStatusChange: true },
  broker_payout_requests: { domain: "finance", labelEn: "Broker payout request", labelAr: "طلب صرف وسيط", link: DASH, onCreate: true, onStatusChange: true, request: true },
  broker_commissions: { domain: "finance", labelEn: "Broker commission", labelAr: "عمولة وسيط", link: DASH, onCreate: true, onStatusChange: true },
  commissions: { domain: "finance", labelEn: "Commission", labelAr: "عمولة", link: DASH, onCreate: true, onStatusChange: true },

  // ── Painting / AI design ──────────────────────────────────────────────
  design_requests: { domain: "design", labelEn: "AI design request", labelAr: "طلب تصميم", link: DASH, onCreate: true, onStatusChange: true, request: true },
  design_approvals: { domain: "design", labelEn: "Design approval", labelAr: "اعتماد تصميم", link: DASH, onCreate: true, onStatusChange: true, request: true },
  design_quotes: { domain: "design", labelEn: "Design quote", labelAr: "عرض سعر تصميم", link: DASH, onCreate: true, onStatusChange: true },
  painting_projects: { domain: "design", labelEn: "Painting project", labelAr: "مشروع دهان", link: DASH, onCreate: true, onStatusChange: true, request: true },
  quotes: { domain: "design", labelEn: "Quote", labelAr: "عرض سعر", link: DASH, onCreate: true, onStatusChange: true },

  // ── Brokers ───────────────────────────────────────────────────────────
  brokerLeads: { domain: "broker", labelEn: "Broker lead", labelAr: "عميل محتمل من وسيط", link: DASH, onCreate: true, onStatusChange: true, request: true },
  brokerReferrals: { domain: "broker", labelEn: "Broker referral", labelAr: "إحالة وسيط", link: DASH, onCreate: true, onStatusChange: true, request: true },
  referrals: { domain: "broker", labelEn: "Referral", labelAr: "إحالة", link: DASH, onCreate: true, onStatusChange: true, request: true },
  broker_listing_claims: { domain: "broker", labelEn: "Broker listing claim", labelAr: "مطالبة إدراج وسيط", link: DASH, onCreate: true, onStatusChange: true, request: true },
  brokerDocuments: { domain: "broker", labelEn: "Broker document", labelAr: "مستند وسيط", link: DASH, onCreate: true, onStatusChange: true, request: true },
  broker_kyc_profiles: { domain: "broker", labelEn: "Broker verification", labelAr: "تحقق وسيط", link: DASH, onCreate: true, onStatusChange: true, request: true },

  // ── Support / complaints / feedback ───────────────────────────────────
  support_chats: { domain: "support", labelEn: "Support chat message", labelAr: "رسالة دعم", link: DASH, onCreate: true, onStatusChange: false, request: true },
  accountDeletionRequests: { domain: "support", labelEn: "Account deletion request", labelAr: "طلب حذف حساب", link: DASH, onCreate: true, onStatusChange: true, request: true },
  user_suggestions: { domain: "support", labelEn: "User suggestion", labelAr: "اقتراح مستخدم", link: "/admin/suggestions", onCreate: true, onStatusChange: false, request: true },
  pilotFeedback: { domain: "support", labelEn: "Pilot feedback", labelAr: "ملاحظات تجريبية", link: DASH, onCreate: true, onStatusChange: false, request: true },

  // ── HR / payroll / technicians (no salary amounts in any alert) ──────
  // New staff requests already reach admin + HR roles via hrAutomation.onStaffRequestCreated.
  staffRequests: { domain: "hr", labelEn: "Staff request", labelAr: "طلب موظف", link: DASH, onCreate: false, onStatusChange: true },
  staffLeaveRequests: { domain: "hr", labelEn: "Leave request", labelAr: "طلب إجازة", link: DASH, onCreate: true, onStatusChange: true },
  overtimeRequests: { domain: "hr", labelEn: "Overtime request", labelAr: "طلب عمل إضافي", link: DASH, onCreate: true, onStatusChange: true },
  staffComplaints: { domain: "hr", labelEn: "Staff complaint", labelAr: "شكوى موظف", link: DASH, onCreate: true, onStatusChange: true },
  staffDocuments: { domain: "hr", labelEn: "Staff document", labelAr: "مستند موظف", link: DASH, onCreate: true, onStatusChange: true },
  staffHrDocuments: { domain: "hr", labelEn: "HR document", labelAr: "مستند موارد بشرية", link: DASH, onCreate: true, onStatusChange: true },
  staff_shifts: { domain: "hr", labelEn: "Technician shift", labelAr: "وردية فني", link: DASH, onCreate: true, onStatusChange: true },
  payroll: { domain: "hr", labelEn: "Payroll run", labelAr: "مسير رواتب", link: DASH, onCreate: true, onStatusChange: true },
  payroll_entries: { domain: "hr", labelEn: "Payroll entry", labelAr: "قيد رواتب", link: DASH, onCreate: false, onStatusChange: true },
  technician_credential_renewals: { domain: "hr", labelEn: "Technician credential renewal", labelAr: "تجديد اعتماد فني", link: DASH, onCreate: true, onStatusChange: true },

  // ── Access / roles / grants (leadership only) ─────────────────────────
  staffAccess: { domain: "security", labelEn: "Staff access", labelAr: "صلاحية موظف", link: DASH, onCreate: true, onStatusChange: true },
  users: { domain: "security", labelEn: "Staff role / access", labelAr: "دور / صلاحية موظف", link: DASH, onCreate: false, onStatusChange: true, statusFields: ["role", "status", "suspended"], onlyRoles: STAFF_ROLES_FOR_ACCESS_ALERTS },
};

const DEFAULT_STATUS_FIELDS = ["status", "approvalStatus", "state", "decision"] as const;

const ROLE_LABELS: Record<string, { en: string; ar: string }> = {
  owner: { en: "Owner", ar: "المالك" },
  tenant: { en: "Tenant", ar: "المستأجر" },
  broker: { en: "Broker", ar: "الوسيط" },
  technician: { en: "Technician", ar: "الفني" },
};

export type AlertPlan = {
  kind: "CREATED" | "STATUS_CHANGED" | "CHAT_MESSAGE";
  collection: string;
  docId: string;
  type: string;
  titleEn: string;
  bodyEn: string;
  titleAr: string;
  bodyAr: string;
  link: string;
  roles: string[];
  actorUid: string;
  emailFallback: boolean;
  dedupeKey: string;
  metadata: Record<string, string>;
};

type Doc = Record<string, unknown> | null | undefined;

export function cleanText(value: unknown, max = 80): string {
  // Strips control characters and collapses whitespace. Long digit runs (phone, IBAN, ID, OTP) are masked.
  return String(value ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\d{5,}/g, (run) => `•••${run.slice(-2)}`)
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

export function cleanEnum(value: unknown): string {
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
  return String(value ?? "").trim().toUpperCase().replace(/[^A-Z0-9_]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40);
}

export function shortRef(docId: string): string {
  return cleanEnum(docId).replace(/_/g, "").slice(0, 8) || "—";
}

export function rolesFor(domain: AlertDomain): string[] {
  return [...new Set([...LEADERSHIP_ROLES, ...DOMAIN_ROLES[domain]])];
}

function pick(doc: Doc, keys: readonly string[]): unknown {
  if (!doc) return undefined;
  for (const key of keys) {
    const value = doc[key];
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return undefined;
}

export function actorOf(doc: Doc): string {
  return cleanText(pick(doc, ["updatedBy", "updatedByUid", "lastUpdatedBy", "lastActorUid", "decidedBy", "reviewedBy", "createdBy", "createdByUid", "senderUid", "requesterId", "submittedBy"]), 128);
}

function whereLabel(doc: Doc): { en: string; ar: string } {
  const property = cleanText(pick(doc, ["propertyName", "buildingName", "propertyTitle"]), 60);
  const unit = cleanText(pick(doc, ["unitNumber", "unitLabel", "unitName"]), 20);
  if (!property && !unit) return { en: "", ar: "" };
  if (property && unit) return { en: ` at ${property}, unit ${unit}`, ar: ` في ${property}، وحدة ${unit}` };
  if (property) return { en: ` at ${property}`, ar: ` في ${property}` };
  return { en: ` (unit ${unit})`, ar: ` (وحدة ${unit})` };
}

function requesterRole(doc: Doc): string {
  return cleanEnum(pick(doc, ["requesterRole", "createdByRole", "senderRole", "submittedByRole", "role"])).toLowerCase();
}

function docRole(doc: Doc): string {
  return String(doc?.role ?? "").trim().toLowerCase();
}

export function statusChange(spec: AlertSpec, before: Doc, after: Doc): { field: string; from: string; to: string } | null {
  if (!before || !after) return null;
  const fields = spec.statusFields || DEFAULT_STATUS_FIELDS;
  for (const field of fields) {
    const from = cleanEnum(before[field]);
    const to = cleanEnum(after[field]);
    if (from === to) continue;
    if (!to && !from) continue;
    return { field, from: from || "NONE", to: to || "NONE" };
  }
  return null;
}

export function planDocumentAlert(input: { collection: string; docId: string; before: Doc; after: Doc; eventId: string }): AlertPlan | null {
  const spec = ALERT_REGISTRY[input.collection];
  if (!spec || !input.after) return null;
  const { before, after, docId, collection } = input;
  if (spec.onlyRoles && !spec.onlyRoles.includes(docRole(after)) && !spec.onlyRoles.includes(docRole(before))) return null;

  const ref = shortRef(docId);
  const where = whereLabel(after);
  const roles = rolesFor(spec.domain);
  const base = { collection, docId, link: spec.link, roles, actorUid: actorOf(after) };
  const fromRole = ROLE_LABELS[requesterRole(after)];

  if (!before) {
    if (!spec.onCreate) return null;
    const byEn = fromRole ? ` from ${fromRole.en}` : "";
    const byAr = fromRole ? ` من ${fromRole.ar}` : "";
    return {
      ...base,
      kind: "CREATED",
      type: `STAFF_ALERT_${cleanEnum(collection)}_CREATED`.slice(0, 80),
      titleEn: `New ${spec.labelEn}${byEn}`.slice(0, 120),
      titleAr: `جديد: ${spec.labelAr}${byAr}`.slice(0, 120),
      bodyEn: `#${ref}${where.en}. Open BIN GROUP to review.`.slice(0, 240),
      bodyAr: `#${ref}${where.ar}. افتح BIN GROUP للمراجعة.`.slice(0, 240),
      emailFallback: spec.request === true,
      dedupeKey: `${collection}/${docId}|CREATED`,
      metadata: { collection, ref, event: "CREATED" },
    };
  }

  if (!spec.onStatusChange) return null;
  const change = statusChange(spec, before, after);
  if (!change) return null;
  if (spec.skipStatuses?.includes(change.to)) return null;
  const fieldEn = change.field === "role" ? "role" : change.field === "suspended" ? "suspended" : "status";
  const fieldAr = change.field === "role" ? "الدور" : change.field === "suspended" ? "الإيقاف" : "الحالة";
  return {
    ...base,
    kind: "STATUS_CHANGED",
    type: `STAFF_ALERT_${cleanEnum(collection)}_STATUS`.slice(0, 80),
    titleEn: `${spec.labelEn} updated: ${change.to.replace(/_/g, " ")}`.slice(0, 120),
    titleAr: `تحديث: ${spec.labelAr} — ${change.to.replace(/_/g, " ")}`.slice(0, 120),
    bodyEn: `#${ref}${where.en}. ${fieldEn}: ${change.from} → ${change.to}.`.slice(0, 240),
    bodyAr: `#${ref}${where.ar}. ${fieldAr}: ${change.from} ← ${change.to}.`.slice(0, 240),
    emailFallback: false,
    dedupeKey: `${collection}/${docId}|${change.field}|${change.from}|${change.to}|${input.eventId}`,
    metadata: { collection, ref, event: "STATUS_CHANGED", field: change.field, from: change.from, to: change.to },
  };
}

// Chat to staff: ticket chat only reaches the tenant, owner and technician (shared/ticketChatNotification),
// so Owner / Tenant / Broker messages are also announced to operations + leadership. The message text
// is never copied into the alert (it can contain personal data or codes).
const CHAT_PARENTS: Record<string, { labelEn: string; labelAr: string; link: (id: string) => string; domain: AlertDomain }> = {
  maintenanceTickets: { labelEn: "ticket", labelAr: "الطلب", link: (id) => `${TICKETS}?ticketId=${encodeURIComponent(id)}`, domain: "operations" },
  conversations: { labelEn: "conversation", labelAr: "المحادثة", link: () => DASH, domain: "support" },
};

export function planChatAlert(input: { parentCollection: string; parentId: string; messageId: string; message: Doc }): AlertPlan | null {
  const parent = CHAT_PARENTS[input.parentCollection];
  if (!parent || !input.message) return null;
  const senderRole = cleanEnum(input.message.senderRole).toLowerCase();
  const role = ROLE_LABELS[senderRole];
  if (!role || senderRole === "technician") return null;
  const ref = shortRef(input.parentId);
  return {
    kind: "CHAT_MESSAGE",
    collection: input.parentCollection,
    docId: input.parentId,
    type: "STAFF_ALERT_CHAT_MESSAGE",
    titleEn: `New message from ${role.en}`,
    titleAr: `رسالة جديدة من ${role.ar}`,
    bodyEn: `On ${parent.labelEn} #${ref}. Open BIN GROUP to read and reply.`,
    bodyAr: `على ${parent.labelAr} #${ref}. افتح BIN GROUP للقراءة والرد.`,
    link: parent.link(input.parentId),
    roles: rolesFor(parent.domain),
    actorUid: cleanText(input.message.senderUid, 128),
    emailFallback: false,
    dedupeKey: `${input.parentCollection}/${input.parentId}/messages/${input.messageId}|CHAT`,
    metadata: { collection: input.parentCollection, ref, event: "CHAT_MESSAGE", senderRole },
  };
}

export type StaffProfile = { uid: string; role?: unknown; status?: unknown; suspended?: unknown; disabled?: unknown };

const INACTIVE = new Set(["SUSPENDED", "DISABLED", "REJECTED", "INACTIVE", "ARCHIVED", "TERMINATED"]);

export function selectRecipients(profiles: StaffProfile[], roles: readonly string[], actorUid: string): string[] {
  const allowed = new Set(roles);
  const out = new Set<string>();
  for (const p of profiles) {
    const role = String(p.role ?? "").trim().toLowerCase();
    if (!p.uid || !allowed.has(role)) continue;
    if (p.suspended === true || p.disabled === true || INACTIVE.has(cleanEnum(p.status))) continue;
    if (actorUid && p.uid === actorUid) continue; // nobody is alerted about their own action
    out.add(p.uid);
  }
  return [...out];
}
